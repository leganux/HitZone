// Initialize tabs and modals
$('.menu .item').tab();
$('.ui.modal').modal();

// Import sound effects
import { createTimerBeep, createErrorSound } from '/sounds/timer.js';

// Socket.IO connection
const socket = io();

// Game state
let currentRoom = null;
let isHost = false;
let mySocketId = null;
let currentSong = null;
let myTimeline = [];
let myCoins = 2;
let isMyTurn = false;
let player = null;

// Initialize Plyr
document.addEventListener('DOMContentLoaded', function() {
    player = new Plyr('#player', {
        controls: ['play', 'progress', 'current-time', 'mute', 'volume'],
        autoplay: true,
        muted: false,
        volume: 0.7,
        youtube: {
            noCookie: true,
            rel: 0,
            showinfo: 0,
            modestbranding: 1,
            playsinline: 1
        }
    });
});

// Extract YouTube video ID from URL
function getYouTubeId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        } else if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.substring(1);
        }
    } catch (error) {
        console.error('Error parsing YouTube URL:', error);
    }
    return null;
}

// Add song form handling
$('#add-song-form').on('submit', function(e) {
    e.preventDefault();
    const formData = {
        name: this.name.value,
        artist: this.artist.value,
        release_year: parseInt(this.release_year.value),
        album: this.album.value,
        link_or_file: this.link_or_file.value
    };

    $('#add-song-btn').addClass('loading');
    $('#song-message').removeClass('positive negative').addClass('hidden');

    fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        $('#add-song-btn').removeClass('loading');
        if (data._id) {
            $('#song-message')
                .removeClass('hidden negative')
                .addClass('positive')
                .html('<i class="check icon"></i> Song added successfully!');
            $('#add-song-form')[0].reset();
        } else {
            $('#song-message')
                .removeClass('hidden positive')
                .addClass('negative')
                .html(`<i class="exclamation triangle icon"></i> ${data.message || 'Error adding song'}`);
        }
    })
    .catch(error => {
        $('#add-song-btn').removeClass('loading');
        $('#song-message')
            .removeClass('hidden positive')
            .addClass('negative')
            .html('<i class="exclamation triangle icon"></i> Error adding song');
    });
});

// Create Room
document.getElementById('create-room-btn').addEventListener('click', async () => {
    const username = document.getElementById('create-username').value.trim();
    if (!username) {
        alert('Please enter a username');
        return;
    }

    try {
        const response = await fetch('/api/rooms/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, socketId: socket.id })
        });
        const room = await response.json();
        
        if (room) {
            currentRoom = room;
            isHost = true;
            mySocketId = socket.id;
            joinGameRoom(room.roomId, username);
        }
    } catch (error) {
        alert('Error creating room: ' + error.message);
    }
});

// Join Room
document.getElementById('join-room-btn').addEventListener('click', async () => {
    const roomId = document.getElementById('join-room-id').value.trim();
    const username = document.getElementById('join-username').value.trim();
    
    if (!roomId || !username) {
        alert('Please enter both room ID and username');
        return;
    }

    try {
        const response = await fetch('/api/rooms/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, username, socketId: socket.id })
        });
        const room = await response.json();
        
        if (room) {
            currentRoom = room;
            mySocketId = socket.id;
            joinGameRoom(roomId, username);
        }
    } catch (error) {
        alert('Error joining room: ' + error.message);
    }
});

// Join Game Room
function joinGameRoom(roomId, username) {
    socket.emit('joinRoom', { roomId, username });
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('game-room').classList.remove('hidden');
    document.getElementById('room-id-display').textContent = roomId;
    
    if (isHost) {
        document.getElementById('host-controls').classList.remove('hidden');
    }
}

// Start Game
document.getElementById('start-game-btn')?.addEventListener('click', async () => {
    if (!currentRoom) return;
    
    const cardsToWin = document.getElementById('cards-to-win').value;
    try {
        const response = await fetch('/api/rooms/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                roomId: currentRoom.roomId,
                cardsToWin 
            })
        });
        const gameState = await response.json();
        
        if (gameState) {
            document.getElementById('waiting-screen').classList.add('hidden');
            document.getElementById('game-screen').classList.remove('hidden');
            initializeGame(gameState);
        }
    } catch (error) {
        alert('Error starting game: ' + error.message);
    }
});

