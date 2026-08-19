# React + Vite + Recharts Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `gasolina-fear-greed-web` from vanilla HTML/JS to React + TypeScript, using Recharts for the data-driven charts, compiled to a static site with Vite and deployed to the same GitHub Pages target.

**Architecture:** A single `App` composed of presentational components (`Header`, `GaugeCard`, `TrendCard`, `StationsSection`/`StationCard`, `StationDialog`) fed by three data hooks (`useLatestSnapshot`, `useHistory`, `useSaldosRecords`) that port the existing fetch/cache logic 1:1. Domain math (score clamping, state colors, labels, downsampling) lives in `src/lib/pressureMath.ts`, shared by hooks, components, and tests.

**Tech Stack:** React 18, TypeScript, Vite, Recharts, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-19-react-vite-migration-design.md`

## Global Constraints

- Repo is `Cordelia242/gasolina-fear-greed-web`, no custom domain → Vite `base: '/gasolina-fear-greed-web/'`.
- No new fetching/state libraries (no TanStack Query, no Zustand) — YAGNI per spec.
- Single test runner: Vitest (no `node:test`).
- `public/data/*.json` contract is unchanged — n8n keeps writing there; only the frontend that reads it changes.
- TypeScript strict mode.
- Visual parity is the default; the only approved implementation-level deviation is the gauge (hand SVG in JSX) and the trend/dialog charts (Recharts idioms — hover tooltip instead of the old click+guide-line, no left-axis balance labels). No unrelated redesign.

---

## Task 1: Project scaffold (Vite + React + TS + Vitest)

**Files:**
- Create: `package.json` (replaces the current empty one)
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/test/setup.ts`
- Create: `src/main.tsx` (placeholder root render, replaced fully in Task 10)
- Create: `src/App.tsx` (placeholder, replaced fully in Task 10)
- Modify: `index.html` (Vite entry, replaces the current static entry — old content is fully ported in Task 10, this task only needs the Vite skeleton)
- Create: `.gitignore` (add `node_modules`, `dist`)

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run test`, `npm run preview` scripts that later tasks rely on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "gasolina-fear-greed-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.7.4",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/gasolina-fear-greed-web/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 5: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Replace `index.html` with the Vite entry**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#17151b" />
  <title>Gasolina Index · Santa Cruz</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Write placeholder `src/App.tsx` and `src/main.tsx`**

```tsx
// src/App.tsx
export function App() {
  return <main className="shell">Cargando…</main>;
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules
dist
```

- [ ] **Step 9: Install dependencies and verify the toolchain**

Run: `npm install`
Run: `npm run build`
Expected: builds successfully, produces `dist/`.
Run: `npm run test`
Expected: "No test files found" (no test files exist yet) — this is fine for this task.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/App.tsx src/main.tsx src/test/setup.ts .gitignore
git commit -m "chore: scaffold Vite + React + TS + Vitest"
```

---

## Task 2: Data contract types + ported schema tests

**Files:**
- Create: `src/types.ts`
- Create: `tests/data-contract.test.ts`
- Delete: `scripts/schema-contract.test.js` (superseded — the source-text-grep assertions it made don't apply to React source; the data-shape assertions are ported below; the UI-behavior assertions are replaced by component tests in Tasks 6–9)

**Interfaces:**
- Produces: `Snapshot`, `Global`, `Inventory`, `Pressure`, `FuelLevel`, `Station`, `HistoryFile`, `SaldoRecord`, `SaldosFile`, `FuelState`, `PressureState`, `PressureMode` — used by every later task.

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type FuelState = 'CRITICO' | 'ESCASEZ' | 'NORMAL' | 'ABUNDANCIA' | 'SATURADO';
export type PressureState =
  | 'SIN_PRESION'
  | 'DEMANDA_BAJA'
  | 'EQUILIBRIO'
  | 'PRESION_ALTA'
  | 'PRESION_EXTREMA'
  | 'BASELINE_BUILDING';
export type PressureMode = 'COMPLETE' | 'PROVISIONAL';

export interface FuelLevel {
  score: number;
  state: FuelState;
}

export interface Pressure {
  score: number | null;
  state: PressureState;
  mode?: PressureMode;
}

export interface Inventory {
  totalLiters: number;
  stationsAvailable: number;
  stationsTotal: number;
}

export interface Global {
  inventory: Inventory;
  pressure: Pressure;
}

export interface Station {
  key: string;
  name: string;
  address?: string;
  liters: number;
  visibleInSource?: boolean;
  fuelLevel: FuelLevel;
  pressure: Pressure;
}

export interface Snapshot {
  scrapedAt: string;
  sourceMeasuredAt?: string;
  global: Global;
  stations?: Station[];
}

export interface HistoryFile {
  date: string;
  snapshots: Snapshot[];
}

export interface SaldoRecord {
  scrapedAt: string;
  sourceMeasuredAt?: string;
  station: string;
  name?: string;
  liters: number;
  fuelLevel?: FuelLevel;
  pressure?: Pressure;
  visibleInSource?: boolean;
}

export interface SaldosFile {
  date: string;
  records: SaldoRecord[];
}
```

- [ ] **Step 2: Write the failing test `tests/data-contract.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Snapshot } from '../src/types';

const root = path.resolve(__dirname, '..');
const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

function assertSnapshotShape(snapshot: Snapshot) {
  expect(snapshot.global?.inventory, 'global.inventory debe existir').toBeTruthy();
  expect(snapshot.global?.pressure, 'global.pressure debe existir').toBeTruthy();
  expect('score' in (snapshot.global as object), 'global.score ambiguo debe eliminarse').toBe(false);
  expect('state' in (snapshot.global as object), 'global.state ambiguo debe eliminarse').toBe(false);
  for (const station of snapshot.stations || []) {
    expect(station.fuelLevel, `${station.key}: fuelLevel debe existir`).toBeTruthy();
    expect(station.pressure, `${station.key}: pressure debe existir`).toBeTruthy();
    expect('score' in (station as object), `${station.key}: score ambiguo debe eliminarse`).toBe(false);
    expect('state' in (station as object), `${station.key}: state ambiguo debe eliminarse`).toBe(false);
  }
}

describe('contrato de datos', () => {
  test('latest.json separa inventario/nivel de combustible de presión', () => {
    assertSnapshotShape(readJson<Snapshot>('public/data/latest.json'));
  });

  test('todos los snapshots históricos usan la nueva estructura', () => {
    const dir = path.join(root, 'public/data/history');
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const file = readJson<{ snapshots: Snapshot[] }>(`public/data/history/${name}`);
      for (const snapshot of file.snapshots || []) assertSnapshotShape(snapshot);
    }
  });

  test('el workflow n8n genera fuelLevel y pressure explícitos', () => {
    const workflow = readJson<{ nodes: Array<{ name: string; parameters: { jsCode: string } }> }>(
      'gasolina-fear-greed-workflow(1).json'
    );
    const node = workflow.nodes.find((n) => n.name === 'Construir datos e indices');
    expect(node, 'Debe existir Construir datos e indices').toBeTruthy();
    expect(node!.parameters.jsCode).toMatch(/fuelLevel/);
    expect(node!.parameters.jsCode).toMatch(/pressure/);
    expect(node!.parameters.jsCode).toMatch(/pressureStateFor/);
  });
});
```

- [ ] **Step 3: Delete the superseded test and run**

Run: `rm scripts/schema-contract.test.js`
Run: `npm run test`
Expected: PASS (3 tests) — the data files already satisfy the contract, this test locks it in.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts tests/data-contract.test.ts
git rm scripts/schema-contract.test.js
git commit -m "feat: add TS data contract, port schema tests to Vitest"
```

---

## Task 3: Domain math (`pressureMath.ts`)

**Files:**
- Create: `src/lib/pressureMath.ts`
- Create: `src/lib/pressureMath.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `clampScore(v)`, `scoreToState(v)`, `fuelScoreToState(v)`, `scoreColor(v)`, `fuelScoreColor(v)`, `compactLiters(v)`, `localDateString(date?)`, `dateOffsetString(daysAgo)` (the last used by hooks in Task 4/5), `fuelStateLabel(s)`, `pressureStateLabel(s)`, `pressureModeLabel(m)`, `downsampleWithVolume(scores, sold, liters, times, max)`, plus color constants `FUEL_STATE_COLORS`, `PRESSURE_STATE_COLORS`, `PANEL_COLOR`, `VOLUME_IN_COLOR`, `VOLUME_OUT_COLOR`, `BALANCE_COLOR`, `ZONE_DIVIDER_COLOR` — the labels/colors/downsampling are used by the chart components (Tasks 6–9).

- [ ] **Step 1: Write the failing test `src/lib/pressureMath.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pressureMath.test.ts`
Expected: FAIL — `./pressureMath` does not exist.

- [ ] **Step 3: Write `src/lib/pressureMath.ts`**

```ts
export const FUEL_STATE_ORDER = ['CRITICO', 'ESCASEZ', 'NORMAL', 'ABUNDANCIA', 'SATURADO'] as const;
export const PRESSURE_STATE_ORDER = [
  'SIN_PRESION',
  'DEMANDA_BAJA',
  'EQUILIBRIO',
  'PRESION_ALTA',
  'PRESION_EXTREMA',
] as const;

const FUEL_STATE_LABELS: Record<string, string> = {
  CRITICO: 'CRÍTICO',
  ESCASEZ: 'ESCASEZ',
  NORMAL: 'NORMAL',
  ABUNDANCIA: 'ABUNDANCIA',
  SATURADO: 'SATURADO',
};

const PRESSURE_STATE_LABELS: Record<string, string> = {
  SIN_PRESION: 'SIN PRESIÓN',
  DEMANDA_BAJA: 'DEMANDA BAJA',
  EQUILIBRIO: 'EQUILIBRIO',
  PRESION_ALTA: 'PRESIÓN ALTA',
  PRESION_EXTREMA: 'PRESIÓN EXTREMA',
  BASELINE_BUILDING: 'BASELINE EN CONSTRUCCIÓN',
};

export const fuelStateLabel = (s?: string | null) => FUEL_STATE_LABELS[s ?? ''] ?? s ?? '—';
export const pressureStateLabel = (s?: string | null) => PRESSURE_STATE_LABELS[s ?? ''] ?? s ?? '—';
export const pressureModeLabel = (m?: string | null) => (m === 'COMPLETE' ? 'ÍNDICE COMPLETO' : 'ÍNDICE PROVISIONAL');

export const clampScore = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));

export const scoreToState = (v: unknown) => PRESSURE_STATE_ORDER[Math.min(4, Math.floor(clampScore(v) / 20))];

export const fuelScoreToState = (v: unknown) => FUEL_STATE_ORDER[Math.min(4, Math.floor(clampScore(v) / 20))];

export function compactLiters(v: unknown) {
  const n = Number(v) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K L`;
  return `${Math.round(n)} L`;
}

export function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const x = Object.fromEntries(parts.map((v) => [v.type, v.value]));
  return `${x.year}-${x.month}-${x.day}`;
}

export function dateOffsetString(daysAgo: number) {
  return localDateString(new Date(Date.now() - daysAgo * 86400000));
}

export const FUEL_STATE_COLORS: Record<string, string> = {
  CRITICO: '#f2545b',
  ESCASEZ: '#ff8f3f',
  NORMAL: '#ffd93d',
  ABUNDANCIA: '#9ed957',
  SATURADO: '#22b573',
};

export const PRESSURE_STATE_COLORS: Record<string, string> = {
  SIN_PRESION: FUEL_STATE_COLORS.SATURADO,
  DEMANDA_BAJA: FUEL_STATE_COLORS.ABUNDANCIA,
  EQUILIBRIO: FUEL_STATE_COLORS.NORMAL,
  PRESION_ALTA: FUEL_STATE_COLORS.ESCASEZ,
  PRESION_EXTREMA: FUEL_STATE_COLORS.CRITICO,
};

export const PANEL_COLOR = '#1d1a21';
export const VOLUME_IN_COLOR = '#5ecb8f';
export const VOLUME_OUT_COLOR = '#e2807a';
export const BALANCE_COLOR = '#5ac8f2';
export const ZONE_DIVIDER_COLOR = 'rgba(232,230,236,.22)';

export const scoreColor = (v: unknown) => PRESSURE_STATE_COLORS[scoreToState(v)];
export const fuelScoreColor = (v: unknown) => FUEL_STATE_COLORS[fuelScoreToState(v)];

export interface DownsampledSeries {
  scores: (number | null)[];
  sold: number[];
  liters: number[];
  times: string[];
}

export function downsampleWithVolume(
  scores: (number | null)[],
  sold: number[],
  liters: number[],
  times: string[],
  max: number
): DownsampledSeries {
  if (scores.length <= max) return { scores, sold, liters, times };
  const stride = Math.ceil(scores.length / max);
  const outS: (number | null)[] = [];
  const outV: number[] = [];
  const outL: number[] = [];
  const outT: string[] = [];
  for (let i = 0; i < scores.length; i += stride) {
    const end = Math.min(i + stride, scores.length);
    outS.push(scores[i]);
    outT.push(times[i]);
    outL.push(liters[i]);
    let sum = 0;
    for (let j = i; j < end; j++) sum += sold[j];
    outV.push(sum);
  }
  if (outT.at(-1) !== times.at(-1)) {
    outS.push(scores.at(-1) ?? null);
    outT.push(times.at(-1)!);
    outV.push(sold.at(-1) ?? 0);
    outL.push(liters.at(-1) ?? 0);
  }
  return { scores: outS, sold: outV, liters: outL, times: outT };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pressureMath.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pressureMath.ts src/lib/pressureMath.test.ts
git commit -m "feat: port domain math (scores, colors, labels, downsampling) to TS"
```

---

## Task 4: `useLatestSnapshot` + `useSaldosRecords` hooks

**Files:**
- Create: `src/hooks/useLatestSnapshot.ts`
- Create: `src/hooks/useLatestSnapshot.test.ts`
- Create: `src/hooks/useSaldosRecords.ts`
- Create: `src/hooks/useSaldosRecords.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `SaldoRecord`, `SaldosFile` from `../types` (Task 2); `dateOffsetString` from `../lib/pressureMath` (Task 3).
- Produces: `useLatestSnapshot(): { latest: Snapshot | null; loading: boolean; error: Error | null }`; `useSaldosRecords(): SaldoRecord[]`; `stationRecordsInRange(records: SaldoRecord[], key: string, hours: number): SaldoRecord[]` — the last is reused by `StationCard`/`StationDialog` (Tasks 8–9).

- [ ] **Step 1: Write the failing test `src/hooks/useLatestSnapshot.test.ts`**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useLatestSnapshot.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/hooks/useLatestSnapshot.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useLatestSnapshot.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test `src/hooks/useSaldosRecords.test.ts`**

```ts
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
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/hooks/useSaldosRecords.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Write `src/hooks/useSaldosRecords.ts`**

```ts
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
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/hooks/useSaldosRecords.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useLatestSnapshot.ts src/hooks/useLatestSnapshot.test.ts src/hooks/useSaldosRecords.ts src/hooks/useSaldosRecords.test.ts
git commit -m "feat: add useLatestSnapshot and useSaldosRecords hooks"
```

---

## Task 5: `useHistory` hook

**Files:**
- Create: `src/hooks/useHistory.ts`
- Create: `src/hooks/useHistory.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `HistoryFile` from `../types`; `dateOffsetString` from `../lib/pressureMath`.
- Produces: `useHistory(rangeKey: ChartRange): { snapshots: Snapshot[]; loading: boolean }`, `type ChartRange = '7d' | '30d' | 'all'` — used by `TrendCard` (Task 7).

- [ ] **Step 1: Write the failing test `src/hooks/useHistory.test.ts`**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useHistory.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/hooks/useHistory.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useHistory.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHistory.ts src/hooks/useHistory.test.ts
git commit -m "feat: add useHistory hook with per-range caching"
```

---

## Task 6: `Header` + `GaugeCard`

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/GaugeCard.tsx`
- Create: `src/components/GaugeCard.test.tsx`

**Interfaces:**
- Consumes: `Global` from `../types`; `clampScore`, `pressureStateLabel`, `PRESSURE_STATE_COLORS`, `PANEL_COLOR` from `../lib/pressureMath`.
- Produces: `<Header updatedAt={string|null} hasError={boolean} />`, `<GaugeCard global={Global|undefined} />` — used by `App` (Task 10).

- [ ] **Step 1: Write the failing test `src/components/GaugeCard.test.tsx`**

```tsx
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GaugeCard } from './GaugeCard';

describe('GaugeCard', () => {
  test('shows -- and the baseline label when there is no pressure data yet', () => {
    render(<GaugeCard />);
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('BASELINE EN CONSTRUCCIÓN')).toBeInTheDocument();
  });

  test('renders the rounded score, state label and stats', () => {
    const fmt = new Intl.NumberFormat('es-BO');
    render(
      <GaugeCard
        global={{
          inventory: { totalLiters: 140200, stationsAvailable: 15, stationsTotal: 19 },
          pressure: { score: 49.04, state: 'EQUILIBRIO' },
        }}
      />
    );
    expect(screen.getByText('49')).toBeInTheDocument();
    expect(screen.getByText('EQUILIBRIO')).toBeInTheDocument();
    expect(screen.getByText(`${fmt.format(140200)} L`)).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/GaugeCard.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/components/Header.tsx`**

```tsx
export function Header({ updatedAt, hasError }: { updatedAt: string | null; hasError: boolean }) {
  const label = hasError
    ? 'No se pudieron cargar los datos'
    : updatedAt
      ? `Actualizado ${new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(updatedAt))}`
      : 'Cargando…';

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">SANTA CRUZ · BOLIVIA</p>
        <h1>Gasolina Index</h1>
        <p className="subtitle">No hice esto antes porque pense que iba a mejorar</p>
      </div>
      <div className="updated-wrap">
        <div className="updated">
          <span className="dot" style={hasError ? { background: '#e2807a' } : undefined} />
          <span>{label}</span>
        </div>
        <p className="update-freq">Se actualiza cada 30 minutos</p>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Write `src/components/GaugeCard.tsx`**

```tsx
import { clampScore, pressureStateLabel, PANEL_COLOR, PRESSURE_STATE_COLORS } from '../lib/pressureMath';
import type { Global } from '../types';

const fmt = new Intl.NumberFormat('es-BO');

function GaugeArc({ score }: { score: number | null }) {
  if (score === null) {
    return <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#3a3542" strokeWidth={14} strokeLinecap="round" />;
  }
  const cx = 100;
  const cy = 100;
  const r = 80;
  const angle = ((180 - (score / 100) * 180) * Math.PI) / 180;
  const mx = (cx + r * Math.cos(angle)).toFixed(1);
  const my = (cy - r * Math.sin(angle)).toFixed(1);
  return (
    <>
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={PRESSURE_STATE_COLORS.SIN_PRESION} />
          <stop offset="25%" stopColor={PRESSURE_STATE_COLORS.DEMANDA_BAJA} />
          <stop offset="50%" stopColor={PRESSURE_STATE_COLORS.EQUILIBRIO} />
          <stop offset="75%" stopColor={PRESSURE_STATE_COLORS.PRESION_ALTA} />
          <stop offset="100%" stopColor={PRESSURE_STATE_COLORS.PRESION_EXTREMA} />
        </linearGradient>
      </defs>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#gaugeGrad)" strokeWidth={14} strokeLinecap="round" />
      <circle cx={mx} cy={my} r={8} fill={PANEL_COLOR} stroke="#fff" strokeWidth={3} />
    </>
  );
}

export function GaugeCard({ global }: { global?: Global }) {
  const pressure = global?.pressure;
  const inventory = global?.inventory;
  const hasPressure = Number.isFinite(pressure?.score);
  const score = hasPressure ? clampScore(pressure!.score) : null;
  const state = pressure?.state || 'BASELINE_BUILDING';

  return (
    <article className="card gauge-card">
      <span className="label">ÍNDICE DE PRESIÓN</span>
      <div className="gauge-row">
        <div className="gauge-wrap">
          <svg className="gauge" viewBox="0 0 200 112" aria-label="Medidor del índice de presión">
            <GaugeArc score={score} />
          </svg>
          <div className="gauge-value">
            <strong>{score === null ? '--' : Math.round(score)}</strong>
            <span className={`state-${state}`}>{pressureStateLabel(state)}</span>
          </div>
        </div>
        <dl className="props gauge-stats">
          <div className="prop">
            <dt>Litros reportados</dt>
            <dd>{fmt.format(inventory?.totalLiters || 0)} L</dd>
          </div>
          <div className="prop">
            <dt>Surtidores con saldo</dt>
            <dd>{inventory?.stationsAvailable ?? 0}</dd>
          </div>
          <div className="prop">
            <dt>Total conocidos</dt>
            <dd>{inventory?.stationsTotal ?? 0}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/GaugeCard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.tsx src/components/GaugeCard.tsx src/components/GaugeCard.test.tsx
git commit -m "feat: add Header and GaugeCard components"
```

---

## Task 7: `TrendCard`

**Files:**
- Create: `src/components/TrendCard.tsx`
- Create: `src/components/TrendCard.test.tsx`

**Interfaces:**
- Consumes: `useHistory`, `ChartRange` from `../hooks/useHistory` (Task 5); `Snapshot` from `../types`; `BALANCE_COLOR`, `PRESSURE_STATE_COLORS`, `VOLUME_IN_COLOR`, `VOLUME_OUT_COLOR`, `clampScore`, `downsampleWithVolume`, `pressureModeLabel`, `pressureStateLabel`, `scoreColor`, `scoreToState` from `../lib/pressureMath` (Task 3).
- Produces: `<TrendCard latest={Snapshot|null} />` — used by `App` (Task 10).

- [ ] **Step 1: Write the failing test `src/components/TrendCard.test.tsx`**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrendCard } from './TrendCard';

const emptyLatest = {
  scrapedAt: '2026-08-19T00:00:00Z',
  global: {
    inventory: { totalLiters: 0, stationsAvailable: 0, stationsTotal: 0 },
    pressure: { score: null, state: 'BASELINE_BUILDING' as const, mode: 'PROVISIONAL' as const },
  },
};

describe('TrendCard', () => {
  test('shows the provisional-mode badge and empty state with no history yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(<TrendCard latest={emptyLatest} />);

    await waitFor(() => expect(screen.getByText('Aún no hay suficiente histórico')).toBeInTheDocument());
    expect(screen.getByText('ÍNDICE PROVISIONAL')).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  test('toggling a legend item marks it disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    render(<TrendCard latest={null} />);

    const legendButton = await screen.findByText('Saldo total (litros)');
    expect(legendButton.closest('button')).toHaveClass('active');
    fireEvent.click(legendButton);
    expect(legendButton.closest('button')).toHaveClass('disabled');

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/TrendCard.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/components/TrendCard.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Bar, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useHistory, type ChartRange } from '../hooks/useHistory';
import {
  BALANCE_COLOR,
  PRESSURE_STATE_COLORS,
  VOLUME_IN_COLOR,
  VOLUME_OUT_COLOR,
  ZONE_DIVIDER_COLOR,
  clampScore,
  downsampleWithVolume,
  pressureModeLabel,
  pressureStateLabel,
  scoreColor,
  scoreToState,
} from '../lib/pressureMath';
import type { Snapshot } from '../types';

const fmt = new Intl.NumberFormat('es-BO');

type SeriesKey = 'index' | 'balance' | 'volume';
const SERIES_KEYS: SeriesKey[] = ['index', 'balance', 'volume'];
const SERIES_LABEL: Record<SeriesKey, string> = {
  index: 'Índice de presión',
  balance: 'Saldo total (litros)',
  volume: 'Volumen (litros)',
};

const RANGES: ChartRange[] = ['7d', '30d', 'all'];
const RANGE_LABEL: Record<ChartRange, string> = { '7d': '7d', '30d': '30d', all: 'Todo' };

function buildPoints(snapshots: Snapshot[], latest: Snapshot | null) {
  const points = snapshots.map((s) => ({
    score: Number.isFinite(s.global?.pressure?.score) ? clampScore(s.global.pressure.score) : null,
    liters: Number(s.global?.inventory?.totalLiters || 0),
    time: s.scrapedAt,
  }));
  if (latest && (!points.length || new Date(latest.scrapedAt) > new Date(points.at(-1)!.time))) {
    points.push({
      score: Number.isFinite(latest.global?.pressure?.score) ? clampScore(latest.global.pressure.score) : null,
      liters: Number(latest.global?.inventory?.totalLiters || 0),
      time: latest.scrapedAt,
    });
  }
  return points;
}

export function TrendCard({ latest }: { latest: Snapshot | null }) {
  const [range, setRange] = useState<ChartRange>('7d');
  const [series, setSeries] = useState<Record<SeriesKey, boolean>>({ index: true, balance: true, volume: true });
  const { snapshots } = useHistory(range);

  const chartData = useMemo(() => {
    const points = buildPoints(snapshots, latest);
    const rawScores = points.map((p) => p.score);
    const rawTimes = points.map((p) => p.time);
    const rawLiters = points.map((p) => p.liters);
    const rawDelta = rawLiters.map((v, i) => (i === 0 ? 0 : v - rawLiters[i - 1]));
    const { scores, sold, liters, times } = downsampleWithVolume(rawScores, rawDelta, rawLiters, rawTimes, 180);
    return times.map((time, i) => ({ time, score: scores[i], sold: sold[i], liters: liters[i] }));
  }, [snapshots, latest]);

  const pressureScores = chartData.map((d) => d.score).filter((v): v is number => Number.isFinite(v));
  const mode = latest?.global?.pressure?.mode;
  const deltaLabel =
    pressureScores.length < 2
      ? pressureModeLabel(mode)
      : `${pressureScores.at(-1)! - pressureScores[0] >= 0 ? '+' : ''}${(pressureScores.at(-1)! - pressureScores[0]).toFixed(1)} pts · ${pressureModeLabel(mode).replace('ÍNDICE ', '')}`;

  const toggleSeries = (key: SeriesKey) => setSeries((s) => ({ ...s, [key]: !s[key] }));

  return (
    <article className="card trend-card">
      <div className="card-title-row">
        <div>
          <span className="label">EVOLUCIÓN</span>
          <h2>
            Gráfico de presión <span className="mini-badge">{deltaLabel}</span>
          </h2>
        </div>
        <div className="chart-ranges">
          {RANGES.map((r) => (
            <button key={r} className={`filter${range === r ? ' active' : ''}`} type="button" onClick={() => setRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-legend">
        {SERIES_KEYS.map((key) => (
          <button
            key={key}
            className={`legend-item${series[key] ? ' active' : ' disabled'}`}
            type="button"
            aria-pressed={series[key]}
            onClick={() => toggleSeries(key)}
          >
            <span className={`legend-dot dot-${key}`} />
            {SERIES_LABEL[key]}
          </button>
        ))}
      </div>
      <div className="chart-wrap">
        {chartData.length < 2 ? (
          <p className="chart-empty">Aún no hay suficiente histórico</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
              <ReferenceArea yAxisId="score" y1={80} y2={100} fill={PRESSURE_STATE_COLORS.PRESION_EXTREMA} fillOpacity={0.1} />
              <ReferenceArea yAxisId="score" y1={0} y2={20} fill={PRESSURE_STATE_COLORS.SIN_PRESION} fillOpacity={0.1} />
              {[20, 40, 60, 80].map((y) => (
                <ReferenceLine key={y} yAxisId="score" y={y} stroke={ZONE_DIVIDER_COLOR} strokeDasharray="2 4" />
              ))}
              <XAxis
                dataKey="time"
                tickFormatter={(t) => new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short' }).format(new Date(t))}
                stroke="#6f6a7d"
                fontSize={9}
              />
              <YAxis yAxisId="score" domain={[0, 100]} hide />
              <YAxis yAxisId="liters" orientation="right" hide domain={['dataMin', 'dataMax']} />
              <YAxis yAxisId="volume" hide domain={['auto', 'auto']} />
              <Tooltip content={<TrendTooltip series={series} />} />
              {series.volume && (
                <Bar yAxisId="volume" dataKey="sold" barSize={4} isAnimationActive={false}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.sold >= 0 ? VOLUME_IN_COLOR : VOLUME_OUT_COLOR} />
                  ))}
                </Bar>
              )}
              {series.balance && (
                <Line yAxisId="liters" type="monotone" dataKey="liters" stroke={BALANCE_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
              {series.index && (
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="score"
                  stroke={PRESSURE_STATE_COLORS.EQUILIBRIO}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}

interface TrendPoint {
  time: string;
  score: number | null;
  liters: number;
  sold: number;
}

function TrendTooltip({ active, payload, series }: { active?: boolean; payload?: Array<{ payload: TrendPoint }>; series: Record<SeriesKey, boolean> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dt = new Date(d.time);
  return (
    <div className="chart-tooltip" style={{ display: 'block', position: 'static' }}>
      <div className="tooltip-date">
        <strong>{new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(dt)}</strong>
        <span>{new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dt)}</span>
      </div>
      <ul className="tooltip-rows">
        {series.index && Number.isFinite(d.score) && (
          <li>
            <span className="tooltip-dot" style={{ background: scoreColor(d.score) }} />
            <span className="tooltip-label">Índice de presión</span>
            <strong>
              {Math.round(d.score!)} · {pressureStateLabel(scoreToState(d.score))}
            </strong>
          </li>
        )}
        {series.balance && (
          <li>
            <span className="tooltip-dot" style={{ background: BALANCE_COLOR }} />
            <span className="tooltip-label">Saldo total</span>
            <strong>{fmt.format(Math.round(d.liters))} L</strong>
          </li>
        )}
        {series.volume && (
          <li>
            <span className="tooltip-dot" style={{ background: d.sold >= 0 ? VOLUME_IN_COLOR : VOLUME_OUT_COLOR }} />
            <span className="tooltip-label">Volumen</span>
            <strong>{d.sold > 0 ? `+${fmt.format(Math.round(d.sold))} L` : d.sold < 0 ? `-${fmt.format(Math.round(Math.abs(d.sold)))} L` : '0 L'}</strong>
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/TrendCard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/TrendCard.tsx src/components/TrendCard.test.tsx
git commit -m "feat: add TrendCard with Recharts composed chart"
```

---

## Task 8: `StationCard` + `StationsSection`

**Files:**
- Create: `src/components/StationCard.tsx`
- Create: `src/components/StationsSection.tsx`
- Create: `src/components/StationsSection.test.tsx`

**Interfaces:**
- Consumes: `Station`, `SaldoRecord` from `../types`; `stationRecordsInRange` from `../hooks/useSaldosRecords` (Task 4); `fuelScoreColor`, `fuelStateLabel` from `../lib/pressureMath` (Task 3).
- Produces: `<StationsSection stations={Station[]} saldosRecords={SaldoRecord[]} onOpenStation={(key: string) => void} />` — used by `App` (Task 10).

- [ ] **Step 1: Write the failing test `src/components/StationsSection.test.tsx`**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StationsSection } from './StationsSection';
import type { Station } from '../types';

const stations: Station[] = [
  { key: 'a', name: 'ALEMANA', liters: 100, fuelLevel: { score: 50, state: 'NORMAL' }, pressure: { score: 0, state: 'SIN_PRESION' } },
  { key: 'b', name: 'BENI', liters: 0, fuelLevel: { score: 0, state: 'CRITICO' }, pressure: { score: 100, state: 'PRESION_EXTREMA' } },
];

describe('StationsSection', () => {
  test('filters to stations with saldo', () => {
    render(<StationsSection stations={stations} saldosRecords={[]} onOpenStation={vi.fn()} />);
    expect(screen.getByText('ALEMANA')).toBeInTheDocument();
    expect(screen.getByText('BENI')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Con saldo'));
    expect(screen.getByText('ALEMANA')).toBeInTheDocument();
    expect(screen.queryByText('BENI')).not.toBeInTheDocument();
  });

  test('opens the dialog for the clicked station', () => {
    const onOpen = vi.fn();
    render(<StationsSection stations={stations} saldosRecords={[]} onOpenStation={onOpen} />);
    fireEvent.click(screen.getByText('ALEMANA'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/StationsSection.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write `src/components/StationCard.tsx`**

```tsx
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { fuelScoreColor, fuelStateLabel } from '../lib/pressureMath';
import { stationRecordsInRange } from '../hooks/useSaldosRecords';
import type { SaldoRecord, Station } from '../types';

const fmt = new Intl.NumberFormat('es-BO');
const STATION_CHART_HOURS = 5;

function consumptionLabel(records: SaldoRecord[]) {
  if (records.length < 2) return 'Sin datos (1h)';
  const first = Number(records[0].liters || 0);
  const last = Number(records.at(-1)!.liters || 0);
  const delta = last - first;
  if (delta > 0) return `Recarga: +${fmt.format(delta)} L (1h)`;
  if (delta < 0) return `~${fmt.format(Math.abs(delta))} L gastados (1h)`;
  return 'Sin cambios (1h)';
}

export function StationCard({ station, saldosRecords, onOpen }: { station: Station; saldosRecords: SaldoRecord[]; onOpen: (key: string) => void }) {
  const fuel = station.fuelLevel || { score: 0, state: 'CRITICO' as const };
  const color = fuelScoreColor(fuel.score);
  const sparkRecords = stationRecordsInRange(saldosRecords, station.key, STATION_CHART_HOURS);
  const sparkData = sparkRecords.map((r) => ({ liters: Number(r.liters || 0) }));
  const consumeRecords = stationRecordsInRange(saldosRecords, station.key, 1);

  return (
    <article className={`card station state-${fuel.state}`} onClick={() => onOpen(station.key)}>
      <div className="station-top">
        <div>
          <h3>{station.name}</h3>
          <div className="address">{station.address || 'Dirección no disponible'}</div>
        </div>
        <div className="station-score">
          {Math.round(fuel.score ?? 0)} · {fuelStateLabel(fuel.state)}
        </div>
      </div>
      <div className="station-main">
        <strong>{fmt.format(station.liters || 0)}</strong>
        <span>litros</span>
      </div>
      <div className="station-chart">
        {sparkData.length < 2 ? (
          <p className="chart-empty-mini">Sin histórico de 5h</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <Area type="monotone" dataKey="liters" stroke={color} fill={color} fillOpacity={0.14} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="station-meta">
        <span>Nivel: {fuelStateLabel(fuel.state)}</span>
        <span>{consumptionLabel(consumeRecords)}</span>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Write `src/components/StationsSection.tsx`**

```tsx
import { useState } from 'react';
import { StationCard } from './StationCard';
import type { SaldoRecord, Station } from '../types';

type Filter = 'all' | 'available' | 'critical';
const FILTERS: Filter[] = ['all', 'available', 'critical'];
const FILTER_LABEL: Record<Filter, string> = { all: 'Todos', available: 'Con saldo', critical: 'Sin saldo' };

export function StationsSection({
  stations,
  saldosRecords,
  onOpenStation,
}: {
  stations: Station[];
  saldosRecords: SaldoRecord[];
  onOpenStation: (key: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const visible = [...stations]
    .sort((a, b) => (b.liters || 0) - (a.liters || 0))
    .filter((s) => (filter === 'available' ? (s.liters || 0) > 0 : filter === 'critical' ? (s.liters || 0) === 0 : true));

  return (
    <>
      <section className="section-head">
        <div>
          <span className="label">SURTIDORES</span>
          <h2>Disponibilidad por estación</h2>
        </div>
        <div className="filters">
          {FILTERS.map((f) => (
            <button key={f} className={`filter${filter === f ? ' active' : ''}`} type="button" onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
      </section>
      <section className="stations-grid">
        {visible.length ? (
          visible.map((s) => <StationCard key={s.key} station={s} saldosRecords={saldosRecords} onOpen={onOpenStation} />)
        ) : (
          <div className="empty">No hay surtidores para este filtro.</div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/components/StationsSection.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/StationCard.tsx src/components/StationsSection.tsx src/components/StationsSection.test.tsx
git commit -m "feat: add StationCard sparkline and StationsSection filter/grid"
```

---

## Task 9: `StationDialog`

**Files:**
- Create: `src/components/StationDialog.tsx`
- Create: `src/components/StationDialog.test.tsx`

**Interfaces:**
- Consumes: `Station`, `SaldoRecord` from `../types`; `stationRecordsInRange` from `../hooks/useSaldosRecords`; `fuelScoreColor`, `fuelStateLabel`, `pressureModeLabel`, `pressureStateLabel` from `../lib/pressureMath`.
- Produces: `<StationDialog station={Station|null} saldosRecords={SaldoRecord[]} onClose={() => void} />` — used by `App` (Task 10).

- [ ] **Step 1: Write the failing test `src/components/StationDialog.test.tsx`**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StationDialog } from './StationDialog';
import type { Station } from '../types';

const station: Station = {
  key: 'a',
  name: 'ALEMANA',
  liters: 100,
  fuelLevel: { score: 50, state: 'NORMAL' },
  pressure: { score: null, state: 'BASELINE_BUILDING' },
};

describe('StationDialog', () => {
  test('shows the baseline label when the station has no pressure score yet', () => {
    render(<StationDialog station={station} saldosRecords={[]} onClose={vi.fn()} />);
    expect(screen.getByText('BASELINE EN CONSTRUCCIÓN')).toBeInTheDocument();
  });

  test('renders nothing visible when no station is selected', () => {
    render(<StationDialog station={null} saldosRecords={[]} onClose={vi.fn()} />);
    expect(screen.queryByText('ALEMANA')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/StationDialog.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/components/StationDialog.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { fuelScoreColor, fuelStateLabel, pressureModeLabel, pressureStateLabel } from '../lib/pressureMath';
import { stationRecordsInRange } from '../hooks/useSaldosRecords';
import type { SaldoRecord, Station } from '../types';

const fmt = new Intl.NumberFormat('es-BO');
type Range = '5h' | '10h' | '1d';
const RANGES: Range[] = ['5h', '10h', '1d'];
const RANGE_HOURS: Record<Range, number> = { '5h': 5, '10h': 10, '1d': 24 };
const RANGE_LABEL: Record<Range, string> = { '5h': '5 horas', '10h': '10 horas', '1d': '1 día' };

export function StationDialog({ station, saldosRecords, onClose }: { station: Station | null; saldosRecords: SaldoRecord[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [range, setRange] = useState<Range>('5h');

  useEffect(() => {
    // jsdom logs "not implemented" for showModal/close in tests — harmless, no assertions depend on it.
    if (station) {
      setRange('5h');
      ref.current?.showModal();
    } else {
      ref.current?.close();
    }
  }, [station]);

  if (!station) return <dialog className="station-dialog" ref={ref} onClose={onClose} />;

  const fuel = station.fuelLevel || { score: 0, state: 'CRITICO' as const };
  const pressure = station.pressure || { score: null, state: 'BASELINE_BUILDING' as const };
  const records = stationRecordsInRange(saldosRecords, station.key, RANGE_HOURS[range]);
  const chartData = records.map((r) => ({ liters: Number(r.liters || 0) }));

  return (
    <dialog className="station-dialog" ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog-head">
        <div>
          <span className="label">{station.address || 'Dirección no disponible'}</span>
          <h2>{station.name}</h2>
        </div>
        <button className="dialog-close" type="button" aria-label="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>
      <dl className="props">
        <div className="prop">
          <dt>Litros actuales</dt>
          <dd>{fmt.format(station.liters || 0)} L</dd>
        </div>
        <div className="prop">
          <dt>Nivel de combustible</dt>
          <dd>
            {Math.round(fuel.score)} · {fuelStateLabel(fuel.state)}
          </dd>
        </div>
        <div className="prop">
          <dt>Índice de presión</dt>
          <dd>
            {Number.isFinite(pressure.score)
              ? `${Math.round(pressure.score!)} · ${pressureStateLabel(pressure.state)} · ${pressureModeLabel(pressure.mode)}`
              : pressureStateLabel(pressure.state || 'BASELINE_BUILDING')}
          </dd>
        </div>
      </dl>
      <div className="filters range-filters">
        {RANGES.map((r) => (
          <button key={r} className={`filter${range === r ? ' active' : ''}`} type="button" onClick={() => setRange(r)}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="chart-wrap">
        {chartData.length < 2 ? (
          <p className="chart-empty">Aún no hay suficiente histórico</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line type="monotone" dataKey="liters" stroke={fuelScoreColor(fuel.score)} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/StationDialog.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/StationDialog.tsx src/components/StationDialog.test.tsx
git commit -m "feat: add StationDialog with per-station line chart"
```

---

## Task 10: Wire up `App`, port `styles.css`, remove old files

**Files:**
- Modify: `src/App.tsx` (replace placeholder with the real composition)
- Modify: `src/main.tsx` (import the ported stylesheet)
- Create: `src/styles.css` (moved verbatim from the current root `styles.css`)
- Delete: `app.js`, `styles.css` (root — superseded by `src/styles.css`)

**Interfaces:**
- Consumes: every component and hook from Tasks 2–9.

- [ ] **Step 1: Move the stylesheet**

Run: `git mv styles.css src/styles.css`

(Content is unchanged — this preserves the exact visual styling from the current site.)

- [ ] **Step 2: Write `src/App.tsx`**

```tsx
import { useState } from 'react';
import { Header } from './components/Header';
import { GaugeCard } from './components/GaugeCard';
import { TrendCard } from './components/TrendCard';
import { StationsSection } from './components/StationsSection';
import { StationDialog } from './components/StationDialog';
import { useLatestSnapshot } from './hooks/useLatestSnapshot';
import { useSaldosRecords } from './hooks/useSaldosRecords';

export function App() {
  const { latest, error } = useLatestSnapshot();
  const saldosRecords = useSaldosRecords();
  const [openStationKey, setOpenStationKey] = useState<string | null>(null);

  const stations = latest?.stations || [];
  const openStation = stations.find((s) => s.key === openStationKey) || null;

  return (
    <main className="shell">
      <Header updatedAt={latest?.scrapedAt ?? null} hasError={Boolean(error)} />
      <section className="hero-stack">
        <GaugeCard global={latest?.global} />
        <TrendCard latest={latest} />
      </section>
      <StationsSection stations={stations} saldosRecords={saldosRecords} onOpenStation={setOpenStationKey} />
      <footer>Datos obtenidos automáticamente desde BioCloud. Este sitio no representa a YPFB ni garantiza disponibilidad al momento de llegada.</footer>
      <StationDialog station={openStation} saldosRecords={saldosRecords} onClose={() => setOpenStationKey(null)} />
    </main>
  );
}
```

- [ ] **Step 3: Update `src/main.tsx` to import the stylesheet**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 4: Remove the superseded vanilla entry point**

Run: `git rm app.js`

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS (all suites from Tasks 2–9)

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`
Open the printed local URL, confirm: gauge renders with the real `public/data/latest.json` values, trend chart draws with legend/range toggles working, station grid renders and filters, clicking a station opens the dialog with its chart, closing works. Stop the dev server after checking.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/main.tsx src/styles.css
git commit -m "feat: wire up App, port stylesheet, retire vanilla app.js"
```

---

## Task 11: Update GitHub Actions deploy workflow

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Replace the workflow with a build-then-deploy pipeline**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'public/**'
      - 'index.html'
      - 'package.json'
      - 'package-lock.json'
      - 'vite.config.ts'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: build with Vite before deploying to Pages"
```

---

## Task 12: Final verification pass

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS, every suite from Tasks 2–9.

- [ ] **Step 2: Type check + build**

Run: `npm run build`
Expected: `tsc -b` reports no errors, `vite build` produces `dist/index.html` and hashed assets, `dist/data/...` mirrors `public/data/...`.

- [ ] **Step 3: Preview the production build**

Run: `npm run preview`
Open the printed URL, confirm the app loads and fetches data correctly under the `/gasolina-fear-greed-web/` base path (matches the GitHub Pages URL shape). Stop the preview server after checking.

- [ ] **Step 4: Confirm no leftover vanilla files**

Run: `git status --short` and `ls`
Expected: no `app.js` or root `styles.css`; `.nojekyll` and `README.md` untouched (still relevant: `.nojekyll` for Pages, README describes the data contract which is unchanged).

- [ ] **Step 5: Commit any remaining cleanup**

```bash
git add -A
git commit -m "chore: final cleanup after React migration" --allow-empty=false
```

(Skip this step if `git status --short` is already clean.)
