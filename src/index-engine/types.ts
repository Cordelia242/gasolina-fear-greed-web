/**
 * Shared types for the index engine.
 *
 * This module is pure: it knows nothing about n8n (`$('Node').first().json`),
 * GitHub, BioCloud, credentials, or the filesystem. It only receives plain
 * data and returns plain data — n8n (or the recalculate script) is
 * responsible for reading/writing files and calling `calculateIndex`.
 *
 * The shapes here are a mechanical extraction of the formula that used to
 * live inline in the n8n "Construir datos e indices" Code node — this is
 * NOT a redesign, it preserves that algorithm's exact semantics so existing
 * history keeps meaning what it already means.
 */

export const FUEL_STATES = ['CRITICO', 'ESCASEZ', 'NORMAL', 'ABUNDANCIA', 'SATURADO'] as const;
export type FuelState = (typeof FUEL_STATES)[number];

export const PRESSURE_STATES = [
  'SIN_PRESION',
  'DEMANDA_BAJA',
  'EQUILIBRIO',
  'PRESION_ALTA',
  'PRESION_EXTREMA',
] as const;
export type PressureState = (typeof PRESSURE_STATES)[number] | 'BASELINE_BUILDING';

export type PressureMode = 'PROVISIONAL' | 'COMPLETE';

/** One observed record, shaped like an entry in public/data/saldos/*.json. RAW data only. */
export interface RawMeasurement {
  scrapedAt: string;
  sourceMeasuredAt: string;
  station: string;
  name: string;
  liters: number;
  visibleInSource: boolean;
  /** Catalog metadata, passed through to the result untouched. Not used in any calculation. */
  address?: string | null;
}

export interface CrisisPeriod {
  name: string;
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Inclusive, YYYY-MM-DD, or null for an open/ongoing crisis. */
  end: string | null;
  /** false means the period is not applied at all (does NOT mean "exclude"). */
  enabled: boolean;
}

export interface CrisesFile {
  version: 1;
  crises: CrisisPeriod[];
}

export interface FuelLevel {
  score: number;
  state: FuelState;
}

export interface Flow {
  deltaLiters: number | null;
  litersPerHour: number | null;
  outflowLitersPerHour: number | null;
  inflowLitersPerHour: number | null;
  recentOutflowLitersPerHour: number | null;
  hoursToEmpty: number | null;
}

export interface StationPressure {
  score: number;
  state: PressureState;
  mode: PressureMode;
  baselineReady: boolean;
  baselineCleanDays: number;
  demandScore: number | null;
  demandRatio: number | null;
  expectedOutflowLitersPerHour: number | null;
  runwayPressure: number;
}

export interface GlobalPressureComponents {
  demandPressure: number | null;
  runwayPressure: number;
  inventoryTrendPressure: number;
  inventoryTrendPctPerHour: number | null;
  stationsWithoutFuel: number;
  stationsWithoutFuelPressure: number;
  flowBalancePressure: number;
}

export interface GlobalPressure {
  score: number;
  state: PressureState;
  mode: PressureMode;
  stationsReady: number;
  stationsTotal: number;
  requiredStationsForComplete: number;
  components: GlobalPressureComponents;
}

export interface StationResult {
  key: string;
  name: string;
  address: string | null;
  liters: number;
  visibleInSource: boolean;
  fuelLevel: FuelLevel;
  pressure: StationPressure;
  flow: Flow;
  inConfiguredCrisis: boolean;
}

export interface GlobalResult {
  inventory: {
    score: number;
    state: FuelState;
    totalLiters: number;
    stationsAvailable: number;
    stationsTotal: number;
  };
  pressure: GlobalPressure;
  flow: {
    outflowLitersPerHour: number;
    inflowLitersPerHour: number;
    netFlowLitersPerHour: number;
  };
}

export interface Snapshot {
  scrapedAt: string;
  sourceMeasuredAt: string;
  baseline: {
    minimumCleanDays: number;
    windowDays: number;
    retentionDays: number;
    currentDateInConfiguredCrisis: boolean;
    configuredCrises: number;
    stationsReady: number;
    stationsTotal: number;
  };
  global: GlobalResult;
  stations: StationResult[];
}

