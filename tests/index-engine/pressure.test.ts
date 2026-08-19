import { describe, expect, test } from 'vitest';
import {
  demandPressureScoreFor,
  pressureStateFor,
  runwayPressureFor,
  stationPressureScoreFor,
} from '../../src/index-engine/pressure';
import type { BaselineAggregate } from '../../src/index-engine/types';

const blend = { demand: 0.75, runway: 0.25 };

function baseline(meanOutflow: number, outflowStd = 0): BaselineAggregate {
  return { cleanDays: 30, outflowCount: 30, meanOutflow, outflowStd };
}

describe('pressureStateFor', () => {
  test('no score yet (baseline still building) maps to BASELINE_BUILDING', () => {
    expect(pressureStateFor(null)).toBe('BASELINE_BUILDING');
    expect(pressureStateFor(NaN)).toBe('BASELINE_BUILDING');
  });

  test('bands the score into the five pressure states', () => {
    expect(pressureStateFor(0)).toBe('SIN_PRESION');
    expect(pressureStateFor(20)).toBe('SIN_PRESION');
    expect(pressureStateFor(40)).toBe('DEMANDA_BAJA');
    expect(pressureStateFor(60)).toBe('EQUILIBRIO');
    expect(pressureStateFor(80)).toBe('PRESION_ALTA');
    expect(pressureStateFor(100)).toBe('PRESION_EXTREMA');
  });
});

describe('demanda anómala (escenario 8): habitual 100 L/h, actual 500 L/h -> presión alta/extrema', () => {
  test('a 5x demand spike against the baseline scores near the maximum', () => {
    const result = demandPressureScoreFor(500, baseline(100, 20));
    expect(result).not.toBeNull();
    expect(result!.ratio).toBe(5);
    expect(result!.score).toBeGreaterThan(80);
    expect(pressureStateFor(result!.score)).toBe('PRESION_EXTREMA');
  });

  test('demand at or below baseline never raises pressure from this component', () => {
    const atBaseline = demandPressureScoreFor(100, baseline(100, 20));
    expect(atBaseline!.score).toBeLessThanOrEqual(50);
  });
});

describe('diferencia entre estaciones (escenario 10)', () => {
  test('a small station at 5x its own baseline is under more demand pressure than a big station at 1.2x', () => {
    const stationA = demandPressureScoreFor(1200, baseline(1000, 100)); // expected 1000, actual 1200
    const stationB = demandPressureScoreFor(500, baseline(100, 20)); // expected 100, actual 500
    expect(stationB!.score).toBeGreaterThan(stationA!.score);
  });

  test('never compares absolute liters/hour — only each station against its own baseline', () => {
    // Station A moves MORE liters/hour in absolute terms (1200 > 500) than Station B,
    // yet B is under more pressure because it is far more anomalous relative to ITS OWN normal.
    const stationA = demandPressureScoreFor(1200, baseline(1000, 100));
    const stationB = demandPressureScoreFor(500, baseline(100, 20));
    expect(1200).toBeGreaterThan(500); // A's absolute outflow really is higher...
    expect(stationB!.score).toBeGreaterThan(stationA!.score); // ...but B is under more pressure.
    expect(pressureStateFor(stationA!.score)).not.toBe('PRESION_EXTREMA');
    expect(pressureStateFor(stationB!.score)).toBe('PRESION_EXTREMA');
  });
});

describe('agotamiento (escenario 11): runwayPressureFor', () => {
  test('little stock and high outflow -> strong depletion pressure', () => {
    const pressure = runwayPressureFor(500, 2000); // 0.25 h to empty
    expect(pressure).toBe(100);
  });

  test('abundant autonomy flattens pressure at 0 — never rewards "even more" autonomy', () => {
    expect(runwayPressureFor(100000, 100)).toBe(0); // 1000 h to empty
    expect(runwayPressureFor(1000000, 100)).toBe(0); // even more autonomy: still 0, not negative
  });

  test('zero stock is always maximum pressure regardless of outflow', () => {
    expect(runwayPressureFor(0, 0)).toBe(100);
    expect(runwayPressureFor(0, 500)).toBe(100);
  });

  test('zero/no outflow with stock on hand means no depletion risk', () => {
    expect(runwayPressureFor(5000, 0)).toBe(0);
    expect(runwayPressureFor(5000, null)).toBe(0);
  });
});

describe('reposición (escenario 13): inflow reduces tension', () => {
  test('an inflow event carries zero outflow, so it never drives depletion pressure up', () => {
    // A strong restock: outflow is 0 (no consumption detected this tick).
    expect(runwayPressureFor(20000, 0)).toBe(0);
  });

  test('a lower recent-outflow EWMA (after a restock damps it) lowers runway pressure than a sustained high one', () => {
    const beforeRestock = runwayPressureFor(3000, 1500); // 2h to empty
    const afterRestockDampedOutflow = runwayPressureFor(3000, 300); // 10h to empty
    expect(afterRestockDampedOutflow).toBeLessThan(beforeRestock);
  });
});

describe('stationPressureScoreFor', () => {
  test('blends demand and runway 0.75/0.25 when a demand signal is available (COMPLETE)', () => {
    const demand = { score: 100, ratio: 5 };
    expect(stationPressureScoreFor(demand, 20, blend)).toBe(100 * 0.75 + 20 * 0.25);
  });

  test('falls back to pure runway pressure when there is no demand signal (PROVISIONAL)', () => {
    expect(stationPressureScoreFor(null, 42, blend)).toBe(42);
  });
});
