import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { NakamaService, RoomInfo ,LeaderboardRecord} from '../../services/nakama.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-lobby',
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.css']
})
export class LobbyComponent implements OnInit, OnDestroy {
  rooms: RoomInfo[] = [];
  loading: boolean = false;
  error: string = '';
  success: string = '';
  selectedMode: string = 'classic';
  joinRoomId: string = '';
  searchingForMatch: boolean = false;
  private autoCreatedRoomId: string | null = null;

   // Search popup state
  searchTimer: number = 30;
  searchState: 'searching' | 'found' | 'not-found' = 'searching';
  private searchTimerInterval: any;
  private matchSubscription: Subscription | null = null;

  // Leaderboard
  leaderboard: any[] = [];
  leaderboardLoading: boolean = false;
  sidebarOpen: boolean = false;

    get username(): string {
    return this.nakamaService.currentSession?.user?.username || 'Player';
  }

  get userInitial(): string {
    return this.username.charAt(0).toUpperCase();
  }


  constructor(
    private nakamaService: NakamaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Do NOT load rooms automatically — only when user clicks "Discover Rooms"
    // Do NOT start any refresh interval
    // Do NOT load leaderboard on init
  }

  ngOnDestroy(): void {
    this.cleanupSearch();
  }

  private refreshInterval: any;

  private startRoomRefresh(): void {
    this.refreshInterval = setInterval(() => {
      this.loadRooms();
    }, 5000);
  }

  private stopRoomRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadRooms(): Promise<void> {
    this.loading = true;
    try {
      // Clean up stale games first
      await this.nakamaService.cleanupGames();
      const response = await this.nakamaService.listGames();
      // Handle both array and object formats (Lua serializes empty tables as {})
      let rooms = Array.isArray(response.rooms) ? response.rooms : [];

      // If no rooms available, auto-create one for the current user
      if (rooms.length === 0 && this.nakamaService.currentSession) {
        console.log('[Lobby] No rooms found, auto-creating one...');
        try {
          const createRes = await this.nakamaService.createGame(this.selectedMode);
          if (createRes.success && createRes.matchId) {
            this.autoCreatedRoomId = createRes.matchId;
            rooms = [{
              id: createRes.matchId,
              mode: this.selectedMode,
              players: 1,
              maxSize: 2
            }];
            console.log('[Lobby] Auto-created room:', createRes.matchId);
          }
        } catch (err) {
          console.error('[Lobby] Failed to auto-create room:', err);
        }
      }

      this.rooms = rooms;
      console.log('[Lobby] Rooms loaded:', this.rooms);
    } catch (error: any) {
      console.error('Error loading rooms:', error);
      this.rooms = [];
    } finally {
      this.loading = false;
    }
  }

  private cleanupTimer(): void {
    if (this.searchTimerInterval) {
      clearInterval(this.searchTimerInterval);
      this.searchTimerInterval = null;
    }
  }

   logout(): void {
    this.nakamaService.disconnect();
    this.router.navigate(['/login']);
  }

   cancelSearch(): void {
    this.nakamaService.removeMatchmaker();
    this.searchingForMatch = false;
    this.cleanupSearch();
  }

  retrySearch(): void {
    this.cleanupSearch();
    this.findMatch();
  }

    async loadLeaderboard(): Promise<void> {
    this.leaderboardLoading = true;
    try {
      const response = await this.nakamaService.getLeaderboard();
      if (response.success) {
        this.leaderboard = response.leaderboard || [];
      }
    } catch (error: any) {
      console.error('Error loading leaderboard:', error);
    } finally {
      this.leaderboardLoading = false;
    }
  }


   private cleanupSearch(): void {
    this.cleanupTimer();
    if (this.matchSubscription) {
      this.matchSubscription.unsubscribe();
      this.matchSubscription = null;
    }
  }



  async createGame(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      // Create the game via RPC first to get the actual match ID
      const response = await this.nakamaService.createGame(this.selectedMode);

      if (response.success && response.matchId) {
        // Navigate with the real match ID and mark as creator
        this.router.navigate(['/game', response.matchId], { queryParams: { creator: 'true' } });
      } else {
        this.error = response.error || 'Failed to create game';
        this.loading = false;
      }
    } catch (error: any) {
      this.error = error.message || 'An error occurred';
      this.loading = false;
    }
  }

  async findMatch(): Promise<void> {
    // Navigate to matchmaking screen instead of creating a room
    this.router.navigate(['/matchmaking']);
  }

  async joinRoom(roomId: string): Promise<void> {
    this.loading = true;
    this.error = '';

    // Check if this is the auto-created room — join as creator
    const isAutoCreated = roomId === this.autoCreatedRoomId;

    try {
      console.log('[Lobby] ===== JOINING ROOM =====');
      console.log('[Lobby] Room ID to join:', roomId, 'isAutoCreated:', isAutoCreated);

      if (!isAutoCreated) {
        // Normal join — this player is Player 2 (joiner)
        const response = await this.nakamaService.joinGame(roomId);
        console.log('[Lobby] joinGame response:', response);

        if (response.success) {
          console.log('[Lobby] Successfully joined room:', roomId);
          this.router.navigate(['/game', roomId]);
        } else {
          this.error = response.error || 'Failed to join game.';
          this.loading = false;
        }
      } else {
        // Auto-created room — this player is the creator (Player X)
        console.log('[Lobby] Joining auto-created room as creator');
        this.router.navigate(['/game', roomId], { queryParams: { creator: 'true' } });
      }
    } catch (error: any) {
      this.error = error.message || 'An error occurred while joining';
      console.error('[Lobby] Join error:', error);
    } finally {
      this.loading = false;
    }
  }
  

  async joinRoomById(): Promise<void> {
    if (!this.joinRoomId || !this.joinRoomId.trim()) {
      this.error = 'Please enter a Room ID';
      return;
    }
    await this.joinRoom(this.joinRoomId.trim());
  }

  goToLeaderboard(): void {
    this.router.navigate(['/leaderboard']);
  }

  toggleLeaderboard(): void {
    this.sidebarOpen = !this.sidebarOpen;
    if (this.sidebarOpen && this.leaderboard.length === 0) {
      this.loadLeaderboard();
    }
  }
}
