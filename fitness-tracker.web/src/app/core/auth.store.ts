import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from './api';

export interface Me { email: string; displayName: string | null; role: 'Admin' | 'User'; hasProfile: boolean; googleEnabled: boolean; }

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private api = inject(Api);
  // undefined = not loaded yet, null = signed out
  readonly me = signal<Me | null | undefined>(undefined);
  readonly isAdmin = computed(() => this.me()?.role === 'Admin');

  async load(): Promise<Me | null> {
    try { const me = await this.api.get<Me>('/auth/me'); this.me.set(me); return me; }
    catch { this.me.set(null); return null; }
  }

  ensureLoaded(): Promise<Me | null> {
    const cur = this.me();
    return cur === undefined ? this.load() : Promise.resolve(cur);
  }

  async logout() {
    try { await this.api.post('/auth/logout', {}); } finally { this.me.set(null); }
  }
}
