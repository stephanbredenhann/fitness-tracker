import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HttpErrorResponse } from '@angular/common/http';
import { Api } from '../core/api';
import { AuthStore } from '../core/auth.store';
import { Logo } from '../shared/logo';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, Logo],
  template: `
    <div class="auth"><div class="card">
      <a class="brand" routerLink="/login"><app-logo [size]="24" /> Fitness Tracker</a>
      <h1>Sign in</h1>
      <p class="lead">Weight, meals and training in one place.</p>
      @if (googleEnabled()) {
        <a class="google" href="/auth/google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </a>
        <div class="or">or with email</div>
      }
      <form (ngSubmit)="submit()">
        <mat-form-field appearance="outline"><mat-label>Email</mat-label>
          <input matInput type="email" name="email" [(ngModel)]="email" required autocomplete="email" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Password</mat-label>
          <input matInput type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" /></mat-form-field>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <div class="actions">
          <button mat-flat-button type="submit" [disabled]="busy()">Sign in</button>
          <a routerLink="/forgot">Forgot password</a>
        </div>
      </form>
      <p class="foot">New here? <a routerLink="/register">Create an account</a></p>
    </div></div>
  `,
})
export class LoginPage {
  private api = inject(Api); private auth = inject(AuthStore); private router = inject(Router);
  returnUrl = input<string>();
  errorParam = input<string>(undefined, { alias: 'error' });
  email = signal(''); password = signal(''); busy = signal(false);
  error = signal('');
  googleEnabled = signal(false);

  constructor() {
    this.api.get<{ google: boolean }>('/auth/providers').then(p => this.googleEnabled.set(p.google)).catch(() => {});
    queueMicrotask(() => {
      if (this.errorParam() === 'disabled') this.error.set('This account is disabled.');
      else if (this.errorParam() === 'google') this.error.set('Google sign-in did not complete. Try again.');
    });
  }

  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      await this.api.post('/auth/login?useCookies=true', { email: this.email(), password: this.password() });
      const me = await this.auth.load();
      this.router.navigateByUrl(me?.hasProfile ? (this.returnUrl() || '/dashboard') : '/onboarding');
    } catch (e) {
      const detail = e instanceof HttpErrorResponse ? e.error?.detail : '';
      this.error.set(detail === 'NotAllowed' ? 'Confirm your email first. Check your inbox for the link.'
        : detail === 'LockedOut' ? 'This account is disabled.' : 'Email or password is incorrect.');
    } finally { this.busy.set(false); }
  }
}
