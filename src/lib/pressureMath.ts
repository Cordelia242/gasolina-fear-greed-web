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
  /** Present only when `soldOut`/`soldIn` were passed in — true outflow/inflow volume per bucket, not derived from the net. */
  soldOut?: number[];
  soldIn?: number[];
}

/**
 * `sold` is the NET liters moved per point (already summed when bucketing
 * points together for display). `soldOut`/`soldIn`, when provided, are
 * summed the same way but kept SEPARATE — outflow and inflow that happened
 * in the same bucket don't cancel out. Without this, filtering the chart to
 * "only egresos" on a bucket whose net was positive (net inflow) would show
 * nothing, hiding real outflow that got netted away.
 */
export function downsampleWithVolume(
  scores: (number | null)[],
  sold: number[],
  liters: number[],
  times: string[],
  max: number,
  soldOut?: number[],
  soldIn?: number[]
): DownsampledSeries {
  if (scores.length <= max) return { scores, sold, liters, times, soldOut, soldIn };
  const stride = Math.ceil(scores.length / max);
  const outS: (number | null)[] = [];
  const outV: number[] = [];
  const outL: number[] = [];
  const outT: string[] = [];
  const outOut: number[] | undefined = soldOut ? [] : undefined;
  const outIn: number[] | undefined = soldIn ? [] : undefined;
  const sumRange = (arr: number[], from: number, to: number) => {
    let sum = 0;
    for (let j = from; j < to; j++) sum += arr[j];
    return sum;
  };
  for (let i = 0; i < scores.length; i += stride) {
    const end = Math.min(i + stride, scores.length);
    outS.push(scores[i]);
    outT.push(times[i]);
    outL.push(liters[i]);
    outV.push(sumRange(sold, i, end));
    if (soldOut && outOut) outOut.push(sumRange(soldOut, i, end));
    if (soldIn && outIn) outIn.push(sumRange(soldIn, i, end));
  }
  if (outT.at(-1) !== times.at(-1)) {
    outS.push(scores.at(-1) ?? null);
    outT.push(times.at(-1)!);
    outV.push(sold.at(-1) ?? 0);
    outL.push(liters.at(-1) ?? 0);
    if (soldOut && outOut) outOut.push(soldOut.at(-1) ?? 0);
    if (soldIn && outIn) outIn.push(soldIn.at(-1) ?? 0);
  }
  return { scores: outS, sold: outV, liters: outL, times: outT, soldOut: outOut, soldIn: outIn };
}
