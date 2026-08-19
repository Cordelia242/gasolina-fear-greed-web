import { clampScore, pressureModeLabel, pressureStateLabel, PANEL_COLOR, PRESSURE_STATE_COLORS } from '../lib/pressureMath';
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
            <small className="pressure-mode">{pressureModeLabel(pressure?.mode)}</small>
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
