import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../core/auth.store';
import { ProfileForm } from '../shared/profile-form';

@Component({
  imports: [ProfileForm],
  template: `
    <div class="auth"><div class="card wide">
      <span class="brand">Fitness Tracker</span>
      <h1>A few numbers to start</h1>
      <p class="lead">These set your resting burn. You can change them any time in Settings.</p>
      <app-profile-form [withWeight]="true" submitLabel="Start tracking" (done)="finish()" />
    </div></div>
  `,
  styles: `.wide { max-width: 560px; }`,
})
export class OnboardingPage {
  private auth = inject(AuthStore); private router = inject(Router);
  async finish() { await this.auth.load(); this.router.navigate(['/dashboard']); }
}
