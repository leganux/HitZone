const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/database');
const Room = require('./models/room');
const Song = require('./models/song');
const { TurnManager, validatePlacement, checkSuddenDeath, handleSuddenDeath, calculateScore } = require('./utils/gameUtils');

// Routes
const songRoutes = require('./routes/songRoutes');
const roomRoutes = require('./routes/roomRoutes');

// Initialize app and turn manager
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const turnManager = new TurnManager(io);

// Share io instance with controllers
app.set('io', io);

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/songs', songRoutes);
app.use('/api/rooms', roomRoutes);

// Main route
app.get('/', (req, res) => {
    res.render('index');
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    let currentRoom = null;

    // Join room
    socket.on('joinRoom', async ({ roomId, username }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (room) {
                currentRoom = room;
                socket.join(roomId);
                socket.emit('roomJoined', room);
                io.to(roomId).emit('playerJoined', { username, socketId: socket.id });
            }
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    // Game actions
    socket.on('selectCard', async ({ roomId }) => {
        try {
            const room = await Room.findOne({ roomId })
                .populate('players.timeline.songId');
            if (!room || !room.gameState.isActive) return;

            const currentPlayerIndex = room.gameState.currentTurn % room.players.length;
            const currentPlayer = room.players[currentPlayerIndex];
            
            if (currentPlayer.socketId !== socket.id) {
                socket.emit('error', 'Not your turn');
                return;
            }

            const randomSong = await Song.aggregate([{ $sample: { size: 1 } }]);
            if (randomSong.length > 0) {
                const populatedSong = await Song.findById(randomSong[0]._id);
                io.to(roomId).emit('turnUpdate', {
                    currentPlayer: currentPlayer.username,
                    timeLimit: room.gameState.turnTimeLimit
                });
                socket.emit('newCard', { song: populatedSong });
            }
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('placementDecision', async ({ roomId, position, songId }) => {
        try {
            const room = await Room.findOne({ roomId })
                .populate('players.timeline.songId');
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            const song = await Song.findById(songId);
            if (!song) return;

            // Validate placement
            let isCorrect = true;
            const timeline = player.timeline.sort((a, b) => a.position - b.position);
            
            if (timeline.length > 0) {
                const prevSong = timeline.find(t => t.position === position - 1)?.songId;
                const nextSong = timeline.find(t => t.position === position + 1)?.songId;
                
                if (prevSong && prevSong.release_year > song.release_year) {
                    isCorrect = false;
                }
                if (nextSong && nextSong.release_year < song.release_year) {
                    isCorrect = false;
                }
            }

            if (isCorrect) {
                player.timeline.push({ songId, position });
                
                // Emit timeline update to all players
                io.to(roomId).emit('playerTimelineUpdate', {
                    playerId: socket.id,
                    timeline: player.timeline
                });
                
                // Check win condition
                if (player.timeline.length >= room.gameState.cardsToWin) {
                    if (checkSuddenDeath(room)) {
                        // Handle sudden death
                        room = await handleSuddenDeath(room);
                        io.to(roomId).emit('suddenDeath', {
                            newCardsToWin: room.gameState.cardsToWin
                        });
                    } else {
                        // Calculate final scores
                        const scores = room.players.map(p => ({
                            socketId: p.socketId,
                            username: p.username,
                            score: calculateScore(p.timeline)
                        }));
                        
                        io.to(roomId).emit('gameWon', { 
                            winner: socket.id,
                            scores: scores
                        });
                        turnManager.clearTimer(roomId);
                        return;
                    }
                }
            }

            // Stop YouTube player for all players
            io.to(roomId).emit('stopPlaying');

            // Move to next turn
            await room.startNewTurn();
            turnManager.startTurnTimer(roomId);

            // Get next player
            const nextPlayerIndex = room.gameState.currentTurn % room.players.length;
            const nextPlayer = room.players[nextPlayerIndex];

            // Notify players
            io.to(roomId).emit('placementResult', { 
                correct: isCorrect, 
                socketId: socket.id,
                nextPlayer: {
                    socketId: nextPlayer.socketId,
                    username: nextPlayer.username
                }
            });
            io.to(roomId).emit('turnStart', { 
                playerId: nextPlayer.socketId,
                playerName: nextPlayer.username,
                timeLimit: room.gameState.turnTimeLimit
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('submitGuess', async ({ roomId, guess }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || player.coins < 1) return;

            // Notify host for validation
            socket.to(room.host).emit('guessValidation', {
                playerId: socket.id,
                guess
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('validateGuess', async ({ roomId, correct }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.host !== socket.id) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            if (correct) {
                player.coins++;
                io.to(roomId).emit('guessResult', {
                    playerId: socket.id,
                    correct: true,
                    newCoins: player.coins
                });
            } else {
                player.coins--;
                io.to(roomId).emit('guessResult', {
                    playerId: socket.id,
                    correct: false,
                    newCoins: player.coins
                });
            }

            await room.save();
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    // Handle disconnection with state persistence
    socket.on('disconnect', async () => {
        try {
            if (!currentRoom) return;

            const room = await Room.findOne({ roomId: currentRoom.roomId });
            if (!room) return;

            // Store player state before removal
            const player = room.players.find(p => p.socketId === socket.id);
            if (player) {
                // Save disconnected player state for potential reconnection
                room.disconnectedPlayers = room.disconnectedPlayers || [];
                room.disconnectedPlayers.push({
                    username: player.username,
                    timeline: player.timeline,
                    coins: player.coins,
                    lastActive: new Date()
                });
            }

            // Remove player from active list
            await room.removePlayer(socket.id);

            // If room is empty, save state and delete after timeout
            if (room.players.length === 0) {
                turnManager.clearTimer(room.roomId);
                setTimeout(async () => {
                    const checkRoom = await Room.findOne({ roomId: room.roomId });
                    if (checkRoom && checkRoom.players.length === 0) {
                        await Room.deleteOne({ _id: checkRoom._id });
                    }
                }, 30 * 60 * 1000); // 30 minutes timeout
            } else {
                // If disconnected player was host, assign new host
                if (room.host === socket.id) {
                    room.host = room.players[0].socketId;
                    room.players[0].isHost = true;
                }
                
                await room.save();
                
                // Notify remaining players
                io.to(room.roomId).emit('playerLeft', { 
                    socketId: socket.id,
                    newHost: room.host
                });
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});

// Cleanup inactive rooms periodically (every 5 minutes)
setInterval(async () => {
    try {
        const roomController = require('./controllers/roomController');
        await roomController.cleanupInactiveRooms();
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3010;

// Kill any existing process on the port
const { execSync } = require('child_process');
try {
    execSync(`lsof -ti:${PORT} | xargs kill -9`);
} catch (error) {
    // Ignore if no process was found
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
