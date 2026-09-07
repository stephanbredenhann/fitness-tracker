import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { Logo } from '../shared/logo';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo],
  template: `
    <header class="top">
      <div class="wrap bar">
        <a routerLink="/dashboard" class="brand"><app-logo [size]="26" /> Fitness Tracker</a>
        <nav class="tabs" aria-label="Main">
          <a routerLink="/dashboard" routerLinkActive="on"><span class="material-icons" aria-hidden="true">insights</span><span>Dashboard</span></a>
          <a routerLink="/food" routerLinkActive="on"><span class="material-icons" aria-hidden="true">restaurant</span><span>Food</span></a>
          <a routerLink="/exercise" routerLinkActive="on"><span class="material-icons" aria-hidden="true">directions_run</span><span>Exercise</span></a>
          <a routerLink="/plans" routerLinkActive="on"><span class="material-icons" aria-hidden="true">fitness_center</span><span>Plans</span></a>
          <a routerLink="/settings" routerLinkActive="on"><span class="material-icons" aria-hidden="true">tune</span><span>Settings</span></a>
          @if (auth.isAdmin()) { <a routerLink="/admin" routerLinkActive="on"><span class="material-icons" aria-hidden="true">manage_accounts</span><span>Admin</span></a> }
        </nav>
      </div>
    </header>
    <main class="wrap"><router-outlet /></main>
  `,
  styles: `
    .top { background: var(--surface); border-bottom: 1px solid var(--hairline); position: sticky; top: 0; z-index: 10; }
    .bar { display: flex; align-items: center; gap: 24px; height: 56px; }
    .brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 600; white-space: nowrap; }
    .brand:hover { text-decoration: none; }
    .tabs { display: flex; gap: 4px; margin-left: auto; }
    .tabs a { color: var(--ink-2); padding: 6px 10px; border-radius: var(--radius); white-space: nowrap; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
    .tabs a:hover { color: var(--ink); text-decoration: none; background: var(--ground); }
    .tabs a.on { color: var(--blue); background: var(--blue-tint); }
    .tabs .material-icons { display: none; font-size: 22px; }
    main { padding-top: 28px; padding-bottom: 60px; }
    @media (max-width: 700px) {
      .bar { height: 48px; }
      .tabs {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; margin: 0; gap: 0;
        display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
        background: var(--surface); border-top: 1px solid var(--hairline); padding-bottom: env(safe-area-inset-bottom);
      }
      .tabs a { flex-direction: column; gap: 2px; padding: 8px 0 6px; border-radius: 0; font-size: 11px; font-weight: 500; min-height: 56px; box-sizing: border-box; justify-content: center; }
      .tabs a.on { background: none; }
      .tabs a:hover { background: none; }
      .tabs .material-icons { display: block; }
      main { padding-top: 20px; padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
    }
  `,
})
export class Shell { auth = inject(AuthStore); }
