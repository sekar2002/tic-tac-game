import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NakamaService } from '../../services/nakama.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  username: string = '';
  loading: boolean = false;
  error: string = '';

  constructor(
    private nakamaService: NakamaService,
    private router: Router
  ) {}

  async login(): Promise<void> {
    if (!this.username.trim()) {
      this.error = 'Please enter a username';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      console.log('Attempting login for:', this.username);
      const success = await this.nakamaService.authenticate(this.username);
      
      console.log('Login result:', success);
      
      if (success) {
        this.router.navigate(['/lobby']);
      } else {
        this.error = 'Failed to connect to server. Make sure Nakama is running.';
      }
    } catch (error: any) {
      console.error('Login error:', error);
      this.error = error.message || 'An error occurred. Check browser console (F12) for details.';
    } finally {
      this.loading = false;
    }
  }
}
