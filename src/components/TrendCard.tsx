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
  compactLiters,
  downsampleWithVolume,
  pressureModeLabel,
  pressureStateLabel,
  scoreColor,
  scoreToState,
} from '../lib/pressureMath';
import type { Snapshot } from '../types';

const fmt = new Intl.NumberFormat('es-BO');
const AXIS_TICK = { fill: '#8f8a9c', fontSize: 9 };
const compactTick = (v: number) => compactLiters(v).replace(' L', '');

type SeriesKey = 'index' | 'balance' | 'volumeIn' | 'volumeOut';
const SERIES_KEYS: SeriesKey[] = ['index', 'balance', 'volumeIn', 'volumeOut'];
const SERIES_LABEL: Record<SeriesKey, string> = {
  index: 'Índice de presión',
  balance: 'Saldo total (litros)',
  volumeIn: 'Ingresos (litros)',
  volumeOut: 'Egresos (litros)',
};

const RANGES: ChartRange[] = ['7d', '30d', 'all'];
const RANGE_LABEL: Record<ChartRange, string> = { '7d': '7d', '30d': '30d', all: 'Todo' };

// Las barras de volumen ocupan solo esta fracción del alto del gráfico, pegadas abajo.
const VOLUME_ZONE_FRACTION = 0.22;

function pointFor(s: Snapshot) {
  return {
    score: Number.isFinite(s.global?.pressure?.score) ? clampScore(s.global.pressure.score) : null,
    liters: Number(s.global?.inventory?.totalLiters || 0),
    outflowLitersPerHour: Number.isFinite(s.global?.flow?.outflowLitersPerHour)
      ? (s.global!.flow!.outflowLitersPerHour as number)
      : null,
    inflowLitersPerHour: Number.isFinite(s.global?.flow?.inflowLitersPerHour)
      ? (s.global!.flow!.inflowLitersPerHour as number)
      : null,
    time: s.scrapedAt,
  };
}

function buildPoints(snapshots: Snapshot[], latest: Snapshot | null) {
  const points = snapshots.map(pointFor);
  if (latest && (!points.length || new Date(latest.scrapedAt) > new Date(points.at(-1)!.time))) {
    points.push(pointFor(latest));
  }
  return points;
}

