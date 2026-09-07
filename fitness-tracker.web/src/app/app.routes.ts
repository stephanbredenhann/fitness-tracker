import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, onboardingGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', title: 'Sign in · Fitness Tracker', canActivate: [guestGuard], loadComponent: () => import('./auth/login').then(m => m.LoginPage) },
  { path: 'register', title: 'Create account · Fitness Tracker', canActivate: [guestGuard], loadComponent: () => import('./auth/register').then(m => m.RegisterPage) },
  { path: 'verify', title: 'Verify email · Fitness Tracker', loadComponent: () => import('./auth/verify').then(m => m.VerifyPage) },
  { path: 'forgot', title: 'Forgot password · Fitness Tracker', canActivate: [guestGuard], loadComponent: () => import('./auth/forgot').then(m => m.ForgotPage) },
  { path: 'reset', title: 'Reset password · Fitness Tracker', loadComponent: () => import('./auth/reset').then(m => m.ResetPage) },
  { path: 'onboarding', title: 'Welcome · Fitness Tracker', canActivate: [onboardingGuard], loadComponent: () => import('./pages/onboarding').then(m => m.OnboardingPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell').then(m => m.Shell),
    children: [
      { path: 'dashboard', title: 'Dashboard · Fitness Tracker', loadComponent: () => import('./pages/dashboard').then(m => m.DashboardPage) },
      { path: 'food', title: 'Food · Fitness Tracker', loadComponent: () => import('./pages/food').then(m => m.FoodPage) },
      { path: 'exercise', title: 'Exercise · Fitness Tracker', loadComponent: () => import('./pages/exercise').then(m => m.ExercisePage) },
      { path: 'plans', title: 'Plans · Fitness Tracker', loadComponent: () => import('./pages/plans').then(m => m.PlansPage) },
      { path: 'plans/new', title: 'New plan · Fitness Tracker', loadComponent: () => import('./pages/plan-edit').then(m => m.PlanEditPage) },
      { path: 'plans/:id', title: 'Edit plan · Fitness Tracker', loadComponent: () => import('./pages/plan-edit').then(m => m.PlanEditPage) },
      { path: 'workout/:planId', title: 'Workout · Fitness Tracker', loadComponent: () => import('./pages/workout').then(m => m.WorkoutPage) },
      { path: 'settings', title: 'Settings · Fitness Tracker', loadComponent: () => import('./pages/settings').then(m => m.SettingsPage) },
      { path: 'admin', title: 'Admin · Fitness Tracker', canActivate: [adminGuard], loadComponent: () => import('./pages/admin').then(m => m.AdminPage) },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
