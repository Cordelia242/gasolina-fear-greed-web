import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

const fmt = new Intl.NumberFormat('es-BO');

export interface FuelPoint {
  time: string;
  liters: number;
}

export function FuelAreaChart({ data, color, showTooltip = false }: { data: FuelPoint[]; color: string; showTooltip?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        {showTooltip && <Tooltip content={<FuelTooltip />} />}
        <Area
          type="monotone"
          dataKey="liters"
          stroke={color}
          fill={color}
          fillOpacity={0.14}
          strokeWidth={2}
          isAnimationActive={false}
          dot={false}
          activeDot={showTooltip ? { r: 4, stroke: color, strokeWidth: 2, fill: '#100f16' } : false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function FuelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FuelPoint }> }) {
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
        <li>
          <span className="tooltip-label">Gasolina</span>
          <strong>{fmt.format(Math.round(d.liters))} L</strong>
        </li>
      </ul>
    </div>
  );
}
