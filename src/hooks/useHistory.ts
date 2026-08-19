import { useEffect, useState } from 'react';
import type { HistoryFile, Snapshot } from '../types';
import { dateOffsetString } from '../lib/pressureMath';

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function fetchHistoryDay(dateStr: string): Promise<HistoryFile | null> {
  try {
    return await getJSON<HistoryFile>(`${import.meta.env.BASE_URL}data/history/${dateStr}.json`);
  } catch {
    return null;
  }
}

async function loadHistoryRange(maxDays: number): Promise<Snapshot[]> {
  const cap = Math.min(maxDays, 400);
  const missGrace = 20;
  let hits = 0;
  let misses = 0;
  const files: HistoryFile[] = [];
  for (let start = 0; start < cap; start += 10) {
    const batch = Array.from({ length: Math.min(10, cap - start) }, (_, i) => start + i);
    const results = await Promise.all(batch.map((i) => fetchHistoryDay(dateOffsetString(i))));
    let batchHits = 0;
    for (const f of results) {
      if (f) {
        files.push(f);
        batchHits++;
        hits++;
      } else {
        misses++;
      }
    }
    if (batchHits === 0 && ((hits > 0 && misses >= missGrace) || (hits === 0 && misses >= missGrace))) break;
  }
  files.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const snapshots = files.flatMap((f) => f.snapshots || []);
  snapshots.sort((a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime());
  return snapshots;
}

const rangeCache: Record<string, Promise<Snapshot[]>> = {};

function getRangeSnapshots(maxDays: number, key: string): Promise<Snapshot[]> {
  if (!rangeCache[key]) rangeCache[key] = loadHistoryRange(maxDays);
  return rangeCache[key];
}

export type ChartRange = '7d' | '30d' | 'all';

const RANGE_DAYS: Record<ChartRange, number> = { '7d': 7, '30d': 30, all: 400 };

export function useHistory(rangeKey: ChartRange): { snapshots: Snapshot[]; loading: boolean } {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRangeSnapshots(RANGE_DAYS[rangeKey], rangeKey).then((s) => {
      if (!cancelled) {
        setSnapshots(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rangeKey]);

  return { snapshots, loading };
}
