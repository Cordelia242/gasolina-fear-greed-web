const cfg = $('Configuracion').first().json;
const parsed = $('Extraer surtidores visibles').first().json;
const localDate = $('Fecha local').first().json.localDate;

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }
function round2(v) { return Math.round(v * 100) / 100; }

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

function stateFor(score) {
  if (score <= 20) return 'CRITICO';
  if (score <= 40) return 'ESCASEZ';
  if (score <= 60) return 'NORMAL';
  if (score <= 80) return 'ABUNDANCIA';
  return 'SATURADO';
}

function sourceDate(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : localDate;
}

function sourceHour(value) {
  const m = String(value || '').match(/T(\d{2}):/);
  return m ? Number(m[1]) : 0;
}

function msForLocalIso(value) {
  if (!value) return null;
  const normalized = String(value).match(/[zZ]|[+-]\d{2}:\d{2}$/) ? String(value) : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function isCrisisDate(date, crises) {
  return crises.some(c => {
    if (!c || c.enabled === false || !c.start) return false;
    const start = String(c.start).slice(0, 10);
    const end = c.end ? String(c.end).slice(0, 10) : null;
    return date >= start && (!end || date <= end);
  });
}

function aggregateDays(days, crises, minDate, excludeDate = null) {
  let count = 0, sumLiters = 0, sumLitersSq = 0, outflowCount = 0, sumOutflow = 0, sumOutflowSq = 0;
  const cleanDates = new Set();
  for (const [date, d] of Object.entries(days || {})) {
    if (date < minDate || date === excludeDate || isCrisisDate(date, crises)) continue;
    const c = Number(d.count || 0);
    const oc = Number(d.outflowCount || 0);
    if (c > 0) {
      count += c;
      sumLiters += Number(d.sumLiters || 0);
      sumLitersSq += Number(d.sumLitersSq || 0);
      cleanDates.add(date);
    }
    if (oc > 0) {
      outflowCount += oc;
      sumOutflow += Number(d.sumOutflow || 0);
      sumOutflowSq += Number(d.sumOutflowSq || 0);
    }
  }
  const meanLiters = count ? sumLiters / count : null;
  const litersVariance = count > 1 ? Math.max(0, sumLitersSq / count - meanLiters * meanLiters) : 0;
  const meanOutflow = outflowCount ? sumOutflow / outflowCount : null;
  const outflowVariance = outflowCount > 1 ? Math.max(0, sumOutflowSq / outflowCount - meanOutflow * meanOutflow) : 0;
  return {
    cleanDays: cleanDates.size,
    count, meanLiters, litersStd: Math.sqrt(litersVariance),
    outflowCount, meanOutflow, outflowStd: Math.sqrt(outflowVariance)
  };
}

function dateMinusDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function updateDayBucket(bucket, date, liters, outflowLph) {
  bucket.days = bucket.days || {};
  const d = bucket.days[date] || {
    count: 0, sumLiters: 0, sumLitersSq: 0,
    outflowCount: 0, sumOutflow: 0, sumOutflowSq: 0
  };
  d.count += 1;
  d.sumLiters += liters;
  d.sumLitersSq += liters * liters;
  if (Number.isFinite(outflowLph) && outflowLph > 0) {
    d.outflowCount += 1;
    d.sumOutflow += outflowLph;
    d.sumOutflowSq += outflowLph * outflowLph;
  }
  bucket.days[date] = d;
}

function pruneDays(bucket, minDate) {
  for (const date of Object.keys(bucket.days || {})) {
    if (date < minDate) delete bucket.days[date];
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
const statsFile = readGithubJson('GitHub - Leer stats.json', { version: 2, stations: {} });
const historyFile = readGithubJson('GitHub - Leer historico diario', { date: localDate, snapshots: [] });
const latestFile = readGithubJson('GitHub - Leer latest.json', null);
const saldosDayFile = readGithubJson('GitHub - Leer saldos del día', { date: localDate, records: [] });
const crisesFile = readGithubJson('GitHub - Leer crises.json', { version: 1, crises: [] });

const catalog = catalogFile.value || { stations: seedCatalog };
const stats = statsFile.value || { version: 2, stations: {} };
const history = historyFile.value || { date: localDate, snapshots: [] };
const saldosDay = saldosDayFile.value || { date: localDate, records: [] };
const crisesConfig = crisesFile.value || { version: 1, crises: [] };
const crises = Array.isArray(crisesConfig.crises) ? crisesConfig.crises : [];

catalog.stations = Array.isArray(catalog.stations) ? catalog.stations : [];
stats.version = 2;
stats.stations = stats.stations || {};
history.date = localDate;
history.snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
saldosDay.date = localDate;
saldosDay.records = Array.isArray(saldosDay.records) ? saldosDay.records : [];

const currentDate = sourceDate(parsed.sourceMeasuredAt);
const currentHour = sourceHour(parsed.sourceMeasuredAt);
const currentIsCrisis = isCrisisDate(currentDate, crises);

const RETENTION_DAYS = 120;
const BASELINE_WINDOW_DAYS = 90;
const BASELINE_MIN_CLEAN_DAYS = 30;
const retentionStart = dateMinusDays(currentDate, RETENTION_DAYS);
const baselineStart = dateMinusDays(currentDate, BASELINE_WINDOW_DAYS);

const catalogByKey = new Map(seedCatalog.map(s => [s.key, { ...s }]));
for (const s of catalog.stations) if (s?.key) catalogByKey.set(s.key, { ...catalogByKey.get(s.key), ...s });

const now = new Date().toISOString();
for (const s of parsed.stations) {
  const previous = catalogByKey.get(s.key) || {};
  catalogByKey.set(s.key, {
    ...previous, key: s.key, name: s.name || previous.name || s.key,
    address: s.address || previous.address || null, lastSeenAt: now
  });
}

const visible = new Map(parsed.stations.map(s => [s.key, s]));
const latestByKey = new Map((latestFile.value?.stations || []).map(s => [s.key, s]));
const previousMeasuredAt = latestFile.value?.sourceMeasuredAt || null;

const prevMs = msForLocalIso(previousMeasuredAt);
const currentMs = msForLocalIso(parsed.sourceMeasuredAt);
const elapsedMs = prevMs !== null && currentMs !== null ? currentMs - prevMs : null;
const elapsedHours = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs / 3600000 : null;
const sameMeasurement = Boolean(previousMeasuredAt && parsed.sourceMeasuredAt === previousMeasuredAt);

const stationResults = [];
const pendingUpdates = [];

for (const station of [...catalogByKey.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const current = visible.get(station.key);
  const liters = current ? Number(current.liters || 0) : 0;
  const previousStation = latestByKey.get(station.key);
  const previousLiters = previousStation ? Number(previousStation.liters || 0) : null;

  let deltaLiters = null, flowLph = null, outflowLph = null, inflowLph = null;
  if (!sameMeasurement && elapsedHours && Number.isFinite(previousLiters)) {
    deltaLiters = liters - previousLiters;
    flowLph = deltaLiters / elapsedHours;
    outflowLph = flowLph < 0 ? Math.abs(flowLph) : 0;
    inflowLph = flowLph > 0 ? flowLph : 0;
  }

  const prior = stats.stations[station.key] || {};
  prior.hourly = prior.hourly || {};
  const hourKey = String(currentHour).padStart(2, '0');
  const bucket = prior.hourly[hourKey] || { days: {} };
  pruneDays(bucket, retentionStart);

  const baseline = aggregateDays(bucket.days, crises, baselineStart, currentDate);
  const baselineReady = baseline.cleanDays >= BASELINE_MIN_CLEAN_DAYS && baseline.outflowCount >= BASELINE_MIN_CLEAN_DAYS;

  const absoluteIndex = clamp(liters / 25000 * 100);

  let historicalIndex = null;
  if (baselineReady && baseline.meanLiters !== null && baseline.litersStd > 0) {
    historicalIndex = clamp(50 + 20 * ((liters - baseline.meanLiters) / baseline.litersStd));
  }

  let demandRatio = null, demandZ = null, demandIndex = null;
  if (baselineReady && Number.isFinite(outflowLph) && baseline.meanOutflow !== null && baseline.meanOutflow > 25) {
    demandRatio = outflowLph / baseline.meanOutflow;
    const ratioIndex = clamp(50 - 25 * Math.log2(Math.max(0.125, demandRatio)));
    if (baseline.outflowStd > 0) {
      demandZ = (outflowLph - baseline.meanOutflow) / baseline.outflowStd;
      const zIndex = clamp(50 - 15 * demandZ);
      demandIndex = ratioIndex * 0.65 + zIndex * 0.35;
    } else {
      demandIndex = ratioIndex;
    }
  }

  const alpha = 0.35;
  let recentOutflowEwma = Number(prior.recentOutflowEwma || 0);
  if (Number.isFinite(outflowLph)) {
    recentOutflowEwma = prior.recentOutflowUpdatedAt
      ? alpha * outflowLph + (1 - alpha) * recentOutflowEwma
      : outflowLph;
  }

  let hoursToEmpty = null;
  const drainForRunway = Math.max(recentOutflowEwma, Number(outflowLph || 0));
  if (liters <= 0) {
    hoursToEmpty = 0;
  } else if (drainForRunway > 25) {
    hoursToEmpty = liters / drainForRunway;
  }

  const runwayIndex = liters <= 0 ? 0 : (hoursToEmpty === null ? 100 : clamp(hoursToEmpty / 16 * 100));

  const components = [];
  if (demandIndex !== null) components.push({ value: demandIndex, weight: 0.45 });
  components.push({ value: runwayIndex, weight: demandIndex !== null ? 0.20 : 0.45 });
  components.push({ value: absoluteIndex, weight: demandIndex !== null ? 0.20 : 0.35 });
  if (historicalIndex !== null) components.push({ value: historicalIndex, weight: 0.15 });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  let score = totalWeight ? components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight : absoluteIndex;
  if (liters <= 0) score = 0;

  stationResults.push({
    key: station.key,
    name: station.name,
    address: current?.address || station.address || null,
    liters,
    visibleInSource: Boolean(current),
    score: round2(score),
    state: stateFor(score),
    absoluteIndex: round2(absoluteIndex),
    historicalIndex: historicalIndex === null ? null : round2(historicalIndex),
    demandIndex: demandIndex === null ? null : round2(demandIndex),
    runwayIndex: round2(runwayIndex),
    deltaLiters: deltaLiters === null ? null : round2(deltaLiters),
    flowLitersPerHour: flowLph === null ? null : round2(flowLph),
    outflowLitersPerHour: outflowLph === null ? null : round2(outflowLph),
    inflowLitersPerHour: inflowLph === null ? null : round2(inflowLph),
    recentOutflowLitersPerHour: round2(recentOutflowEwma),
    hoursToEmpty: hoursToEmpty === null ? null : round2(hoursToEmpty),
    demandRatio: demandRatio === null ? null : round2(demandRatio),
    demandZ: demandZ === null ? null : round2(demandZ),
    expectedOutflowLitersPerHour: baseline.meanOutflow === null ? null : round2(baseline.meanOutflow),
    baselineCleanDays: baseline.cleanDays,
    baselineReady,
    baselineHour: currentHour,
    inConfiguredCrisis: currentIsCrisis
  });

  if (!sameMeasurement) {
    updateDayBucket(bucket, currentDate, liters, outflowLph);
    prior.hourly[hourKey] = bucket;
    prior.recentOutflowEwma = recentOutflowEwma;
    prior.recentOutflowUpdatedAt = parsed.sourceMeasuredAt || now;
    prior.lastLiters = liters;
    prior.lastMeasuredAt = parsed.sourceMeasuredAt || now;
    prior.updatedAt = now;
    pendingUpdates.push({ key: station.key, value: prior });
  }
}

const globalScore = stationResults.length
  ? stationResults.reduce((sum, s) => sum + s.score, 0) / stationResults.length
  : 0;

const globalOutflow = stationResults.reduce((sum, s) => sum + Number(s.outflowLitersPerHour || 0), 0);
const globalInflow = stationResults.reduce((sum, s) => sum + Number(s.inflowLitersPerHour || 0), 0);
const baselineReadyStations = stationResults.filter(s => s.baselineReady).length;

const snapshot = {
  scrapedAt: now,
  sourceMeasuredAt: parsed.sourceMeasuredAt,
  baseline: {
    minimumCleanDays: BASELINE_MIN_CLEAN_DAYS,
    windowDays: BASELINE_WINDOW_DAYS,
    retentionDays: RETENTION_DAYS,
    currentDateInConfiguredCrisis: currentIsCrisis,
    configuredCrises: crises.filter(c => c && c.enabled !== false).length,
    stationsReady: baselineReadyStations,
    stationsTotal: stationResults.length
  },
  global: {
    score: round2(globalScore),
    state: stateFor(globalScore),
    totalLiters: stationResults.reduce((sum, s) => sum + s.liters, 0),
    stationsAvailable: stationResults.filter(s => s.liters > 0).length,
    stationsTotal: stationResults.length,
    outflowLitersPerHour: round2(globalOutflow),
    inflowLitersPerHour: round2(globalInflow),
    netFlowLitersPerHour: round2(globalInflow - globalOutflow)
  },
  stations: stationResults
};

const last = history.snapshots[history.snapshots.length - 1];
const isNewSnapshot = !last ||
  last.sourceMeasuredAt !== snapshot.sourceMeasuredAt ||
  last.global?.totalLiters !== snapshot.global.totalLiters;

if (isNewSnapshot) {
  history.snapshots.push(snapshot);
  for (const update of pendingUpdates) stats.stations[update.key] = update.value;

  for (const s of stationResults) {
    saldosDay.records.push({
      scrapedAt: now,
      sourceMeasuredAt: parsed.sourceMeasuredAt,
      station: s.key,
      name: s.name,
      liters: s.liters,
      visibleInSource: s.visibleInSource,
      deltaLiters: s.deltaLiters,
      flowLitersPerHour: s.flowLitersPerHour,
      outflowLitersPerHour: s.outflowLitersPerHour,
      inflowLitersPerHour: s.inflowLitersPerHour,
      demandRatio: s.demandRatio,
      hoursToEmpty: s.hoursToEmpty,
      inConfiguredCrisis: s.inConfiguredCrisis
    });
  }
}

catalog.stations = [...catalogByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
catalog.updatedAt = now;
stats.updatedAt = now;

const pretty = value => JSON.stringify(value, null, 2) + '\n';

return [{
  json: {
    catalogExists: catalogFile.exists,
    statsExists: statsFile.exists,
    historyExists: historyFile.exists,
    latestExists: latestFile.exists,
    saldosExists: saldosDayFile.exists,
    crisesExists: crisesFile.exists,

    catalogPath: `${cfg.dataRoot}/catalog.json`,
    statsPath: `${cfg.dataRoot}/stats.json`,
    historyPath: `${cfg.dataRoot}/history/${localDate}.json`,
    latestPath: `${cfg.dataRoot}/latest.json`,
    saldosPath: `${cfg.dataRoot}/saldos/${localDate}.json`,
    crisesPath: `${cfg.dataRoot}/crises.json`,

    catalogContent: pretty(catalog),
    statsContent: pretty(stats),
    historyContent: pretty(history),
    latestContent: pretty(snapshot),
    saldosContent: pretty(saldosDay),
    crisesContent: pretty(crisesConfig),

    snapshot
  }
}];
