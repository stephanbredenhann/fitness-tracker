import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { AdminUser, Api, errorMessage } from '../core/api';
import { AuthStore } from '../core/auth.store';

@Component({
  imports: [MatButtonModule, MatMenuModule, MatIconModule],
  template: `
    <div class="stack">
      <div>
        <h1>Users</h1>
        <p class="muted">Accounts only. Nobody's weight, food or exercise is visible here.</p>
      </div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <section class="panel table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last seen</th><th></th></tr></thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr [class.off]="u.disabled">
                <td data-label="Email">{{ u.email }}</td>
                <td data-label="Name">{{ u.displayName || '–' }}</td>
                <td data-label="Role">{{ u.isAdmin ? 'Admin' : 'User' }}</td>
                <td data-label="Status">{{ u.disabled ? 'Disabled' : u.emailConfirmed ? 'Active' : 'Unconfirmed' }}</td>
                <td data-label="Last seen" class="num muted">{{ ago(u.lastSeenAt) }}</td>
                <td class="acts">
                  @if (u.email !== auth.me()?.email) {
                    <button type="button" class="icon-btn" [matMenuTriggerFor]="menu" aria-label="Actions"><span class="material-icons">more_horiz</span></button>
                    <mat-menu #menu="matMenu">
                      <button mat-menu-item (click)="act(u, u.disabled ? 'enable' : 'disable')">{{ u.disabled ? 'Enable account' : 'Disable account' }}</button>
                      <button mat-menu-item (click)="act(u, u.isAdmin ? 'demote' : 'promote')">{{ u.isAdmin ? 'Remove admin' : 'Make admin' }}</button>
                      <button mat-menu-item (click)="act(u, 'reset-password')">Send password reset</button>
                      <button mat-menu-item class="danger" (click)="remove(u)">Delete account</button>
                    </mat-menu>
                  } @else { <span class="muted small">You</span> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Database</h2>
        <p class="muted small" style="margin-bottom:12px">A backup is a snapshot of every account and entry. Restoring replaces the current data with the uploaded file; a safety copy of the current data is kept on the server first.</p>
        <div class="db-acts">
          <a mat-stroked-button href="/api/admin/backup" download>Download backup</a>
          <input #picker type="file" accept=".bac" (change)="pick($event)" hidden />
          <button mat-stroked-button type="button" (click)="picker.click()">{{ file()?.name ?? 'Choose .bac file' }}</button>
          <button mat-flat-button type="button" [disabled]="!file() || restoring()" (click)="restore()">Restore</button>
        </div>
        @if (dbMsg()) { <p class="small" style="margin-top:10px" [class.error]="dbError()" [class.muted]="!dbError()">{{ dbMsg() }}</p> }
      </section>
    </div>
  `,
  styles: `
    .table-wrap { padding: 0 20px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; color: var(--ink-2); font-weight: 500; padding: 14px 10px 10px 0; border-bottom: 1px solid var(--hairline); }
    td { padding: 12px 10px 12px 0; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    tr.off td { color: var(--ink-3); }
    .acts { text-align: right; width: 40px; }
    .danger { color: var(--danger); }
    .db-acts { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .db-acts a, .db-acts button { width: 100%; }
    @media (min-width: 700px) {
      .db-acts { grid-template-columns: auto auto auto; justify-content: start; }
      .db-acts a, .db-acts button { width: auto; }
    }
    @media (max-width: 700px) {
      .table-wrap { padding: 4px 16px; }
      thead { display: none; }
      table, tbody, tr, td { display: block; }
      tr { position: relative; padding: 12px 0; border-bottom: 1px solid var(--hairline); }
      tr:last-child { border-bottom: 0; }
      td { padding: 2px 0; border: 0; white-space: normal; }
      td[data-label]::before { content: attr(data-label); display: inline-block; width: 84px; color: var(--ink-2); font-size: 13px; }
      td:first-child { font-weight: 500; padding-right: 44px; }
      td:first-child::before { display: none; }
      .acts { position: absolute; top: 8px; right: 0; width: auto; padding: 0; }
    }
  `,
})
export class AdminPage {
  private api = inject(Api);
  auth = inject(AuthStore);
  users = signal<AdminUser[]>([]); error = signal('');
  file = signal<File | null>(null); restoring = signal(false); dbMsg = signal(''); dbError = signal(false);

  constructor() { this.load(); }
  async load() { this.users.set(await this.api.get<AdminUser[]>('/api/admin/users')); }

  async act(u: AdminUser, action: string) {
    this.error.set('');
    try { await this.api.post(`/api/admin/users/${u.id}/${action}`, {}); await this.load(); }
    catch (e) { this.error.set(errorMessage(e)); }
  }

  async remove(u: AdminUser) {
    if (!confirm(`Delete ${u.email} and all their data? This cannot be undone.`)) return;
    this.error.set('');
    try { await this.api.delete(`/api/admin/users/${u.id}`); await this.load(); }
    catch (e) { this.error.set(errorMessage(e)); }
  }

  pick(e: Event) { this.file.set((e.target as HTMLInputElement).files?.[0] ?? null); this.dbMsg.set(''); }

  async restore() {
    const f = this.file()!;
    if (!confirm(`Restore from ${f.name}? All current data is replaced with the contents of this backup. A safety copy of the current data is saved on the server first.`)) return;
    this.restoring.set(true); this.dbMsg.set(''); this.dbError.set(false);
    const form = new FormData(); form.append('file', f);
    try {
      const r = await this.api.post<{ safetyCopy: string }>('/api/admin/restore', form);
      this.dbMsg.set(`Restored. Safety copy saved at ${r.safetyCopy}.`); this.file.set(null);
      await this.load();
    } catch (e) { this.dbError.set(true); this.dbMsg.set(errorMessage(e, 'Restore failed.')); }
    finally { this.restoring.set(false); }
  }

  ago(iso: string | null) {
    if (!iso) return 'Never';
    const h = Math.floor((Date.now() - new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()) / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h} h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
  }
}
