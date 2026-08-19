// n8n Code node body — ORCHESTRATION ONLY.
//
// This node reads GitHub state and the BioCloud scrape (via other nodes'
// outputs, `$('Nodo').first().json`), hands plain data to
// GasolinaIndexEngine.calculateIndex (the bundle pasted above this in the
// same Code node — see scripts/n8n/update-workflow.ts), and turns the
// result back into the file contents this workflow commits to GitHub.
//
// It must NEVER contain index math itself — that lives in exactly one
// place, src/index-engine/*.ts, and reaches this node only through the
// generated bundle. If you need to change the formula, edit src/index-engine
// and run `npm run build:n8n-workflow`; do not hand-edit this file's sibling
// bundle or paste math back into this glue.

const cfg = $('Configuracion').first().json;
const parsed = $('Extraer surtidores visibles').first().json;
const localDate = $('Fecha local').first().json.localDate;

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function readGithubJson(nodeName, fallback) {
  const response = $(nodeName).first().json;
  if (!response || !response.content) return { exists: false, value: clone(fallback) };
  try {
    const raw = Buffer.from(String(response.content).replace(/\n/g, ''), 'base64').toString('utf8');
    return { exists: true, value: JSON.parse(raw) };
  } catch (e) {
    throw new Error(`No se pudo interpretar ${nodeName}: ${e.message}`);
  }
}

const seedCatalog = [
  { key: 'alemana', name: 'ALEMANA' }, { key: 'beni', name: 'BENI' },
  { key: 'berea', name: 'BEREA' }, { key: 'cedeno', name: 'CEDENO' },
  { key: 'chaco', name: 'CHACO' }, { key: 'gasco', name: 'GASCO' },
  { key: 'la-teca', name: 'LA TECA' }, { key: 'lopez', name: 'LOPEZ' },
  { key: 'montecristo', name: 'MONTECRISTO' }, { key: 'paragua', name: 'PARAGUA' },
  { key: 'parapeti', name: 'PARAPETI' }, { key: 'royal', name: 'ROYAL' },
  { key: 'sur-central', name: 'SUR CENTRAL' }, { key: 'viru-viru', name: 'VIRU VIRU' }
];
const catalogFile = readGithubJson('GitHub - Leer catalog.json', { stations: seedCatalog });
const statsFile = readGithubJson('GitHub - Leer stats.json', { version: 3, stations: {} });
const historyFile = readGithubJson('GitHub - Leer historico diario', { date: localDate, snapshots: [] });
const latestFile = readGithubJson('GitHub - Leer latest.json', null);
const saldosDayFile = readGithubJson('GitHub - Leer saldos del día', { date: localDate, records: [] });
const crisesFile = readGithubJson('GitHub - Leer crises.json', { version: 1, crises: [] });

const catalog = catalogFile.value || { stations: seedCatalog };
const stats = statsFile.value || { version: 3, stations: {} };
const history = historyFile.value || { date: localDate, snapshots: [] };
const saldosDay = saldosDayFile.value || { date: localDate, records: [] };
const crises = Array.isArray(crisesFile.value?.crises) ? crisesFile.value.crises : [];
catalog.stations = Array.isArray(catalog.stations) ? catalog.stations : [];
history.date = localDate;
history.snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
saldosDay.date = localDate;
saldosDay.records = Array.isArray(saldosDay.records) ? saldosDay.records : [];

const now = new Date().toISOString();

// --- Catalog bookkeeping (which stations exist, their name/address) — orchestration, not math.
const catalogByKey = new Map(seedCatalog.map(s => [s.key, { ...s }]));
for (const s of catalog.stations) if (s?.key) catalogByKey.set(s.key, { ...catalogByKey.get(s.key), ...s });
for (const s of parsed.stations) {
  const previous = catalogByKey.get(s.key) || {};
  catalogByKey.set(s.key, { ...previous, key: s.key, name: s.name || previous.name || s.key, address: s.address || previous.address || null, lastSeenAt: now });
}
const visible = new Map(parsed.stations.map(s => [s.key, s]));
const roster = [...catalogByKey.values()].sort((a, b) => a.name.localeCompare(b.name));

// --- Build the engine's explicit, decoupled input. No $()/GitHub/credentials inside the engine.
const currentMeasurements = roster.map(station => {
  const current = visible.get(station.key);
  return {
    scrapedAt: now,
    sourceMeasuredAt: parsed.sourceMeasuredAt,
    station: station.key,
    name: station.name,
    liters: current ? Number(current.liters || 0) : 0,
    visibleInSource: Boolean(current),
    address: current?.address || station.address || null,
  };
});

const previousMeasurements = (latestFile.value?.stations || []).map(s => ({
  scrapedAt: latestFile.value.scrapedAt,
  sourceMeasuredAt: latestFile.value.sourceMeasuredAt,
  station: s.key,
  name: s.name,
  liters: Number(s.liters || 0),
  visibleInSource: Boolean(s.visibleInSource),
  address: s.address || null,
}));

const lastHistoryEntry = history.snapshots[history.snapshots.length - 1] || null;
const previousHistoryEntry = lastHistoryEntry
  ? { sourceMeasuredAt: lastHistoryEntry.sourceMeasuredAt, totalLiters: lastHistoryEntry.global.inventory.totalLiters }
  : null;

const priorStats = { version: 3, stations: stats.stations || {} };

// --- The ONLY math call in this whole node.
const result = GasolinaIndexEngine.calculateIndex({
  now,
  currentMeasurements,
  previousMeasurements,
  priorStats,
  previousHistoryEntry,
  crises,
});

const snapshot = result.snapshot;

// --- Persist the engine's output back into the file shapes this workflow commits.
stats.version = 3;
stats.stations = result.nextStats.stations;
stats.updatedAt = now;

if (result.isNewSnapshot) {
  history.snapshots.push(snapshot);
  for (const s of snapshot.stations) {
    // RAW ONLY: saldos records store observed data, never fuelLevel/pressure/flow —
    // those are derived and recomputable from this file + crises.json + the engine config.
    saldosDay.records.push({
      scrapedAt: snapshot.scrapedAt,
      sourceMeasuredAt: snapshot.sourceMeasuredAt,
      station: s.key,
      name: s.name,
      liters: s.liters,
      visibleInSource: s.visibleInSource,
    });
  }
}

catalog.stations = [...catalogByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
catalog.updatedAt = now;

const pretty = value => JSON.stringify(value, null, 2) + '\n';
return [{ json: {
  catalogExists: catalogFile.exists,
  statsExists: statsFile.exists,
  historyExists: historyFile.exists,
  latestExists: latestFile.exists,
  saldosExists: saldosDayFile.exists,
  catalogPath: `${cfg.dataRoot}/catalog.json`,
  statsPath: `${cfg.dataRoot}/stats.json`,
  historyPath: `${cfg.dataRoot}/history/${localDate}.json`,
  latestPath: `${cfg.dataRoot}/latest.json`,
  saldosPath: `${cfg.dataRoot}/saldos/${localDate}.json`,
  catalogContent: pretty(catalog),
  statsContent: pretty(stats),
  historyContent: pretty(history),
  latestContent: pretty(snapshot),
  saldosContent: pretty(saldosDay),
  snapshot
} }];
