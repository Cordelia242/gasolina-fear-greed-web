import { describe, expect, test } from 'vitest';
import { dateMinusDays, isCrisisDate, sourceDate, sourceHour } from '../../src/index-engine/crises';

describe('isCrisisDate', () => {
  test('a date inside an enabled, closed crisis is excluded (start/end inclusive)', () => {
    const crises = [{ name: 'Test', start: '2026-08-01', end: '2026-08-10', enabled: true }];
    expect(isCrisisDate('2026-08-01', crises)).toBe(true);
    expect(isCrisisDate('2026-08-10', crises)).toBe(true);
    expect(isCrisisDate('2026-08-05', crises)).toBe(true);
    expect(isCrisisDate('2026-07-31', crises)).toBe(false);
    expect(isCrisisDate('2026-08-11', crises)).toBe(false);
  });

  test('an open crisis (end: null) excludes every date on/after start, indefinitely', () => {
    const crises = [{ name: 'Crisis vigente', start: '2026-08-01', end: null, enabled: true }];
    expect(isCrisisDate('2026-08-01', crises)).toBe(true);
    expect(isCrisisDate('2027-01-01', crises)).toBe(true);
    expect(isCrisisDate('2099-12-31', crises)).toBe(true);
    expect(isCrisisDate('2026-07-31', crises)).toBe(false);
  });

  test('enabled: false means the period is never applied — it does NOT exclude', () => {
    const crises = [{ name: 'Draft', start: '2026-08-01', end: null, enabled: false }];
    expect(isCrisisDate('2026-08-15', crises)).toBe(false);
  });

  test('a date can be re-evaluated retroactively: same date, different crisis config, different result', () => {
    const date = '2026-08-05';
    expect(isCrisisDate(date, [])).toBe(false);
    const crisesAddedLater = [{ name: 'Retroactiva', start: '2026-08-01', end: '2026-08-10', enabled: true }];
    expect(isCrisisDate(date, crisesAddedLater)).toBe(true);
  });
});

describe('sourceDate / sourceHour', () => {
  test('extract the literal date/hour from a naive timestamp without timezone conversion', () => {
    expect(sourceDate('2026-08-17T23:31:00', 'fallback')).toBe('2026-08-17');
    expect(sourceHour('2026-08-17T23:31:00')).toBe(23);
    expect(sourceHour('2026-08-17T02:05:00')).toBe(2);
  });
});

describe('dateMinusDays', () => {
  test('subtracts calendar days', () => {
    expect(dateMinusDays('2026-08-19', 90)).toBe('2026-05-21');
  });
});
