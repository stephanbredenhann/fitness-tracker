import { Component, input, model } from '@angular/core';

@Component({
  selector: 'app-segmented',
  template: `
    <div role="radiogroup" class="seg" [attr.aria-label]="label()">
      @for (o of options(); track o.value) {
        <button type="button" role="radio" [attr.aria-checked]="value() === o.value" [class.on]="value() === o.value" (click)="value.set(o.value)">{{ o.label }}</button>
      }
    </div>
  `,
  styles: `
    .seg {
      display: inline-flex; flex-wrap: nowrap; align-items: stretch;
      border: 1px solid var(--hairline); border-radius: var(--radius-pill);
      background: var(--ground); padding: 3px; gap: 2px;
    }
    button {
      border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; font-weight: 500;
      padding: 0 12px; height: 34px; border-radius: var(--radius-pill); cursor: pointer; white-space: nowrap;
      min-width: 0; transition: color .18s, background .18s;
    }
    button:hover { color: var(--ink); }
    button.on { background: var(--blue); color: #fff; }
    @media (max-width: 560px) { .seg { width: 100%; } button { flex: 1; overflow: hidden; text-overflow: ellipsis; } }
  `,
})
export class Segmented<T> {
  value = model.required<T>();
  options = input.required<{ value: T; label: string }[]>();
  label = input('');
}
