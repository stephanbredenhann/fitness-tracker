import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../core/auth.store';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="top">
      <div class="wrap bar">
        <a routerLink="/dashboard" class="brand">Fitness Tracker</a>
        <nav>
          <a routerLink="/dashboard" routerLinkActive="on">Dashboard</a>
          <a routerLink="/food" routerLinkActive="on">Food</a>
          <a routerLink="/exercise" routerLinkActive="on">Exercise</a>
          <a routerLink="/settings" routerLinkActive="on">Settings</a>
          @if (auth.isAdmin()) { <a routerLink="/admin" routerLinkActive="on">Admin</a> }
        </nav>
      </div>
    </header>
    <main class="wrap"><router-outlet /></main>
  `,
  styles: `
    .top { background: var(--surface); border-bottom: 1px solid var(--hairline); position: sticky; top: 0; z-index: 10; }
    .bar { display: flex; align-items: center; gap: 24px; height: 56px; }
    .brand { color: var(--ink); font-weight: 600; white-space: nowrap; }
    .brand:hover { text-decoration: none; }
    nav { display: flex; gap: 4px; margin-left: auto; overflow-x: auto; scrollbar-width: none; }
    nav a { color: var(--ink-2); padding: 6px 10px; border-radius: var(--radius); white-space: nowrap; font-weight: 500; }
    nav a:hover { color: var(--ink); text-decoration: none; background: var(--ground); }
    nav a.on { color: var(--blue); background: var(--blue-tint); }
    main { padding-top: 28px; padding-bottom: 60px; }
    @media (max-width: 560px) {
      .bar { height: auto; flex-wrap: wrap; gap: 0; padding-top: 12px; }
      .brand { width: 100%; margin-bottom: 8px; }
      nav { margin-left: -10px; width: calc(100% + 20px); padding: 0 10px 10px; }
    }
  `,
})
export class Shell { auth = inject(AuthStore); }
