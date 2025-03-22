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

// Get populated player data
app.get('/api/rooms/:roomId/players', async (req, res) => {
    try {
        const room = await Room.findOne({ roomId: req.params.roomId })
            .populate({
                path: 'players.timeline.songId',
                model: 'Song'
            });
        
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }
        
        res.json(room.players);
    } catch (error) {
        console.error('Error fetching populated player data:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

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
                .populate({
                    path: 'players.timeline.songId',
                    model: 'Song'
                });
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
                .populate({
                    path: 'players.timeline.songId',
                    model: 'Song'
                });
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            const song = await Song.findById(songId);
            if (!song) return;

            // Validate placement
            let isCorrect = true;
            const timeline = player.timeline.sort((a, b) => {
                if (a.position === b.position) {
                    return a.songId.release_year - b.songId.release_year;
                }
                return a.position - b.position;
            });
            
            if (timeline.length > 0) {
                // Find the cards immediately before and after the placement position
                const prevSong = timeline.reduce((closest, t) => {
                    if (t.position < position && (!closest || t.position > closest.position)) {
                        return t;
                    }
                    return closest;
                }, null)?.songId;

                const nextSong = timeline.reduce((closest, t) => {
                    if (t.position > position && (!closest || t.position < closest.position)) {
                        return t;
                    }
                    return closest;
                }, null)?.songId;

                // Validate year order, allowing same-year placements
                if (prevSong && prevSong.release_year > song.release_year) {
                    isCorrect = false;
                }
                if (nextSong && nextSong.release_year < song.release_year) {
                    isCorrect = false;
                }
            }

            if (isCorrect) {
                player.timeline.push({ songId, position });
                await room.save();

                // Get fully populated room data
                const populatedRoom = await Room.findOne({ roomId })
                    .populate({
                        path: 'players.timeline.songId',
                        model: 'Song'
                    });
                const populatedPlayer = populatedRoom.players.find(p => p.socketId === socket.id);
                
                // Emit timeline update to all players with complete song data
                io.to(roomId).emit('playerTimelineUpdate', {
                    playerId: socket.id,
                    timeline: populatedPlayer.timeline
                });
                
            }

            // Stop YouTube player for all players
            io.to(roomId).emit('stopPlaying');

            // Get current player's username
            const currentPlayer = room.players.find(p => p.socketId === socket.id);
            
            // Notify players of placement result, but don't advance turn
            io.to(roomId).emit('placementResult', { 
                correct: isCorrect, 
                socketId: socket.id,
                playerName: currentPlayer.username,
                song: song  // Include the song data in the response
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('submitGuess', async ({ roomId, guess, username }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player || player.coins < 1) return;

           
            await room.save();

            // Broadcast the guess to all players
            io.to(roomId).emit('newGuess', { username, guess });

         

            // Notify host for validation
            socket.to(room.host).emit('guessValidation', {
                playerId: socket.id,
                guess,
                username
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('validateGuess', async ({ roomId, correct }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.host !== socket.id) return;

            // Just notify about the validation result
            io.to(roomId).emit('guessResult', {
                correct
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    // Handle coin management
    socket.on('manageCoin', async ({ roomId, playerSocketId, action }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.host !== socket.id) return;

            const player = room.players.find(p => p.socketId === playerSocketId);
            if (!player) return;

            if (action === 'add') {
                player.coins++;
            } else if (action === 'remove' && player.coins > 0) {
                player.coins--;
            }

            await room.save();

            // Notify all players about the coin update
            io.to(roomId).emit('coinUpdated', {
                playerSocketId: player.socketId,
                coins: player.coins,
                username: player.username
            });

            // Update game state for all players
            io.to(roomId).emit('gameStateUpdated', {
                gameState: room.gameState,
                players: room.players
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    // Handle disconnection with state persistence
    // Handle song playback synchronization
    socket.on('syncSongPlayback', async ({ roomId, song }) => {
        try {
            // Broadcast the song to all other players in the room
            socket.to(roomId).emit('playSyncedSong', { song });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    // Handle admin turn controls
    socket.on('skipTurn', async ({ roomId }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.host !== socket.id) return;

            // Move to next turn
            await room.startNewTurn();

            // Get next player
            const nextPlayerIndex = room.gameState.currentTurn % room.players.length;
            const nextPlayer = room.players[nextPlayerIndex];

            // Notify players
            io.to(roomId).emit('turnSkipped');
            io.to(roomId).emit('turnStart', { 
                playerId: nextPlayer.socketId,
                playerName: nextPlayer.username
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    // Handle winner declaration
    socket.on('declareWinner', async ({ roomId, winnerSocketId }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.host !== socket.id) return;

            const winner = room.players.find(p => p.socketId === winnerSocketId);
            if (!winner) return;

            // Calculate final scores
            const scores = room.players.map(p => ({
                socketId: p.socketId,
                username: p.username,
                score: calculateScore(p.timeline)
            }));

            // Notify all players about the winner
            io.to(roomId).emit('gameWon', { 
                winner: winnerSocketId,
                scores: scores
            });

            turnManager.clearTimer(roomId);
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('nextTurn', async ({ roomId }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.host !== socket.id) return;

            // Move to next turn
            await room.startNewTurn();

            // Get next player
            const nextPlayerIndex = room.gameState.currentTurn % room.players.length;
            const nextPlayer = room.players[nextPlayerIndex];

            // Notify players
            io.to(roomId).emit('turnStart', { 
                playerId: nextPlayer.socketId,
                playerName: nextPlayer.username
            });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

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
