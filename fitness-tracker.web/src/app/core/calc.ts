import { ExerciseType, PlanItem, StrengthSet } from './api';

// Mirror of fitness-tracker.api/Calc.cs so previews match what the server stores.
export const CARDIO_TYPES: ExerciseType[] = ['Walking', 'Running', 'Cycling', 'Hiking', 'Swimming', 'Rowing'];

export function cardioMet(type: ExerciseType, kmh: number): number | null {
  switch (type) {
    case 'Walking': return kmh < 3.2 ? 2.0 : kmh < 4.0 ? 2.8 : kmh < 4.8 ? 3.0 : kmh < 5.6 ? 3.5 : kmh < 6.4 ? 4.3 : kmh < 7.2 ? 5.0 : 7.0;
    case 'Running': return kmh < 6.4 ? 6.0 : kmh < 8.0 ? 8.3 : kmh < 9.7 ? 9.8 : kmh < 11.3 ? 11.0 : kmh < 12.9 ? 11.8 : kmh < 14.5 ? 12.8 : kmh < 16.1 ? 14.5 : kmh < 17.7 ? 16.0 : 19.0;
    case 'Cycling': return kmh < 16 ? 4.0 : kmh < 19 ? 6.8 : kmh < 22 ? 8.0 : kmh < 26 ? 10.0 : kmh < 30 ? 12.0 : 15.8;
    default: return null;
  }
}

export const strengthMet = (loadKg: number, bodyKg: number) =>
  bodyKg <= 0 ? 3.5 : loadKg / bodyKg >= 0.5 ? 6.0 : loadKg / bodyKg >= 0.2 ? 5.0 : 3.5;

export function exerciseKcal(type: ExerciseType, baseMet: number | undefined, minutes: number, kg: number, distanceKm: number | null, sets: StrengthSet[]): number | null {
  let met: number | null = distanceKm && distanceKm > 0 && minutes > 0 ? cardioMet(type, distanceKm / (minutes / 60)) : null;
  if (met === null && type === 'Strength' && sets.length) met = sets.reduce((a, s) => a + strengthMet(s.weightKg, kg), 0) / sets.length;
  if (met === null) met = baseMet ?? null;
  return met === null || !kg || !minutes ? null : Math.round(met * kg * minutes / 60);
}

export const paceMinPerKm = (km: number | null, minutes: number) => km && km > 0 ? minutes / km : null;

export function formatPace(minPerKm: number | null): string {
  if (minPerKm === null || !isFinite(minPerKm)) return '';
  const m = Math.floor(minPerKm), s = Math.round((minPerKm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

// Mirror of Calc.PlanEstimate: the hold time or 4 s per rep, plus rest, kcal from the higher of the exercise MET and the load-based MET.
export function planEstimate(items: PlanItem[], bodyKg: number | null): { minutes: number; kcal: number | null } {
  let minutes = 0, kcal = 0;
  for (const i of items) {
    const work = i.durationSec ?? i.reps * 4;
    const min = i.sets * (work + i.restSec) / 60;
    minutes += min;
    if (bodyKg) kcal += Math.max(i.met, strengthMet(i.weightKg, bodyKg)) * bodyKg * min / 60;
  }
  return { minutes: Math.round(minutes), kcal: bodyKg ? Math.round(kcal) : null };
}

export const volumeKg = (sets: StrengthSet[]) => Math.round(sets.reduce((a, s) => a + (s.durationSec ? 0 : s.sets * s.reps * s.weightKg), 0));

export const describeSet = (s: { sets: number; reps: number; weightKg: number; durationSec: number | null }) =>
  s.durationSec ? `${s.sets > 1 ? s.sets + ' × ' : ''}${s.durationSec} s${s.weightKg ? ' @ ' + s.weightKg + ' kg' : ''}` : `${s.sets} × ${s.reps}${s.weightKg ? ' @ ' + s.weightKg + ' kg' : ''}`;
