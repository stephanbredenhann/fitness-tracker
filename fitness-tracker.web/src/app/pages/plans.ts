import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api, errorMessage, WorkoutPlan } from '../core/api';
import { describeSet } from '../core/calc';

@Component({
  imports: [RouterLink, MatButtonModule, MatMenuModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar class="loading" mode="indeterminate" aria-label="Loading" /> }
    <div class="stack">
      <div class="page-head">
        <h1>Workout plans</h1>
        <a mat-flat-button routerLink="/plans/new">New plan</a>
      </div>
      @if (error()) { <p class="error">{{ error() }}</p> }

      <section class="panel">
        <h2>My plans</h2>
        @if (mine().length) {
          <ul class="list plans">
            @for (p of mine(); track p.id) {
              <li>
                <div class="name">
                  <div class="head">
                    <a [routerLink]="['/plans', p.id]" class="title">{{ p.name }}</a>
                    @if (p.isShared) { <span class="tag">Shared</span> }
                  </div>
                  <span class="sub">{{ meta(p) }}</span>
                  @if (p.description) { <span class="sub">{{ p.description }}</span> }
                </div>
                <div class="acts">
                  <a mat-flat-button [routerLink]="['/workout', p.id]">Start</a>
                  <button type="button" class="icon-btn" [matMenuTriggerFor]="mineMenu" aria-label="More"><span class="material-icons">more_horiz</span></button>
                  <mat-menu #mineMenu="matMenu">
                    <a mat-menu-item [routerLink]="['/exercise']" [queryParams]="{ plan: p.id }">Quick log</a>
                    <a mat-menu-item [routerLink]="['/plans', p.id]">Edit</a>
                    <button mat-menu-item (click)="share(p, true)" [disabled]="p.isShared">Share with everyone</button>
                    <button mat-menu-item (click)="share(p, false)" [disabled]="!p.isShared">Make private</button>
                    <button mat-menu-item class="danger" (click)="remove(p)">Delete</button>
                  </mat-menu>
                </div>
              </li>
            }
          </ul>
        } @else if (!loading()) { <p class="empty">No plans yet. Build one with the exercises you have at home, then log sessions from it in one tap.</p> }
      </section>

      <section class="panel">
        <h2>Shared by others</h2>
        @if (shared().length) {
          <ul class="list plans">
            @for (p of shared(); track p.id) {
              <li>
                <div class="name">
                  <div class="head">
                    <span class="title">{{ p.name }}</span>
                    <span class="muted small by">by {{ p.ownerName }}</span>
                  </div>
                  <span class="sub">{{ meta(p) }}</span>
                  @if (p.description) { <span class="sub">{{ p.description }}</span> }
                  <details class="items"><summary>Exercises</summary>
                    <ul>@for (i of p.items; track $index) { <li>{{ i.name }} <span class="muted">{{ describeSet(i) }}</span></li> }</ul>
                  </details>
                </div>
                <div class="acts">
                  <a mat-flat-button [routerLink]="['/workout', p.id]">Start</a>
                  <button type="button" class="icon-btn" [matMenuTriggerFor]="sharedMenu" aria-label="More"><span class="material-icons">more_horiz</span></button>
                  <mat-menu #sharedMenu="matMenu">
                    <a mat-menu-item [routerLink]="['/exercise']" [queryParams]="{ plan: p.id }">Quick log</a>
                    <button mat-menu-item type="button" (click)="copy(p)">Copy to mine</button>
                  </mat-menu>
                </div>
              </li>
            }
          </ul>
        } @else if (!loading()) { <p class="empty">Nobody has shared a plan yet. Flip one of yours to Shared and it appears here for everyone.</p> }
      </section>
    </div>
  `,
  styles: `
    .plans li { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 12px; }
    .head { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .title { font-weight: 500; color: var(--ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .head .tag { flex-shrink: 0; }
    .by { flex-shrink: 0; white-space: nowrap; }
    .acts { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }
    .acts .mdc-button { flex-shrink: 0; white-space: nowrap; }
    .items { margin-top: 6px; font-size: 13px; }
    .items ul { list-style: none; margin: 6px 0 0; padding: 0 0 0 4px; }
    .items li { padding: 2px 0; border: 0; display: block; }
    .danger { color: var(--danger); }
  `,
})
export class PlansPage {
  private api = inject(Api); private snack = inject(MatSnackBar);
  mine = signal<WorkoutPlan[]>([]); shared = signal<WorkoutPlan[]>([]); loading = signal(true); error = signal('');
  describeSet = describeSet;

  constructor() { this.load(); }

  async load() {
    try {
      const r = await this.api.get<{ mine: WorkoutPlan[]; shared: WorkoutPlan[] }>('/api/plans');
      this.mine.set(r.mine); this.shared.set(r.shared);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.loading.set(false); }
  }

  meta(p: WorkoutPlan) {
    const n = p.items.length, kcal = p.estimatedKcal === null ? '' : ` · ~${p.estimatedKcal} kcal`;
    return `${n} exercise${n === 1 ? '' : 's'} · ~${p.estimatedMin} min${kcal}`;
  }

  async share(p: WorkoutPlan, isShared: boolean) {
    this.error.set('');
    try {
      await this.api.put(`/api/plans/${p.id}`, { name: p.name, description: p.description, isShared, items: p.items });
      this.mine.update(list => list.map(x => x.id === p.id ? { ...x, isShared } : x));
      this.snack.open(isShared ? `${p.name} is now shared with everyone` : `${p.name} is private again`, undefined, { duration: 2500 });
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async copy(p: WorkoutPlan) {
    this.error.set('');
    try {
      const c = await this.api.post<WorkoutPlan>(`/api/plans/${p.id}/copy`, {});
      this.mine.update(list => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
      this.snack.open(`Copied ${p.name} to your plans`, undefined, { duration: 2500 });
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async remove(p: WorkoutPlan) {
    if (!confirm(`Delete ${p.name}?${p.isShared ? ' Others will lose access to it.' : ''}`)) return;
    this.error.set('');
    try { await this.api.delete(`/api/plans/${p.id}`); this.mine.update(list => list.filter(x => x.id !== p.id)); }
    catch (e) { this.error.set(errorMessage(e)); }
  }
}