// Initialize game state
function initializeGame(gameState) {
    const player = gameState.players.find(p => p.socketId === mySocketId);
    if (player) {
        myTimeline = player.timeline;
        myCoins = player.coins;
        updateCoinsDisplay();
        renderTimeline();
        renderCardGrid();
        
        // Initialize other players' timelines
        const otherPlayers = gameState.players.filter(p => p.socketId !== mySocketId);
        renderOtherPlayersTimelines(otherPlayers);
    }
}

// Sort timeline by year
function sortTimelineByYear(timeline) {
    return [...timeline].sort((a, b) => {
        const yearA = a.songId.release_year;
        const yearB = b.songId.release_year;
        if (yearA === yearB) {
            return a.position - b.position;
        }
        return yearA - yearB;
    });
}

// Render timeline
function renderTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';
    
    const sortedTimeline = sortTimelineByYear(myTimeline);
    sortedTimeline.forEach(card => {
        const cardElement = createCardElement(card);
        timeline.appendChild(cardElement);
    });
}

// Create card element
function createCardElement(card) {
    if (!card || !card.songId) {
        console.error('Invalid card data:', card);
        return document.createElement('div');
    }

    // Log the card data to help debug
    console.log('Creating card element with data:', card);

    const songData = card.songId;
    if (typeof songData !== 'object') {
        console.error('Song data is not populated:', songData);
        return document.createElement('div');
    }

    const div = document.createElement('div');
    div.className = `ui card timeline-card ${card.isBase ? 'base' : ''} ${card.isLocked ? 'locked' : ''}`;
    div.setAttribute('data-year', songData.release_year);
    div.innerHTML = `
        <div class="content">
            <div class="header">${songData.name}</div>
            <div class="meta">${songData.artist}</div>
            <div class="description">
                <p>Album: ${songData.album || 'N/A'}</p>
                <p class="year">${songData.release_year}</p>
            </div>
        </div>
    `;
    return div;
}

// Render other players' timelines
function renderOtherPlayersTimelines(players) {
    const container = document.getElementById('other-players-timelines');
    container.innerHTML = '';
    
    players.forEach(player => {
        const segment = document.createElement('div');
        segment.className = 'ui segment';
        segment.setAttribute('data-player-id', player.socketId);
        
        segment.innerHTML = `
            <h4 class="ui header">${player.username}'s Timeline</h4>
            <div class="player-timeline ui cards"></div>
        `;
        
        container.appendChild(segment);
        
        // Render player's timeline
        const timelineContainer = segment.querySelector('.player-timeline');
        const sortedTimeline = sortTimelineByYear(player.timeline);
        sortedTimeline.forEach(card => {
            const cardElement = createCardElement(card);
            timelineContainer.appendChild(cardElement);
        });
    });
}

// Render card grid
function renderCardGrid() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';
    
    for (let i = 0; i < 50; i++) {
        const cardSlot = document.createElement('div');
        cardSlot.className = 'card-slot';
        cardSlot.textContent = '♫';
        cardSlot.addEventListener('click', () => selectCard(i));
        grid.appendChild(cardSlot);
    }
}

// Select a card
function selectCard(index) {
    if (!isMyTurn || !currentRoom) return;
    
    socket.emit('selectCard', { 
        roomId: currentRoom.roomId,
        position: index
    });
}

