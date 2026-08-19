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
