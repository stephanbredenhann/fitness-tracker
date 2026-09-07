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
    .seg { display: inline-flex; border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--surface); padding: 2px; gap: 2px; }
    button { border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; font-weight: 500; padding: 0 12px; height: 34px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
    button:hover { color: var(--ink); background: var(--ground); }
    button.on { background: var(--blue); color: #fff; }
    @media (max-width: 560px) { .seg { display: flex; width: 100%; } button { flex: 1; } }
  `,
})
export class Segmented<T> {
  value = model.required<T>();
  options = input.required<{ value: T; label: string }[]>();
  label = input('');
}
