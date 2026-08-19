import type { BaselineAggregate, CrisisPeriod, DayBucket, HourBucket } from './types.ts';
import { isCrisisDate } from './crises.ts';

/**
 * Aggregates the clean (non-crisis, within-window) days of a hour bucket into
 * a mean/std of outflow L/h — "clean" days are the readiness gate, dirty
 * (crisis) days are excluded entirely rather than down-weighted, so a crisis
 * never gets "normalized away" by averaging.
 */
export function aggregateDays(
  days: Record<string, DayBucket> | undefined,
  crises: CrisisPeriod[],
  minDate: string,
): BaselineAggregate {
  let outflowCount = 0;
  let sumOutflow = 0;
  let sumOutflowSq = 0;
  const cleanDates = new Set<string>();

  for (const [date, d] of Object.entries(days || {})) {
    if (date < minDate || isCrisisDate(date, crises)) continue;
    const oc = Number(d.outflowCount || 0);
    if (oc > 0) {
      outflowCount += oc;
      sumOutflow += Number(d.sumOutflow || 0);
      sumOutflowSq += Number(d.sumOutflowSq || 0);
      cleanDates.add(date);
    }
  }

  const meanOutflow = outflowCount ? sumOutflow / outflowCount : null;
  const variance =
    outflowCount > 1 && meanOutflow !== null
      ? Math.max(0, sumOutflowSq / outflowCount - meanOutflow * meanOutflow)
      : 0;

  return { cleanDays: cleanDates.size, outflowCount, meanOutflow, outflowStd: Math.sqrt(variance) };
}

/** Folds one more observed outflow sample into a day's running sum/sum-of-squares. Pure — returns a new bucket. */
export function updateDayBucket(bucket: HourBucket, date: string, outflowLph: number | null): HourBucket {
  const days = { ...(bucket.days || {}) };
  if (Number.isFinite(outflowLph) && (outflowLph as number) > 0) {
    const prior = days[date] || { outflowCount: 0, sumOutflow: 0, sumOutflowSq: 0 };
    days[date] = {
      outflowCount: prior.outflowCount + 1,
      sumOutflow: prior.sumOutflow + (outflowLph as number),
      sumOutflowSq: prior.sumOutflowSq + (outflowLph as number) ** 2,
    };
  }
  return { days };
}

/** Drops days older than `minDate` (retention). Pure — returns a new bucket. */
export function pruneDays(bucket: HourBucket, minDate: string): HourBucket {
  const days: Record<string, DayBucket> = {};
  for (const [date, d] of Object.entries(bucket.days || {})) {
    if (date >= minDate) days[date] = d;
  }
  return { days };
}
