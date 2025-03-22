// Initialize tabs and modals
$('.menu .item').tab();
$('.ui.modal').modal();

// Hide game room initially
document.getElementById('game-room').classList.add('hidden');
document.getElementById('welcome-screen').classList.remove('hidden');

// Theme handling
const themeToggle = document.getElementById('theme-toggle');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

// Initialize theme from localStorage or system preference
const savedTheme = localStorage.getItem('theme') || 'dark'; // Default to dark theme
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeToggleIcon(savedTheme);

// Theme toggle click handler
themeToggle?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggleIcon(newTheme);
});

// Update theme toggle icon and styles
function updateThemeToggleIcon(theme) {
    const icon = themeToggle?.querySelector('i');
    if (icon) {
        icon.className = theme === 'dark' ? 'icon moon' : 'icon sun';
    }

    // Update card colors based on theme
    const cards = document.querySelectorAll('.timeline-card');
    cards.forEach((card, index) => {
        if (theme === 'dark') {
            switch (index % 5) {
                case 0:
                    card.style.background = 'linear-gradient(135deg, #162D4D, #1a4580)';
                    break;
                case 1:
                    card.style.background = 'linear-gradient(135deg, #1a3d6c, #2c5c9e)';
                    break;
                case 2:
                    card.style.background = 'linear-gradient(135deg, #1c2f4a, #2b4870)';
                    break;
                case 3:
                    card.style.background = 'linear-gradient(135deg, #203354, #334e7a)';
                    break;
                case 4:
                    card.style.background = 'linear-gradient(135deg, #152844, #243e66)';
                    break;
            }
        } else {
            switch (index % 5) {
                case 0:
                    card.style.background = 'linear-gradient(135deg, #e3f2fd, #bbdefb)';
                    break;
                case 1:
                    card.style.background = 'linear-gradient(135deg, #e8f5e9, #c8e6c9)';
                    break;
                case 2:
                    card.style.background = 'linear-gradient(135deg, #f3e5f5, #e1bee7)';
                    break;
                case 3:
                    card.style.background = 'linear-gradient(135deg, #fff3e0, #ffe0b2)';
                    break;
                case 4:
                    card.style.background = 'linear-gradient(135deg, #e0f7fa, #b2ebf2)';
                    break;
            }
        }
    });
}

