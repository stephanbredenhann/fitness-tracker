import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api, Equipment, EQUIPMENT_LABELS, errorMessage, LibraryExercise, MUSCLE_LABELS, MuscleGroup, PlanItem, WeighIn, WorkoutPlan } from '../core/api';
import { planEstimate } from '../core/calc';

const INTENSITY = [{ label: 'Light', met: 3.5 }, { label: 'Moderate', met: 5 }, { label: 'Vigorous', met: 8 }];
const blank = (): PlanItem => ({ name: '', met: 5, sets: 3, reps: 10, weightKg: 0, restSec: 60 });

@Component({
  imports: [DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatSelectModule, MatSlideToggleModule],
  template: `
    <div class="stack">
      <div class="row between">
        <h1>{{ id() ? 'Edit plan' : 'New plan' }}</h1>
        <a mat-button routerLink="/plans">Back to plans</a>
      </div>

      <form (ngSubmit)="save()">
        <section class="panel">
          <div class="fields">
            <mat-form-field appearance="outline"><mat-label>Name</mat-label><input matInput name="name" [(ngModel)]="name" required maxlength="80" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Description (optional)</mat-label><input matInput name="desc" [(ngModel)]="description" maxlength="500" /></mat-form-field>
          </div>
          <mat-slide-toggle name="shared" [(ngModel)]="isShared">Share with everyone on the tracker</mat-slide-toggle>
          <p class="muted small" style="margin-top:6px">Shared plans show your display name. Others can log sessions from it or copy it, only you can edit it.</p>
        </section>

        <section class="panel" style="margin-top:20px">
          <h2>Exercises</h2>
          <div class="mhead muted small"><span>Exercise</span><span>Sets</span><span>Reps</span><span>kg</span><span>Rest s</span><span></span></div>
          @for (m of items(); track $index; let i = $index) {
            <div class="mrow">
              <input class="plain" placeholder="Type to search the library" [ngModel]="m.name" (ngModelChange)="rename(i, $event)" [ngModelOptions]="{ standalone: true }" list="library" maxlength="60" required />
              <label class="cell"><span>Sets</span><input class="plain" type="number" inputmode="numeric" min="1" max="20" [ngModel]="m.sets" (ngModelChange)="patch(i, { sets: $event })" [ngModelOptions]="{ standalone: true }" /></label>
              <label class="cell"><span>Reps</span><input class="plain" type="number" inputmode="numeric" min="1" max="500" [ngModel]="m.reps" (ngModelChange)="patch(i, { reps: $event })" [ngModelOptions]="{ standalone: true }" /></label>
              <label class="cell"><span>kg</span><input class="plain" type="number" inputmode="decimal" min="0" max="500" step="0.5" [ngModel]="m.weightKg" (ngModelChange)="patch(i, { weightKg: $event })" [ngModelOptions]="{ standalone: true }" /></label>
              <label class="cell"><span>Rest s</span><input class="plain" type="number" inputmode="numeric" min="0" max="600" step="5" [ngModel]="m.restSec" (ngModelChange)="patch(i, { restSec: $event })" [ngModelOptions]="{ standalone: true }" /></label>
              <div class="rowacts">
                <button type="button" class="icon-btn" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move up"><span class="material-icons">arrow_upward</span></button>
                <button type="button" class="icon-btn" (click)="move(i, 1)" [disabled]="i === items().length - 1" aria-label="Move down"><span class="material-icons">arrow_downward</span></button>
                <button type="button" class="icon-btn" (click)="removeItem(i)" aria-label="Remove exercise"><span class="material-icons">close</span></button>
              </div>
            </div>
          }
          <datalist id="library">@for (x of library(); track x.id) { <option [value]="x.name">{{ equipment[x.equipment] }} · {{ muscles[x.muscle] }}</option> }</datalist>
          <div class="actions">
            <button type="button" mat-button (click)="addItem()">Add exercise</button>
            <button type="button" mat-button (click)="showCustom.set(!showCustom())">Add your own exercise</button>
          </div>
          <p class="muted small" style="margin-top:10px">
            @if (estimate(); as e) { About {{ e.minutes }} min{{ e.kcal !== null ? ' and ~' + e.kcal + ' kcal at ' + (weightKg() | number:'1.0-1') + ' kg' : '' }}. }
            0 kg means bodyweight. Rest is the pause after each set.
          </p>

          @if (showCustom()) {
            <div class="custom">
              <h3>Your own exercise</h3>
              <div class="fields">
                <mat-form-field appearance="outline"><mat-label>Name</mat-label><input matInput name="cname" [(ngModel)]="cName" maxlength="60" /></mat-form-field>
                <mat-form-field appearance="outline"><mat-label>Equipment</mat-label>
                  <mat-select name="ceq" [(ngModel)]="cEquipment">@for (e of equipmentKeys; track e) { <mat-option [value]="e">{{ equipment[e] }}</mat-option> }</mat-select></mat-form-field>
                <mat-form-field appearance="outline"><mat-label>Muscle group</mat-label>
                  <mat-select name="cmus" [(ngModel)]="cMuscle">@for (m of muscleKeys; track m) { <mat-option [value]="m">{{ muscles[m] }}</mat-option> }</mat-select></mat-form-field>
                <mat-form-field appearance="outline"><mat-label>Intensity</mat-label>
                  <mat-select name="cmet" [(ngModel)]="cMet">@for (i of intensity; track i.met) { <mat-option [value]="i.met">{{ i.label }}</mat-option> }</mat-select></mat-form-field>
              </div>
              <div class="actions"><button type="button" mat-stroked-button (click)="addCustom()" [disabled]="!cName().trim()">Add to library and plan</button></div>
            </div>
          }
        </section>

        @if (error()) { <p class="error" style="margin-top:12px">{{ error() }}</p> }
        <div class="actions" style="margin-top:16px">
          <button mat-flat-button type="submit" [disabled]="busy()">{{ id() ? 'Save changes' : 'Create plan' }}</button>
          <a mat-button routerLink="/plans">Cancel</a>
        </div>
      </form>
    </div>
  `,
  styles: `
    .mhead, .mrow { display: grid; grid-template-columns: 1fr 56px 56px 72px 64px 104px; gap: 8px; align-items: center; }
    .mhead { padding: 0 0 6px; }
    .mrow { padding: 4px 0; }
    .cell { display: block; }
    .cell span { display: none; }
    .rowacts { display: flex; justify-content: flex-end; }
    .rowacts .icon-btn { padding: 4px; }
    .rowacts .icon-btn:disabled { color: var(--hairline); background: none; cursor: default; }
    .custom { margin-top: 16px; padding: 14px; border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--ground); }
    .custom h3 { font-size: 15px; margin-bottom: 10px; }
    @media (max-width: 560px) {
      .mhead { display: none; }
      .mrow { grid-template-columns: repeat(4, 1fr); grid-template-areas: "name name name name" "sets reps kg rest" "acts acts acts acts"; padding: 10px 0; border-top: 1px solid var(--hairline); }
      .mrow > :nth-child(1) { grid-area: name; }
      .mrow > :nth-child(2) { grid-area: sets; }
      .mrow > :nth-child(3) { grid-area: reps; }
      .mrow > :nth-child(4) { grid-area: kg; }
      .mrow > :nth-child(5) { grid-area: rest; }
      .rowacts { grid-area: acts; }
      .cell span { display: block; font-size: 12px; color: var(--ink-2); margin-bottom: 2px; }
    }
  `,
})
export class PlanEditPage {
  private api = inject(Api); private router = inject(Router); private snack = inject(MatSnackBar);
  id = input<string>();
  equipment = EQUIPMENT_LABELS; muscles = MUSCLE_LABELS; intensity = INTENSITY;
  equipmentKeys = Object.keys(EQUIPMENT_LABELS) as Equipment[]; muscleKeys = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
  name = signal(''); description = signal(''); isShared = signal(false); items = signal<PlanItem[]>([blank()]);
  library = signal<LibraryExercise[]>([]); weightKg = signal<number | null>(null);
  showCustom = signal(false); cName = signal(''); cEquipment = signal<Equipment>('Dumbbell'); cMuscle = signal<MuscleGroup>('FullBody'); cMet = signal(5);
  busy = signal(false); error = signal('');

