const Room = require('../models/room');
const Song = require('../models/song');
const crypto = require('crypto');

const roomController = {
    // Create a new room
    create: async (req, res) => {
        try {
            const { username, socketId } = req.body;
            const roomId = crypto.randomBytes(3).toString('hex');
            
            const room = new Room({
                roomId,
                host: socketId, // Store socketId as host
                players: [{
                    socketId,
                    username,
                    isHost: true,
                    coins: 2,
                    timeline: []
                }]
            });

            await room.save();
            
            // Join socket to room
            const io = req.app.get('io');
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.join(roomId);
            }

            res.status(201).json(room);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Join a room
    join: async (req, res) => {
        try {
            const { roomId, username, socketId } = req.body;
            const room = await Room.findOne({ roomId });

            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            if (room.players.length >= room.maxPlayers) {
                return res.status(400).json({ message: 'Room is full' });
            }

            await room.addPlayer(socketId, username);
            await room.updateActivity();

            // Get io instance and notify all players
            const io = req.app.get('io');
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.join(roomId);
                
                // Send current game state to new player if game is active
                if (room.gameState.isActive) {
                    socket.emit('gameStarted', {
                        currentPlayer: room.players[room.gameState.currentTurn % room.players.length].username,
                        timeLimit: room.gameState.turnTimeLimit
                    });
                }
            }

            res.json(room);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Get room state
    getState: async (req, res) => {
        try {
            const { roomId } = req.params;
            const room = await Room.findOne({ roomId })
                .populate('gameState.availableCards')
                .populate('players.timeline.songId');

            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            res.json(room);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    },

    // Start game
    startGame: async (req, res) => {
        try {
            const { roomId, cardsToWin } = req.body;
            console.log('Starting game for room:', roomId);
            const room = await Room.findOne({ roomId: roomId });
            console.log('Found room:', room);

            if (!room) {
                console.log('Room not found for ID:', roomId);
                return res.status(404).json({ message: 'Room not found' });
            }

            // Get initial cards for each player
            const initialCards = await Song.aggregate([
                { $sample: { size: room.players.length } }
            ]);

            // Assign initial cards to players
            for (let i = 0; i < room.players.length; i++) {
                if (initialCards[i]) {
                    const populatedCard = await Song.findById(initialCards[i]._id);
                    if (populatedCard) {
                        room.players[i].timeline = [{
                            songId: populatedCard,
                            position: 0,
                            isBase: true
                        }];
                    }
                }
            }

            // Set up game state
            room.gameState = {
                isActive: true,
                currentTurn: 0,
                cardsToWin: cardsToWin || 5,
                availableCards: [],
                turnTimeLimit: 60,
                lastTurnStarted: new Date()
            };

            await room.save();
            
            // Save and populate the response
            await room.save();
            const populatedRoom = await Room.findById(room._id)
                .populate({
                    path: 'players.timeline.songId',
                    select: 'name artist album release_year link_or_file'
                });

            // Get io instance
            const io = req.app.get('io');
            const currentPlayer = room.players[0];
            
            // Notify all players about game start with complete game state
            const gameStartData = {
                currentPlayer: currentPlayer.username,
                timeLimit: room.gameState.turnTimeLimit,
                gameState: {
                    isActive: true,
                    cardsToWin: room.gameState.cardsToWin,
                    players: populatedRoom.players.map(player => ({
                        socketId: player.socketId,
                        username: player.username,
                        timeline: player.timeline,
                        coins: player.coins,
                        isHost: player.isHost
                    }))
                }
            };

            io.to(room.roomId).emit('gameStarted', gameStartData);

            // Notify about turn start
            io.to(room.roomId).emit('turnStart', {
                playerId: currentPlayer.socketId,
                playerName: currentPlayer.username,
                timeLimit: room.gameState.turnTimeLimit
            });

            // Send individual player data to each player
            room.players.forEach(player => {
                const socket = io.sockets.sockets.get(player.socketId);
                if (socket) {
                    socket.emit('playerData', {
                        timeline: player.timeline,
                        coins: player.coins
                    });
                }
            });

            res.json(populatedRoom);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Update room state (for game actions)
    updateState: async (req, res) => {
        try {
            const { roomId } = req.params;
            const updates = req.body;
            
            const room = await Room.findOne({ roomId });
            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            // Apply updates
            if (updates.gameState) {
                Object.assign(room.gameState, updates.gameState);
            }
            
            if (updates.playerUpdates) {
                updates.playerUpdates.forEach(update => {
                    room.updatePlayerState(update.socketId, update.changes);
                });
            }

            await room.updateActivity();
            await room.save();

            // Get io instance and notify all players about the update
            const io = req.app.get('io');
            io.to(roomId).emit('gameStateUpdated', {
                gameState: room.gameState,
                players: room.players
            });

            res.json(room);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Clean up inactive rooms (called periodically)
    cleanupInactiveRooms: async () => {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        try {
            await Room.deleteMany({ lastActive: { $lt: thirtyMinutesAgo } });
        } catch (error) {
            console.error('Error cleaning up rooms:', error);
        }
    }
};

module.exports = roomController;