export function TrendCard({ latest }: { latest: Snapshot | null }) {
  const [range, setRange] = useState<ChartRange>('7d');
  const [series, setSeries] = useState<Record<SeriesKey, boolean>>({ index: true, balance: true, volumeIn: true, volumeOut: true });
  const { snapshots } = useHistory(range);

  const chartData = useMemo(() => {
    const points = buildPoints(snapshots, latest);
    const rawScores = points.map((p) => p.score);
    const rawTimes = points.map((p) => p.time);
    const rawLiters = points.map((p) => p.liters);
    const rawDelta = rawLiters.map((v, i) => (i === 0 ? 0 : v - rawLiters[i - 1]));
    // Volumen real de egresos/ingresos de ESE intervalo (tasa * horas transcurridas),
    // no derivado del neto — así conservan lo que pasó aunque se compensen entre sí.
    const elapsedHoursAt = (i: number) =>
      i === 0 ? 0 : (new Date(rawTimes[i]).getTime() - new Date(rawTimes[i - 1]).getTime()) / 3_600_000;
    const rawOut = points.map((p, i) => {
      const hours = elapsedHoursAt(i);
      return hours > 0 && p.outflowLitersPerHour !== null ? p.outflowLitersPerHour * hours : 0;
    });
    const rawIn = points.map((p, i) => {
      const hours = elapsedHoursAt(i);
      return hours > 0 && p.inflowLitersPerHour !== null ? p.inflowLitersPerHour * hours : 0;
    });
    const { scores, sold, liters, times, soldOut, soldIn } = downsampleWithVolume(
      rawScores,
      rawDelta,
      rawLiters,
      rawTimes,
      180,
      rawOut,
      rawIn
    );
    return times.map((time, i) => ({
      time,
      score: scores[i],
      sold: sold[i],
      liters: liters[i],
      soldOut: soldOut?.[i] ?? 0,
      soldIn: soldIn?.[i] ?? 0,
    }));
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
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="4%">
              <ReferenceArea yAxisId="score" y1={80} y2={100} fill={PRESSURE_STATE_COLORS.PRESION_EXTREMA} fillOpacity={0.15} />
              <ReferenceArea yAxisId="score" y1={0} y2={20} fill={PRESSURE_STATE_COLORS.SIN_PRESION} fillOpacity={0.15} />
              {[0, 20, 40, 60, 80, 100].map((y) => (
                <ReferenceLine key={y} yAxisId="score" y={y} stroke={ZONE_DIVIDER_COLOR} strokeDasharray="1 5" strokeLinecap="round" />
              ))}
              <XAxis
                dataKey="time"
                tickFormatter={(t) => new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: 'short' }).format(new Date(t))}
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
              />
              <YAxis
                yAxisId="liters"
                orientation="left"
                domain={['dataMin', 'dataMax']}
                tickFormatter={compactTick}
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                width={44}
              />
              <YAxis
                yAxisId="score"
                orientation="right"
                domain={[0, 100]}
                ticks={[0, 20, 40, 60, 80, 100]}
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                width={26}
              />
              <YAxis
                yAxisId="scoreState"
                orientation="right"
                domain={[0, 100]}
                ticks={[10, 30, 50, 70, 90]}
                tickFormatter={(v) => pressureStateLabel(scoreToState(v))}
                axisLine={false}
                tickLine={false}
                tick={AXIS_TICK}
                width={86}
              />
              {/* dominio escalado a VOLUME_ZONE_FRACTION del alto: las barras (siempre positivas, en absSold)
                  quedan confinadas a una franja abajo del gráfico en vez de ocupar todo el alto */}
              <YAxis yAxisId="volume" hide domain={[0, (max: number) => (max > 0 ? max / VOLUME_ZONE_FRACTION : 1)]} />
              <Tooltip content={<TrendTooltip series={series} />} />
              {(series.volumeIn || series.volumeOut) && (
                <Bar yAxisId="volume" dataKey={(d: TrendPoint) => filteredVolume(d, series)} isAnimationActive={false}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={volumeColor(d, series)} />
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
        {chartData.length >= 2 && (
          <>
            <span className="axis-unit axis-unit-left">L</span>
            <span className="axis-unit axis-unit-right">IDX</span>
          </>
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
  soldOut: number;
  soldIn: number;
}

// Con ambos filtros activos se muestra el movimiento neto (como antes). Con uno solo
// activo, se usa el volumen real de ese lado (soldOut/soldIn) en vez de derivarlo del
// neto: un intervalo con ingresos y egresos simultáneos no debe mostrar "0" en egresos
// solo porque el ingreso fue mayor y compensó el neto.
function filteredVolume(d: TrendPoint, series: Record<SeriesKey, boolean>) {
  if (series.volumeIn && series.volumeOut) return Math.abs(d.sold);
  if (series.volumeIn) return d.soldIn;
  if (series.volumeOut) return d.soldOut;
  return 0;
}

function isOutflowDisplay(d: TrendPoint, series: Record<SeriesKey, boolean>): boolean {
  if (series.volumeOut && !series.volumeIn) return true;
  if (series.volumeIn && !series.volumeOut) return false;
  return d.sold < 0;
}

function volumeColor(d: TrendPoint, series: Record<SeriesKey, boolean>) {
  return isOutflowDisplay(d, series) ? VOLUME_OUT_COLOR : VOLUME_IN_COLOR;
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
        {(series.volumeIn || series.volumeOut) && (
          <li>
            <span className="tooltip-dot" style={{ background: volumeColor(d, series) }} />
            <span className="tooltip-label">Volumen</span>
            <strong>
              {(() => {
                const v = filteredVolume(d, series);
                if (v === 0) return '0 L';
                return isOutflowDisplay(d, series) ? `-${fmt.format(Math.round(v))} L` : `+${fmt.format(Math.round(v))} L`;
              })()}
            </strong>
          </li>
        )}
      </ul>
    </div>
  );
}
