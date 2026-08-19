import { describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLatestSnapshot } from './useLatestSnapshot';

describe('useLatestSnapshot', () => {
  test('loads the latest snapshot from data/latest.json', async () => {
    const snapshot = {
      scrapedAt: '2026-08-19T00:00:00Z',
      global: { inventory: { totalLiters: 1, stationsAvailable: 1, stationsTotal: 1 }, pressure: { score: 1, state: 'EQUILIBRIO' } },
      stations: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));

    const { result } = renderHook(() => useLatestSnapshot());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.latest).toEqual(snapshot);
    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data/latest.json'), expect.any(Object));

    vi.unstubAllGlobals();
  });

  test('exposes an error when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { result } = renderHook(() => useLatestSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.latest).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);

    vi.unstubAllGlobals();
  });
});
