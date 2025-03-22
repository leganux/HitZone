const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    host: { type: String, required: true }, // This will store socketId of host
    players: [{
        socketId: String,
        username: String,
        timeline: [{
            songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', populate: true },
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
            songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', populate: true },
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
        availableCards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song', populate: true }],
        turnTimeLimit: { type: Number, default: 60 }, // seconds
        lastTurnStarted: { type: Date }
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
    return this.save();
};

// Method to check if turn time limit is exceeded
roomSchema.methods.isTurnTimeExceeded = function() {
    if (!this.gameState.lastTurnStarted) return false;
    const elapsed = (new Date() - this.gameState.lastTurnStarted) / 1000;
    return elapsed > this.gameState.turnTimeLimit;
};

// Method to handle turn timeout
roomSchema.methods.handleTurnTimeout = async function() {
    if (this.isTurnTimeExceeded()) {
        await this.startNewTurn();
        return true;
    }
    return false;
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
