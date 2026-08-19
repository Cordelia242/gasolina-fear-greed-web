import { describe, expect, test } from 'vitest';
import { groupSnapshots } from '../scripts/recalculate-history';

describe('groupSnapshots', () => {
  test('groups records by sourceMeasuredAt in chronological order', () => {
    const files = [
      {
        date: '2026-08-18',
        records: [
          { scrapedAt: 't1', sourceMeasuredAt: '2026-08-18T00:16:00', station: 'a', name: 'A', liters: 100, visibleInSource: true },
          { scrapedAt: 't0', sourceMeasuredAt: '2026-08-17T23:46:00', station: 'a', name: 'A', liters: 90, visibleInSource: true },
        ],
      },
    ];
    const groups = groupSnapshots(files);
    expect([...groups.keys()]).toEqual(['2026-08-17T23:46:00', '2026-08-18T00:16:00']);
  });

  test('regression: a station written twice for the same instant (old workflow double-write) must not be double-counted', () => {
    // This is exactly what happened in public/data/saldos/2026-08-18.json for
    // 2026-08-17T23:46:00 — two consecutive n8n runs both appended a record
    // because BioCloud hadn't produced a new reading yet. Before the fix,
    // groupSnapshots kept both rows, doubling totalLiters for that snapshot
    // (171160 -> 342320) and showing up as a spike in the trend chart.
    const files = [
      {
        date: '2026-08-18',
        records: [
          { scrapedAt: '2026-08-18T03:47:50.519Z', sourceMeasuredAt: '2026-08-17T23:46:00', station: 'alemana', name: 'ALEMANA', liters: 36834, visibleInSource: true },
          { scrapedAt: '2026-08-18T04:00:29.924Z', sourceMeasuredAt: '2026-08-17T23:46:00', station: 'alemana', name: 'ALEMANA', liters: 36834, visibleInSource: true },
          { scrapedAt: '2026-08-18T03:47:50.519Z', sourceMeasuredAt: '2026-08-17T23:46:00', station: 'beni', name: 'BENI', liters: 0, visibleInSource: false },
        ],
      },
    ];
    const groups = groupSnapshots(files);
    const snapshot = groups.get('2026-08-17T23:46:00')!;
    expect(snapshot).toHaveLength(2); // one per station, not three
    const alemana = snapshot.filter((r) => r.station === 'alemana');
    expect(alemana).toHaveLength(1);
    expect(alemana[0].scrapedAt).toBe('2026-08-18T04:00:29.924Z'); // keeps the latest write
  });
});
