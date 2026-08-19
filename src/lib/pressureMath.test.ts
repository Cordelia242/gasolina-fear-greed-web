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
