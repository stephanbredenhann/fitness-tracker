import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, errorMessage, Profile, StravaStatus } from '../core/api';
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

      @if (auth.me()?.stravaEnabled) {
        <section class="panel">
          <h2>Connections</h2>
          @if (strava(); as s) {
            @if (s.connected) {
              <div class="row between wrap">
                <div><strong>Strava</strong><br><span class="muted small">Connected · {{ s.lastSyncAt ? 'last sync ' + ago(s.lastSyncAt) : 'not synced yet' }}</span></div>
                <div class="actions" style="margin:0">
                  <button mat-stroked-button type="button" (click)="sync()" [disabled]="syncing()">{{ syncing() ? 'Syncing' : 'Sync now' }}</button>
                  <button mat-button type="button" (click)="disconnect()">Disconnect</button>
                </div>
              </div>
              <p class="muted small" style="margin-top:10px">Sync pulls your runs, rides, walks and workouts since the last sync (30 days the first time). Calories are estimated from your weight, distance and time, the same way as manual entries.</p>
            } @else {
              <div class="row between wrap">
                <div><strong>Strava</strong><br><span class="muted small">Import activities into your exercise log.</span></div>
                <a class="google" href="/auth/strava" style="width:auto">Connect Strava</a>
              </div>
            }
          }
          @if (stravaMsg()) { <p class="small" style="margin-top:10px" [class.error]="stravaError()" [class.muted]="!stravaError()">{{ stravaMsg() }}</p> }
        </section>
      }

      <section class="panel row between">
        <div><strong>{{ auth.me()?.email }}</strong><br><span class="muted small">Signed in</span></div>
        <button mat-button type="button" (click)="logout()">Sign out</button>
      </section>
    </div>
  `,
  styles: `.wrap { flex-wrap: wrap; row-gap: 10px; }`,
})
export class SettingsPage {
  private api = inject(Api); private router = inject(Router);
  auth = inject(AuthStore);
  profile = signal<Profile | null>(null);
  strava = signal<StravaStatus | null>(null); syncing = signal(false); stravaMsg = signal(''); stravaError = signal(false);
  oldPassword = signal(''); newPassword = signal(''); pwBusy = signal(false); pwSaved = signal(false); pwError = signal('');

  constructor() {
    this.api.get<Profile>('/api/profile').then(p => this.profile.set(p));
    const flag = inject(ActivatedRoute).snapshot.queryParamMap.get('strava');
    if (flag === 'ok') this.stravaMsg.set('Strava connected. Sync now to import your recent activities.');
    if (flag === 'error') { this.stravaError.set(true); this.stravaMsg.set('Strava did not finish connecting. Try again.'); }
    if (this.auth.me()?.stravaEnabled) this.loadStrava();
  }

  async loadStrava() { try { this.strava.set(await this.api.get<StravaStatus>('/api/strava/status')); } catch { /* panel stays empty */ } }

  async sync() {
    this.syncing.set(true); this.stravaMsg.set(''); this.stravaError.set(false);
    try {
      const r = await this.api.post<{ imported: number; skipped: number; needsWeight: boolean }>('/api/strava/sync', {});
      this.stravaMsg.set(r.needsWeight ? 'Log a weigh-in first so calories can be estimated, then sync again.'
        : `Imported ${r.imported} activit${r.imported === 1 ? 'y' : 'ies'}${r.skipped ? `, skipped ${r.skipped} already known or unsupported` : ''}.`);
      await this.loadStrava();
    } catch (e) { this.stravaError.set(true); this.stravaMsg.set(errorMessage(e, 'Sync failed.')); }
    finally { this.syncing.set(false); }
  }

  async disconnect() {
    if (!confirm('Disconnect Strava? Imported activities stay in your log.')) return;
    try { await this.api.delete('/api/strava/'); this.stravaMsg.set('Strava disconnected.'); await this.loadStrava(); }
    catch (e) { this.stravaError.set(true); this.stravaMsg.set(errorMessage(e)); }
  }

  ago(iso: string) {
    const min = Math.round((Date.now() - new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()) / 60000);
    return min < 2 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.floor(min / 60)} h ago` : `${Math.floor(min / 1440)} days ago`;
  }

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
