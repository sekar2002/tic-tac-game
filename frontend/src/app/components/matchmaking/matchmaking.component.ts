import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { NakamaService } from '../../services/nakama.service';

@Component({
  selector: 'app-matchmaking',
  templateUrl: './matchmaking.component.html',
  styleUrls: ['./matchmaking.component.css']
})
export class MatchmakingComponent implements OnInit, OnDestroy {
  loading: boolean = false;
  error: string = '';
  searching: boolean = false;
  searchTime: number = 0;
  selectedMode: string = 'classic';
  
  private readonly MATCHMAKING_TIMEOUT = 60; // 60 seconds timeout
  private pollInterval: any;
  private searchTimer: any;

  constructor(
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

    // Start searching automatically
    this.startMatchmaking();
  }

  ngOnDestroy(): void {
    this.stopSearchTimer();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    
    // Cancel matchmaking if still searching
    if (this.searching) {
      this.nakamaService.cancelMatchmaker();
    }
  }

  async startMatchmaking(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.searching = true;
    this.searchTime = 0;

    try {
      // Start the search timer
      this.startSearchTimer();

      // Join matchmaking queue via RPC
      const response = await this.nakamaService.findMatch(this.selectedMode);
      
      console.log('[Matchmaking] find_match response:', response);

      if (response.success && response.matched) {
        // Immediately matched!
        console.log('[Matchmaking] Immediately matched with:', response.opponent);
        this.handleMatchFound({
          matchId: response.matchId,
          role: response.role,
          opponent: response.opponent
        });
      } else if (response.success && response.status === 'waiting') {
        // Added to queue, start polling for match
        console.log('[Matchmaking] Added to queue, polling for match...');
        this.startPollingForMatch();
      } else {
        this.error = 'Failed to join matchmaking queue';
        this.searching = false;
        this.loading = false;
      }

    } catch (error: any) {
      console.error('[Matchmaking] Failed to start matchmaking:', error);
      this.error = error.message || 'Failed to start matchmaking';
      this.searching = false;
      this.loading = false;
    }
  }

  private startPollingForMatch(): void {
    // Poll every 2 seconds to check if we've been matched
    this.pollInterval = setInterval(async () => {
      await this.checkMatchStatus();
    }, 2000);
  }

  private async checkMatchStatus(): Promise<void> {
    if (!this.searching) return;

    try {
      const response = await this.nakamaService.checkMatchStatus();
      
      if (response.success && response.status === 'matched') {
        console.log('[Matchmaking] Poll detected match:', response);
        this.handleMatchFound({
          matchId: response.matchId,
          role: response.role,
          opponent: response.opponent
        });
      }
    } catch (error) {
      console.error('[Matchmaking] Poll error:', error);
    }
  }

  private startSearchTimer(): void {
    this.searchTimer = setInterval(() => {
      this.searchTime++;
      
      // Check for timeout
      if (this.searchTime >= this.MATCHMAKING_TIMEOUT) {
        console.log('[Matchmaking] Timeout reached, stopping search');
        this.handleMatchmakingTimeout();
      }
    }, 1000);
  }

  private stopSearchTimer(): void {
    if (this.searchTimer) {
      clearInterval(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private handleMatchFound(matchData: any): void {
    console.log('[Matchmaking] Handling match found:', matchData);

    this.searching = false;
    this.loading = false;
    this.stopSearchTimer();

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Navigate to game - GameComponent will query server for role
    if (matchData.matchId) {
      console.log('[Matchmaking] Navigating to game:', matchData.matchId);
      this.router.navigate(['/game', matchData.matchId], {
        queryParams: {
          matchmaking: 'true'
        }
      });
    } else {
      this.error = 'Failed to find match. Please try again.';
    }
  }

  private handleMatchmakingTimeout(): void {
    console.log('[Matchmaking] Matchmaking timeout after 60 seconds');
    
    this.searching = false;
    this.loading = false;
    this.stopSearchTimer();
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Cancel matchmaking to remove from queue
    this.nakamaService.cancelMatchmaker().catch(err => {
      console.error('[Matchmaking] Error cancelling matchmaking:', err);
    });

    this.error = `No match found within ${this.MATCHMAKING_TIMEOUT} seconds. Please try again later.`;
  }

  async cancelSearch(): Promise<void> {
    this.searching = false;
    this.loading = false;
    this.stopSearchTimer();
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Cancel via RPC to remove from queue
    try {
      await this.nakamaService.cancelMatchmaker();
      console.log('[Matchmaking] Cancelled matchmaking via RPC');
    } catch (error) {
      console.error('[Matchmaking] Error cancelling matchmaking:', error);
    }

    this.router.navigate(['/lobby']);
  }

  tryAgain(): void {
    this.error = '';
    this.startMatchmaking();
  }

  getSearchTimeText(): string {
    if (this.searchTime < 60) {
      return `Searching for ${this.searchTime}s...`;
    } else {
      const minutes = Math.floor(this.searchTime / 60);
      const seconds = this.searchTime % 60;
      return `Searching for ${minutes}m ${seconds}s...`;
    }
  }
}
