import { Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { addDays, longDate, today } from '../core/dates';

@Component({
  selector: 'app-date-nav',
  imports: [FormsModule, MatIconModule],
  template: `
    <div class="nav">
      <button type="button" class="icon-btn" (click)="shift(-1)" aria-label="Previous day"><span class="material-icons">chevron_left</span></button>
      <label class="date">
        <span>{{ label() }}</span>
        <input type="date" [ngModel]="date()" (ngModelChange)="date.set($event)" [max]="max" aria-label="Pick a date" />
      </label>
      <button type="button" class="icon-btn" (click)="shift(1)" [disabled]="date() >= max" aria-label="Next day"><span class="material-icons">chevron_right</span></button>
    </div>
  `,
  styles: `
    .nav { display: inline-flex; align-items: center; gap: 4px; }
    .icon-btn:hover { color: var(--blue); }
    .icon-btn:disabled { color: var(--hairline); background: none; cursor: default; }
    .date { position: relative; font-weight: 600; font-size: 18px; padding: 4px 8px; border-radius: var(--radius); cursor: pointer; }
    .date:hover { background: var(--ground); }
    .date input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  `,
})
export class DateNav {
  date = model.required<string>();
  max = today();
  label = () => longDate(this.date());
  shift(n: number) { this.date.set(addDays(this.date(), n)); }
}
