import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, errorMessage } from '../core/api';
import { Logo } from '../shared/logo';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, Logo],
  template: `
    <div class="auth"><div class="card">
      <a class="brand" routerLink="/login"><app-logo [size]="24" /> Fitness Tracker</a>
      <h1>Choose a new password</h1>
      <p class="lead">For {{ email() }}</p>
      <form (ngSubmit)="submit()">
        <mat-form-field><mat-label>New password</mat-label>
          <input matInput type="password" name="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
          <mat-hint>At least 8 characters</mat-hint></mat-form-field>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <div class="actions"><button mat-flat-button type="submit" [disabled]="busy()">Save password</button></div>
      </form>
      <p class="foot"><a routerLink="/forgot">Request a new link</a></p>
    </div></div>
  `,
})
export class ResetPage {
  private api = inject(Api); private router = inject(Router);
  email = input<string>(''); code = input<string>('');
  password = signal(''); busy = signal(false); error = signal('');
  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      await this.api.post('/auth/resetPassword', { email: this.email(), resetCode: this.code(), newPassword: this.password() });
      this.router.navigate(['/login']);
    } catch (e) { this.error.set(errorMessage(e, 'This link is no longer valid. Request a new one.')); }
    finally { this.busy.set(false); }
  }
}