// Handle card placement
function handleCardPlacement(song) {
    if (!song) {
        console.error('Invalid song data received');
        return;
    }

    console.log('Handling card placement:', song);
    currentSong = song;
    
    // Lock all card slots while placing
    const cardSlots = document.querySelectorAll('.card-slot');
    cardSlots.forEach(slot => {
        slot.classList.add('disabled');
        slot.style.pointerEvents = 'none';
    });
    
    // Update preview card with hidden details
    document.getElementById('preview-name').textContent = '???';
    document.getElementById('preview-artist').textContent = '???';
    document.getElementById('preview-album').textContent = 'Album: ???';

    // Update placement buttons based on timeline
    updatePlacementButtons();
    
    // Handle YouTube video
    const videoId = getYouTubeId(song.link_or_file);
    if (videoId) {
        try {
            // Destroy existing player if it exists
            if (player) {
                player.destroy();
                player = null;
            }

            // Clear and recreate player container
            const playerContainer = document.getElementById('player');
            playerContainer.innerHTML = '';
            
            // Create new container and iframe
            const embedContainer = document.createElement('div');
            embedContainer.className = 'plyr__video-embed';
            
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${videoId}?origin=${window.location.origin}&iv_load_policy=3&modestbranding=1&playsinline=1&showinfo=0&rel=0&enablejsapi=1&start=30&end=60&autoplay=1`;
            iframe.allowFullscreen = true;
            iframe.allow = 'autoplay';
            
            embedContainer.appendChild(iframe);
            playerContainer.appendChild(embedContainer);
            
            // Initialize new player after a short delay
            setTimeout(() => {
                player = new Plyr('#player', {
                    controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume'],
                    autoplay: true,
                    muted: false,
                    volume: 0.7,
                    youtube: { 
                        noCookie: true,
                        playsinline: true,
                        rel: 0,
                        showinfo: 0,
                        modestbranding: 1
                    }
                });
                
                player.once('ready', () => {
                    try {
                        player.play();
                    } catch (error) {
                        console.error('Playback error:', error);
                    }
                });
            }, 100);
        } catch (error) {
            console.error('Player initialization error:', error);
        }
    } else {
        console.error('Invalid YouTube URL:', song.link_or_file);
    }
    
    // Show placement UI
    document.getElementById('card-preview').classList.remove('hidden');
    
    // Setup placement buttons
    document.getElementById('place-before').onclick = () => confirmPlacement('before');
    document.getElementById('place-after').onclick = () => confirmPlacement('after');
}

// Update placement buttons based on timeline
function updatePlacementButtons() {
    const intermediateContainer = document.getElementById('intermediate-positions');
    intermediateContainer.innerHTML = '';
    
    const sortedTimeline = sortTimelineByYear(myTimeline);
    
    if (sortedTimeline.length > 1) {
        // Add intermediate position buttons
        for (let i = 0; i < sortedTimeline.length - 1; i++) {
            const currentCard = sortedTimeline[i];
            const nextCard = sortedTimeline[i + 1];
            
            const button = document.createElement('button');
            button.className = 'ui button blue';
            button.textContent = `Place between ${currentCard.songId.release_year} and ${nextCard.songId.release_year}`;
            button.onclick = () => confirmPlacement('between', i);
            intermediateContainer.appendChild(button);
        }
    }
}

// Confirm card placement
function confirmPlacement(position, index) {
    if (!currentSong || !currentRoom) return;
    
    const newPosition = calculateNewPosition(position, index);
    socket.emit('placementDecision', {
        roomId: currentRoom.roomId,
        socketId: mySocketId,
        position: newPosition,
        songId: currentSong._id
    });
}

// Calculate new position
function calculateNewPosition(placement, index) {
    if (myTimeline.length === 0) return 0;
    
    const sortedTimeline = sortTimelineByYear(myTimeline);
    
    if (placement === 'before') {
        return sortedTimeline[0].position - 1;
    } else if (placement === 'between') {
        const currentCard = sortedTimeline[index];
        const nextCard = sortedTimeline[index + 1];
        return (currentCard.position + nextCard.position) / 2;
    } else {
        return sortedTimeline[sortedTimeline.length - 1].position + 1;
    }
}

// Update coins display
function updateCoinsDisplay() {
    document.getElementById('coin-count').textContent = myCoins;
    const buyCardBtn = document.getElementById('buy-card-btn');
    const stealCardBtn = document.getElementById('steal-card-btn');
    
    if (buyCardBtn) {
        buyCardBtn.classList.toggle('disabled', myCoins < 3);
    }
    if (stealCardBtn) {
        stealCardBtn.classList.toggle('disabled', myCoins < 4);
    }
}

// Show confetti effect
function showConfetti() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
        confetti.style.left = Math.random() * window.innerWidth + 'px';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
    }
}

// Socket event handlers
socket.on('roomJoined', (room) => {
    currentRoom = room;
    updatePlayersList(room.players);
});

socket.on('gameStarted', ({ currentPlayer, timeLimit, gameState }) => {
    document.getElementById('waiting-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    
    // Update game state
    if (gameState) {
        document.getElementById('current-player').textContent = currentPlayer;
        startTurnTimer(timeLimit);

        // Update all players' data
        if (gameState.players) {
            currentRoom.players = gameState.players;
            const player = gameState.players.find(p => p.socketId === mySocketId);
            if (player) {
                myTimeline = player.timeline;
                myCoins = player.coins;
            }
        }
    }
    
    // Initialize game UI
    initializeGame(currentRoom);
});

// Handle individual player data updates
socket.on('playerData', ({ timeline, coins }) => {
    myTimeline = timeline;
    myCoins = coins;
    updateCoinsDisplay();
    renderTimeline();
});

socket.on('gameStateUpdated', ({ gameState, players }) => {
    // Update room state
    if (currentRoom) {
        currentRoom.gameState = gameState;
        currentRoom.players = players;
        
        // Update UI
        updatePlayersList(players);
        const player = players.find(p => p.socketId === mySocketId);
        if (player) {
            myTimeline = player.timeline;
            myCoins = player.coins;
            updateCoinsDisplay();
            renderTimeline();
        }
    }
});

socket.on('playerJoined', ({ username, socketId }) => {
    const playerItem = document.createElement('div');
    playerItem.className = 'item';
    playerItem.textContent = username;
    if (socketId === currentRoom.host) {
        playerItem.classList.add('host-player');
    }
    document.getElementById('players-list').appendChild(playerItem);
});

// Turn timer handling
let turnTimer = null;

function startTurnTimer(seconds) {
    clearInterval(turnTimer);
    const timerDisplay = document.getElementById('turn-timer');
    let timeLeft = seconds;

    function updateTimer() {
        timerDisplay.textContent = `${timeLeft}s`;
        if (timeLeft <= 10) {
            timerDisplay.style.color = 'red';
            createTimerBeep();
        }
        timeLeft--;

        if (timeLeft < 0) {
            clearInterval(turnTimer);
        }
    }

    updateTimer();
    turnTimer = setInterval(updateTimer, 1000);
}

socket.on('turnUpdate', ({ currentPlayer, timeLimit }) => {
    document.getElementById('current-player').textContent = currentPlayer;
    document.getElementById('turn-timer').style.color = '';
    startTurnTimer(timeLimit);
});

socket.on('turnStart', ({ playerId, playerName, timeLimit }) => {
    isMyTurn = playerId === mySocketId;
    document.getElementById('turn-actions').classList.toggle('hidden', !isMyTurn);
    document.getElementById('current-player').textContent = 
        isMyTurn ? 'Your Turn' : `${playerName}'s Turn`;
    
    // Reset and start turn timer
    document.getElementById('turn-timer').style.color = '';
    startTurnTimer(timeLimit);
});

socket.on('turnTimeout', () => {
    if (isMyTurn) {
        alert('Time\'s up! Your turn has ended.');
        document.getElementById('card-preview').classList.add('hidden');
        currentSong = null;
    }
});

socket.on('newCard', ({ song }) => {
    if (!song) {
        console.error('Received empty song data');
        return;
    }
    console.log('Received song:', song);
    handleCardPlacement(song);
});

// Handle timeline updates from other players
socket.on('playerTimelineUpdate', ({ playerId, timeline }) => {
    if (playerId !== mySocketId) {
        const playerElement = document.querySelector(`[data-player-id="${playerId}"]`);
        if (playerElement) {
            const timelineContainer = playerElement.querySelector('.player-timeline');
            timelineContainer.innerHTML = '';
            const sortedTimeline = sortTimelineByYear(timeline);
            sortedTimeline.forEach(card => {
                const cardElement = createCardElement(card);
                timelineContainer.appendChild(cardElement);
            });
        }
    }
});

// Handle stopping playback
socket.on('stopPlaying', () => {
    if (player) {
        player.pause();
    }
});

socket.on('placementResult', ({ correct, socketId, nextPlayer }) => {
    // Update current player display
    document.getElementById('current-player').textContent = 
        nextPlayer.socketId === mySocketId ? 'Your Turn' : `${nextPlayer.username}'s Turn`;
    
    if (socketId === mySocketId) {
        if (correct) {
            // Show the actual song details before adding to timeline
            document.getElementById('preview-name').textContent = currentSong.name;
            document.getElementById('preview-artist').textContent = currentSong.artist;
            document.getElementById('preview-album').textContent = `Album: ${currentSong.album || 'N/A'}`;
            
            // Add to timeline after a short delay to show the details
            setTimeout(() => {
                myTimeline.push({
                    songId: currentSong,
                    position: calculateNewPosition('after')
                });
                renderTimeline();
                showConfetti();
                
                // Clear preview and stop playback
                if (player) {
                    player.pause();
                }
                currentSong = null;
                document.getElementById('card-preview').classList.add('hidden');
            }, 2000);
        } else {
            // Show the actual song details before discarding
            document.getElementById('preview-name').textContent = currentSong.name;
            document.getElementById('preview-artist').textContent = currentSong.artist;
            document.getElementById('preview-album').textContent = `Album: ${currentSong.album || 'N/A'}`;
            
            createErrorSound();
            
            // Show error and clear after delay
            setTimeout(() => {
                alert('Incorrect placement! The card has been discarded.');
                
                // Stop playback and clear preview
                if (player) {
                    player.pause();
                }
                currentSong = null;
                document.getElementById('card-preview').classList.add('hidden');
            }, 2000);
        }
        
        // Unlock card slots for next turn
        const cardSlots = document.querySelectorAll('.card-slot');
        cardSlots.forEach(slot => {
            slot.classList.remove('disabled');
            slot.style.pointerEvents = 'auto';
        });
    }
});

// Game end handling
socket.on('gameWon', ({ winner, scores }) => {
    clearInterval(turnTimer);
    const scoresList = document.getElementById('final-scores');
    scoresList.innerHTML = '';
    
    // Sort scores in descending order
    scores.sort((a, b) => b.score - a.score);
    
    scores.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'item';
        const place = index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        item.innerHTML = `
            <div class="content">
                <div class="header">${place} ${player.username}</div>
                <div class="description">Score: ${player.score}</div>
            </div>
        `;
        scoresList.appendChild(item);
    });
    
    $('.game-over.modal').modal('show');
});

