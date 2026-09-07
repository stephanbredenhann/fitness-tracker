import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, errorMessage, Profile } from '../core/api';
import { AuthStore } from '../core/auth.store';
import { ProfileForm } from '../shared/profile-form';

@Component({
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, ProfileForm],
  template: `
    <div class="stack">
      <h1>Settings</h1>
      <section class="panel">
        <h2>Your numbers</h2>
        @if (profile(); as p) { <app-profile-form [initial]="p" (done)="auth.load()" /> }
      </section>

      <section class="panel">
        <h2>Password</h2>
        <form (ngSubmit)="changePassword()">
          <div class="fields">
            <mat-form-field appearance="outline"><mat-label>Current password</mat-label>
              <input matInput type="password" name="old" [(ngModel)]="oldPassword" required autocomplete="current-password" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>New password</mat-label>
              <input matInput type="password" name="new" [(ngModel)]="newPassword" required minlength="8" autocomplete="new-password" /></mat-form-field>
          </div>
          @if (pwError()) { <p class="error">{{ pwError() }}</p> }
          <div class="actions">
            <button mat-stroked-button type="submit" [disabled]="pwBusy()">Change password</button>
            @if (pwSaved()) { <span class="muted small">Changed</span> }
          </div>
        </form>
        <p class="muted small" style="margin-top:12px">Signed in with Google and never set a password? Use "Forgot password" on the sign-in page to create one.</p>
      </section>

      <section class="panel row between">
        <div><strong>{{ auth.me()?.email }}</strong><br><span class="muted small">Signed in</span></div>
        <button mat-button type="button" (click)="logout()">Sign out</button>
      </section>
    </div>
  `,
})
export class SettingsPage {
  private api = inject(Api); private router = inject(Router);
  auth = inject(AuthStore);
  profile = signal<Profile | null>(null);
  oldPassword = signal(''); newPassword = signal(''); pwBusy = signal(false); pwSaved = signal(false); pwError = signal('');

  constructor() { this.api.get<Profile>('/api/profile').then(p => this.profile.set(p)); }

  async changePassword() {
    this.pwBusy.set(true); this.pwError.set(''); this.pwSaved.set(false);
    try {
      await this.api.post('/auth/manage/info', { oldPassword: this.oldPassword(), newPassword: this.newPassword() });
      this.pwSaved.set(true); this.oldPassword.set(''); this.newPassword.set('');
    } catch (e) { this.pwError.set(errorMessage(e, 'Could not change the password. Check the current one.')); }
    finally { this.pwBusy.set(false); }
  }

  async logout() { await this.auth.logout(); this.router.navigate(['/login']); }
}