// System theme change handler
prefersDarkScheme.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        updateThemeToggleIcon(newTheme);
    }
});

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
document.addEventListener('DOMContentLoaded', function () {
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
$('#add-song-form').on('submit', function (e) {
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
        await Swal.fire({
            title: 'Missing Username',
            text: 'Please enter a username',
            icon: 'warning',
            confirmButtonText: 'OK',
            background: '#ffc107',
            color: '#000000'
        });
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
        await Swal.fire({
            title: 'Error',
            text: 'Error creating room: ' + error.message,
            icon: 'error',
            confirmButtonText: 'OK',
            background: '#dc3545',
            color: '#ffffff'
        });
    }
});

// Join Room
document.getElementById('join-room-btn').addEventListener('click', async () => {
    const roomId = document.getElementById('join-room-id').value.trim();
    const username = document.getElementById('join-username').value.trim();

    if (!roomId || !username) {
        await Swal.fire({
            title: 'Missing Information',
            text: 'Please enter both room ID and username',
            icon: 'warning',
            confirmButtonText: 'OK',
            background: '#ffc107',
            color: '#000000'
        });
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
        await Swal.fire({
            title: 'Error',
            text: 'Error joining room: ' + error.message,
            icon: 'error',
            confirmButtonText: 'OK',
            background: '#dc3545',
            color: '#ffffff'
        });
    }
});

// Join Game Room
function joinGameRoom(roomId, username) {
    socket.emit('joinRoom', { roomId, username });

    // Hide welcome elements
    document.getElementById('welcome-screen').classList.add('hidden');
    document.querySelector('.ui.header.massive.animated').classList.add('hidden');
    document.querySelector('.game-instructions').classList.add('hidden');

    // Show game room
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
        await Swal.fire({
            title: 'Error',
            text: 'Error starting game: ' + error.message,
            icon: 'error',
            confirmButtonText: 'OK',
            background: '#dc3545',
            color: '#ffffff'
        });
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

    for (let i = 0; i < 25; i++) {
        const cardSlot = document.createElement('div');
        cardSlot.className = 'card-slot';
        cardSlot.textContent = '♫';
        cardSlot.addEventListener('click', () => selectCard(i));
        grid.appendChild(cardSlot);
    }
}

// Select a card
function selectCard(index) {
    if (!isMyTurn || !currentRoom || currentSong) return;

    // Lock all cards immediately when one is selected
    lockCardSlots();

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
}

// Update placement buttons based on timeline
function updatePlacementButtons() {
    const intermediateContainer = document.getElementById('intermediate-positions');
    intermediateContainer.innerHTML = '';

    const sortedTimeline = sortTimelineByYear(myTimeline);

    // Always show before button for the first card
    const beforeButton = document.createElement('button');
    beforeButton.className = 'ui button blue';
    beforeButton.textContent = sortedTimeline.length > 0
        ? `Place before ${sortedTimeline[0].songId.release_year}`
        : 'Place as first card';
    beforeButton.onclick = () => confirmPlacement('before');
    intermediateContainer.appendChild(beforeButton);

    // Show intermediate buttons for multiple cards
    if (sortedTimeline.length > 0) {
        for (let i = 0; i < sortedTimeline.length; i++) {
            const currentCard = sortedTimeline[i];
            const nextCard = sortedTimeline[i + 1];
            const br = document.createElement('br');
            intermediateContainer.appendChild(br);

            // For the last card or when there's a gap in years between cards
            if (!nextCard ) {
                const afterButton = document.createElement('button');

                afterButton.className = 'ui button blue';
                afterButton.textContent = `Place after ${currentCard.songId.release_year}`;
                afterButton.onclick = () => confirmPlacement('after', i);
                intermediateContainer.appendChild(afterButton);
            }

            // Add between button if there's a next card
            if (nextCard) {
                const betweenButton = document.createElement('button');
                betweenButton.className = 'ui button blue';
                betweenButton.textContent = `Place between ${currentCard.songId.release_year} and ${nextCard.songId.release_year}`;
                betweenButton.onclick = () => confirmPlacement('between', i);
                intermediateContainer.appendChild(betweenButton);
            }
        }
    } else {
        // If no cards, show single button to place first card
        const firstButton = document.createElement('button');
        firstButton.className = 'ui button blue';
        firstButton.textContent = 'Place card';
        firstButton.onclick = () => confirmPlacement('after');
        intermediateContainer.appendChild(firstButton);
    }
}

// Lock all card slots during song playback
function lockCardSlots() {
    const cardSlots = document.querySelectorAll('.card-slot');
    cardSlots.forEach(slot => {
        slot.classList.add('disabled');
        slot.style.pointerEvents = 'none';
    });
}

// Unlock card slots for next turn
function unlockCardSlots() {
    const cardSlots = document.querySelectorAll('.card-slot');
    cardSlots.forEach(slot => {
        slot.classList.remove('disabled');
        slot.style.pointerEvents = 'auto';
    });
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

socket.on('gameStarted', ({ currentPlayer, gameState }) => {
    document.getElementById('waiting-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Update game state
    if (gameState) {
        document.getElementById('current-player').textContent = currentPlayer;
        
        // Show admin controls if host
        if (isHost) {
            document.getElementById('admin-turn-controls').classList.remove('hidden');
            
            // Initialize coin management dropdown
            const coinPlayerSelect = document.getElementById('coin-player');
            coinPlayerSelect.innerHTML = '';
            gameState.players.forEach(p => {
                const option = document.createElement('option');
                option.value = p.socketId;
                option.textContent = `${p.username} (🪙: ${p.coins})`;
                coinPlayerSelect.appendChild(option);
            });
        }

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

// Coin management event handlers
document.getElementById('add-coin-btn')?.addEventListener('click', () => {
    if (isHost && currentRoom) {
        const selectedPlayer = document.getElementById('coin-player').value;
        socket.emit('manageCoin', {
            roomId: currentRoom.roomId,
            playerSocketId: selectedPlayer,
            action: 'add'
        });
    }
});

document.getElementById('remove-coin-btn')?.addEventListener('click', () => {
    if (isHost && currentRoom) {
        const selectedPlayer = document.getElementById('coin-player').value;
        socket.emit('manageCoin', {
            roomId: currentRoom.roomId,
            playerSocketId: selectedPlayer,
            action: 'remove'
        });
    }
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

        // Update coin management dropdown if host
        if (isHost) {
            const coinPlayerSelect = document.getElementById('coin-player');
            coinPlayerSelect.innerHTML = '';
            players.forEach(p => {
                const option = document.createElement('option');
                option.value = p.socketId;
                option.textContent = `${p.username} (🪙: ${p.coins})`;
                coinPlayerSelect.appendChild(option);
            });
        }
    }
});

socket.on('coinUpdated', ({ playerSocketId, coins, username }) => {
    // Update coin display in player list
    const playerItem = document.querySelector(`[data-player-id="${playerSocketId}"]`);
    if (playerItem) {
        const coinSpan = playerItem.querySelector('.coin-count');
        if (coinSpan) {
            coinSpan.textContent = coins;
        }
    }

    // Update my coins if I'm the player
    if (playerSocketId === mySocketId) {
        myCoins = coins;
        updateCoinsDisplay();
    }

    // Show notification
    Swal.fire({
        title: 'Coins Updated',
        text: `${username}'s coins: ${coins}`,
        icon: 'info',
        timer: 2000,
        showConfirmButton: false
    });
});

socket.on('playerJoined', ({ username, socketId }) => {
    const playerItem = document.createElement('div');
    playerItem.className = 'item';
    playerItem.setAttribute('data-player-id', socketId);
    
    if (socketId === currentRoom.host) {
        playerItem.classList.add('host-player');
    }

    // Add username and coins display (new players start with 2 coins)
    playerItem.innerHTML = `
        ${username} 
        <span class="coin-count" style="float: right;">🪙 2</span>
    `;
    
    document.getElementById('players-list').appendChild(playerItem);

    // Update coin management dropdown if host
    if (isHost) {
        const coinPlayerSelect = document.getElementById('coin-player');
        const option = document.createElement('option');
        option.value = socketId;
        option.textContent = `${username} (🪙: 2)`;
        coinPlayerSelect.appendChild(option);
    }
});

// Turn control handling
socket.on('turnUpdate', ({ currentPlayer }) => {
    document.getElementById('current-player').textContent = currentPlayer;
    if (isHost) {
        document.getElementById('admin-turn-controls').classList.remove('hidden');
    }
});

socket.on('turnStart', ({ playerId, playerName }) => {
    isMyTurn = playerId === mySocketId;
    document.getElementById('turn-actions').classList.toggle('hidden', !isMyTurn);
    document.getElementById('current-player').textContent =
        isMyTurn ? 'Your Turn' : `${playerName}'s Turn`;

    // Show admin controls if host
    if (isHost) {
        document.getElementById('admin-turn-controls').classList.remove('hidden');
    }

    // Reset song state and unlock cards at the start of turn
    currentSong = null;
    unlockCardSlots();
});

// Add event listeners for admin controls
document.getElementById('skip-turn-btn')?.addEventListener('click', () => {
    if (isHost && currentRoom) {
        socket.emit('skipTurn', { roomId: currentRoom.roomId });
    }
});

document.getElementById('next-turn-btn')?.addEventListener('click', () => {
    if (isHost && currentRoom) {
        socket.emit('nextTurn', { roomId: currentRoom.roomId });
    }
});

socket.on('turnSkipped', async () => {
    if (isMyTurn) {
        try {
            await Swal.fire({
                html: `
                    <div style="
                        background: linear-gradient(135deg, #4d2d1a, #804d1a);
                        padding: 20px;
                        border-radius: 10px;
                        border: 2px solid #ffa500;
                        box-shadow: 0 0 20px rgba(255, 165, 0, 0.3);
                    ">
                        <h2 style="
                            color: #ffa500;
                            margin-bottom: 20px;
                            text-shadow: 0 0 10px rgba(255, 165, 0, 0.5);
                            font-size: 2em;
                        ">Time's Up!</h2>
                        <div style="
                            font-size: 1.5em;
                            color: #ffcc80;
                            margin: 10px 0;
                            text-shadow: 0 0 5px rgba(255, 165, 0, 0.3);
                        ">Your turn has ended</div>
                    </div>
                `,
                background: 'transparent',
                backdrop: 'rgba(41, 25, 10, 0.9)',
                timer: 3000,
                showConfirmButton: false,
                customClass: {
                    popup: 'animated fadeIn'
                }
            });
        } catch (error) {
            console.error('Error showing alert:', error);
        }
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

    // Emit song sync event to all players in the room
    socket.emit('syncSongPlayback', {
        roomId: currentRoom.roomId,
        song: song
    });
});

// Handle synchronized song playback
socket.on('playSyncedSong', ({ song }) => {
    if (!song || !song.link_or_file) return;

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
    }
});

// Handle timeline updates from other players
socket.on('playerTimelineUpdate', ({ playerId, timeline }) => {
    // Update the timeline for the player who made the change
    if (playerId === mySocketId) {
        myTimeline = timeline;
        renderTimeline();
    }

    // Update the timeline for other players
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
});

// Handle stopping playback
socket.on('stopPlaying', () => {
    if (player) {
        player.pause();
    }
});

socket.on('placementResult', async ({ correct, socketId, playerName, song }) => {
    // Don't update current player or unlock slots - wait for admin to trigger next turn
    if (song) {
        try {
            if (socketId === mySocketId) {
                // Show the actual song details for the current player
                document.getElementById('preview-name').textContent = song.name;
                document.getElementById('preview-artist').textContent = song.artist;
                document.getElementById('preview-album').textContent = `Album: ${song.album || 'N/A'}`;

                // Wait for 1 second to show the song details
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (correct) {
                // Show success alert to all players
                await Swal.fire({
                    html: `
                        <div style="
                            background: linear-gradient(135deg, #162D4D, #1a4580);
                            padding: 20px;
                            border-radius: 10px;
                            border: 2px solid #00ff9d;
                            box-shadow: 0 0 20px rgba(0, 255, 157, 0.3);
                        ">
                            <h2 style="
                                color: #00ff9d;
                                margin-bottom: 20px;
                                text-shadow: 0 0 10px rgba(0, 255, 157, 0.5);
                            ">${socketId === mySocketId ? 'Correct Placement!' : `${playerName} Placed Correctly!`}</h2>
                            <div style="
                                font-size: 2.5em;
                                color: #ffffff;
                                margin: 20px 0;
                                text-shadow: 0 0 10px rgba(0, 204, 255, 0.5);
                            ">${song.release_year}</div>
                            <div style="
                                font-size: 1.5em;
                                color: #00ccff;
                                margin: 10px 0;
                                text-shadow: 0 0 5px rgba(0, 204, 255, 0.3);
                            ">${song.name}</div>
                            <div style="
                                color: #88ccff;
                                margin-top: 10px;
                            ">by ${song.artist}</div>
                            <div style="
                                color: #88ccff;
                                font-size: 0.9em;
                                margin-top: 5px;
                            ">${song.album || ''}</div>
                        </div>
                    `,
                    background: 'transparent',
                    backdrop: 'rgba(10, 25, 41, 0.9)',
                    timer: 3000,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'animated fadeIn'
                    }
                });

                if (socketId === mySocketId) {
                    showConfetti();
                }
            } else {
                if (socketId === mySocketId) {
                    createErrorSound();
                }

                // Show error alert to all players
                await Swal.fire({
                    html: `
                        <div style="
                            background: linear-gradient(135deg, #2d1a1a, #4d1a1a);
                            padding: 20px;
                            border-radius: 10px;
                            border: 2px solid #ff4444;
                            box-shadow: 0 0 20px rgba(255, 68, 68, 0.3);
                        ">
                            <h2 style="
                                color: #ff4444;
                                margin-bottom: 20px;
                                text-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
                            ">${socketId === mySocketId ? 'Incorrect Placement!' : `${playerName} Placed Incorrectly!`}</h2>
                            <div style="
                                font-size: 2.5em;
                                color: #ffffff;
                                margin: 20px 0;
                                text-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
                            ">${song.release_year}</div>
                            <div style="
                                font-size: 1.5em;
                                color: #ff8888;
                                margin: 10px 0;
                                text-shadow: 0 0 5px rgba(255, 68, 68, 0.3);
                            ">${song.name}</div>
                            <div style="
                                color: #ffaaaa;
                                margin-top: 10px;
                            ">by ${song.artist}</div>
                            <div style="
                                color: #ffaaaa;
                                font-size: 0.9em;
                                margin-top: 5px;
                            ">${song.album || ''}</div>
                        </div>
                    `,
                    background: 'transparent',
                    backdrop: 'rgba(41, 10, 10, 0.9)',
                    timer: 3000,
                    showConfirmButton: false,
                    customClass: {
                        popup: 'animated fadeIn'
                    }
                });
            }
        } catch (error) {
            console.error('Error showing alert:', error);
        }

        // Clear preview and stop playback
        if (player) {
            player.pause();
        }
        currentSong = null;
        document.getElementById('card-preview').classList.add('hidden');
        
        // Keep card slots locked until admin triggers next turn
    }
});

// Game end handling
socket.on('gameWon', ({ winner, scores }) => {
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

    // Show welcome elements
    document.querySelector('.ui.header.massive.animated').classList.remove('hidden');
    document.querySelector('.game-instructions').classList.remove('hidden');
    document.getElementById('welcome-screen').classList.remove('hidden');

    // Hide game elements
    document.getElementById('game-room').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');

    // Reset game state
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
        playerItem.setAttribute('data-player-id', player.socketId);
        
        if (player.socketId === currentRoom.host) {
            playerItem.classList.add('host-player');
        }
        if (player.socketId === mySocketId) {
            playerItem.classList.add('current-player');
        }

        // Add username and coins display
        playerItem.innerHTML = `
            ${player.username} 
            <span class="coin-count" style="float: right;">🪙 ${player.coins}</span>
        `;
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
