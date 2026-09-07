import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api, errorMessage, WorkoutPlan } from '../core/api';

@Component({
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, MatSlideToggleModule],
  template: `
    @if (loading()) { <mat-progress-bar class="loading" mode="indeterminate" aria-label="Loading" /> }
    <div class="stack">
      <div class="row between">
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
                  <a [routerLink]="['/plans', p.id]" class="title">{{ p.name }}</a>
                  <span class="sub">{{ meta(p) }}</span>
                  @if (p.description) { <span class="sub">{{ p.description }}</span> }
                </div>
                <div class="acts">
                  <mat-slide-toggle [checked]="p.isShared" (change)="share(p, $event.checked)" aria-label="Share with everyone">{{ p.isShared ? 'Shared' : 'Private' }}</mat-slide-toggle>
                  <a mat-stroked-button [routerLink]="['/exercise']" [queryParams]="{ plan: p.id }">Log</a>
                  <a mat-button [routerLink]="['/plans', p.id]">Edit</a>
                  <button type="button" class="icon-btn" (click)="remove(p)" aria-label="Delete plan"><span class="material-icons">close</span></button>
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
                  <span class="title">{{ p.name }}</span> <span class="muted small">by {{ p.ownerName }}</span>
                  <span class="sub">{{ meta(p) }}</span>
                  @if (p.description) { <span class="sub">{{ p.description }}</span> }
                  <details class="items"><summary>Exercises</summary>
                    <ul>@for (i of p.items; track $index) { <li>{{ i.name }} <span class="muted">{{ i.sets }} × {{ i.reps }}{{ i.weightKg ? ' @ ' + i.weightKg + ' kg' : '' }}</span></li> }</ul>
                  </details>
                </div>
                <div class="acts">
                  <a mat-stroked-button [routerLink]="['/exercise']" [queryParams]="{ plan: p.id }">Log</a>
                  <button mat-button type="button" (click)="copy(p)">Copy to mine</button>
                </div>
              </li>
            }
          </ul>
        } @else if (!loading()) { <p class="empty">Nobody has shared a plan yet. Flip one of yours to Shared and it appears here for everyone.</p> }
      </section>
    </div>
  `,
  styles: `
    .plans li { align-items: flex-start; flex-wrap: wrap; }
    .title { font-weight: 500; color: var(--ink); }
    .acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .items { margin-top: 6px; font-size: 13px; }
    .items summary { cursor: pointer; color: var(--blue); }
    .items ul { list-style: none; margin: 6px 0 0; padding: 0 0 0 4px; }
    .items li { padding: 2px 0; border: 0; display: block; }
    @media (max-width: 560px) { .plans li .name { flex-basis: 100%; } .acts { width: 100%; justify-content: flex-end; } }
  `,
})
export class PlansPage {
  private api = inject(Api); private snack = inject(MatSnackBar);
  mine = signal<WorkoutPlan[]>([]); shared = signal<WorkoutPlan[]>([]); loading = signal(true); error = signal('');

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
