const Room = require('../models/room');

class TurnManager {
    constructor(io) {
        this.io = io;
        this.timers = new Map();
    }

    // Start turn timer for a room
    startTurnTimer(roomId) {
        // Clear existing timer if any
        this.clearTimer(roomId);

        // Set new timer
        const timer = setInterval(async () => {
            try {
                const room = await Room.findOne({ roomId });
                if (!room || !room.gameState.isActive) {
                    this.clearTimer(roomId);
                    return;
                }

                const turnExpired = await room.handleTurnTimeout();
                if (turnExpired) {
                    const nextPlayerIndex = room.gameState.currentTurn % room.players.length;
                    const nextPlayer = room.players[nextPlayerIndex];

                    this.io.to(roomId).emit('turnTimeout');
                    this.io.to(roomId).emit('turnStart', { 
                        playerId: nextPlayer.socketId 
                    });
                }
            } catch (error) {
                console.error('Turn timer error:', error);
            }
        }, 1000); // Check every second

        this.timers.set(roomId, timer);
    }

    // Clear timer for a room
    clearTimer(roomId) {
        const timer = this.timers.get(roomId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(roomId);
        }
    }

    // Handle room cleanup
    cleanupRoom(roomId) {
        this.clearTimer(roomId);
    }
}

// Validate card placement
function validatePlacement(timeline, newCard, position) {
    if (timeline.length === 0) return true;

    const sortedTimeline = [...timeline].sort((a, b) => a.position - b.position);
    const prevCard = sortedTimeline.find(c => c.position === position - 1)?.songId;
    const nextCard = sortedTimeline.find(c => c.position === position + 1)?.songId;

    if (prevCard && prevCard.release_year > newCard.release_year) return false;
    if (nextCard && nextCard.release_year < newCard.release_year) return false;

    return true;
}

// Check for sudden death condition
function checkSuddenDeath(room) {
    const winners = room.players.filter(p => 
        p.timeline.length >= room.gameState.cardsToWin
    );
    return winners.length > 1;
}

// Handle sudden death
async function handleSuddenDeath(room) {
    // Reset player timelines to base cards only
    room.players.forEach(player => {
        const baseCard = player.timeline.find(c => c.isBase);
        player.timeline = baseCard ? [baseCard] : [];
    });

    // Increase cards to win by 1
    room.gameState.cardsToWin++;
    
    // Reset turn to random player
    room.gameState.currentTurn = Math.floor(Math.random() * room.players.length);
    
    await room.save();
    return room;
}

// Calculate score for a player
function calculateScore(timeline) {
    return timeline.reduce((score, card, index, array) => {
        if (index === 0) return score;
        const prevCard = array[index - 1];
        
        // Points for correct chronological order
        if (card.songId.release_year >= prevCard.songId.release_year) {
            score += 100;
            
            // Bonus points for cards from same year
            if (card.songId.release_year === prevCard.songId.release_year) {
                score += 50;
            }
            
            // Bonus points for cards from same artist
            if (card.songId.artist === prevCard.songId.artist) {
                score += 25;
            }
        }
        
        return score;
    }, 0);
}

module.exports = {
    TurnManager,
    validatePlacement,
    checkSuddenDeath,
    handleSuddenDeath,
    calculateScore
};