  estimate = computed(() => { const valid = this.items().filter(i => i.name.trim()); return valid.length ? planEstimate(valid, this.weightKg()) : null; });

  constructor() {
    this.api.get<LibraryExercise[]>('/api/library').then(l => this.library.set(l));
    this.api.get<WeighIn[]>('/api/weighins').then(w => this.weightKg.set(w.at(-1)?.weightKg ?? null));
    queueMicrotask(() => { if (this.id()) this.load(this.id()!); });
  }

  async load(id: string) {
    try {
      const p = await this.api.get<WorkoutPlan>(`/api/plans/${id}`);
      if (!p.isMine) { this.router.navigate(['/plans']); return; }
      this.name.set(p.name); this.description.set(p.description ?? ''); this.isShared.set(p.isShared); this.items.set(p.items);
    } catch (e) { this.error.set(errorMessage(e, 'That plan could not be loaded.')); }
  }

  // Picking a library name copies its MET into the row; unknown names keep a moderate 5.0.
  rename(i: number, name: string) {
    const hit = this.library().find(x => x.name.toLowerCase() === name.trim().toLowerCase());
    this.patch(i, { name, met: hit?.met ?? 5 });
  }
  patch(i: number, change: Partial<PlanItem>) { this.items.update(list => list.map((m, j) => j === i ? { ...m, ...change } : m)); }
  addItem() { this.items.update(list => [...list, blank()]); }
  removeItem(i: number) { this.items.update(list => list.length === 1 ? [blank()] : list.filter((_, j) => j !== i)); }
  move(i: number, d: number) {
    this.items.update(list => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; return l; });
  }

  async addCustom() {
    this.error.set('');
    try {
      const x = await this.api.post<LibraryExercise>('/api/library', { name: this.cName().trim(), equipment: this.cEquipment(), muscle: this.cMuscle(), met: this.cMet() });
      this.library.update(l => [...l, x]);
      const empty = this.items().findIndex(m => !m.name.trim());
      const row = { ...blank(), name: x.name, met: x.met };
      this.items.update(list => empty >= 0 ? list.map((m, j) => j === empty ? row : m) : [...list, row]);
      this.cName.set(''); this.showCustom.set(false);
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  async save() {
    this.busy.set(true); this.error.set('');
    const body = { name: this.name(), description: this.description() || null, isShared: this.isShared(), items: this.items().filter(i => i.name.trim()) };
    try {
      if (this.id()) await this.api.put(`/api/plans/${this.id()}`, body);
      else await this.api.post('/api/plans', body);
      this.snack.open(this.id() ? 'Plan saved' : 'Plan created', undefined, { duration: 2500 });
      this.router.navigate(['/plans']);
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
