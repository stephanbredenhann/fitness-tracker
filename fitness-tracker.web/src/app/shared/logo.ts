import { Component, input } from '@angular/core';

@Component({
  selector: 'app-logo',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <g fill="#fff">
        <rect x="12" y="15" width="4" height="8" rx="1.5" />
        <rect x="18" y="11" width="6" height="16" rx="2" />
        <rect x="24" y="16" width="16" height="6" rx="2" />
        <rect x="40" y="11" width="6" height="16" rx="2" />
        <rect x="48" y="15" width="4" height="8" rx="1.5" />
      </g>
      <polyline points="14,48 25,42 34,46 50,35" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
  styles: `:host { display: inline-flex; color: var(--blue); } svg { display: block; }`,
})
export class Logo { size = input(28); }
