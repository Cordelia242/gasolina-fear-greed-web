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
