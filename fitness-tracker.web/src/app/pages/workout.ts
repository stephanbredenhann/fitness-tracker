import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api, errorMessage, Exercise, PlanItem, StrengthSet, WorkoutPlan } from '../core/api';
import { describeSet } from '../core/calc';
import { today } from '../core/dates';

type Step = { item: number; set: number; kind: 'work' | 'rest' };
type DoneSet = { item: number; reps: number; weightKg: number; durationSec: number | null };

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatProgressBarModule],
  template: `
    <div (click)="prime()">
      @switch (screen()) {
        @case ('loading') { <mat-progress-bar class="loading" mode="indeterminate" aria-label="Loading" /> }

        @case ('error') {
          <section class="panel">
            <p class="error">{{ error() }}</p>
            <div class="actions"><a mat-button routerLink="/plans">Back to plans</a></div>
          </section>
        }

        @case ('resume') {
          <section class="panel">
            <h2>Unfinished {{ name() }}</h2>
            <p class="muted small">{{ done().length }} set{{ done().length === 1 ? '' : 's' }} done, started {{ startedTime() }}</p>
            <div class="end">
              <button mat-flat-button type="button" (click)="resume()">Resume</button>
              <button mat-button type="button" (click)="discard()">Discard</button>
            </div>
          </section>
        }

        @case ('go') {
          <div class="session">
            <div class="page-head">
              <div class="meta">
                <h1>{{ name() }}</h1>
                <p class="muted small num">Set {{ setNo() }} of {{ totalSets() }} · {{ mmss(elapsed()) }}</p>
              </div>
              <button type="button" class="icon-btn" (click)="exit()" aria-label="Exit workout"><span class="material-icons">close</span></button>
            </div>

            @if (step(); as s) {
              <section class="stage">
                @if (s.kind === 'work') {
                  <p class="muted small">Set {{ s.set + 1 }} of {{ item().sets }}</p>
                  <h2 class="big">{{ item().name }}</h2>
                  @if (item().durationSec !== null) {
                    <div class="digits num">{{ mmss(remaining() ?? 0) }}</div>
                    <p class="muted">{{ item().durationSec }} s hold</p>
                  } @else {
                    <p class="target num">{{ item().reps }} reps{{ item().weightKg > 0 ? ' @ ' + kg() + ' kg' : '' }}</p>
                  }
                  @if (item().durationSec === null || item().weightKg > 0) {
                    <div class="vals">
                      @if (item().durationSec === null) {
                        <label><span>Reps</span><input class="plain" type="number" inputmode="numeric" min="1" max="500" [ngModel]="reps()" (ngModelChange)="reps.set($event)" /></label>
                      }
                      @if (item().weightKg > 0) {
                        <label><span>kg</span><input class="plain" type="number" inputmode="decimal" step="0.5" min="0" max="500" [ngModel]="kg()" (ngModelChange)="kg.set($event)" /></label>
                      }
                    </div>
                  }
                  <div class="acts">
                    @if (item().durationSec !== null) {
                      <button mat-stroked-button type="button" (click)="toggle()">{{ pausedLeft() === null ? 'Pause' : 'Start' }}</button>
                    }
                    <button mat-flat-button type="button" (click)="completeSet()">Done</button>
                  </div>
                } @else {
                  <p class="muted small">Rest</p>
                  <div class="digits num">{{ mmss(remaining() ?? 0) }}</div>
                  @if (nextWork(); as n) { <p class="muted">Next: {{ items()[n.item].name }}, set {{ n.set + 1 }} of {{ items()[n.item].sets }}</p> }
                  <div class="acts">
                    <button mat-stroked-button type="button" (click)="advance()">Skip</button>
                    <button mat-stroked-button type="button" (click)="add30()">+30 s</button>
                  </div>
                }
              </section>
            }
          </div>
        }

        @case ('finish') {
          <section class="panel">
            <h2>{{ name() }}</h2>
            <p class="muted small num">{{ rows().length }} movement{{ rows().length === 1 ? '' : 's' }} · {{ done().length }} set{{ done().length === 1 ? '' : 's' }} · {{ mmss(elapsed()) }}</p>
            <ul class="list recap">
              @for (r of rows(); track $index) { <li><div class="name">{{ r.name }}</div><span class="val">{{ describeSet(r) }}</span></li> }
            </ul>
            @if (error()) { <p class="error">{{ error() }}</p> }
            <div class="end">
              <button mat-flat-button type="button" (click)="log()" [disabled]="busy()">{{ error() ? 'Retry' : 'Log workout' }}</button>
              @if (canResume()) { <button mat-button type="button" (click)="keepGoing()">Keep going</button> }
              <button mat-button type="button" (click)="quit()">Discard</button>
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .session { display: flex; flex-direction: column; min-height: calc(100dvh - 48px); box-sizing: border-box; padding-bottom: env(safe-area-inset-bottom); }
    .session .page-head { margin-bottom: 16px; }
    .meta { min-width: 0; flex: 1; flex-shrink: 1; overflow: hidden; }
    .meta h1 { font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stage { display: flex; flex-direction: column; gap: 12px; flex: 1; }
    .big { font-size: 28px; }
    .target { font-size: 20px; font-weight: 500; }
    .digits { font-size: 72px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; text-align: center; margin: 16px 0; }
    .vals { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .vals:has(> :only-child) { grid-template-columns: 1fr; }
    .vals span { display: block; font-size: 12px; color: var(--ink-2); margin-bottom: 2px; }
    .acts { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .acts .mdc-button { height: 56px; font-size: 17px; white-space: nowrap; }
    .acts > :only-child { grid-column: 1 / -1; }
    .end { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
    .end .mdc-button { white-space: nowrap; }
    .end:has(> :nth-child(3)) > :first-child { grid-column: 1 / -1; }
    .recap { margin-top: 12px; }
  `,
})
export class WorkoutPage {
  private api = inject(Api); private router = inject(Router); private snack = inject(MatSnackBar);
  planId = input.required<string>();
  describeSet = describeSet;

