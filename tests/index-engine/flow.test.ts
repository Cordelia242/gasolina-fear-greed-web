import { describe, expect, test } from 'vitest';
import { buildFlowResult, computeFlow, elapsedHoursBetween, updateRecentOutflow } from '../../src/index-engine/flow';

describe('computeFlow', () => {
  test('10000 -> 9000 over 30 minutes detects ~-2000 L/h outflow', () => {
    const flow = computeFlow({ liters: 9000, previousLiters: 10000, elapsedHours: 0.5, sameMeasurement: false });
    expect(flow.deltaLiters).toBe(-1000);
    expect(flow.litersPerHour).toBe(-2000);
    expect(flow.outflowLitersPerHour).toBe(2000);
    expect(flow.inflowLitersPerHour).toBe(0);
  });

  test('9000 -> 12000 detects a restock (inflow), zero outflow', () => {
    const flow = computeFlow({ liters: 12000, previousLiters: 9000, elapsedHours: 0.5, sameMeasurement: false });
    expect(flow.deltaLiters).toBe(3000);
    expect(flow.inflowLitersPerHour).toBe(6000);
    expect(flow.outflowLitersPerHour).toBe(0);
  });

  test('a duplicate measurement (sameMeasurement) never produces a flow delta', () => {
    const flow = computeFlow({ liters: 9000, previousLiters: 10000, elapsedHours: 0.5, sameMeasurement: true });
    expect(flow).toEqual({ deltaLiters: null, litersPerHour: null, outflowLitersPerHour: null, inflowLitersPerHour: null });
  });

  test('no previous reading yields nulls, not zero/garbage', () => {
    const flow = computeFlow({ liters: 9000, previousLiters: null, elapsedHours: 0.5, sameMeasurement: false });
    expect(flow.deltaLiters).toBeNull();
  });
});

describe('elapsedHoursBetween', () => {
  test('is deterministic regardless of runtime timezone (naive timestamps treated as a fixed clock)', () => {
    const hours = elapsedHoursBetween('2026-08-17T23:00:00', '2026-08-17T23:30:00');
    expect(hours).toBe(0.5);
  });

  test('a non-positive elapsed time returns null', () => {
    expect(elapsedHoursBetween('2026-08-17T23:30:00', '2026-08-17T23:00:00')).toBeNull();
    expect(elapsedHoursBetween('2026-08-17T23:00:00', '2026-08-17T23:00:00')).toBeNull();
  });
});

describe('autonomy (hoursToEmpty)', () => {
  test('10000 L at 2000 L/h outflow -> ~5 hours to empty', () => {
    const point = computeFlow({ liters: 10000, previousLiters: 11000, elapsedHours: 0.5, sameMeasurement: false });
    const recentOutflow = updateRecentOutflow(null, point.outflowLitersPerHour, 0.35);
    const flow = buildFlowResult(point, 10000, recentOutflow);
    expect(flow.hoursToEmpty).toBe(5);
  });

  test('zero outflow means hoursToEmpty is null (never divides by zero / never Infinity)', () => {
    const flow = buildFlowResult({ deltaLiters: 0, litersPerHour: 0, outflowLitersPerHour: 0, inflowLitersPerHour: 0 }, 10000, 0);
    expect(flow.hoursToEmpty).toBeNull();
  });
});

describe('updateRecentOutflow (EWMA)', () => {
  test('cold start adopts the first sample as-is', () => {
    expect(updateRecentOutflow(null, 1000, 0.35)).toBe(1000);
  });

  test('blends the new sample with the prior EWMA at the configured alpha', () => {
    expect(updateRecentOutflow(1000, 2000, 0.35)).toBeCloseTo(0.35 * 2000 + 0.65 * 1000, 6);
  });

  test('a null/missing outflow sample leaves the prior EWMA unchanged (no consumption event this tick)', () => {
    expect(updateRecentOutflow(1234, null, 0.35)).toBe(1234);
  });
});