socket.on('suddenDeath', ({ newCardsToWin }) => {
    document.getElementById('new-target-cards').textContent = newCardsToWin;
    $('.sudden-death.modal').modal('show');
});

// Play again handling
document.getElementById('play-again')?.addEventListener('click', () => {
    $('.game-over.modal').modal('hide');
    document.getElementById('waiting-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    myTimeline = [];
    myCoins = 2;
    updateCoinsDisplay();
});

socket.on('playerLeft', ({ socketId, newHost }) => {
    if (socketId === currentRoom.host) {
        currentRoom.host = newHost;
        if (mySocketId === newHost) {
            isHost = true;
            document.getElementById('host-controls').classList.remove('hidden');
        }
    }
    updatePlayersList(currentRoom.players.filter(p => p.socketId !== socketId));
});

// Helper functions
function updatePlayersList(players) {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'item';
        if (player.socketId === currentRoom.host) {
            playerItem.classList.add('host-player');
        }
        if (player.socketId === mySocketId) {
            playerItem.classList.add('current-player');
        }
        playerItem.textContent = player.username;
        list.appendChild(playerItem);
    });
    
    // Update other players' timelines
    const otherPlayers = players.filter(p => p.socketId !== mySocketId);
    renderOtherPlayersTimelines(otherPlayers);
}

