import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { Api, Dashboard, errorMessage, Exercise, ExerciseType } from '../core/api';
import { EXERCISE_LABELS } from './exercise';
import { addDays, shortDate, today } from '../core/dates';
import { BLUE, chartBase, HAIR, INK2 } from '../shared/chart-defaults';
import { Segmented } from '../shared/segmented';

@Component({
  imports: [DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, BaseChartDirective, Segmented],
  template: `
    @if (!data() && !error()) { <mat-progress-bar class="loading" mode="indeterminate" aria-label="Loading" /> }
    <div class="stack">
      <div class="row between">
        <h1>Dashboard</h1>
        <app-segmented [(value)]="days" [options]="ranges" label="Range" />
      </div>

      @if (data(); as d) {
        <section class="hero panel">
          <div class="weight">
            <div class="big num">{{ d.latestKg === null ? '–' : (d.latestKg | number:'1.0-1') }}<span class="unit">kg</span></div>
            <p class="muted">
              @if (d.latestKg !== null) {
                {{ toGo(d) }}
              } @else { No weigh-in yet. }
            </p>
          </div>
          <form class="weigh" (ngSubmit)="saveWeight()">
            <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Today's weight</mat-label>
              <input matInput type="number" inputmode="decimal" name="w" [(ngModel)]="todayKg" step="0.1" min="30" max="300" required /><span matTextSuffix>kg</span></mat-form-field>
            <button mat-flat-button type="submit" [disabled]="saving()">{{ d.latestDate === todayIso ? 'Update' : 'Log' }}</button>
          </form>
          <dl class="today num">
            <div><dt>Eaten</dt><dd>{{ todayRow(d)?.intake ?? 0 }}</dd></div>
            <div><dt>Burn</dt><dd>{{ todayRow(d)?.burn ?? d.tdee ?? '–' }}</dd></div>
            <div><dt>{{ (todayRow(d)?.deficit ?? 0) < 0 ? 'Surplus' : 'Deficit' }}</dt><dd>{{ abs(todayRow(d)?.deficit ?? 0) }}</dd></div>
            <div><dt>Streak</dt><dd><span class="material-icons flame" [class.on]="d.activeToday" aria-hidden="true">local_fire_department</span>{{ d.streak }}{{ d.streak === 1 ? ' day' : ' days' }}</dd></div>
          </dl>
          <p class="cap muted small">
            @if (d.activeToday) { Streak kept today. }
            @else if (d.streak > 0) { Log any exercise today to keep your streak. }
            @else { Log an exercise to start a streak. }
          </p>
          @if (error()) { <p class="error">{{ error() }}</p> }
        </section>

        @if (mix().length) {
          <section class="panel">
            <h2>Activity</h2>
            <div class="mix">
              @for (m of mix(); track m.type) {
                <a class="tile" routerLink="/exercise">
                  <strong class="num">{{ m.count }}</strong>
                  <span>{{ labels[m.type] }}</span>
                  <span class="muted small num">{{ m.km ? m.km + ' km · ' : '' }}{{ m.kcal }} kcal</span>
                </a>
              }
            </div>
          </section>
        }

        <section class="panel">
          <h2>Weight</h2>
          @if (d.weights.length) {
            <div class="chart"><canvas baseChart type="line" [data]="weightData()" [options]="weightOptions"></canvas></div>
          } @else { <p class="empty">Log a few weigh-ins and the trend appears here.</p> }
        </section>

        <section class="panel">
          <div class="row between" style="margin-bottom:14px">
            <h2 style="margin:0">Daily balance</h2>
            <span class="legend small muted"><i class="sw filled"></i>Deficit <i class="sw hollow"></i>Surplus</span>
          </div>
          @if (d.days.length) {
            <div class="chart"><canvas baseChart type="bar" [data]="deficitData()" [options]="deficitOptions"></canvas></div>
            <p class="muted small" style="margin-top:10px">Burn is your resting rate at {{ d.bmr }} kcal, times your activity level, plus logged exercise.</p>
          } @else {
            <p class="empty">Log <a routerLink="/food">food</a> or <a routerLink="/exercise">exercise</a> to see each day's balance.</p>
          }
        </section>
      } @else if (error()) { <p class="error">{{ error() }}</p> }
    </div>
  `,
  styles: `
    .hero { display: grid; grid-template-columns: 1fr auto; gap: 20px 32px; align-items: start; }
    .big { font-size: 48px; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
    .unit { font-size: 18px; font-weight: 500; color: var(--ink-2); margin-left: 6px; }
    .weight p { margin-top: 8px; }
    .weigh { display: flex; gap: 10px; align-items: center; }
    .weigh mat-form-field { width: 160px; }
    .today { grid-column: 1 / -1; display: flex; gap: 32px; margin: 4px 0 0; padding-top: 16px; border-top: 1px solid var(--hairline); }
    .today dt { color: var(--ink-2); font-size: 13px; }
    .today dd { margin: 0; font-size: 20px; font-weight: 600; }
    .flame { font-size: 18px; vertical-align: -3px; color: var(--ink-3); margin-right: 2px; }
    .flame.on { color: var(--blue); }
    .cap { grid-column: 1 / -1; margin: 8px 0 0; }
    .chart { position: relative; height: 260px; }
    .mix { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--hairline); border-radius: var(--radius); color: var(--ink); }
    .tile:hover { text-decoration: none; border-color: var(--blue); }
    .tile strong { font-size: 22px; font-weight: 600; line-height: 1.1; }
    .legend { display: inline-flex; align-items: center; gap: 6px; }
    .sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; margin-left: 10px; }
    .sw.filled { background: var(--blue); }
    .sw.hollow { border: 2px solid var(--blue); box-sizing: border-box; }
    @media (max-width: 560px) { .hero { grid-template-columns: 1fr; } .today { gap: 20px; } .chart { height: 220px; } .big { font-size: 40px; } }
  `,
})
export class DashboardPage {
  private api = inject(Api);
  todayIso = today();
  days = signal(30);
  ranges = [{ value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
  data = signal<Dashboard | null>(null); exercises = signal<Exercise[]>([]);
  labels = EXERCISE_LABELS;
  mix = computed(() => {
    const by = new Map<ExerciseType, { type: ExerciseType; count: number; km: number; kcal: number }>();
    for (const e of this.exercises()) {
      const m = by.get(e.type) ?? { type: e.type, count: 0, km: 0, kcal: 0 };
      m.count++; m.km = Math.round((m.km + (e.distanceKm ?? 0)) * 10) / 10; m.kcal += e.kcal;
      by.set(e.type, m);
    }
    return [...by.values()].sort((a, b) => b.count - a.count);
  });
  todayKg = signal<number | null>(null);
  saving = signal(false); error = signal('');
  abs = Math.abs;

  constructor() { effect(() => { this.days(); this.load(); }); }

  async load() {
    try {
      const from = addDays(this.todayIso, -(this.days() - 1));
      const [d, ex] = await Promise.all([
        this.api.get<Dashboard>('/api/dashboard', { to: this.todayIso, days: this.days() }),
        this.api.get<Exercise[]>('/api/exercises', { from, to: this.todayIso }),
      ]);
      this.data.set(d); this.exercises.set(ex);
      if (this.todayKg() === null) this.todayKg.set(d.latestKg === null ? null : Math.round(d.latestKg * 10) / 10);
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async saveWeight() {
    this.saving.set(true); this.error.set('');
    try { await this.api.put(`/api/weighins/${this.todayIso}`, { weightKg: this.todayKg() }); await this.load(); }
    catch (e) { this.error.set(errorMessage(e)); }
    finally { this.saving.set(false); }
  }

  todayRow(d: Dashboard) { return d.days.find(x => x.date === this.todayIso); }

  toGo(d: Dashboard) {
    const diff = Math.round(((d.latestKg ?? 0) - d.goalKg) * 10) / 10;
    if (Math.abs(diff) < 0.05) return 'At your goal.';
    return diff > 0 ? `${diff} kg above your ${d.goalKg} kg goal` : `${-diff} kg below your ${d.goalKg} kg goal`;
  }

  private range = computed(() => {
    const out: string[] = [];
    for (let i = this.days() - 1; i >= 0; i--) out.push(addDays(this.todayIso, -i));
    return out;
  });

  weightData = computed<ChartConfiguration<'line'>['data']>(() => {
    const d = this.data()!, r = this.range();
    const byDate = new Map(d.weights.map(w => [w.date, w.weightKg]));
    return {
      labels: r.map(shortDate),
      datasets: [
        { label: 'Weight', data: r.map(x => byDate.get(x) ?? null), borderColor: BLUE, backgroundColor: BLUE, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.25, spanGaps: true },
        { label: 'Goal', data: r.map(() => d.goalKg), borderColor: INK2, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
      ],
    };
  });

  deficitData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const d = this.data()!, r = this.range();
    const byDate = new Map(d.days.map(x => [x.date, x]));
    return {
      labels: r.map(shortDate),
      datasets: [{
        label: 'Balance', data: r.map(x => byDate.get(x)?.deficit ?? null),
        backgroundColor: c => ((c.raw as number) ?? 0) >= 0 ? BLUE : 'transparent',
        borderColor: BLUE, borderWidth: c => ((c.raw as number) ?? 0) >= 0 ? 0 : 2, borderRadius: 4, borderSkipped: 'start',
        maxBarThickness: 28,
      }],
    };
  });

  private base = chartBase;

  weightOptions: ChartConfiguration<'line'>['options'] = {
    ...this.base,
    plugins: { ...this.base.plugins, legend: { position: 'bottom', labels: { color: INK2, boxWidth: 10, boxHeight: 2, usePointStyle: false } },
      tooltip: { ...this.base.plugins.tooltip, callbacks: { label: c => `${c.dataset.label}: ${c.formattedValue} kg` } } },
    scales: { ...this.base.scales, y: { ...this.base.scales.y, ticks: { ...this.base.scales.y.ticks, callback: v => `${v} kg` } } },
  };

  deficitOptions: ChartConfiguration<'bar'>['options'] = {
    ...this.base,
    plugins: { ...this.base.plugins, legend: { display: false },
      tooltip: { ...this.base.plugins.tooltip, callbacks: { label: c => {
        const row = this.data()!.days.find(x => shortDate(x.date) === c.label);
        if (!row) return '';
        return [`Eaten ${row.intake} kcal`, `Burn ${row.burn} kcal`, `${row.deficit >= 0 ? 'Deficit' : 'Surplus'} ${Math.abs(row.deficit)} kcal`];
      } } } },
    scales: { ...this.base.scales, y: { ...this.base.scales.y, ticks: { ...this.base.scales.y.ticks, callback: v => `${v}` } } },
  };
}
