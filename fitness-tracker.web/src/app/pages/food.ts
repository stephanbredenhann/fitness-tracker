import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api, errorMessage, FoodEntry, FoodHit, RecentFood } from '../core/api';
import { today } from '../core/dates';
import { DateNav } from '../shared/date-nav';

@Component({
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule, DateNav],
  template: `
    @if (loading()) { <mat-progress-bar class="loading" mode="indeterminate" aria-label="Loading" /> }
    <div class="stack">
      <div class="page-head">
        <h1>Food</h1>
        <app-date-nav [(date)]="date" />
      </div>

      <section class="panel">
        <span class="muted small">Eaten</span>
        <div class="totals">
          <div class="kcal num">{{ totals().kcal }}<span class="unit">kcal</span></div>
          <div class="macros muted small">{{ totals().protein }} g protein · {{ totals().carbs }} g carbs · {{ totals().fat }} g fat</div>
        </div>
        @if (entries().length) {
          <ul class="list">
            @for (e of entries(); track e.id) {
              <li>
                <div class="name">
                  <span class="trunc">{{ e.name }}</span>
                  @if (e.grams) { <span class="sub">{{ e.grams }} g</span> }
                </div>
                <span class="val">{{ e.kcal }} kcal</span>
                <button type="button" class="icon-btn" (click)="remove(e)" aria-label="Remove"><span class="material-icons">close</span></button>
              </li>
            }
          </ul>
        } @else { <p class="empty">Nothing logged for this day.</p> }
      </section>

      <section class="panel">
        <h2>Add food</h2>
        <mat-form-field>
          <mat-label>Search foods</mat-label>
          <input matInput [ngModel]="query()" (ngModelChange)="onQuery($event)" placeholder="e.g. oats, chicken breast" autocomplete="off" />
          @if (searching()) { <mat-hint>Searching</mat-hint> }
        </mat-form-field>
        @if (searchError()) { <p class="error hint">{{ searchError() }}</p> }

        @if (picked(); as h) {
          <form class="portion" (ngSubmit)="addPicked()">
            <div class="picked">
              <strong>{{ h.name }}</strong>
              <span class="muted small">{{ h.brand }} · {{ h.kcalPer100g }} kcal per 100 g</span>
            </div>
            <div class="portion-tools">
              <div class="portion-add">
                <mat-form-field class="grams"><mat-label>Portion</mat-label>
                  <input matInput type="number" inputmode="decimal" name="grams" [(ngModel)]="grams" min="1" max="5000" required /><span matTextSuffix>g</span></mat-form-field>
                <button mat-flat-button type="submit">Add {{ scaled(h.kcalPer100g) }} kcal</button>
              </div>
              <button mat-button type="button" class="cancel" (click)="picked.set(null)">Cancel</button>
            </div>
          </form>
        } @else if (results().length) {
          <ul class="list results">
            @for (h of results(); track h.barcode) {
              <li (click)="picked.set(h)" tabindex="0" (keydown.enter)="picked.set(h)">
                <div class="name">
                  <span class="trunc">{{ h.name }}</span>
                  @if (h.brand) { <span class="sub">{{ h.brand }}</span> }
                </div>
                <span class="val muted">{{ h.kcalPer100g }} kcal / 100 g</span>
              </li>
            }
          </ul>
        } @else if (query().length > 1 && !searching()) {
          <p class="muted small hint">No matches. Add it manually below.</p>
        }

        @if (recent().length && !picked()) {
          <p class="muted small recent-label">Recent</p>
          <div class="chips">
            @for (r of recent(); track r.name) {
              <button type="button" class="chip" (click)="addRecent(r)">{{ r.name }} <span class="muted">{{ r.kcal }}</span></button>
            }
          </div>
        }

        <details class="manual">
          <summary>Enter manually</summary>
          <form #manual="ngForm" (ngSubmit)="addManual(manual)">
            <div class="fields">
              <mat-form-field><mat-label>Name</mat-label><input matInput name="name" [(ngModel)]="mName" required /></mat-form-field>
              <mat-form-field><mat-label>Calories</mat-label><input matInput type="number" inputmode="numeric" name="kcal" [(ngModel)]="mKcal" required min="0" max="10000" /><span matTextSuffix>kcal</span></mat-form-field>
            </div>
            @if (addError()) { <p class="error">{{ addError() }}</p> }
            <div class="actions"><button mat-stroked-button type="submit">Add</button></div>
          </form>
        </details>
      </section>
    </div>
  `,
  styles: `
    .totals {
      display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: baseline;
      gap: 16px; margin: 4px 0 8px;
    }
    .kcal { flex-shrink: 0; font-size: 36px; font-weight: 700; line-height: 1.05; letter-spacing: -0.03em; white-space: nowrap; }
    .unit { font-size: 16px; font-weight: 500; color: var(--ink-2); margin-left: 6px; }
    .macros { text-align: right; min-width: 0; }
    .list .name > .trunc { display: block; }
    .hint { margin-top: 8px; }
    .recent-label { margin: 16px 0 8px; }
    .results li { cursor: pointer; }
    .results li:hover, .results li:focus-visible { background: var(--ground); margin: 0 -8px; padding-left: 8px; padding-right: 8px; }
    .portion {
      display: flex; flex-direction: column; gap: 10px;
      margin-top: 12px; padding: 12px; background: var(--blue-tint); border-radius: var(--radius);
    }
    .picked { min-width: 0; }
    .picked strong, .picked .muted { display: block; }
    .portion-tools { display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-width: 0; }
    .portion-add { display: flex; flex-wrap: nowrap; gap: 10px; align-items: center; min-width: 0; }
    .grams { flex: 1; min-width: 0; width: auto; }
    .portion-add > button { flex-shrink: 0; }
    .cancel { align-self: flex-start; }
    .manual { margin-top: 20px; }
    .manual summary { font-weight: 500; margin-bottom: 12px; }
    @media (min-width: 560px) {
      .portion-tools { flex-direction: row; flex-wrap: nowrap; align-items: center; }
      .portion-add { flex: 1; }
      .cancel { align-self: center; flex-shrink: 0; }
    }
  `,
})
export class FoodPage {
  private api = inject(Api); private snack = inject(MatSnackBar);
  date = signal(today());
  entries = signal<FoodEntry[]>([]); loading = signal(true);
  recent = signal<RecentFood[]>([]);
  query = signal(''); results = signal<FoodHit[]>([]); searching = signal(false); searchError = signal('');
  picked = signal<FoodHit | null>(null); grams = signal(100);
  mName = signal(''); mKcal = signal<number | null>(null); addError = signal('');
  private timer?: ReturnType<typeof setTimeout>; private seq = 0;

