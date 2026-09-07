import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { Api, errorMessage, Exercise, ExerciseType, LibraryExercise, StravaStatus, StrengthSet, WeighIn } from '../core/api';
import { AuthStore } from '../core/auth.store';
import { CARDIO_TYPES, describeSet, exerciseKcal, formatPace, paceMinPerKm, volumeKg } from '../core/calc';
import { addDays, shortDate, today } from '../core/dates';
import { DateNav } from '../shared/date-nav';
import { BLUE, chartBase } from '../shared/chart-defaults';
import { Segmented } from '../shared/segmented';

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  Walking: 'Walking', Running: 'Running', Cycling: 'Cycling', Swimming: 'Swimming', Strength: 'Strength',
  Hiit: 'HIIT', Hiking: 'Hiking', Rowing: 'Rowing', Yoga: 'Yoga', Other: 'Other',
};
const ORDER: ExerciseType[] = ['Running', 'Walking', 'Cycling', 'Strength', 'Hiking', 'Swimming', 'Rowing', 'Hiit', 'Yoga', 'Other'];
type TrendType = 'Running' | 'Walking' | 'Cycling' | 'Strength';
type Metric = 'distance' | 'pace' | 'kcal' | 'volume';
const METRICS: Record<Metric, { label: string; unit: string }> = {
  distance: { label: 'Distance', unit: 'km' }, pace: { label: 'Pace', unit: '/km' }, kcal: { label: 'Calories', unit: 'kcal' }, volume: { label: 'Volume', unit: 'kg' },
};

