/**
 * Recomputes public/data/history/*.json, public/data/latest.json and
 * public/data/stats.json from scratch by replaying public/data/saldos/*.json
 * (RAW) through the index engine (src/index-engine), honoring
 * public/data/crises.json.
 *
 * This is the ONLY place besides n8n's "Construir datos e indices" Code
 * node that calls calculateIndex — both call the exact same engine, so
 * there is a single source of truth for the formula.
 *
 * Usage:
 *   npm run recalculate
 *   npm run recalculate -- --from 2026-08-01 --to 2026-08-31
 *   npm run recalculate -- --dry-run
 *   npm run recalculate -- --keep-derived-in-saldos   (skip the raw-file cleanup below)
 *
 * --from / --to bound which history/*.json day-files get WRITTEN (and how
 * far replay goes for --to). Replay itself always starts from the earliest
 * available saldos file, because the baseline/stats accumulator needs
 * unbroken history to stay correct — you can't jump into the middle of a
 * running mean. latest.json and stats.json always reflect the state right
 * after the last processed snapshot (i.e. as of --to, or the very end).
 *
 * Historical public/data/saldos/*.json records may still carry legacy
 * `fuelLevel`/`pressure`/`flow` fields from before this refactor (those are
 * DERIVED and don't belong in RAW storage). By default this script also
 * rewrites saldos files to drop those fields — this is lossless (nothing
 * genuinely observed is removed) and is exactly the "raw shouldn't need
 * these to be reconstructed" migration. Pass --keep-derived-in-saldos to
 * skip that cleanup.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateIndex } from '../src/index-engine/engine.ts';
import type {
  CrisesFile,
  RawMeasurement,
  Snapshot,
  StatsFile,
} from '../src/index-engine/types.ts';

interface Args {
  from: string | null;
  to: string | null;
  dryRun: boolean;
  keepDerivedInSaldos: boolean;
  dataRoot: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { from: null, to: null, dryRun: false, keepDerivedInSaldos: false, dataRoot: 'public/data' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from') args.from = argv[++i];
    else if (arg === '--to') args.to = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--keep-derived-in-saldos') args.keepDerivedInSaldos = true;
    else if (arg === '--data-root') args.dataRoot = argv[++i];
  }
  return args;
}

interface SaldoRecordOnDisk extends RawMeasurement {
  fuelLevel?: unknown;
  pressure?: unknown;
  flow?: unknown;
}

interface SaldosFileOnDisk {
  date: string;
  records: SaldoRecordOnDisk[];
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function loadCrises(dataRoot: string): Promise<CrisesFile> {
  try {
    return await readJson<CrisesFile>(path.join(dataRoot, 'crises.json'));
  } catch {
    return { version: 1, crises: [] };
  }
}

async function loadSaldosFiles(dataRoot: string): Promise<SaldosFileOnDisk[]> {
  const dir = path.join(dataRoot, 'saldos');
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  const files = await Promise.all(names.map((n) => readJson<SaldosFileOnDisk>(path.join(dir, n))));
  return files.sort((a, b) => a.date.localeCompare(b.date));
}

interface CatalogFile {
  stations?: Array<{ key: string; address?: string | null }>;
}

/**
 * catalog.json is the only source for `address` — raw saldos records don't
 * carry it (BioCloud's address text is scraped once per station, not on
 * every reading). Read-only here: this script never writes catalog.json.
 */
async function loadAddressByStation(dataRoot: string): Promise<Map<string, string | null>> {
  try {
    const catalog = await readJson<CatalogFile>(path.join(dataRoot, 'catalog.json'));
    return new Map((catalog.stations ?? []).map((s) => [s.key, s.address ?? null]));
  } catch {
    return new Map();
  }
}

function toRawMeasurement(record: SaldoRecordOnDisk, addressByStation: Map<string, string | null>): RawMeasurement {
  return {
    scrapedAt: record.scrapedAt,
    sourceMeasuredAt: record.sourceMeasuredAt,
    station: record.station,
    name: record.name,
    liters: record.liters,
    visibleInSource: record.visibleInSource,
    address: (record as { address?: string | null }).address ?? addressByStation.get(record.station) ?? null,
  };
}

