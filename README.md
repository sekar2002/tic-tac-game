# Multiplayer Tic-Tac-Toe Game

A real-time multiplayer Tic-Tac-Toe game built with **Angular** (frontend) and **Nakama** (Go backend) with **PostgreSQL** database.

## Tech Stack

### Frontend
- **Angular 17** - Component-based UI framework
- **TypeScript** - Type-safe JavaScript
- **CSS3** - Responsive styling with gradients and animations
- **WebSocket** - Real-time communication

### Backend
- **Nakama 3.22** - Game server framework
- **Go** - Server-side game logic
- **PostgreSQL 15** - Database for persistence
- **Docker** - Containerized deployment



## Setup Instructions

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for Angular CLI)

### Step 1: Start Nakama & PostgreSQL

```bash
docker-compose up -d
```

This will start:
- PostgreSQL on port 5432
- Nakama on ports 7349, 7350, 7351

Verify Nakama is running:
```bash
curl http://localhost:7350
```

### Step 2: Install Frontend Dependencies

```bash
cd frontend
npm install
```

### Step 3: Start Angular Development Server

```bash
npm start
```

The app will be available at `http://localhost:4200`

## Project Structure

```
.
├── docker-compose.yml              # Docker configuration
├── nakama/
│   └── data/
│       ├── args.yml                # Nakama configuration
│       └── modules/
│           ├── go.mod              # Go module file
│           └── main.go             # Server-side game logic
└── frontend/
    ├── package.json                # Node dependencies
    ├── angular.json                # Angular configuration
    ├── tsconfig.json               # TypeScript configuration
    └── src/
        ├── app/
        │   ├── app.module.ts
        │   ├── app-routing.module.ts
        │   ├── app.component.ts
        │   ├── services/
        │   │   └── nakama.service.ts    # Nakama communication
        │   └── components/
        │       ├── login/               # Login screen
        │       ├── lobby/               # Game lobby
        │       ├── game/                # Game board
        │       └── leaderboard/         # Leaderboard display
        |       |__matchmaking
        ├── styles.css                   # Global styles
        ├── main.ts
        └── index.html
```



## How to Play

### 1. Login
- Whenever the user login,if account exist user will be redirected to lobby
- If no account exist,account will be created

### 2. Lobby
- **Create Room**: When creating a room,a new game will be created.Until the next player joins,he will be waiting for the opponent to join
- **Join Room**: When the user has a room id of created room,they can join the room to play.
- **Find Match**: The players will be available in the queue when they give find a match and they will be paired up.
- **Discover Rooms**: When they give discover rooms,if already player is available by creating a room ,the rooms will be showing for joining.The player can join the game by clicking on join
- **Leaderboard**: The leaderboard will be showing the list of players with the total score

### 3. Game Modes

#### Classic Mode
- No time limits
- Player can make move as their own wis

#### Timed Mode
- 30 seconds per turn
- If the player doesnt make move within the time,then the opponent will win
- Timer will be displayed for both the player[Time left for the move]

### 4. Playing the Game
- Click on any empty cell to place your symbol (X or O)
- X always goes first
- Game state are updated to both the players
- Winner announced when 3 in a row achieved


## API Endpoints

### RPC Functions

```
┌────┬──────────────────────┬──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────┐
│ #  │ RPC Name             │ Purpose              │ What it does                                                                                 │
├────┼──────────────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1  │ create_game          │ Create a game room   │ Creates game in storage, assigns Player X                                                    │
│ 2  │ join_game            │ Join a room          │ Assigns Player O to existing room                                                            │
│ 3  │ make_move            │ Submit a move        │ Validates move (turn, cell empty, not game over), applies it, checks winner, updates storage │
│ 4  │ get_game_state       │ Fetch current state  │ Reads game state, checks timeout (timed mode)                                                │
│ 5  │ check_timeout        │ Check turn timer     │ Validates if current player timed out                                                        │
│ 6  │ list_games           │ List rooms           │ Shows open rooms waiting for opponent                                                        │
│ 7  │ get_leaderboard      │ View rankings        │ Fetches all player stats, sorts by score                                                     │
│ 8  │ cleanup_games        │ Delete old games     │ Removes finished/abandoned rooms                                                             │
│ 9  │ find_match           │ Quick match          │ Queue system — joins queue or matches 2 waiting players                                      │
│ 10 │ check_match_status   │ Poll matchmaking     │ Checks if player has been matched                                                            │
│ 11 │ store_username       │ Save username        │ Stores username for leaderboard display                                                      │
└────┴──────────────────────┴──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────┘
```




## Development

### Backend (Nakama Go Module)

To rebuild after changes:
```bash
docker-compose restart nakama
```

Logs:
```bash
docker-compose logs -f nakama
```

### Frontend (Angular)

Install dependencies:
```bash
cd frontend && npm install
```

Development server:
```bash
npm start
```

Build for production:
```bash
npm run build
```

## Configuration

### Nakama Server
Edit `nakama/data/args.yml`:
- Server port (default: 7350)
- Session token expiry
- Logger level

### Frontend
Edit `frontend/src/app/services/nakama.service.ts`:
- Server host (default: localhost)
- Server port (default: 7350)
- HTTP key (default: defaulthttpkey)

## Production Deployment

### Docker Compose Production Mode

```bash
docker-compose up -d --build
```

### Angular Production Build

```bash
cd frontend
npm run build
```



