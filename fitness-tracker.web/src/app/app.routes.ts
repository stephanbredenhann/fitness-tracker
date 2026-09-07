import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, onboardingGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./auth/login').then(m => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./auth/register').then(m => m.RegisterPage) },
  { path: 'verify', loadComponent: () => import('./auth/verify').then(m => m.VerifyPage) },
  { path: 'forgot', canActivate: [guestGuard], loadComponent: () => import('./auth/forgot').then(m => m.ForgotPage) },
  { path: 'reset', loadComponent: () => import('./auth/reset').then(m => m.ResetPage) },
  { path: 'onboarding', canActivate: [onboardingGuard], loadComponent: () => import('./pages/onboarding').then(m => m.OnboardingPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell').then(m => m.Shell),
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard').then(m => m.DashboardPage) },
      { path: 'food', loadComponent: () => import('./pages/food').then(m => m.FoodPage) },
      { path: 'exercise', loadComponent: () => import('./pages/exercise').then(m => m.ExercisePage) },
      { path: 'plans', loadComponent: () => import('./pages/plans').then(m => m.PlansPage) },
      { path: 'plans/new', loadComponent: () => import('./pages/plan-edit').then(m => m.PlanEditPage) },
      { path: 'plans/:id', loadComponent: () => import('./pages/plan-edit').then(m => m.PlanEditPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings').then(m => m.SettingsPage) },
      { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./pages/admin').then(m => m.AdminPage) },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
