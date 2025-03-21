# HitZone - Music Timeline Game

A multiplayer web game where players compete to create the most accurate music timeline by placing songs in chronological order.

## Features

- Create and join game rooms
- Real-time multiplayer using Socket.IO
- Music timeline creation and validation
- Coin system for special actions
- Support for YouTube links and MP3 files
- Persistent game state across disconnections

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start MongoDB server locally or set MONGODB_URI in environment variables

3. Run the development server:
```bash
npm run dev
```

4. Access the game at `http://localhost:3000`

## Game Rules

1. Each player starts with:
   - One random song card in their timeline
   - 2 virtual coins

2. On your turn:
   - Select from 50 available cards to get a random song
   - Listen to the song
   - Place it in your timeline before/after existing cards
   - If placed correctly, keep the card; if wrong, discard it

3. Special Actions:
   - Bet 1 coin to guess artist/song name (win 1 coin if correct)
   - Use 3 coins to buy an extra card or steal a future turn

4. Winning:
   - First player to complete their timeline (5, 7, or 10 cards) wins
   - Sudden death if multiple players complete simultaneously

## API Endpoints

### Songs
- `POST /api/songs` - Create a new song
- `GET /api/songs` - Get all songs
- `GET /api/songs/random` - Get a random song
- `GET /api/songs/:id` - Get a specific song
- `PUT /api/songs/:id` - Update a song
- `DELETE /api/songs/:id` - Delete a song

### Rooms
- `POST /api/rooms/create` - Create a new room
- `POST /api/rooms/join` - Join an existing room
- `GET /api/rooms/:roomId/state` - Get room state
- `POST /api/rooms/:roomId/start` - Start game
- `PUT /api/rooms/:roomId/state` - Update room state

## Technologies Used

- Node.js + Express
- MongoDB + Mongoose
- Socket.IO
- Pug Templates
- Fomantic UI
- jQuery
