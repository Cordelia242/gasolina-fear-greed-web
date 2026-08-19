import type { Flow } from './types.ts';
import { round2 } from './fuel-level.ts';

/**
 * Parses a timestamp to epoch ms, treating an offset-less string as UTC.
 * This is deliberately NOT `new Date(naiveString)` — that interprets an
 * offset-less string using the *runtime's* local timezone, which would make
 * elapsed-time math non-deterministic across machines. Appending 'Z' when no
 * offset is present pins the interpretation regardless of where this runs.
 */
export function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(String(value)) ? String(value) : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function elapsedHoursBetween(
  previousSourceMeasuredAt: string | null | undefined,
  currentSourceMeasuredAt: string | null | undefined,
): number | null {
  const prevMs = toEpochMs(previousSourceMeasuredAt);
  const currentMs = toEpochMs(currentSourceMeasuredAt);
  if (prevMs === null || currentMs === null) return null;
  const elapsedMs = currentMs - prevMs;
  return elapsedMs > 0 ? elapsedMs / 3_600_000 : null;
}

export interface ComputeFlowInput {
  liters: number;
  previousLiters: number | null;
  elapsedHours: number | null;
  /** True when this measurement is a duplicate of the previous one (same sourceMeasuredAt). */
  sameMeasurement: boolean;
}

export interface PointFlow {
  deltaLiters: number | null;
  litersPerHour: number | null;
  outflowLitersPerHour: number | null;
  inflowLitersPerHour: number | null;
}

export function computeFlow(input: ComputeFlowInput): PointFlow {
  const { liters, previousLiters, elapsedHours, sameMeasurement } = input;
  if (sameMeasurement || !elapsedHours || !Number.isFinite(previousLiters)) {
    return { deltaLiters: null, litersPerHour: null, outflowLitersPerHour: null, inflowLitersPerHour: null };
  }
  const deltaLiters = liters - (previousLiters as number);
  const litersPerHour = deltaLiters / elapsedHours;
  return {
    deltaLiters: round2(deltaLiters),
    litersPerHour: round2(litersPerHour),
    outflowLitersPerHour: round2(litersPerHour < 0 ? Math.abs(litersPerHour) : 0),
    inflowLitersPerHour: round2(litersPerHour > 0 ? litersPerHour : 0),
  };
}

/**
 * Exponential moving average of outflow, smoothing a single noisy delta into
 * a "recent demand" signal used for both `hoursToEmpty` and the pressure
 * components. `null` in means no prior EWMA yet (cold start).
 */
export function updateRecentOutflow(
  priorRecentOutflowLph: number | null,
  outflowLitersPerHour: number | null,
  alpha: number,
): number | null {
  if (!Number.isFinite(outflowLitersPerHour)) return priorRecentOutflowLph;
  const outflow = outflowLitersPerHour as number;
  if (priorRecentOutflowLph === null || !Number.isFinite(priorRecentOutflowLph)) return outflow;
  return alpha * outflow + (1 - alpha) * priorRecentOutflowLph;
}

export function buildFlowResult(point: PointFlow, liters: number, recentOutflowLph: number | null): Flow {
  return {
    deltaLiters: point.deltaLiters,
    litersPerHour: point.litersPerHour,
    outflowLitersPerHour: point.outflowLitersPerHour,
    inflowLitersPerHour: point.inflowLitersPerHour,
    recentOutflowLitersPerHour: recentOutflowLph === null ? null : round2(recentOutflowLph),
    hoursToEmpty: recentOutflowLph !== null && recentOutflowLph > 0 ? round2(liters / recentOutflowLph) : null,
  };
}
