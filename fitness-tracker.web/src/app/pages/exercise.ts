import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Api, errorMessage, Exercise, ExerciseType, WeighIn } from '../core/api';
import { today } from '../core/dates';
import { DateNav } from '../shared/date-nav';

const LABELS: Record<ExerciseType, string> = {
  Walking: 'Walking', Running: 'Running', Cycling: 'Cycling', Swimming: 'Swimming', Strength: 'Strength training',
  Hiit: 'HIIT', Hiking: 'Hiking', Rowing: 'Rowing', Yoga: 'Yoga', Other: 'Other',
};

@Component({
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, DateNav],
  template: `
    <div class="stack">
      <div class="row between">
        <h1>Exercise</h1>
        <app-date-nav [(date)]="date" />
      </div>

      <section class="panel">
        <div class="num" style="margin-bottom:8px"><span class="muted small">Burned</span><br><strong style="font-size:22px">{{ total() }}</strong> kcal</div>
        @if (entries().length) {
          <ul class="list">
            @for (e of entries(); track e.id) {
              <li>
                <div class="name">{{ labels[e.type] }} <span class="sub">{{ e.durationMin }} min @if (e.note) { · {{ e.note }} }</span></div>
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
          <div class="fields">
            <mat-form-field appearance="outline"><mat-label>Activity</mat-label>
              <mat-select name="type" [(ngModel)]="type" required>
                @for (t of types(); track t.type) { <mat-option [value]="t.type">{{ labels[t.type] }}</mat-option> }
              </mat-select></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Duration</mat-label>
              <input matInput type="number" name="min" [(ngModel)]="minutes" required min="1" max="1440" /><span matTextSuffix>min</span></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>{{ type() === 'Other' ? 'Calories' : 'Calories (optional override)' }}</mat-label>
              <input matInput type="number" name="kcal" [(ngModel)]="kcal" min="0" max="10000" [required]="type() === 'Other'" [placeholder]="'' + (estimate() ?? '')" />
              <span matTextSuffix>kcal</span>
              @if (estimate() !== null && type() !== 'Other') { <mat-hint>Estimated {{ estimate() }} kcal at {{ weightKg() }} kg</mat-hint> }
              @else if (type() !== 'Other' && weightKg() === null) { <mat-hint>Log a weigh-in to get an estimate</mat-hint> }
            </mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Note</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="120" /></mat-form-field>
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <div class="actions"><button mat-flat-button type="submit" [disabled]="busy()">Add</button></div>
        </form>
      </section>
    </div>
  `,
})
export class ExercisePage {
  private api = inject(Api);
  labels = LABELS;
  date = signal(today());
  entries = signal<Exercise[]>([]);
  types = signal<{ type: ExerciseType; met: number }[]>([]);
  weightKg = signal<number | null>(null);
  type = signal<ExerciseType>('Walking'); minutes = signal<number | null>(30); kcal = signal<number | null>(null); note = signal('');
  busy = signal(false); error = signal('');

  total = computed(() => this.entries().reduce((a, e) => a + e.kcal, 0));
  estimate = computed(() => {
    const met = this.types().find(t => t.type === this.type())?.met, kg = this.weightKg(), min = this.minutes();
    return met && kg && min ? Math.round(met * kg * min / 60) : null;
  });

  constructor() {
    effect(() => { this.load(this.date()); });
    this.api.get<{ type: ExerciseType; met: number }[]>('/api/exercises/types').then(t => this.types.set([...t, { type: 'Other', met: 0 }]));
    this.api.get<WeighIn[]>('/api/weighins').then(w => this.weightKg.set(w.at(-1)?.weightKg ?? null));
  }

  async load(date: string) { this.entries.set(await this.api.get<Exercise[]>('/api/exercises', { date })); }

  async add() {
    this.busy.set(true); this.error.set('');
    try {
      await this.api.post('/api/exercises', { date: this.date(), type: this.type(), durationMin: this.minutes(), kcal: this.kcal(), note: this.note() || null });
      this.kcal.set(null); this.note.set('');
      await this.load(this.date());
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async remove(e: Exercise) {
    await this.api.delete(`/api/exercises/${e.id}`);
    this.entries.update(list => list.filter(x => x.id !== e.id));
  }
}
