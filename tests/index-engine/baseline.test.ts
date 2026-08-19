import { describe, expect, test } from 'vitest';
import { aggregateDays, pruneDays, updateDayBucket } from '../../src/index-engine/baseline';
import type { HourBucket } from '../../src/index-engine/types';

function bucketWithDailyOutflow(dates: string[], outflowLph: number): HourBucket {
  return dates.reduce((bucket, date) => updateDayBucket(bucket, date, outflowLph), { days: {} } as HourBucket);
}

describe('aggregateDays', () => {
  test('averages clean days into mean/std outflow', () => {
    const bucket = bucketWithDailyOutflow(['2026-08-01', '2026-08-02', '2026-08-03'], 100);
    const result = aggregateDays(bucket.days, [], '2026-01-01');
    expect(result.cleanDays).toBe(3);
    expect(result.meanOutflow).toBe(100);
  });

  test('night (02:00) and day (18:00) baselines are separate buckets and never mix', () => {
    const nightBucket = bucketWithDailyOutflow(['2026-08-01', '2026-08-02'], 50);
    const dayBucket = bucketWithDailyOutflow(['2026-08-01', '2026-08-02'], 900);
    const night = aggregateDays(nightBucket.days, [], '2026-01-01');
    const day = aggregateDays(dayBucket.days, [], '2026-01-01');
    expect(night.meanOutflow).toBe(50);
    expect(day.meanOutflow).toBe(900);
    expect(night.meanOutflow).not.toBe(day.meanOutflow);
  });

  test('days inside a crisis never feed the baseline', () => {
    const bucket = bucketWithDailyOutflow(['2026-08-01', '2026-08-02', '2026-08-03'], 100);
    const crises = [{ name: 'Crisis', start: '2026-08-02', end: '2026-08-02', enabled: true }];
    const result = aggregateDays(bucket.days, crises, '2026-01-01');
    expect(result.cleanDays).toBe(2);
  });

  test('an open crisis (end: null) excludes every day at/after start from the baseline', () => {
    const bucket = bucketWithDailyOutflow(['2026-08-01', '2026-08-05', '2026-08-10'], 100);
    const crises = [{ name: 'Crisis vigente', start: '2026-08-03', end: null, enabled: true }];
    const result = aggregateDays(bucket.days, crises, '2026-01-01');
    expect(result.cleanDays).toBe(1); // only 2026-08-01 survives
  });

  test('retroactively marking previously-normal days as crisis changes the recomputed baseline', () => {
    const bucket = bucketWithDailyOutflow(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'], 100);
    const before = aggregateDays(bucket.days, [], '2026-01-01');
    const crisesAddedLater = [{ name: 'Retroactiva', start: '2026-08-02', end: '2026-08-03', enabled: true }];
    const after = aggregateDays(bucket.days, crisesAddedLater, '2026-01-01');
    expect(before.cleanDays).toBe(4);
    expect(after.cleanDays).toBe(2);
    expect(after.meanOutflow).toBe(before.meanOutflow); // same rate on remaining days, but...
    expect(after.outflowCount).not.toBe(before.outflowCount); // ...fewer samples back it
  });

  test('a crisis is not "normalized away" by many consecutive anomalous hours — it stays excluded regardless of sample count', () => {
    // 30 straight days at an anomalous 500 L/h, but every one of them is inside the crisis window.
    const dates = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    const bucket = bucketWithDailyOutflow(dates, 500);
    const crises = [{ name: 'Crisis larga', start: '2026-08-01', end: '2026-08-30', enabled: true }];
    const result = aggregateDays(bucket.days, crises, '2026-01-01');
    expect(result.cleanDays).toBe(0);
    expect(result.meanOutflow).toBeNull();
  });
});

describe('pruneDays', () => {
  test('drops days older than the retention cutoff', () => {
    const bucket = bucketWithDailyOutflow(['2026-01-01', '2026-08-01'], 100);
    const pruned = pruneDays(bucket, '2026-06-01');
    expect(Object.keys(pruned.days)).toEqual(['2026-08-01']);
  });
});
