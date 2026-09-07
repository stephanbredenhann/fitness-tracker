import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Sex = 'Male' | 'Female';
export type ActivityLevel = 'Sedentary' | 'Light' | 'Moderate' | 'Active';
export type ExerciseType = 'Walking' | 'Running' | 'Cycling' | 'Swimming' | 'Strength' | 'Hiit' | 'Hiking' | 'Rowing' | 'Yoga' | 'Other';

export interface Profile { displayName: string | null; heightCm: number; goalWeightKg: number; birthDate: string; sex: Sex; activityLevel: ActivityLevel; }
export interface WeighIn { date: string; weightKg: number; }
export interface FoodEntry { id: number; date: string; name: string; kcal: number; grams: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; barcode: string | null; }
export interface FoodHit { name: string; brand: string | null; barcode: string; kcalPer100g: number; proteinPer100g: number | null; carbsPer100g: number | null; fatPer100g: number | null; }
export interface RecentFood { name: string; kcal: number; grams: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; barcode: string | null; }
export interface Exercise { id: number; date: string; type: ExerciseType; durationMin: number; kcal: number; note: string | null; }
export interface Dashboard {
  weights: WeighIn[];
  days: { date: string; intake: number; burn: number; deficit: number }[];
  bmr: number | null; tdee: number | null; goalKg: number; startKg: number | null; latestKg: number | null; latestDate: string | null;
}
export interface AdminUser { id: string; email: string; displayName: string | null; emailConfirmed: boolean; isAdmin: boolean; disabled: boolean; createdAt: string; lastSeenAt: string | null; }

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  Sedentary: 'Sedentary, desk job and little exercise',
  Light: 'Lightly active, on my feet some of the day',
  Moderate: 'Moderately active, physical work or daily training',
  Active: 'Very active, hard physical work or intense training',
};

export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof HttpErrorResponse) {
    const body = e.error;
    if (body?.errors && typeof body.errors === 'object') {
      const msgs = Object.values(body.errors as Record<string, string[]>).flat();
      if (msgs.length) return msgs.join(' ');
    }
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.detail === 'string' && body.detail !== body.title) return body.detail;
    if (e.status === 0) return 'Cannot reach the server.';
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  get<T>(url: string, params?: Record<string, string | number>) { return firstValueFrom(this.http.get<T>(url, { params })); }
  post<T>(url: string, body: unknown) { return firstValueFrom(this.http.post<T>(url, body)); }
  put<T>(url: string, body: unknown) { return firstValueFrom(this.http.put<T>(url, body)); }
  delete(url: string) { return firstValueFrom(this.http.delete(url)); }
  text(url: string) { return firstValueFrom(this.http.get(url, { responseType: 'text' })); }
}
