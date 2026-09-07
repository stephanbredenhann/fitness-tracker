import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ACTIVITY_LABELS, ActivityLevel, Api, errorMessage, Profile, Sex } from '../core/api';
import { today } from '../core/dates';

@Component({
  selector: 'app-profile-form',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <form (ngSubmit)="submit()">
      <div class="fields">
        <mat-form-field appearance="outline"><mat-label>Name</mat-label>
          <input matInput name="displayName" [(ngModel)]="displayName" autocomplete="given-name" /></mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="hinted"><mat-label>Sex</mat-label>
          <mat-select name="sex" [(ngModel)]="sex" required>
            <mat-option value="Male">Male</mat-option><mat-option value="Female">Female</mat-option>
          </mat-select>
          <mat-hint>Used for the calorie estimate only</mat-hint></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Date of birth</mat-label>
          <input matInput type="date" name="birthDate" [(ngModel)]="birthDate" required [max]="maxBirth" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Height</mat-label>
          <input matInput type="number" inputmode="decimal" name="heightCm" [(ngModel)]="heightCm" required min="100" max="250" step="0.5" /><span matTextSuffix>cm</span></mat-form-field>
        @if (withWeight()) {
          <mat-form-field appearance="outline"><mat-label>Current weight</mat-label>
            <input matInput type="number" inputmode="decimal" name="weightKg" [(ngModel)]="weightKg" required min="30" max="300" step="0.1" /><span matTextSuffix>kg</span></mat-form-field>
        }
        <mat-form-field appearance="outline"><mat-label>Goal weight</mat-label>
          <input matInput type="number" inputmode="decimal" name="goalWeightKg" [(ngModel)]="goalWeightKg" required min="30" max="300" step="0.1" /><span matTextSuffix>kg</span></mat-form-field>
      </div>
      <mat-form-field appearance="outline" class="field"><mat-label>Typical day</mat-label>
        <mat-select name="activityLevel" [(ngModel)]="activityLevel" required>
          @for (level of levels; track level) { <mat-option [value]="level">{{ labels[level] }}</mat-option> }
        </mat-select>
        <mat-hint>Multiplies your resting burn into a daily estimate</mat-hint></mat-form-field>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="busy()">{{ submitLabel() }}</button>
        @if (saved()) { <span class="muted small">Saved</span> }
      </div>
    </form>
  `,
})
export class ProfileForm {
  private api = inject(Api);
  initial = input<Profile | null>(null);
  withWeight = input(false);
  submitLabel = input('Save');
  done = output<void>();

  levels: ActivityLevel[] = ['Sedentary', 'Light', 'Moderate', 'Active'];
  labels = ACTIVITY_LABELS;
  maxBirth = today();

  displayName = signal(''); sex = signal<Sex | ''>(''); birthDate = signal(''); heightCm = signal<number | null>(null);
  weightKg = signal<number | null>(null); goalWeightKg = signal<number | null>(null); activityLevel = signal<ActivityLevel | ''>('');
  busy = signal(false); saved = signal(false); error = signal('');

  ngOnInit() {
    const p = this.initial();
    if (!p) return;
    this.displayName.set(p.displayName ?? ''); this.sex.set(p.sex); this.birthDate.set(p.birthDate);
    this.heightCm.set(p.heightCm); this.goalWeightKg.set(p.goalWeightKg); this.activityLevel.set(p.activityLevel);
  }

  async submit() {
    this.busy.set(true); this.error.set(''); this.saved.set(false);
    try {
      await this.api.put('/api/profile', {
        displayName: this.displayName() || null, sex: this.sex(), birthDate: this.birthDate(),
        heightCm: this.heightCm(), goalWeightKg: this.goalWeightKg(), activityLevel: this.activityLevel(),
      });
      if (this.withWeight()) await this.api.put(`/api/weighins/${today()}`, { weightKg: this.weightKg() });
      this.saved.set(true);
      this.done.emit();
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
