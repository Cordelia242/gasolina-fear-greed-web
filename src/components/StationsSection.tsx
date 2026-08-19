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