/** One (station, hour-of-day, calendar-date) accumulator — enough to derive mean/variance without storing raw history. */
export interface DayBucket {
  outflowCount: number;
  sumOutflow: number;
  sumOutflowSq: number;
}

export interface HourBucket {
  days: Record<string, DayBucket>;
}

/** Per-station baseline accumulator state, incrementally updated one snapshot at a time. */
export interface StationBaselineState {
  hours: Record<string, HourBucket>;
  recentOutflowLph: number | null;
  updatedAt?: string;
}

export interface StatsFile {
  version: 3;
  stations: Record<string, StationBaselineState>;
  updatedAt?: string;
}

export interface BaselineAggregate {
  cleanDays: number;
  outflowCount: number;
  meanOutflow: number | null;
  outflowStd: number;
}

/** Global pressure weights. `demandPressure` is only used in COMPLETE mode. */
export interface PressureWeights {
  demandPressure: number;
  runwayPressure: number;
  inventoryTrendPressure: number;
  stationsWithoutFuelPressure: number;
  flowBalancePressure: number;
}

/** Per-station blend between its own demand-vs-baseline score and its runway (depletion) risk. */
export interface StationPressureBlend {
  demand: number;
  runway: number;
}

export interface EngineConfig {
  capacityLiters: number;
  retentionDays: number;
  baselineWindowDays: number;
  baselineMinCleanDays: number;
  /** Fraction (0-1) of stations that must be baseline-ready for the GLOBAL mode to be COMPLETE. */
  requiredStationsForCompleteRatio: number;
  /** Floor applied to `stationsTotal * requiredStationsForCompleteRatio`. */
  requiredStationsForCompleteMin: number;
  /** Smoothing factor for the recentOutflow EWMA (0-1, higher = more reactive). */
  recentOutflowAlpha: number;
  provisionalWeights: PressureWeights;
  completeWeights: PressureWeights;
  stationPressureBlend: StationPressureBlend;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  capacityLiters: 25000,
  retentionDays: 120,
  baselineWindowDays: 90,
  baselineMinCleanDays: 30,
  requiredStationsForCompleteRatio: 0.5,
  requiredStationsForCompleteMin: 3,
  recentOutflowAlpha: 0.35,
  provisionalWeights: {
    demandPressure: 0,
    runwayPressure: 0.35,
    inventoryTrendPressure: 0.3,
    stationsWithoutFuelPressure: 0.25,
    flowBalancePressure: 0.1,
  },
  completeWeights: {
    demandPressure: 0.45,
    runwayPressure: 0.2,
    inventoryTrendPressure: 0.15,
    stationsWithoutFuelPressure: 0.1,
    flowBalancePressure: 0.1,
  },
  stationPressureBlend: {
    demand: 0.75,
    runway: 0.25,
  },
};

export interface CalculateIndexInput {
  /**
   * Wall-clock timestamp to stamp the result with (`snapshot.scrapedAt`,
   * `nextStats.updatedAt`). Explicit and caller-supplied — the engine never
   * calls `Date.now()` itself, so the same input always produces the exact
   * same output (see determinism requirement).
   */
  now: string;
  /** Full station roster for this snapshot (n8n/caller merges catalog + scraped data beforehand). */
  currentMeasurements: RawMeasurement[];
  /** Same roster as of the last computed snapshot (public/data/latest.json), when available. */
  previousMeasurements?: RawMeasurement[];
  /** Baseline accumulator state going INTO this calculation (empty `{version:3,stations:{}}` on the first run). */
  priorStats: StatsFile;
  /**
   * The last entry already persisted in today's history file, used only to
   * decide `isNewSnapshot` (dedup across runs that see unchanged source
   * data). `null`/omitted means "today's history is empty" — the snapshot
   * is always new in that case.
   */
  previousHistoryEntry?: { sourceMeasuredAt: string; totalLiters: number } | null;
  crises: CrisisPeriod[];
  config?: EngineConfig;
}

export interface CalculateIndexResult {
  snapshot: Snapshot;
  /** Baseline accumulator state to persist AFTER this calculation. */
  nextStats: StatsFile;
  /** False when this snapshot is a duplicate of the previous one (same sourceMeasuredAt + totalLiters) and should not be appended to history/stats. */
  isNewSnapshot: boolean;
}
