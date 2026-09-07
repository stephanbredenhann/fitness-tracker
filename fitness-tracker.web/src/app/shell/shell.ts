import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from '../core/auth.store';
import { Logo } from '../shared/logo';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Logo],
  host: { '[class.session]': 'session()' },
  template: `
    <header class="top">
      <div class="wrap bar">
        <a routerLink="/dashboard" class="brand"><app-logo [size]="26" /><span>Fitness Tracker</span></a>
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
    .bar { display: flex; flex-wrap: nowrap; align-items: center; gap: 24px; height: 56px; min-width: 0; white-space: nowrap; }
    .brand { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: 8px; flex-shrink: 0; color: var(--ink); font-weight: 600; white-space: nowrap; }
    .brand:hover { text-decoration: none; }
    .tabs { display: flex; flex-wrap: nowrap; gap: 4px; margin-left: auto; min-width: 0; }
    .tabs a {
      color: var(--ink-2); padding: 6px 10px; border-radius: var(--radius-pill); white-space: nowrap; font-weight: 500;
      display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
      transition: color .18s, background .18s;
    }
    .tabs a:hover { color: var(--ink); text-decoration: none; background: var(--ground); }
    .tabs a.on { color: var(--blue); background: var(--blue-tint); }
    .tabs .material-icons { display: none; font-size: 22px; }
    main { padding-top: 28px; padding-bottom: 60px; }
    @media (max-width: 880px) { .brand span { display: none; } }
    @media (max-width: 700px) {
      .brand { display: none; }
      .top { position: static; background: none; border: 0; height: 0; overflow: visible; }
      .bar { height: 0; overflow: visible; gap: 0; }
      .tabs {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; margin: 0; gap: 0;
        display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
        overflow-x: auto; flex-wrap: nowrap;
        background: var(--surface); border-top: 1px solid var(--hairline); padding-bottom: env(safe-area-inset-bottom);
      }
      .tabs a {
        flex-direction: column; gap: 2px; padding: 8px 4px 6px; border-radius: 0; font-size: 11px; font-weight: 500;
        min-width: 0; min-height: 56px; box-sizing: border-box; justify-content: center; flex-shrink: 1;
      }
      .tabs a > span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .tabs a.on { color: var(--blue); background: var(--blue-tint); }
      .tabs a:hover { background: none; }
      .tabs a.on:hover { background: var(--blue-tint); }
      .tabs .material-icons { display: block; }
      main { padding-top: 16px; padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
    }
    :host.session .top { display: none; }
    :host.session main { padding-top: 12px; padding-bottom: 16px; max-width: none; }
  `,
})
export class Shell {
  auth = inject(AuthStore);
  private router = inject(Router);
  session = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects.startsWith('/workout')),
    ),
    { initialValue: this.router.url.startsWith('/workout') },
  );
}
