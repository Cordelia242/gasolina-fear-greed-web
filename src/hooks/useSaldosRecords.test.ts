import { describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSaldosRecords, stationRecordsInRange } from './useSaldosRecords';
import type { SaldoRecord } from '../types';

describe('useSaldosRecords', () => {
  test('combines records from the last two days', async () => {
    const dayA = { date: 'a', records: [{ scrapedAt: '2026-08-19T00:00:00Z', station: 'alemana', liters: 100 }] };
    const dayB = { date: 'b', records: [{ scrapedAt: '2026-08-18T00:00:00Z', station: 'alemana', liters: 90 }] };
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        call += 1;
        return { ok: true, json: async () => (call === 1 ? dayA : dayB) };
      })
    );

    const { result } = renderHook(() => useSaldosRecords());
    await waitFor(() => expect(result.current.length).toBe(2));

    vi.unstubAllGlobals();
  });
});

describe('stationRecordsInRange', () => {
  test('filters by station and cutoff, sorted ascending by time', () => {
    const now = Date.now();
    const records: SaldoRecord[] = [
      { scrapedAt: new Date(now - 1000).toISOString(), station: 'a', liters: 2 },
      { scrapedAt: new Date(now - 10 * 3600 * 1000).toISOString(), station: 'a', liters: 1 },
      { scrapedAt: new Date(now - 500).toISOString(), station: 'b', liters: 5 },
    ];
    const result = stationRecordsInRange(records, 'a', 5);
    expect(result).toHaveLength(1);
    expect(result[0].liters).toBe(2);
  });
});
