import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NakamaService, GameState } from '../../services/nakama.service';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, OnDestroy {
  matchId: string = '';
  gameState: GameState | null = null;
  loading: boolean = false;
  error: string = '';
  success: string = '';
  timerSeconds: number = 0;
  timerInterval: any;
  isMyTurn: boolean = false;
  mySymbol: string = '';
  matchStarted: boolean = false;
  waitingForOpponent: boolean = true;

  private isCreator: boolean = false;
  private timerRemaining: number = 0; // Local countdown synced from server

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private nakamaService: NakamaService
  ) {}

  ngOnInit(): void {
    // Verify user is logged in
    if (!this.nakamaService.currentSession) {
      this.error = 'Not logged in. Please login first.';
      setTimeout(() => this.router.navigate(['/login']), 2000);
      return;
    }

    // CRITICAL: Extract matchId from route params
    this.matchId = this.route.snapshot.params['matchId'] || '';

    // Read query parameters
    const isCreatorParam = this.route.snapshot.queryParams['creator'] === 'true';
    const isMatchmaking = this.route.snapshot.queryParams['matchmaking'] === 'true';

    console.log('[Game] ngOnInit - matchId:', this.matchId, 'isCreator:', isCreatorParam, 'isMatchmaking:', isMatchmaking);

    // Handle matchmaking - both players are matched simultaneously
    if (isMatchmaking) {
      console.log('[Game] Matchmaking flow - querying server for role');

      // Start polling immediately for game state updates
      this.pollInterval = setInterval(() => {
        this.pollGameState();
      }, 1000);

      // Query server for game state to determine our role
      this.nakamaService.getGameState(this.matchId).then(res => {
        if (res.success && res.state) {
          const players = res.state.players || {};
          const myId = this.nakamaService.currentSession.user?.id || '';

          console.log('[Game] Matchmaking server response - x_id:', players.x_id, 'o_id:', players.o_id, 'myId:', myId);

          // Server determines our role based on who we are
          const isPlayerX = players.x_id === myId;
          this.isCreator = isPlayerX;
          this.mySymbol = isPlayerX ? 'X' : 'O';
          this.matchStarted = true;
          this.waitingForOpponent = false;

          // Build game state from server
          this.gameState = {
            board: res.state.board || ['', '', '', '', '', '', '', '', ''],
            currentTurn: res.state.turn || 'X',
            playerX: players.x_id || '',
            playerO: players.o_id || '',
            winner: res.state.winner || '',
            mode: res.state.mode || 'classic',
            timerEndsAt: res.state.timerEndsAt || 0,
            createdAt: Date.now()
          };

          this.isMyTurn = this.gameState.currentTurn === this.mySymbol;
          console.log('[Game] Matchmaking - mySymbol:', this.mySymbol, 'isMyTurn:', this.isMyTurn);
          this.startTimer();
        }
      }).catch(err => {
        console.error('[Game] Matchmaking - failed to get game state:', err);
        this.error = 'Failed to load game state';
      });

      // Join the match via WebSocket for real-time updates
      this.nakamaService.joinMatchById(this.matchId);

      return;
    }


    // If matchId is 'new', create the game via RPC first
    if (!this.matchId || this.matchId === 'new') {
      this.nakamaService.createGame('classic').then(res => {
        console.log('[Game] Player 1 - createGame response:', res);
        if (res.success && res.matchId) {
          this.matchId = res.matchId;
          this.matchStarted = true;
          this.isCreator = true;
          this.mySymbol = 'X';
          this.waitingForOpponent = true;  // Wait for Player 2 to join
          this.isMyTurn = false;           // Not until opponent joins

          // IMPORTANT: Set isPlayerX BEFORE calling joinMatchById so it's preserved
          this.nakamaService.match = {
            match_id: res.matchId,
            match_id_clean: res.matchId,
            size: 1,
            self: null,
            isPlayerX: true  // Creator is always Player X
          };

          console.log('[Game] Player 1 - Created game, matchId:', this.matchId, 'isCreator:', this.isCreator, 'waitingForOpponent:', this.waitingForOpponent);

          // Now join the match via WebSocket to receive real-time updates
          this.nakamaService.joinMatchById(res.matchId);
          console.log('[Game] Player 1 - Calling joinMatchById');
        }
      }).catch(err => {
        console.error('[Game] Player 1 - createGame error:', err);
      });
    } else {
            console.log('[Game] Joining existing game:', this.matchId, 'isCreator:', isCreatorParam);

      if (isCreatorParam) {
        // We're the creator - just set our state and join the match
        this.matchStarted = true;
        this.isCreator = true;
        this.mySymbol = 'X';
        this.waitingForOpponent = true;  // Wait for Player 2 to join
        this.isMyTurn = false;           // Not until opponent joins

        // Set isPlayerX before joining
        this.nakamaService.match = {
          match_id: this.matchId,
          match_id_clean: this.matchId,
          size: 1,
          self: null,
          isPlayerX: true
        };

        console.log('[Game] Creator joining match:', this.matchId);
        this.nakamaService.joinMatchById(this.matchId);
      } else {
        // We're the joiner - call joinGame RPC
        this.nakamaService.joinGame(this.matchId).then(res => {
          console.log('[Game] joinGame response:', res);
          if (res.success) {
            // We joined successfully. We are now Player O
            this.mySymbol = 'O';
            this.matchStarted = true;
            this.isCreator = false;
            this.waitingForOpponent = false;  // Player X already exists
            this.isMyTurn = false;            // Player X goes first

            console.log('[Game] Successfully joined as Player O, waiting for Player X move');
          } else {
            this.error = res.error || 'Failed to join';
            console.error('[Game] Failed to join:', this.error);
          }
        }).catch(err => {
          console.error('[Game] joinGame error:', err);
          this.error = 'Error joining game';
        });
      }

    }

    const userId = this.nakamaService.currentSession.user?.id || 'unknown';

    console.log('[Game] INITIALIZING STATE - isCreator:', this.isCreator, 'matchStarted:', this.matchStarted, 'userId:', userId);

    // Initialize game state
    this.gameState = {
      board: ['', '', '', '', '', '', '', '', ''],
      currentTurn: 'X',
      playerX: this.isCreator ? userId : '',
      playerO: '',  // Will be set when opponent joins
      winner: '',
      mode: 'classic',
      timerEndsAt: 0,
      createdAt: Date.now()
    };

    console.log('[Game] After init - isCreator:', this.isCreator, 'waitingForOpponent:', this.waitingForOpponent, 'isMyTurn:', this.isMyTurn, 'matchStarted:', this.matchStarted);

    // Subscribe to game state updates from server
    this.nakamaService.onGameStateUpdate.subscribe((state: any) => {
      // The server sends the full state object. We just update our local state.
      this.gameState = state as GameState;
      this.updateTurnInfo();
      this.startTimer();
    });

    this.nakamaService.onMatchJoined.subscribe((matchId: string) => {
      if (matchId === 'matched' || matchId.startsWith('waiting:')) return;

      console.log('[Game] onMatchJoined - matchId:', matchId, 'isPlayerX:', this.nakamaService.match?.isPlayerX);

      this.matchId = matchId;
      this.matchStarted = true;

      if (!this.gameState) return;

      // Use role assigned by the service
      const isPlayerX = this.nakamaService.match?.isPlayerX !== false;
      this.isCreator = isPlayerX;
      console.log('[Game] onMatchJoined - isCreator:', this.isCreator);

      // Set player IDs
      if (isPlayerX) {
        this.gameState.playerX = this.nakamaService.currentSession?.user?.id || '';
      } else {
        this.gameState.playerO = this.nakamaService.currentSession?.user?.id || '';
      }
      
      // For creator (Player X), we need to wait for Player O to join
      // For joiner (Player O), we need to wait for Player X to be present
      // The match presence event will fire when both are present
    });

    // Listen for opponent join via match presence events
    this.nakamaService.onMatchPresence.subscribe((event: any) => {
      if (!this.gameState || event.matchId !== this.matchId) return;

      // Check if opponent joined
      if (event.joins && event.joins.length > 0) {
        const opponentId = event.joins[0].user_id;
        const myId = this.nakamaService.currentSession?.user?.id;

        // Ignore if it's my own join
        if (opponentId === myId) return;

        console.log('[Game] Presence detected opponent:', opponentId, 'myId:', myId, 'isCreator:', this.isCreator);

        // Update player IDs if not set
        if (this.isCreator && this.gameState.playerO !== opponentId) {
          this.gameState.playerO = opponentId;
          this.waitingForOpponent = false;
          this.isMyTurn = true; // Creator goes first
          console.log('[Game] Creator: Opponent joined, starting game');
        } else if (!this.isCreator && this.gameState.playerX !== opponentId) {
          this.gameState.playerX = opponentId;
          this.waitingForOpponent = false;
          this.isMyTurn = false; // Joiner waits
          console.log('[Game] Joiner: Opponent detected, waiting for move');
        }
      }
    });

    // Subscribe to errors
    this.nakamaService.onError.subscribe((message) => {
      this.error = message;
      setTimeout(() => this.error = '', 3000);
    });

    // Join the match
    this.joinMatch();

    // Start polling for updates to detect opponent join and state changes
    this.pollInterval = setInterval(() => {
      this.pollGameState();
    }, 1000);
  }

  private pollInterval: any;

  private hasLeftGame: boolean = false;

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    this.leaveGame();
  }

  private async pollGameState(): Promise<void> {
    if (!this.matchId || this.matchId === 'new') return;
    try {
      const res = await this.nakamaService.getGameState(this.matchId);
      if (res.success && res.state) {
        const players = res.state.players || {};
        const myId = this.nakamaService.currentSession?.user?.id;

        // Check if opponent has joined by looking at server state
        if (this.waitingForOpponent && this.gameState) {
          const opponentId = this.isCreator ? players.o_id : players.x_id;
          
          if (opponentId && opponentId !== '' && opponentId !== myId) {
            console.log('[Game] Opponent detected:', opponentId);
            this.waitingForOpponent = false;
            this.isMyTurn = this.isCreator; // Creator (X) goes first
          }
        }

        // Always sync game state from server
        if (this.gameState) {
          const prevTurn = this.gameState.currentTurn;
          this.gameState.playerX = players.x_id || '';
          this.gameState.playerO = players.o_id || '';
          this.gameState.currentTurn = res.state.turn || 'X';
          this.gameState.board = res.state.board || this.gameState.board;
          this.gameState.winner = res.state.winner || '';
          this.gameState.mode = res.state.mode || this.gameState.mode;
          this.gameState.timerEndsAt = res.state.timerEndsAt || 0;

          // Sync mySymbol from server state if not set or incorrect
          if (myId && myId !== 'unknown') {
            if (players.x_id === myId && this.mySymbol !== 'X') {
              console.log('[Game] Poll correcting mySymbol to X');
              this.mySymbol = 'X';
              this.isCreator = true;
            } else if (players.o_id === myId && this.mySymbol !== 'O') {
              console.log('[Game] Poll correcting mySymbol to O');
              this.mySymbol = 'O';
              this.isCreator = false;
            }
          }

          this.updateTurnInfo();

          // Restart timer if turn changed (opponent made a move)
          if (prevTurn !== this.gameState.currentTurn) {
            this.startTimer();
          }
        }
      }
    } catch (e) {
      console.error('[Game] Poll error:', e);
    }
  }
   // All 8 possible winning lines
  private readonly WIN_LINES: number[][] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];

  get winLine(): number | null {
    if (!this.gameState?.winner || this.gameState.winner === 'draw') return null;
    const board = this.gameState.board;
    const w = this.gameState.winner;
    for (let i = 0; i < this.WIN_LINES.length; i++) {
      const [a, b, c] = this.WIN_LINES[i];
      if (board[a] === w && board[b] === w && board[c] === w) {
        return i;
      }
    }
    return null;
  }

  private joinMatch(): void {
    const cleanMatchId = this.matchId.replace(/\.$/, '');
    this.matchId = cleanMatchId;

    if (!cleanMatchId || cleanMatchId === 'new') {
      // For new games, wait for createGame callback to join
      // The callback will call joinMatchById with the real matchId
      return;
    } else {
      // Joining a specific room by ID - tell service we are Player O
      this.nakamaService.joinMatchById(cleanMatchId);
    }
  }

  private updateTurnInfo(): void {
    if (!this.gameState) return;

    const userId = this.nakamaService.currentSession?.user?.id;
    console.log('[Game] updateTurnInfo - userId:', userId, 'mySymbol:', this.mySymbol, 'currentTurn:', this.gameState.currentTurn);

    if (!userId || !this.mySymbol) return;

     // Don't update turn info if waiting for opponent
    if (this.waitingForOpponent) {
      console.log('[Game] updateTurnInfo - Still waiting for opponent, not updating turn');
      this.isMyTurn = false;
      return;
    }

    // Use mySymbol to determine whose turn it is (not userId comparison)
    this.isMyTurn = this.gameState.currentTurn === this.mySymbol;
    console.log('[Game] updateTurnInfo - mySymbol:', this.mySymbol, 'isMyTurn:', this.isMyTurn);
  }

  private startTimer(): void {
    this.stopTimer();

    if (this.gameState?.mode === 'timed' && this.gameState.timerEndsAt > 0 && !this.gameState.winner) {
      // Sync remaining time from server state at the moment we receive it
      // This avoids clock drift between client and server
      this.syncTimerFromServer();

      this.timerInterval = setInterval(() => {
        // Tick down locally between server syncs
        if (this.timerRemaining > 0) {
          this.timerRemaining--;
          this.timerSeconds = this.timerRemaining;

          // When timer hits 0, check timeout on server
          if (this.timerRemaining === 0) {
            this.checkServerTimeout();
          }
        } else {
          this.timerSeconds = 0;
        }
      }, 1000);
    }
  }

  private async checkServerTimeout(): Promise<void> {
    try {
      const response = await this.nakamaService.checkTimeout(this.matchId);
      if (response.success && response.timeout) {
        // Opponent timed out - we win!
        this.gameState = response.state;
        this.updateTurnInfo();
        this.stopTimer();
      }
    } catch (e) {
      console.error('[Game] Timeout check error:', e);
    }
  }

  private syncTimerFromServer(): void {
    if (!this.gameState || !this.gameState.timerEndsAt) return;
    // Estimate server's current time using our local clock offset
    // Both players see the same timerEndsAt, so countdown stays in sync
    const localNow = Math.floor(Date.now() / 1000);
    this.timerRemaining = Math.max(0, this.gameState.timerEndsAt - localNow);
    this.timerSeconds = this.timerRemaining;
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  async makeMove(position: number): Promise<void> {
    if (!this.gameState || this.waitingForOpponent || this.gameState.winner || !this.isMyTurn) {
      return;
    }

    if (this.gameState.board[position] !== '') {
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      // Call server RPC for validation
      const response = await this.nakamaService.makeMove(this.matchId, position);

      if (response.success) {
        // Check if timeout occurred
              // Check if timeout occurred
        if (response.timeout) {
          console.log('[Game] Timeout detected - player', response.timedOutPlayer, 'timed out');
          this.error = `Player ${response.timedOutPlayer} ran out of time!`;
        }
        

        
        // Update local state with server truth
        this.gameState = response.state;
        this.updateTurnInfo();
        this.startTimer(); // Restart timer for next player
      } else {
        // Server rejected the move
        this.error = response.error || 'Invalid move';
      }
    } catch (error: any) {
      this.error = error.message || 'Failed to make move';
    } finally {
      this.loading = false;
    }
  }

  // Server handles all game logic and validation now.

  getStatusText(): string {
    if (!this.gameState) return 'Starting game...';

    if (this.waitingForOpponent) {
      return '⏳ Waiting for opponent to join...';
    }

    if (this.gameState.winner) {
      if (this.gameState.winner === 'draw') {
        return "It's a Draw!";
      }

      const userId = this.nakamaService.currentSession?.user?.id;
      const winnerId = this.gameState.winner === 'X' ? this.gameState.playerX : this.gameState.playerO;

      if (winnerId === userId) {
        return '🎉 You Win!';
      } else {
        return 'You Lose. Better luck next time!';
      }
    }

    if (this.isMyTurn) {
      if (this.gameState.mode === 'timed' && this.timerSeconds <= 10 && this.timerSeconds > 0) {
        return `⚠️ Hurry! ${this.timerSeconds}s left`;
      }
      return `Your Turn (${this.mySymbol})`;
    }

    return "Waiting for opponent's move...";
  }

  getStatusClass(): string {
    if (!this.gameState) return 'waiting';

    if (this.gameState.winner) {
      if (this.gameState.winner === 'draw') return 'draw';
      
      const userId = this.nakamaService.currentSession?.user?.id;
      const winnerId = this.gameState.winner === 'X' ? this.gameState.playerX : this.gameState.playerO;
      
      return winnerId === userId ? 'winner' : 'draw';
    }

    return this.isMyTurn ? 'playing' : 'waiting';
  }

  getCellClass(position: number): string {
    if (!this.gameState) return '';

    const value = this.gameState.board[position];
    let classes = '';

    if (value !== '') {
      classes += ' occupied ' + value.toLowerCase();
    }

    return classes;
  }

  copyMatchId(): void {
    if (this.matchId) {
      navigator.clipboard.writeText(this.matchId).then(() => {
        console.log('Match ID copied to clipboard');
      }).catch(err => {
        console.error('Failed to copy match ID:', err);
      });
    }
  }

  getTimerClass(): string {
    return this.timerSeconds <= 10 ? 'timer warning' : 'timer';
  }

  getTimerPercentage(): number {
    if (!this.gameState) return 100;
    const totalTime = 30; // 30 seconds total
    return Math.min(100, (this.timerSeconds / totalTime) * 100);
  }

  goToLobby(): void {
    this.leaveGame();
    this.router.navigate(['/lobby']);
  }

  private async leaveGame(): Promise<void> {
    if (this.hasLeftGame || !this.matchId || this.matchId === 'new') return;
    this.hasLeftGame = true;

    try {
      const res = await this.nakamaService.leaveGame(this.matchId);
      if (res.success) {
        console.log('[Game] Left game successfully, winner:', res.winner || 'abandoned');
      }
    } catch (err) {
      console.error('[Game] Failed to leave game:', err);
    }
  }
}