// Bet handling
document.getElementById('bet-coin-btn')?.addEventListener('click', () => {
    if (myCoins >= 1) {
        $('.bet-modal').modal('show');
    }
});

document.getElementById('submit-guess')?.addEventListener('click', () => {
    const artist = document.getElementById('guess-artist').value;
    const song = document.getElementById('guess-song').value;
    
    socket.emit('submitGuess', {
        roomId: currentRoom.roomId,
        socketId: mySocketId,
        guess: { artist, song }
    });
    
    $('.bet-modal').modal('hide');
});

// Host validation handling
socket.on('guessValidation', ({ playerId, guess }) => {
    if (isHost) {
        document.getElementById('validation-content').innerHTML = `
            <p><strong>Player Guess:</strong></p>
            <p>Artist: ${guess.artist}</p>
            <p>Song: ${guess.song}</p>
        `;
        $('.admin-validation').modal('show');
    }
});

document.querySelector('.approve-guess')?.addEventListener('click', () => {
    socket.emit('validateGuess', {
        roomId: currentRoom.roomId,
        correct: true
    });
    $('.admin-validation').modal('hide');
});

document.querySelector('.reject-guess')?.addEventListener('click', () => {
    socket.emit('validateGuess', {
        roomId: currentRoom.roomId,
        correct: false
    });
    $('.admin-validation').modal('hide');
});
