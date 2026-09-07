import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, errorMessage } from '../core/api';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="auth"><div class="card">
      <a class="brand" routerLink="/login">Fitness Tracker</a>
      @if (sent()) {
        <h1>Check your inbox</h1>
        <p class="lead">A confirmation link is on its way to {{ email() }}. Open it, then sign in.</p>
        <div class="actions">
          <a mat-flat-button routerLink="/login">Go to sign in</a>
          <button mat-button type="button" (click)="resend()" [disabled]="busy()">Send it again</button>
        </div>
        @if (resent()) { <p class="muted small" style="margin-top:12px">Sent.</p> }
      } @else {
        <h1>Create an account</h1>
        <p class="lead">Use the email you check daily. Reminders go there.</p>
        <form (ngSubmit)="submit()">
          <mat-form-field appearance="outline"><mat-label>Email</mat-label>
            <input matInput type="email" name="email" [(ngModel)]="email" required autocomplete="email" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Password</mat-label>
            <input matInput type="password" name="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
            <mat-hint>At least 8 characters</mat-hint></mat-form-field>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <div class="actions"><button mat-flat-button type="submit" [disabled]="busy()">Create account</button></div>
        </form>
        <p class="foot">Already have one? <a routerLink="/login">Sign in</a></p>
      }
    </div></div>
  `,
})
export class RegisterPage {
  private api = inject(Api);
  email = signal(''); password = signal(''); busy = signal(false); sent = signal(false); resent = signal(false); error = signal('');

  async submit() {
    this.busy.set(true); this.error.set('');
    try { await this.api.post('/auth/register', { email: this.email(), password: this.password() }); this.sent.set(true); }
    catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async resend() {
    this.busy.set(true);
    try { await this.api.post('/auth/resendConfirmationEmail', { email: this.email() }); this.resent.set(true); }
    finally { this.busy.set(false); }
  }
}
