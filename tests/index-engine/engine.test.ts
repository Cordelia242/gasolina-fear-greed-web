import { describe, expect, test } from 'vitest';
import { calculateIndex } from '../../src/index-engine/engine';
import { updateDayBucket } from '../../src/index-engine/baseline';
import type { HourBucket, RawMeasurement, StatsFile } from '../../src/index-engine/types';

const HOUR = 14; // 2026-08-19T14:xx:xx -> hour bucket "14"

function measurement(station: string, liters: number, sourceMeasuredAt = '2026-08-19T14:00:00'): RawMeasurement {
  return {
    scrapedAt: '2026-08-19T14:00:05.000Z',
    sourceMeasuredAt,
    station,
    name: station.toUpperCase(),
    liters,
    visibleInSource: liters > 0,
  };
}

function bucketWithCleanDays(days: number, outflowLph: number): HourBucket {
  let bucket: HourBucket = { days: {} };
  for (let i = 1; i <= days; i++) {
    const date = `2026-0${i <= 9 ? '7' : '8'}-${String(i <= 9 ? i + 20 : i - 9).padStart(2, '0')}`;
    bucket = updateDayBucket(bucket, date, outflowLph);
  }
  return bucket;
}

function statsWithBaseline(stations: Record<string, { cleanDays: number; outflowLph: number; recentOutflowLph: number | null }>): StatsFile {
  const result: StatsFile = { version: 3, stations: {} };
  for (const [key, cfg] of Object.entries(stations)) {
    result.stations[key] = {
      hours: { [String(HOUR)]: bucketWithCleanDays(cfg.cleanDays, cfg.outflowLph) },
      recentOutflowLph: cfg.recentOutflowLph,
    };
  }
  return result;
}

describe('baseline insuficiente (escenario 14)', () => {
  test('a brand-new station with no history is always PROVISIONAL', () => {
    const result = calculateIndex({
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: [measurement('nueva', 10000)],
      previousMeasurements: [],
      priorStats: { version: 3, stations: {} },
      crises: [],
    });
    expect(result.snapshot.stations[0].pressure.mode).toBe('PROVISIONAL');
    expect(result.snapshot.stations[0].pressure.baselineReady).toBe(false);
    expect(result.snapshot.global.pressure.mode).toBe('PROVISIONAL');
  });

  test('29 clean days (one short of the minimum) is still PROVISIONAL', () => {
    const priorStats = statsWithBaseline({ a: { cleanDays: 29, outflowLph: 100, recentOutflowLph: 100 } });
    const result = calculateIndex({
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: [measurement('a', 10000)],
      previousMeasurements: [],
      priorStats,
      crises: [],
    });
    expect(result.snapshot.stations[0].pressure.baselineReady).toBe(false);
    expect(result.snapshot.stations[0].pressure.mode).toBe('PROVISIONAL');
  });
});

describe('baseline suficiente (escenario 15)', () => {
  test('>= 30 clean days across enough stations allows global COMPLETE mode', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
    const priorStats = statsWithBaseline(
      Object.fromEntries(keys.map((k) => [k, { cleanDays: 30, outflowLph: 100, recentOutflowLph: 100 }])),
    );
    const result = calculateIndex({
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: keys.map((k) => measurement(k, 10000)),
      previousMeasurements: [],
      priorStats,
      crises: [],
    });
    for (const station of result.snapshot.stations) {
      expect(station.pressure.baselineReady).toBe(true);
      expect(station.pressure.mode).toBe('COMPLETE');
    }
    expect(result.snapshot.global.pressure.mode).toBe('COMPLETE');
  });
});

describe('estación sin combustible (escenario 12)', () => {
  test('a station at 0 L raises the global pressure via stationsWithoutFuelPressure', () => {
    const base = {
      now: '2026-08-19T14:00:05.000Z',
      previousMeasurements: [],
      priorStats: { version: 3, stations: {} } as StatsFile,
      crises: [],
    };
    const withEmptyStation = calculateIndex({
      ...base,
      currentMeasurements: [measurement('a', 15000), measurement('b', 0)],
    });
    const allStocked = calculateIndex({
      ...base,
      currentMeasurements: [measurement('a', 15000), measurement('b', 15000)],
    });
    expect(withEmptyStation.snapshot.global.pressure.components.stationsWithoutFuel).toBe(1);
    expect(withEmptyStation.snapshot.global.pressure.components.stationsWithoutFuelPressure).toBeGreaterThan(
      allStocked.snapshot.global.pressure.components.stationsWithoutFuelPressure,
    );
    expect(withEmptyStation.snapshot.global.pressure.score).toBeGreaterThan(allStocked.snapshot.global.pressure.score);
  });
});

describe('crisis abierta no alimenta el baseline', () => {
  test('an open crisis covering the accumulated days keeps the station un-ready even with plenty of samples', () => {
    const priorStats = statsWithBaseline({ a: { cleanDays: 30, outflowLph: 500, recentOutflowLph: 500 } });
    const openCrisis = [{ name: 'Crisis vigente', start: '2026-07-01', end: null, enabled: true }];
    const result = calculateIndex({
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: [measurement('a', 10000)],
      previousMeasurements: [],
      priorStats,
      crises: openCrisis,
    });
    expect(result.snapshot.stations[0].pressure.baselineReady).toBe(false);
    expect(result.snapshot.baseline.currentDateInConfiguredCrisis).toBe(true);
  });
});

describe('determinismo (escenario 16)', () => {
  test('the same input produces byte-identical output', () => {
    const input = {
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: [measurement('a', 10000), measurement('b', 0)],
      previousMeasurements: [measurement('a', 11000, '2026-08-19T13:30:00'), measurement('b', 0, '2026-08-19T13:30:00')],
      priorStats: statsWithBaseline({ a: { cleanDays: 10, outflowLph: 200, recentOutflowLph: 180 } }),
      crises: [{ name: 'Crisis', start: '2026-08-01', end: null, enabled: true }],
    };
    const first = calculateIndex(structuredClone(input));
    const second = calculateIndex(structuredClone(input));
    expect(first).toEqual(second);
  });
});

describe('vehiclesEstimated / queueMinutes never participate in the calculation', () => {
  test('RawMeasurement has no such fields, so the engine cannot read them even if a caller tries to smuggle them in', () => {
    const withExtraFields = {
      ...measurement('a', 10000),
      vehiclesEstimated: 99999,
      queueMinutes: 99999,
    } as RawMeasurement;
    const withoutExtraFields = measurement('a', 10000);
    const resultA = calculateIndex({
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: [withExtraFields],
      previousMeasurements: [],
      priorStats: { version: 3, stations: {} },
      crises: [],
    });
    const resultB = calculateIndex({
      now: '2026-08-19T14:00:05.000Z',
      currentMeasurements: [withoutExtraFields],
      previousMeasurements: [],
      priorStats: { version: 3, stations: {} },
      crises: [],
    });
    expect(resultA.snapshot.stations[0].fuelLevel).toEqual(resultB.snapshot.stations[0].fuelLevel);
    expect(resultA.snapshot.stations[0].pressure).toEqual(resultB.snapshot.stations[0].pressure);
  });
});
