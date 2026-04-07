import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NakamaService } from '../../services/nakama.service';

export interface PlayerStats {
  userId: string;
  username: string;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  score: number;
  rank: number;
}


@Component({
  selector: 'app-leaderboard',
  templateUrl: './leaderboard.component.html',
  styleUrls: ['./leaderboard.component.css']
})
export class LeaderboardComponent implements OnInit {
  leaderboard: PlayerStats[] = [];
  loading: boolean = false;
  error: string = '';

  constructor(
    private nakamaService: NakamaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadLeaderboard();
  }

  async loadLeaderboard(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      const response = await this.nakamaService.getLeaderboard();

      if (response.success) {
        this.leaderboard = response.leaderboard || [];
      } else {
        this.error = response.message || 'Failed to load leaderboard';
      }
    } catch (error: any) {
      this.error = error.message || 'An error occurred';
    } finally {
      this.loading = false;
    }
  }

  getRankClass(rank: number): string {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return '';
  }

  goBack(): void {
    this.router.navigate(['/lobby']);
  }
}
