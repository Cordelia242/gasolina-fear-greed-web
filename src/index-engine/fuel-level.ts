import type { FuelLevel, FuelState } from './types.ts';

export function clampScore(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fuel level represents ONLY quantity of gasoline in stock. It must never
 * consider consumption, outflow speed, baseline, crises or autonomy — those
 * belong to flow/pressure. Boundaries are inclusive on the lower state
 * (score === 20 is still CRITICO), matching the original formula.
 */
export function fuelStateFor(score: number): FuelState {
  if (score <= 20) return 'CRITICO';
  if (score <= 40) return 'ESCASEZ';
  if (score <= 60) return 'NORMAL';
  if (score <= 80) return 'ABUNDANCIA';
  return 'SATURADO';
}

export function fuelLevelFor(liters: number, capacityLiters: number): FuelLevel {
  const score = clampScore((Number(liters) || 0) / capacityLiters * 100);
  return { score: round2(score), state: fuelStateFor(score) };
}
