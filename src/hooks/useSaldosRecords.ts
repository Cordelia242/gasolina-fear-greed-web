import { useEffect, useState } from 'react';
import type { SaldoRecord, SaldosFile } from '../types';
import { dateOffsetString } from '../lib/pressureMath';

const SALDOS_DAYS_BACK = 2;

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function fetchSaldosDay(dateStr: string): Promise<SaldosFile | null> {
  try {
    return await getJSON<SaldosFile>(`${import.meta.env.BASE_URL}data/saldos/${dateStr}.json`);
  } catch {
    return null;
  }
}

let cache: Promise<SaldoRecord[]> | null = null;

function loadSaldosRecords(): Promise<SaldoRecord[]> {
  if (!cache) {
    cache = Promise.all(Array.from({ length: SALDOS_DAYS_BACK }, (_, i) => fetchSaldosDay(dateOffsetString(i)))).then(
      (days) => days.filter((d): d is SaldosFile => Boolean(d)).flatMap((d) => d.records || [])
    );
  }
  return cache;
}

export function useSaldosRecords(): SaldoRecord[] {
  const [records, setRecords] = useState<SaldoRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadSaldosRecords().then((r) => {
      if (!cancelled) setRecords(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return records;
}

export function stationRecordsInRange(records: SaldoRecord[], key: string, hours: number): SaldoRecord[] {
  const cutoff = Date.now() - hours * 3600 * 1000;
  return records
    .filter((r) => r.station === key && new Date(r.scrapedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime());
}
