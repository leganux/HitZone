const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    host: { type: String, required: true }, // This will store socketId of host
    players: [{
        socketId: String,
        username: String,
        timeline: [{
            songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
            position: Number,
            isBase: { type: Boolean, default: false },
            isLocked: { type: Boolean, default: false }
        }],
        coins: { type: Number, default: 2 },
        isHost: { type: Boolean, default: false }
    }],
    disconnectedPlayers: [{
        username: String,
        timeline: [{
            songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
            position: Number,
            isBase: Boolean,
            isLocked: Boolean
        }],
        coins: Number,
        lastActive: Date
    }],
    gameState: {
        isActive: { type: Boolean, default: false },
        currentTurn: { type: Number, default: 0 },
        cardsToWin: { type: Number, default: 5 },
        availableCards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }],
        turnTimeLimit: { type: Number, default: 60 }, // seconds
        lastTurnStarted: { type: Date },
        activeBets: [{
            playerId: String,
            playerName: String,
            songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
            bet: {
                artist: String,
                song: String
            },
            resolved: { type: Boolean, default: false }
        }]
    },
    maxPlayers: { type: Number, default: 20 },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

// Method to update last active timestamp
roomSchema.methods.updateActivity = function() {
    this.lastActive = Date.now();
    return this.save();
};

// Method to start a new turn
roomSchema.methods.startNewTurn = function() {
    this.gameState.lastTurnStarted = new Date();
    this.gameState.currentTurn++;
    // Clear active bets when starting new turn
    this.gameState.activeBets = [];
    return this.save();
};

// Turn control methods
roomSchema.methods.handleAdminTurnControl = function(action) {
    if (action === 'next') {
        this.gameState.lastTurnStarted = new Date();
        this.gameState.currentTurn++;
        this.gameState.activeBets = [];
        return this.save();
    } else if (action === 'skip') {
        this.gameState.currentTurn++;
        return this.save();
    }
    return null;
};

// Coin exchange methods
roomSchema.methods.exchangeCoinsForTurn = function(playerId) {
    const player = this.players.find(p => p.socketId === playerId);
    if (player && player.coins >= 4) {
        player.coins -= 2;
        return this.save();
    }
    return null;
};

roomSchema.methods.canExchangeCoinsForTurn = function(playerId) {
    const player = this.players.find(p => p.socketId === playerId);
    return player && player.coins >= 4;
};

// Betting methods
roomSchema.methods.addBet = function(playerId, playerName, songId, bet) {
    this.gameState.activeBets.push({
        playerId,
        playerName,
        songId,
        bet,
        resolved: false
    });
    return this.save();
};

// Method to resolve a bet
roomSchema.methods.resolveBet = function(playerId, correct) {
    const bet = this.gameState.activeBets.find(b => b.playerId === playerId && !b.resolved);
    if (bet) {
        bet.resolved = true;
        const player = this.players.find(p => p.socketId === playerId);
        if (player) {
            if (correct) {
                player.coins += 2; // Win 2 coins (1 bet + 1 bonus)
            } else {
                // Remove card from timeline if bet was incorrect
                player.timeline = player.timeline.filter(card => !card.songId.equals(bet.songId));
            }
        }
    }
    return this.save();
};

// Method to check if player has active bet
roomSchema.methods.hasActiveBet = function(playerId) {
    return this.gameState.activeBets.some(bet => bet.playerId === playerId && !bet.resolved);
};


// Method to add a player to the room
roomSchema.methods.addPlayer = function(socketId, username, isHost = false) {
    if (this.players.length >= this.maxPlayers) {
        throw new Error('Room is full');
    }
    
    const player = {
        socketId,
        username,
        timeline: [],
        coins: 2,
        isHost
    };
    
    this.players.push(player);
    
    // If this is the first player or isHost is true, set as host
    if (this.players.length === 1 || isHost) {
        this.host = socketId;
        player.isHost = true;
    }
    
    return this.save();
};

// Method to remove a player from the room
roomSchema.methods.removePlayer = function(socketId) {
    this.players = this.players.filter(player => player.socketId !== socketId);
    return this.save();
};

// Method to get player state
roomSchema.methods.getPlayerState = function(socketId) {
    return this.players.find(player => player.socketId === socketId);
};

// Method to update player state
roomSchema.methods.updatePlayerState = function(socketId, updates) {
    const player = this.players.find(player => player.socketId === socketId);
    if (player) {
        Object.assign(player, updates);
        return this.save();
    }
    return null;
};

module.exports = mongoose.model('Room', roomSchema);
