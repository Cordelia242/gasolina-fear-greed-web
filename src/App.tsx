import { useState } from 'react';
import { Header } from './components/Header';
import { GaugeCard } from './components/GaugeCard';
import { TrendCard } from './components/TrendCard';
import { StationsSection } from './components/StationsSection';
import { StationDialog } from './components/StationDialog';
import { useLatestSnapshot } from './hooks/useLatestSnapshot';
import { useSaldosRecords } from './hooks/useSaldosRecords';
import { filterSantaCruzStations } from './lib/stationFilter';

export function App() {
  const { latest, error } = useLatestSnapshot();
  const saldosRecords = useSaldosRecords();
  const [openStationKey, setOpenStationKey] = useState<string | null>(null);

  const stations = filterSantaCruzStations(latest?.stations || []);
  const openStation = stations.find((s) => s.key === openStationKey) || null;

  // El índice de presión sigue siendo el oficial (calculado sobre todas las
  // estaciones); solo el inventario (litros/conteos) se recalcula sobre el
  // subconjunto visible, para que coincida con lo que se ve en pantalla.
  const filteredGlobal = latest?.global
    ? {
        ...latest.global,
        inventory: {
          totalLiters: stations.reduce((sum, s) => sum + (Number(s.liters) || 0), 0),
          stationsAvailable: stations.filter((s) => (s.liters || 0) > 0).length,
          stationsTotal: stations.length,
        },
      }
    : undefined;

  return (
    <main className="shell">
      <Header updatedAt={latest?.scrapedAt ?? null} hasError={Boolean(error)} />
      <section className="hero-stack">
        <GaugeCard global={filteredGlobal} />
        <TrendCard latest={latest} />
      </section>
      <StationsSection stations={stations} saldosRecords={saldosRecords} onOpenStation={setOpenStationKey} />
      <footer>Datos obtenidos automáticamente desde BioCloud. Este sitio no representa a YPFB ni garantiza disponibilidad al momento de llegada.</footer>
      <StationDialog station={openStation} saldosRecords={saldosRecords} onClose={() => setOpenStationKey(null)} />
    </main>
  );
}
