import type { CrisisPeriod } from './types.ts';

/** Extracts YYYY-MM-DD from the start of a timestamp string, falling back when absent. */
export function sourceDate(value: string | null | undefined, fallback: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
  return m ? m[1] : fallback;
}

/**
 * Extracts the literal hour-of-day written in a timestamp (e.g. 12 from
 * "2026-08-17T12:05:00"). Deliberately does not go through `Date`, which
 * would interpret an offset-less string using the runtime's local timezone
 * and break both portability and "no comparar consumo nocturno con diurno".
 */
export function sourceHour(value: string | null | undefined): number {
  const m = /T(\d{2}):/.exec(String(value || ''));
  return m ? Number(m[1]) : 0;
}

/** A crisis with `enabled: false` never excludes anything. Dates are inclusive. */
export function isCrisisDate(date: string, crises: CrisisPeriod[]): boolean {
  return crises.some((c) => {
    if (!c || c.enabled === false || !c.start) return false;
    const start = String(c.start).slice(0, 10);
    const end = c.end ? String(c.end).slice(0, 10) : null;
    return date >= start && (!end || date <= end);
  });
}

/** `date` minus `days`, both as YYYY-MM-DD. Anchored at 12:00 UTC to stay clear of DST edge cases. */
export function dateMinusDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