@Component({
  imports: [DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule, DateNav, BaseChartDirective, Segmented],
  template: `
    @if (loading()) { <mat-progress-bar class="loading" mode="indeterminate" aria-label="Loading" /> }
    <div class="stack">
      <div class="row between">
        <h1>Exercise</h1>
        <div class="row" style="gap:4px">
          @if (strava()?.connected) {
            <button type="button" class="icon-btn" (click)="syncStrava()" [disabled]="syncing()" aria-label="Sync Strava" title="Sync Strava"><span class="material-icons" [class.spin]="syncing()">sync</span></button>
          }
          <app-date-nav [(date)]="date" />
        </div>
      </div>

      <section class="panel">
        <div class="num" style="margin-bottom:8px"><span class="muted small">Burned</span><br><strong style="font-size:22px">{{ total() }}</strong> kcal</div>
        @if (entries().length) {
          <ul class="list">
            @for (e of entries(); track e.id) {
              <li>
                <div class="name">
                  {{ labels[e.type] }} @if (e.source === 'Strava') { <span class="tag">Strava</span> }
                  <span class="sub">{{ describe(e) }} @if (e.note) { · {{ e.note }} }</span>
                  @if (e.sets.length) {
                    <details class="sets"><summary>{{ e.sets.length }} movement{{ e.sets.length === 1 ? '' : 's' }}</summary>
                      <ul>@for (s of e.sets; track $index) { <li>{{ s.name }} <span class="muted">{{ describeSet(s) }}</span></li> }</ul>
                    </details>
                  }
                </div>
                <span class="val">{{ e.kcal }} kcal</span>
                <button type="button" class="icon-btn" (click)="remove(e)" aria-label="Remove"><span class="material-icons">close</span></button>
              </li>
            }
          </ul>
        } @else { <p class="empty">No exercise logged for this day.</p> }
      </section>

      <section class="panel">
        <h2>Log exercise</h2>
        <form (ngSubmit)="add()">
          <div class="chips" role="radiogroup" aria-label="Activity" style="margin-bottom:16px">
            @for (t of order; track t) {
              <button type="button" class="chip" [class.on]="type() === t" role="radio" [attr.aria-checked]="type() === t" (click)="type.set(t)">{{ labels[t] }}</button>
            }
          </div>

          <div class="fields">
            <mat-form-field appearance="outline"><mat-label>Duration</mat-label>
              <input matInput type="number" inputmode="numeric" name="min" [(ngModel)]="minutes" required min="1" max="1440" /><span matTextSuffix>min</span></mat-form-field>
            @if (isCardio()) {
              <mat-form-field appearance="outline"><mat-label>Distance (optional)</mat-label>
                <input matInput type="number" inputmode="decimal" name="km" [(ngModel)]="distanceKm" min="0.01" max="1000" step="0.01" /><span matTextSuffix>km</span>
                @if (pace(); as p) { <mat-hint>Pace {{ p }} /km</mat-hint> }
              </mat-form-field>
            }
          </div>

          @if (type() === 'Strength') {
            <div class="movements">
              <div class="mhead muted small"><span>Movement</span><span>Sets</span><span>Reps / s</span><span>kg</span><span></span></div>
              @for (m of movements(); track $index; let i = $index) {
                <div class="mrow">
                  <input class="plain" placeholder="e.g. Dumbbell press" [ngModel]="m.name" (ngModelChange)="patch(i, { name: $event })" [ngModelOptions]="{ standalone: true }" list="library" maxlength="60" />
                  @if (m.durationSec !== null) {
                    <span></span>
                    <span class="timed"><input class="plain num" type="number" inputmode="numeric" min="5" max="3600" step="5" [ngModel]="m.durationSec" (ngModelChange)="patch(i, { durationSec: $event })" [ngModelOptions]="{ standalone: true }" aria-label="Seconds" /><em class="unit">s</em></span>
                  } @else {
                    <input class="plain num" type="number" inputmode="numeric" min="1" max="20" [ngModel]="m.sets" (ngModelChange)="patch(i, { sets: $event })" [ngModelOptions]="{ standalone: true }" aria-label="Sets" />
                    <input class="plain num" type="number" inputmode="numeric" min="1" max="500" [ngModel]="m.reps" (ngModelChange)="patch(i, { reps: $event })" [ngModelOptions]="{ standalone: true }" aria-label="Reps" />
                  }
                  <input class="plain num" type="number" inputmode="decimal" min="0" max="500" step="0.5" [ngModel]="m.weightKg" (ngModelChange)="patch(i, { weightKg: $event })" [ngModelOptions]="{ standalone: true }" aria-label="Weight in kg" />
                  <div class="rowacts">
                    <button type="button" class="icon-btn" [class.on]="m.durationSec !== null" [attr.aria-pressed]="m.durationSec !== null" title="Time this exercise instead of counting reps" (click)="toggleTimed(i)"><span class="material-icons">timer</span></button>
                    <button type="button" class="icon-btn" (click)="removeMovement(i)" aria-label="Remove movement"><span class="material-icons">close</span></button>
                  </div>
                </div>
              }
              <datalist id="library">@for (x of library(); track x.id) { <option [value]="x.name"></option> }</datalist>
              <button type="button" mat-button (click)="addMovement()">Add movement</button>
              <a mat-button routerLink="/plans">Use a plan</a>
              <p class="muted small">0 kg means bodyweight. Heavier loads relative to your weight raise the estimate.</p>
            </div>
          }

          <div class="fields">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="hinted"><mat-label>{{ type() === 'Other' ? 'Calories' : 'Calories (optional override)' }}</mat-label>
              <input matInput type="number" inputmode="numeric" name="kcal" [(ngModel)]="kcal" min="0" max="10000" [required]="type() === 'Other'" [placeholder]="'' + (estimate() ?? '')" />
              <span matTextSuffix>kcal</span>
              @if (estimate() !== null && type() !== 'Other') { <mat-hint>Estimated {{ estimate() }} kcal at {{ weightKg() | number:'1.0-1' }} kg</mat-hint> }
              @else if (type() !== 'Other' && weightKg() === null) { <mat-hint>Log a weigh-in to get an estimate</mat-hint> }
            </mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Note</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="120" /></mat-form-field>
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <div class="actions"><button mat-flat-button type="submit" [disabled]="busy()">Add</button></div>
        </form>
      </section>

      <section class="panel">
        <div class="row between wrap-row" style="margin-bottom:14px">
          <h2 style="margin:0">Trends</h2>
          <app-segmented [(value)]="days" [options]="ranges" label="Range" />
        </div>
        <div style="margin-bottom:12px">
          <app-segmented [value]="trendType()" (valueChange)="setTrendType($event)" [options]="trendTypeOptions" label="Activity" />
        </div>
        @if (sessions().length) {
          <app-segmented class="metrics" [(value)]="metric" [options]="metricOptions()" label="Metric" />
          <div class="chart"><canvas baseChart [type]="metric() === 'pace' ? 'line' : 'bar'" [data]="trendData()" [options]="trendOptions()"></canvas></div>
          <p class="muted small" style="margin-top:10px">{{ summary() }}</p>
        } @else { <p class="empty">No {{ labels[trendType()].toLowerCase() }} in the last {{ days() }} days.</p> }
      </section>
    </div>
  `,
  styles: `
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .sets { margin-top: 4px; font-size: 13px; }
    .sets ul { list-style: none; margin: 6px 0 0; padding: 0 0 0 4px; }
    .sets li { padding: 2px 0; }
    .movements { margin: 0 0 12px; }
    .mhead, .mrow { display: grid; grid-template-columns: 1fr 56px 72px 72px 64px; gap: 8px; align-items: center; }
    .timed { display: flex; align-items: center; gap: 4px; }
    .unit { font-style: normal; font-size: 12px; color: var(--ink-2); }
    .rowacts { display: flex; justify-content: flex-end; }
    .rowacts .icon-btn { padding: 4px; }
    .rowacts .icon-btn.on { color: var(--blue); background: var(--blue-tint); }
    .mhead { padding: 0 0 6px; }
    .mrow { padding: 4px 0; }
    .metrics { display: block; margin-bottom: 12px; }
    .chart { position: relative; height: 240px; }
    .wrap-row { flex-wrap: wrap; }
    @media (max-width: 560px) {
      .mhead, .mrow { grid-template-columns: 1fr 48px 60px 60px 56px; gap: 6px; }
      .chart { height: 200px; }
    }
  `,
})
export class ExercisePage {
  private api = inject(Api); private snack = inject(MatSnackBar); private auth = inject(AuthStore);
  labels = EXERCISE_LABELS; describeSet = describeSet;
  strava = signal<StravaStatus | null>(null); syncing = signal(false); order = ORDER;
  trendTypes: TrendType[] = ['Running', 'Walking', 'Cycling', 'Strength'];
  trendTypeOptions = this.trendTypes.map(t => ({ value: t, label: EXERCISE_LABELS[t] }));
  ranges = [{ value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
  todayIso = today();
  date = signal(today());
  entries = signal<Exercise[]>([]); loading = signal(true);
  types = signal<{ type: ExerciseType; met: number }[]>([]); library = signal<LibraryExercise[]>([]);
  weightKg = signal<number | null>(null);
  type = signal<ExerciseType>('Running'); minutes = signal<number | null>(30); distanceKm = signal<number | null>(null);
  kcal = signal<number | null>(null); note = signal('');
  movements = signal<StrengthSet[]>([{ name: '', sets: 3, reps: 10, weightKg: 0, durationSec: null }]);
  busy = signal(false); error = signal(''); lastSec = 60;
  days = signal(30); trendType = signal<TrendType>('Running'); metric = signal<Metric>('distance');
  range = signal<Exercise[]>([]);

  total = computed(() => this.entries().reduce((a, e) => a + e.kcal, 0));
  isCardio = computed(() => CARDIO_TYPES.includes(this.type()));
  pace = computed(() => this.isCardio() ? formatPace(paceMinPerKm(this.distanceKm(), this.minutes() ?? 0)) : '');
  estimate = computed(() => {
    const kg = this.weightKg(), min = this.minutes();
    if (!kg || !min) return null;
    const sets = this.type() === 'Strength' ? this.movements().filter(m => m.name.trim()) : [];
    return exerciseKcal(this.type(), this.types().find(t => t.type === this.type())?.met, min, kg, this.isCardio() ? this.distanceKm() : null, sets);
  });

  sessions = computed(() => this.range().filter(e => e.type === this.trendType()));
  metricsFor = computed<Metric[]>(() => this.trendType() === 'Strength' ? ['volume', 'kcal'] : ['distance', 'pace', 'kcal']);
  metricOptions = computed(() => this.metricsFor().map(m => ({ value: m, label: METRICS[m].label })));

  constructor() {
    effect(() => { this.load(this.date()); });
    effect(() => { this.loadRange(this.days()); });
    this.api.get<{ type: ExerciseType; met: number }[]>('/api/exercises/types').then(t => this.types.set([...t, { type: 'Other', met: 0 }]));
    this.api.get<WeighIn[]>('/api/weighins').then(w => this.weightKg.set(w.at(-1)?.weightKg ?? null));
    this.api.get<LibraryExercise[]>('/api/library').then(l => this.library.set(l));
    if (this.auth.me()?.stravaEnabled) this.api.get<StravaStatus>('/api/strava/status').then(s => this.strava.set(s)).catch(() => {});
    const planId = inject(ActivatedRoute).snapshot.queryParamMap.get('plan');
    if (planId) this.loadPlan(planId);
  }

  async load(date: string) {
    try { this.entries.set(await this.api.get<Exercise[]>('/api/exercises', { date })); }
    finally { this.loading.set(false); }
  }

  async syncStrava() {
    this.syncing.set(true); this.error.set('');
    try {
      const r = await this.api.post<{ imported: number; needsWeight: boolean }>('/api/strava/sync', {});
      this.snack.open(r.needsWeight ? 'Log a weigh-in first so calories can be estimated' : `Imported ${r.imported} from Strava`, undefined, { duration: 3000 });
      await Promise.all([this.load(this.date()), this.loadRange(this.days())]);
    } catch (e) { this.error.set(errorMessage(e, 'Strava sync failed.')); }
    finally { this.syncing.set(false); }
  }
  async loadRange(days: number) { this.range.set(await this.api.get<Exercise[]>('/api/exercises', { from: addDays(this.todayIso, -(days - 1)), to: this.todayIso })); }

  // Prefill strength movements from a workout plan (Phase 4 adds the endpoint; a 404 is simply ignored).
  async loadPlan(id: string) {
    try {
      const plan = await this.api.get<{ name: string; items: StrengthSet[]; estimatedMin: number | null }>(`/api/plans/${id}`);
      this.type.set('Strength'); this.note.set(plan.name);
      this.movements.set(plan.items.map(i => ({ name: i.name, sets: i.sets, reps: i.reps, weightKg: i.weightKg, durationSec: i.durationSec ?? null })));
      if (plan.estimatedMin) this.minutes.set(plan.estimatedMin);
    } catch { /* plan gone or not shared, keep the empty form */ }
  }

  describe(e: Exercise) {
    const parts = [`${e.durationMin} min`];
    if (e.distanceKm) parts.push(`${e.distanceKm} km`, `${formatPace(paceMinPerKm(e.distanceKm, e.durationMin))} /km`);
    if (e.sets.length && volumeKg(e.sets)) parts.push(`${volumeKg(e.sets).toLocaleString()} kg volume`);
    return parts.join(' · ');
  }

  patch(i: number, change: Partial<StrengthSet>) {
    if (change.durationSec) this.lastSec = change.durationSec;
    this.movements.update(list => list.map((m, j) => j === i ? { ...m, ...change } : m));
  }
  toggleTimed(i: number) { this.patch(i, this.movements()[i].durationSec === null ? { durationSec: this.lastSec, sets: 1 } : { durationSec: null }); }
  addMovement() { this.movements.update(list => [...list, { name: '', sets: 3, reps: 10, weightKg: 0, durationSec: null }]); }
  removeMovement(i: number) { this.movements.update(list => list.filter((_, j) => j !== i)); }

  async add() {
    this.busy.set(true); this.error.set('');
    const strength = this.type() === 'Strength';
    try {
      await this.post({
        date: this.date(), type: this.type(), durationMin: this.minutes(), kcal: this.kcal(), note: this.note() || null,
        distanceKm: this.isCardio() ? this.distanceKm() : null,
        sets: strength ? this.movements().filter(m => m.name.trim()) : [],
      });
      this.kcal.set(null); this.note.set(''); this.distanceKm.set(null);
      if (strength) this.movements.set([{ name: '', sets: 3, reps: 10, weightKg: 0, durationSec: null }]);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  private async post(body: object) {
    const saved = await this.api.post<Exercise>('/api/exercises', body);
    if (saved.date === this.date()) this.entries.update(list => [...list, saved]);
    this.range.update(list => [...list, saved]);
    this.snack.open(`Added ${this.labels[saved.type].toLowerCase()}, ${saved.kcal} kcal`, undefined, { duration: 2500 });
  }

  async remove(e: Exercise) {
    this.entries.update(list => list.filter(x => x.id !== e.id));
    this.range.update(list => list.filter(x => x.id !== e.id));
    try { await this.api.delete(`/api/exercises/${e.id}`); }
    catch (err) { this.entries.update(list => [...list, e]); this.range.update(list => [...list, e]); this.error.set(errorMessage(err)); return; }
    const { id, source, ...body } = e;
    this.snack.open(`Removed ${this.labels[e.type].toLowerCase()}`, 'Undo', { duration: 6000 }).onAction().subscribe(() => this.post(body).catch(err => this.error.set(errorMessage(err))));
  }

  setTrendType(t: TrendType) {
    this.trendType.set(t);
    if (!this.metricsFor().includes(this.metric())) this.metric.set(t === 'Strength' ? 'volume' : 'distance');
  }

  private value(e: Exercise, m: Metric): number | null {
    switch (m) {
      case 'distance': return e.distanceKm;
      case 'pace': return paceMinPerKm(e.distanceKm, e.durationMin);
      case 'kcal': return e.kcal;
      case 'volume': return volumeKg(e.sets) || null;
    }
  }

  private dates = computed(() => {
    const out: string[] = [];
    for (let i = this.days() - 1; i >= 0; i--) out.push(addDays(this.todayIso, -i));
    return out;
  });

  // One value per day: sums for distance, kcal and volume; distance-weighted mean for pace.
  private perDay = computed(() => {
    const m = this.metric(), byDate = new Map<string, number>();
    for (const d of this.dates()) {
      const day = this.sessions().filter(e => e.date === d);
      if (!day.length) continue;
      if (m === 'pace') {
        const km = day.reduce((a, e) => a + (e.distanceKm ?? 0), 0), min = day.reduce((a, e) => a + (e.distanceKm ? e.durationMin : 0), 0);
        if (km > 0) byDate.set(d, Math.round(min / km * 100) / 100);
      } else {
        const sum = day.reduce((a, e) => a + (this.value(e, m) ?? 0), 0);
        if (sum > 0) byDate.set(d, Math.round(sum * 100) / 100);
      }
    }
    return byDate;
  });

  trendData = computed<ChartConfiguration<'bar' | 'line'>['data']>(() => {
    const by = this.perDay(), pace = this.metric() === 'pace';
    return {
      labels: this.dates().map(shortDate),
      datasets: [{
        label: METRICS[this.metric()].label, data: this.dates().map(d => by.get(d) ?? null),
        backgroundColor: BLUE, borderColor: BLUE, borderWidth: 2, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28,
        pointRadius: 4, pointHoverRadius: 6, tension: 0.25, spanGaps: true,
      }],
    };
  });

  trendOptions = computed<ChartConfiguration<'bar' | 'line'>['options']>(() => {
    const m = this.metric(), unit = METRICS[m].unit;
    const fmt = (v: number) => m === 'pace' ? `${formatPace(v)} ${unit}` : `${v.toLocaleString()} ${unit}`;
    return {
      ...chartBase,
      plugins: { ...chartBase.plugins, legend: { display: false },
        tooltip: { ...chartBase.plugins.tooltip, callbacks: { label: c => fmt(c.raw as number) } } },
      scales: { ...chartBase.scales, y: { ...chartBase.scales.y, reverse: m === 'pace', beginAtZero: m !== 'pace',
        ticks: { ...chartBase.scales.y.ticks, callback: v => m === 'pace' ? formatPace(Number(v)) : `${v}` } } },
    };
  });

  summary = computed(() => {
    const s = this.sessions(), n = s.length, label = `${n} session${n === 1 ? '' : 's'}`;
    if (this.trendType() === 'Strength') return `${label} · ${volumeKg(s.flatMap(e => e.sets)).toLocaleString()} kg lifted · ${s.reduce((a, e) => a + e.kcal, 0)} kcal`;
    const km = s.reduce((a, e) => a + (e.distanceKm ?? 0), 0), min = s.reduce((a, e) => a + (e.distanceKm ? e.durationMin : 0), 0);
    const pace = km > 0 ? ` · average pace ${formatPace(min / km)} /km` : '';
    return `${label} · ${Math.round(km * 10) / 10} km${pace} · ${s.reduce((a, e) => a + e.kcal, 0)} kcal`;
  });
}
