import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthStore), router = inject(Router);
  const me = await auth.ensureLoaded();
  if (!me) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (!me.hasProfile) return router.createUrlTree(['/onboarding']);
  return true;
};

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore), router = inject(Router);
  const me = await auth.ensureLoaded();
  if (!me) return router.createUrlTree(['/login']);
  if (me.hasProfile) return router.createUrlTree(['/dashboard']);
  return true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore), router = inject(Router);
  const me = await auth.ensureLoaded();
  return me?.role === 'Admin' ? true : router.createUrlTree(['/dashboard']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore), router = inject(Router);
  const me = await auth.ensureLoaded();
  return me ? router.createUrlTree(['/dashboard']) : true;
};
