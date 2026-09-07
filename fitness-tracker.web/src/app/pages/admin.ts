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
                <td>{{ u.email }}</td>
                <td>{{ u.displayName || '–' }}</td>
                <td>{{ u.isAdmin ? 'Admin' : 'User' }}</td>
                <td>{{ u.disabled ? 'Disabled' : u.emailConfirmed ? 'Active' : 'Unconfirmed' }}</td>
                <td class="num muted">{{ ago(u.lastSeenAt) }}</td>
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
  `,
})
export class AdminPage {
  private api = inject(Api);
  auth = inject(AuthStore);
  users = signal<AdminUser[]>([]); error = signal('');

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

  ago(iso: string | null) {
    if (!iso) return 'Never';
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h} h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
  }
}