  screen = signal<'loading' | 'resume' | 'go' | 'finish' | 'error'>('loading');
  name = signal(''); items = signal<PlanItem[]>([]);
  startedAt = signal(0); idx = signal(0); done = signal<DoneSet[]>([]);
  now = signal(Date.now()); deadline = signal<number | null>(null); pausedLeft = signal<number | null>(null);
  reps = signal(0); kg = signal(0);
  busy = signal(false); error = signal('');

  // A rest step follows every set except a zero rest or the very last set of the plan.
  steps = computed<Step[]>(() => {
    const items = this.items(), out: Step[] = [];
    items.forEach((it, i) => {
      for (let set = 0; set < it.sets; set++) {
        out.push({ item: i, set, kind: 'work' });
        if (it.restSec > 0 && !(i === items.length - 1 && set === it.sets - 1)) out.push({ item: i, set, kind: 'rest' });
      }
    });
    return out;
  });
  step = computed<Step | undefined>(() => this.steps()[this.idx()]);
  item = computed(() => this.items()[this.step()?.item ?? 0]);
  totalSets = computed(() => this.items().reduce((a, i) => a + i.sets, 0));
  setNo = computed(() => Math.min(this.done().length + 1, this.totalSets()));
  nextWork = computed(() => this.steps().slice(this.idx() + 1).find(s => s.kind === 'work'));
  remaining = computed(() => this.pausedLeft() ?? (this.deadline() === null ? null : Math.max(0, this.deadline()! - this.now())));
  elapsed = computed(() => this.now() - this.startedAt());
  canResume = computed(() => this.idx() < this.steps().length - 1 || this.done().length < this.totalSets());
  startedTime = computed(() => new Date(this.startedAt()).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));

  // One row per item: the mean of what was actually done, so the log matches the session.
  rows = computed<StrengthSet[]>(() => {
    const byItem = new Map<number, DoneSet[]>();
    for (const d of this.done()) byItem.set(d.item, [...(byItem.get(d.item) ?? []), d]);
    return [...byItem].map(([i, list]) => {
      const mean = (f: (d: DoneSet) => number) => list.reduce((a, d) => a + f(d), 0) / list.length;
      return {
        name: this.items()[i].name, sets: list.length,
        reps: Math.round(mean(d => d.reps)), weightKg: Math.round(mean(d => d.weightKg) * 2) / 2,
        durationSec: list[0].durationSec === null ? null : Math.round(mean(d => d.durationSec ?? 0)),
      };
    });
  });

  private ctx: AudioContext | null = null;
  private lock: { release(): Promise<void> } | null = null;
  private onVisible = () => { if (document.visibilityState === 'visible') this.wake(); };

  constructor() {
    const timer = setInterval(() => this.tick(), 250);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', this.onVisible);
      this.lock?.release().catch(() => {});
    });
    // ponytail: reps/kg edits mid-set are not persisted
    effect(() => {
      if (this.screen() !== 'go') return;
      const snap = { name: this.name(), items: this.items(), startedAt: this.startedAt(), idx: this.idx(), done: this.done(), deadline: this.deadline(), pausedLeft: this.pausedLeft() };
      try { localStorage.setItem(this.key(), JSON.stringify(snap)); } catch { /* private mode or full quota, the workout still runs */ }
    });
    queueMicrotask(() => this.init());
  }

  private key() { return 'workout:' + this.planId(); }
  private clear() { try { localStorage.removeItem(this.key()); } catch { /* nothing to clean up */ } }

  private init() {
    let raw: string | null = null;
    try { raw = localStorage.getItem(this.key()); } catch { /* storage blocked, start fresh */ }
    if (raw) {
      try {
        const s = JSON.parse(raw);
        this.name.set(s.name); this.items.set(s.items); this.startedAt.set(s.startedAt);
        this.idx.set(s.idx); this.done.set(s.done); this.deadline.set(s.deadline); this.pausedLeft.set(s.pausedLeft);
        this.screen.set('resume');
        return;
      } catch { /* corrupt snapshot, start fresh */ }
    }
    this.load();
  }

  private async load() {
    this.screen.set('loading'); this.error.set('');
    try {
      const p = await this.api.get<WorkoutPlan>(`/api/plans/${this.planId()}`);
      if (!p.items.length) { this.error.set('That plan has no exercises yet.'); this.screen.set('error'); return; }
      this.name.set(p.name); this.items.set(p.items);
      this.startedAt.set(Date.now()); this.idx.set(0); this.done.set([]);
      this.go(); this.enter();
    } catch (e) { this.error.set(errorMessage(e, 'That plan could not be loaded.')); this.screen.set('error'); }
  }

  // A snapshot never holds the reps/kg inputs, so refill them from the plan before continuing.
  resume() { const s = this.step(); if (s?.kind === 'work') { const it = this.items()[s.item]; this.reps.set(it.reps); this.kg.set(it.weightKg); } this.go(); }
  discard() { this.clear(); this.load(); }
  keepGoing() { this.go(); }
  quit() { this.clear(); this.router.navigate(['/plans']); }
  exit() { if (this.done().length) this.screen.set('finish'); else this.quit(); }

  private go() {
    this.screen.set('go');
    this.wake();
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private async wake() {
    try { this.lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* no wake lock, the screen may dim */ }
  }

  // Entering a step arms its timer: rests run down on their own, timed work waits for Start.
  private enter() {
    const s = this.step(); if (!s) return;
    const it = this.items()[s.item];
    if (s.kind === 'rest') { this.pausedLeft.set(null); this.deadline.set(Date.now() + it.restSec * 1000); return; }
    this.reps.set(it.reps); this.kg.set(it.weightKg);
    this.deadline.set(null); this.pausedLeft.set(it.durationSec === null ? null : it.durationSec * 1000);
  }

  private tick() {
    this.now.set(Date.now());
    const d = this.deadline();
    if (d !== null && this.now() >= d) this.expire();
  }

  private expire() {
    this.deadline.set(null);
    this.feedback();
    if (this.step()?.kind === 'rest') this.advance(); else this.completeSet();
  }

  toggle() {
    if (this.pausedLeft() === null) { this.pausedLeft.set(this.remaining()); this.deadline.set(null); }
    else { this.deadline.set(Date.now() + this.pausedLeft()!); this.pausedLeft.set(null); }
  }
  add30() { this.deadline.update(d => d === null ? d : d + 30000); }

  completeSet() {
    const s = this.step(); if (!s) return;
    const it = this.items()[s.item];
    const durationSec = it.durationSec === null ? null : Math.max(5, Math.round((it.durationSec * 1000 - (this.remaining() ?? 0)) / 1000));
    this.done.update(l => [...l, { item: s.item, reps: Number(this.reps()) || it.reps, weightKg: Number(this.kg()) || 0, durationSec }]);
    this.advance();
  }

  advance() {
    if (this.idx() + 1 >= this.steps().length) { this.screen.set('finish'); return; }
    this.idx.update(i => i + 1);
    this.enter();
  }

  mmss(ms: number) {
    const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60;
    return `${h ? h + ':' : ''}${h ? String(m).padStart(2, '0') : m}:${String(t % 60).padStart(2, '0')}`;
  }

  // One AudioContext, created on the first tap so the browser lets it make sound later.
  prime() { try { this.ctx ??= new AudioContext(); this.ctx.resume(); } catch { /* no audio, vibration still fires */ } }

  private feedback() {
    try {
      navigator.vibrate?.(200);
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), t = this.ctx.currentTime;
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.3);
    } catch { /* silent beep is not worth failing the timer over */ }
  }

  async log() {
    this.busy.set(true); this.error.set('');
    try {
      const saved = await this.api.post<Exercise>('/api/exercises', {
        date: today(), type: 'Strength',
        durationMin: Math.min(1440, Math.max(1, Math.round(this.elapsed() / 60000))),
        note: this.name(), sets: this.rows(),
      });
      this.clear();
      this.snack.open(`Logged ${this.name()}, ${saved.kcal} kcal`, undefined, { duration: 2500 });
      this.router.navigate(['/exercise']);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
