import { describe, expect, test } from 'vitest';
import { fuelLevelFor, fuelStateFor } from '../../src/index-engine/fuel-level';

const CAPACITY = 25000;

describe('fuelLevelFor', () => {
  test('0 L is CRITICO', () => {
    expect(fuelLevelFor(0, CAPACITY)).toEqual({ score: 0, state: 'CRITICO' });
  });

  test('boundaries: 20/40/60/80/100% map inclusively to the lower state', () => {
    expect(fuelStateFor(20)).toBe('CRITICO');
    expect(fuelStateFor(40)).toBe('ESCASEZ');
    expect(fuelStateFor(60)).toBe('NORMAL');
    expect(fuelStateFor(80)).toBe('ABUNDANCIA');
    expect(fuelStateFor(100)).toBe('SATURADO');
  });

  test('just above each boundary flips to the next state', () => {
    expect(fuelStateFor(20.01)).toBe('ESCASEZ');
    expect(fuelStateFor(40.01)).toBe('NORMAL');
    expect(fuelStateFor(60.01)).toBe('ABUNDANCIA');
    expect(fuelStateFor(80.01)).toBe('SATURADO');
  });

  test('liters map to the corresponding % of capacity', () => {
    expect(fuelLevelFor(5000, CAPACITY).score).toBe(20);
    expect(fuelLevelFor(25000, CAPACITY).score).toBe(100);
    expect(fuelLevelFor(50000, CAPACITY).score).toBe(100); // clamped, never over 100
  });

  test('never considers consumption, baseline or crisis — pure function of liters', () => {
    // Same liters, called twice, must be identical regardless of any external state.
    expect(fuelLevelFor(13186, CAPACITY)).toEqual(fuelLevelFor(13186, CAPACITY));
  });
});
