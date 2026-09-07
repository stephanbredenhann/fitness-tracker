import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Api } from '../core/api';

@Component({
  imports: [RouterLink, MatButtonModule],
  template: `
    <div class="auth"><div class="card">
      <a class="brand" routerLink="/login">Fitness Tracker</a>
      @switch (state()) {
        @case ('working') { <h1>Confirming your email</h1><p class="lead">One moment.</p> }
        @case ('ok') {
          <h1>Email confirmed</h1>
          <p class="lead">Your account is ready.</p>
          <a mat-flat-button routerLink="/login">Sign in</a>
        }
        @default {
          <h1>That link did not work</h1>
          <p class="lead">It may have expired or already been used. Sign in to request a new one.</p>
          <a mat-flat-button routerLink="/login">Go to sign in</a>
        }
      }
    </div></div>
  `,
})
export class VerifyPage {
  private api = inject(Api);
  userId = input<string>(); code = input<string>(); changedEmail = input<string>();
  state = signal<'working' | 'ok' | 'failed'>('working');

  constructor() {
    effect(() => {
      const userId = this.userId(), code = this.code();
      if (!userId || !code) { this.state.set('failed'); return; }
      const params = new URLSearchParams({ userId, code });
      if (this.changedEmail()) params.set('changedEmail', this.changedEmail()!);
      this.api.text('/auth/confirmEmail?' + params).then(() => this.state.set('ok'), () => this.state.set('failed'));
    });
  }
}
