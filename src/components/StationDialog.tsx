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
    // jsdom doesn't implement HTMLDialogElement.showModal/close — guard so tests don't throw.
    if (station) {
      setRange('5h');
      if (typeof ref.current?.showModal === 'function') ref.current.showModal();
    } else if (typeof ref.current?.close === 'function') {
      ref.current.close();
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
