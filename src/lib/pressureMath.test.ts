import { describe, expect, test } from 'vitest';
import { clampScore, scoreToState, downsampleWithVolume, fuelStateLabel, pressureStateLabel, compactLiters } from './pressureMath';

describe('clampScore', () => {
  test('clamps to [0, 100] and coerces non-numbers to 0', () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore('abc')).toBe(0);
  });
});

describe('scoreToState', () => {
  test('maps score bands to pressure states', () => {
    expect(scoreToState(0)).toBe('SIN_PRESION');
    expect(scoreToState(19)).toBe('SIN_PRESION');
    expect(scoreToState(20)).toBe('DEMANDA_BAJA');
    expect(scoreToState(100)).toBe('PRESION_EXTREMA');
  });
});

describe('downsampleWithVolume', () => {
  test('leaves series untouched when under the max', () => {
    const result = downsampleWithVolume([1, 2], [10, 20], [100, 200], ['a', 'b'], 180);
    expect(result).toEqual({ scores: [1, 2], sold: [10, 20], liters: [100, 200], times: ['a', 'b'] });
  });

  test('aggregates volume sums per bucket and always keeps the last point', () => {
    const scores = [1, 2, 3, 4, 5];
    const sold = [10, 10, 10, 10, 10];
    const liters = [100, 100, 100, 100, 100];
    const times = ['a', 'b', 'c', 'd', 'e'];
    const result = downsampleWithVolume(scores, sold, liters, times, 2);
    expect(result.times).toEqual(['a', 'd', 'e']);
    expect(result.sold).toEqual([30, 20, 10]);
  });

  test('regression: soldOut/soldIn stay separate even when a bucket nets to the opposite sign', () => {
    // Same point/bucket shape as the test above (5 points, max 2 -> buckets
    // [a,b,c] and [d,e], plus e kept as its own trailing point).
    // Bucket [a,b,c]: outflow 100+100+0=200, inflow 5+0+0=5 -> net would be -195 (outflow).
    // Bucket [d,e]: outflow 0+10=10, inflow 300+0=300 -> net would be +290 (inflow).
    // Before the fix, "solo egresos" derived its value from the net's sign, so the
    // second bucket (net inflow) showed 0 egresos even though 10L actually went out
    // there — exactly the reported bug. soldOut/soldIn must ignore the net entirely.
    const scores = [1, 2, 3, 4, 5];
    const liters = [100, 5, 5, 5, 295];
    const times = ['a', 'b', 'c', 'd', 'e'];
    const sold = [0, -95, 0, 0, 290]; // net per point, irrelevant to this test
    const soldOutIn = [100, 100, 0, 0, 10];
    const soldInIn = [5, 0, 0, 300, 0];
    const result = downsampleWithVolume(scores, sold, liters, times, 2, soldOutIn, soldInIn);
    expect(result.times).toEqual(['a', 'd', 'e']);
    expect(result.soldOut).toEqual([200, 10, 10]);
    expect(result.soldIn).toEqual([5, 300, 0]);
  });
});

describe('labels', () => {
  test('falls back to BASELINE EN CONSTRUCCIÓN for the baseline-building state', () => {
    expect(pressureStateLabel('BASELINE_BUILDING')).toBe('BASELINE EN CONSTRUCCIÓN');
  });

  test('falls back to an em dash for a missing state', () => {
    expect(pressureStateLabel(null)).toBe('—');
  });

  test('fuelStateLabel maps known states', () => {
    expect(fuelStateLabel('CRITICO')).toBe('CRÍTICO');
  });

  test('compactLiters abbreviates thousands', () => {
    expect(compactLiters(1500)).toBe('1.5K L');
    expect(compactLiters(15000)).toBe('15K L');
    expect(compactLiters(500)).toBe('500 L');
  });
});
