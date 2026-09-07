import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api } from '../core/api';
import { Logo } from '../shared/logo';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, Logo],
  template: `
    <div class="auth"><div class="card">
      <a class="brand" routerLink="/login"><app-logo [size]="24" /> Fitness Tracker</a>
      @if (sent()) {
        <h1>Check your inbox</h1>
        <p class="lead">If {{ email() }} has an account, a reset link is on its way.</p>
        <a mat-flat-button routerLink="/login">Back to sign in</a>
      } @else {
        <h1>Reset your password</h1>
        <p class="lead">Enter your email and we will send a reset link.</p>
        <form (ngSubmit)="submit()">
          <mat-form-field><mat-label>Email</mat-label>
            <input matInput type="email" name="email" [(ngModel)]="email" required autocomplete="email" /></mat-form-field>
          <div class="actions">
            <button mat-flat-button type="submit" [disabled]="busy()">Send reset link</button>
            <a routerLink="/login">Back to sign in</a>
          </div>
        </form>
      }
    </div></div>
  `,
})
export class ForgotPage {
  private api = inject(Api);
  email = signal(''); busy = signal(false); sent = signal(false);
  async submit() {
    this.busy.set(true);
    try { await this.api.post('/auth/forgotPassword', { email: this.email() }); } catch { /* always show sent */ }
    this.sent.set(true); this.busy.set(false);
  }
}