  totals = computed(() => {
    const sum = (f: (e: FoodEntry) => number | null) => Math.round(this.entries().reduce((a, e) => a + (f(e) ?? 0), 0));
    return { kcal: sum(e => e.kcal), protein: sum(e => e.proteinG), carbs: sum(e => e.carbsG), fat: sum(e => e.fatG) };
  });

  constructor() {
    effect(() => { this.load(this.date()); });
    this.loadRecent();
  }

  async load(date: string) {
    try { this.entries.set(await this.api.get<FoodEntry[]>('/api/food', { date })); }
    finally { this.loading.set(false); }
  }
  async loadRecent() { this.recent.set(await this.api.get<RecentFood[]>('/api/food/recent')); }

  onQuery(q: string) {
    this.query.set(q); this.picked.set(null); this.searchError.set('');
    clearTimeout(this.timer);
    if (q.trim().length < 2) { this.results.set([]); return; }
    this.timer = setTimeout(() => this.search(q.trim()), 400);
  }

  async search(q: string) {
    const seq = ++this.seq;
    this.searching.set(true);
    try {
      const hits = await this.api.get<FoodHit[]>('/api/food/search', { q });
      if (seq !== this.seq) return;
      this.results.set(hits); this.searchError.set('');
    } catch (e) {
      if (seq !== this.seq) return;
      this.results.set([]); this.searchError.set(errorMessage(e, 'Search is unavailable. Enter the food manually.'));
    } finally { if (seq === this.seq) this.searching.set(false); }
  }

  scaled(per100: number | null) { return per100 === null ? null : Math.round(per100 * this.grams() / 100 * 10) / 10; }

  async addPicked() {
    const h = this.picked()!;
    await this.add({ name: h.brand ? `${h.name} (${h.brand})` : h.name, kcal: Math.round(this.scaled(h.kcalPer100g)!), grams: this.grams(),
      proteinG: this.scaled(h.proteinPer100g), carbsG: this.scaled(h.carbsPer100g), fatG: this.scaled(h.fatPer100g), barcode: h.barcode });
    this.picked.set(null); this.query.set(''); this.results.set([]);
  }

  addRecent(r: RecentFood) { return this.add({ ...r }); }

  async addManual(form: NgForm) {
    if (!this.mName() || this.mKcal() === null) return;
    await this.add({ name: this.mName(), kcal: this.mKcal()!, grams: null, proteinG: null, carbsG: null, fatG: null, barcode: null });
    form.resetForm(); this.mName.set(''); this.mKcal.set(null);
  }

  private async add(body: Omit<FoodEntry, 'id' | 'date'>, date = this.date()) {
    this.addError.set('');
    try {
      const saved = await this.api.post<FoodEntry>('/api/food', { ...body, date });
      if (date === this.date()) this.entries.update(list => [...list, saved]);
      this.snack.open(`Added ${saved.name}`, undefined, { duration: 2500 });
      this.loadRecent();
    } catch (e) { this.addError.set(errorMessage(e)); }
  }

  async remove(e: FoodEntry) {
    this.entries.update(list => list.filter(x => x.id !== e.id));
    try { await this.api.delete(`/api/food/${e.id}`); }
    catch (err) { this.entries.update(list => [...list, e]); this.addError.set(errorMessage(err)); return; }
    const { id, date, ...body } = e;
    this.snack.open(`Removed ${e.name}`, 'Undo', { duration: 6000 }).onAction().subscribe(() => this.add(body, date));
  }
}
