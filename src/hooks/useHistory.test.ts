import { describe, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHistory } from './useHistory';

describe('useHistory', () => {
  test('loads and flattens snapshots for the range, sorted by time', async () => {
    const day = {
      date: 'x',
      snapshots: [
        { scrapedAt: '2026-08-19T02:00:00Z', global: { inventory: {}, pressure: {} } },
        { scrapedAt: '2026-08-19T01:00:00Z', global: { inventory: {}, pressure: {} } },
      ],
    };
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        const isFirst = calls === 0;
        calls += 1;
        return isFirst ? { ok: true, json: async () => day } : { ok: false, status: 404 };
      })
    );

    const { result } = renderHook(() => useHistory('7d'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshots.map((s) => s.scrapedAt)).toEqual(['2026-08-19T01:00:00Z', '2026-08-19T02:00:00Z']);

    vi.unstubAllGlobals();
  });
});