/** Groups all records across every saldos file by their sourceMeasuredAt instant, in chronological order. */
function groupSnapshots(files: SaldosFileOnDisk[]): Map<string, SaldoRecordOnDisk[]> {
  const groups = new Map<string, SaldoRecordOnDisk[]>();
  for (const file of files) {
    for (const record of file.records) {
      const key = record.sourceMeasuredAt;
      const group = groups.get(key);
      if (group) group.push(record);
      else groups.set(key, [record]);
    }
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = path.resolve(process.cwd(), args.dataRoot);

  const crisesFile = await loadCrises(dataRoot);
  const saldosFiles = await loadSaldosFiles(dataRoot);
  const addressByStation = await loadAddressByStation(dataRoot);
  const snapshotGroups = groupSnapshots(saldosFiles);

  console.log(`Replaying ${snapshotGroups.size} snapshot(s) from ${saldosFiles.length} saldos file(s)...`);

  let priorStats: StatsFile = { version: 3, stations: {} };
  let previousMeasurements: RawMeasurement[] = [];
  let latestSnapshot: Snapshot | null = null;

  const historyByDate = new Map<string, Snapshot[]>();
  let currentHistoryDate: string | null = null;
  let previousHistoryEntry: { sourceMeasuredAt: string; totalLiters: number } | null = null;

  let written = 0;
  let skippedAsDuplicate = 0;

  for (const [sourceMeasuredAt, records] of snapshotGroups) {
    if (args.to && sourceMeasuredAt.slice(0, 10) > args.to) break;

    const currentMeasurements = records.map((r) => toRawMeasurement(r, addressByStation));
    const scrapedAt = records.reduce((max, r) => (r.scrapedAt > max ? r.scrapedAt : max), records[0].scrapedAt);
    const date = sourceMeasuredAt.slice(0, 10);

    if (date !== currentHistoryDate) {
      currentHistoryDate = date;
      previousHistoryEntry = null;
    }

    const result = calculateIndex({
      now: scrapedAt,
      currentMeasurements,
      previousMeasurements,
      priorStats,
      previousHistoryEntry,
      crises: crisesFile.crises,
    });

    previousMeasurements = currentMeasurements;
    latestSnapshot = result.snapshot;

    if (!result.isNewSnapshot) {
      skippedAsDuplicate++;
      continue;
    }

    priorStats = result.nextStats;
    previousHistoryEntry = {
      sourceMeasuredAt: result.snapshot.sourceMeasuredAt,
      totalLiters: result.snapshot.global.inventory.totalLiters,
    };

    if (!args.from || date >= args.from) {
      const existing = historyByDate.get(date) ?? [];
      existing.push(result.snapshot);
      historyByDate.set(date, existing);
      written++;
    }
  }

  console.log(`${written} snapshot(s) written across ${historyByDate.size} day(s), ${skippedAsDuplicate} duplicate(s) skipped.`);

  if (args.dryRun) {
    console.log('--dry-run: no files written.');
    return;
  }

  for (const [date, snapshots] of historyByDate) {
    const filePath = path.join(dataRoot, 'history', `${date}.json`);
    await writeFile(filePath, JSON.stringify({ date, snapshots }, null, 2) + '\n');
  }

  if (latestSnapshot) {
    await writeFile(path.join(dataRoot, 'latest.json'), JSON.stringify(latestSnapshot, null, 2) + '\n');
  }

  await writeFile(path.join(dataRoot, 'stats.json'), JSON.stringify(priorStats, null, 2) + '\n');

  if (!args.keepDerivedInSaldos) {
    let cleaned = 0;
    for (const file of saldosFiles) {
      const hasDerived = file.records.some((r) => r.fuelLevel || r.pressure || r.flow);
      if (!hasDerived) continue;
      // Strip only the derived fields — keep everything else on the record byte-for-byte,
      // and do NOT inject `address` here: it wasn't part of the original observation, it's
      // a catalog.json lookup only used for display in the DERIVED snapshot output above.
      const cleanedRecords = file.records.map(({ fuelLevel, pressure, flow, ...rest }) => rest);
      const filePath = path.join(dataRoot, 'saldos', `${file.date}.json`);
      await writeFile(filePath, JSON.stringify({ date: file.date, records: cleanedRecords }, null, 2) + '\n');
      cleaned++;
    }
    if (cleaned > 0) console.log(`Stripped legacy derived fields (fuelLevel/pressure/flow) from ${cleaned} saldos file(s).`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
