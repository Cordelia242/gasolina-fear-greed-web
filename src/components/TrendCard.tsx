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
