import { useEffect, useState } from 'react';
import type { Snapshot } from '../types';

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export interface LatestSnapshotState {
  latest: Snapshot | null;
  loading: boolean;
  error: Error | null;
}

export function useLatestSnapshot(): LatestSnapshotState {
  const [state, setState] = useState<LatestSnapshotState>({ latest: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    getJSON<Snapshot>(`${import.meta.env.BASE_URL}data/latest.json`)
      .then((latest) => {
        if (!cancelled) setState({ latest, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ latest: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
