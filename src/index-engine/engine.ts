import {
  DEFAULT_ENGINE_CONFIG,
  type CalculateIndexInput,
  type CalculateIndexResult,
  type EngineConfig,
  type GlobalPressureComponents,
  type HourBucket,
  type Snapshot,
  type StationBaselineState,
  type StationResult,
  type StatsFile,
} from './types.ts';
import { clampScore, fuelLevelFor, fuelStateFor, round2 } from './fuel-level.ts';
import { dateMinusDays, isCrisisDate, sourceDate, sourceHour } from './crises.ts';
import { aggregateDays, pruneDays, updateDayBucket } from './baseline.ts';
import { buildFlowResult, computeFlow, elapsedHoursBetween, updateRecentOutflow } from './flow.ts';
import {
  completePressureScoreFor,
  demandPressureScoreFor,
  pressureStateFor,
  provisionalPressureScoreFor,
  runwayPressureFor,
  stationPressureScoreFor,
} from './pressure.ts';

function emptyStationBaselineState(): StationBaselineState {
  return { hours: {}, recentOutflowLph: null };
}

export function calculateIndex(input: CalculateIndexInput): CalculateIndexResult {
  const config: EngineConfig = input.config ?? DEFAULT_ENGINE_CONFIG;
  const { currentMeasurements, crises, priorStats } = input;
  const previousMeasurements = input.previousMeasurements ?? [];
  const previousByKey = new Map(previousMeasurements.map((m) => [m.station, m] as const));

  const scrapedAt = input.now;
  const sourceMeasuredAt =
    currentMeasurements.find((m) => m.sourceMeasuredAt)?.sourceMeasuredAt ?? scrapedAt;
  const previousSourceMeasuredAt = previousMeasurements[0]?.sourceMeasuredAt ?? null;

  const currentDate = sourceDate(sourceMeasuredAt, sourceMeasuredAt.slice(0, 10));
  const currentHour = sourceHour(sourceMeasuredAt);
  const previousDate = sourceDate(previousSourceMeasuredAt, currentDate);
  const currentIsCrisis = isCrisisDate(currentDate, crises);

  const retentionStart = dateMinusDays(currentDate, config.retentionDays);
  const baselineStart = dateMinusDays(currentDate, config.baselineWindowDays);

  const sameMeasurement = Boolean(previousSourceMeasuredAt && sourceMeasuredAt === previousSourceMeasuredAt);
  const elapsedHours = elapsedHoursBetween(previousSourceMeasuredAt, sourceMeasuredAt);

  const nextStationsStats: Record<string, StationBaselineState> = { ...priorStats.stations };
  const stationResults: StationResult[] = [];

  const sorted = [...currentMeasurements].sort((a, b) => a.name.localeCompare(b.name));

  for (const station of sorted) {
    const liters = Number(station.liters) || 0;
    const fuelLevel = fuelLevelFor(liters, config.capacityLiters);
    const previousStation = previousByKey.get(station.station);
    const previousLiters = previousStation ? Number(previousStation.liters) || 0 : null;

    const point = computeFlow({ liters, previousLiters, elapsedHours, sameMeasurement });

    const prior = priorStats.stations[station.station] ?? emptyStationBaselineState();
    const bucket: HourBucket = pruneDays(prior.hours[String(currentHour)] ?? { days: {} }, retentionStart);
    const baseline = aggregateDays(bucket.days, crises, baselineStart);
    const baselineReady =
      baseline.cleanDays >= config.baselineMinCleanDays &&
      baseline.outflowCount > 0 &&
      Number(baseline.meanOutflow) > 0;

    const recentOutflow = updateRecentOutflow(prior.recentOutflowLph, point.outflowLitersPerHour, config.recentOutflowAlpha);

    const demandCalc = baselineReady ? demandPressureScoreFor(recentOutflow, baseline) : null;
    const runwayPressure = clampScore(runwayPressureFor(liters, recentOutflow));
    const stationScore = stationPressureScoreFor(demandCalc, runwayPressure, config.stationPressureBlend);

    const flow = buildFlowResult(point, liters, recentOutflow);

    stationResults.push({
      key: station.station,
      name: station.name,
      address: station.address ?? null,
      liters,
      visibleInSource: station.visibleInSource,
      fuelLevel,
      flow,
      pressure: {
        score: round2(stationScore),
        state: pressureStateFor(stationScore),
        mode: demandCalc ? 'COMPLETE' : 'PROVISIONAL',
        baselineReady,
        baselineCleanDays: baseline.cleanDays,
        demandScore: demandCalc ? round2(demandCalc.score) : null,
        demandRatio: demandCalc ? round2(demandCalc.ratio) : null,
        expectedOutflowLitersPerHour: baselineReady ? round2(baseline.meanOutflow as number) : null,
        runwayPressure: round2(runwayPressure),
      },
      inConfiguredCrisis: currentIsCrisis,
    });

    if (!sameMeasurement) {
      const updatedBucket =
        previousDate === currentDate && point.outflowLitersPerHour !== null && point.outflowLitersPerHour > 0
          ? updateDayBucket(bucket, currentDate, point.outflowLitersPerHour)
          : bucket;
      nextStationsStats[station.station] = {
        hours: { ...prior.hours, [String(currentHour)]: updatedBucket },
        recentOutflowLph: recentOutflow,
        updatedAt: scrapedAt,
      };
    }
  }

  const totalLiters = stationResults.reduce((sum, s) => sum + s.liters, 0);
  const inventoryScore = stationResults.length
    ? stationResults.reduce((sum, s) => sum + s.fuelLevel.score, 0) / stationResults.length
    : 0;
  const globalFlow = stationResults.reduce(
    (acc, s) => {
      acc.out += s.flow.outflowLitersPerHour || 0;
      acc.in += s.flow.inflowLitersPerHour || 0;
      return acc;
    },
    { out: 0, in: 0 },
  );
  const stationsWithoutFuel = stationResults.filter((s) => s.liters <= 0).length;
  const stationsWithoutFuelPressure = stationResults.length
    ? (stationsWithoutFuel / stationResults.length) * 100
    : 0;
  const globalRunwayPressure = stationResults.length
    ? stationResults.reduce((sum, s) => sum + (s.pressure.runwayPressure || 0), 0) / stationResults.length
    : 0;

  const previousGlobalLiters = previousMeasurements.length
    ? previousMeasurements.reduce((sum, m) => sum + (Number(m.liters) || 0), 0)
    : NaN;
  let inventoryTrendPctPerHour: number | null = null;
  let inventoryTrendPressure = 0;
  if (!sameMeasurement && elapsedHours && previousGlobalLiters > 0) {
    inventoryTrendPctPerHour = (((totalLiters - previousGlobalLiters) / previousGlobalLiters) * 100) / elapsedHours;
    inventoryTrendPressure =
      inventoryTrendPctPerHour < 0 ? clampScore((-inventoryTrendPctPerHour / 5) * 100) : 0;
  }

  const flowBalancePressure = globalFlow.out > 0 ? clampScore(((globalFlow.out - globalFlow.in) / globalFlow.out) * 100) : 0;

  const completeStations = stationResults.filter(
    (s) => s.pressure.mode === 'COMPLETE' && Number.isFinite(s.pressure.demandScore),
  );
  const requiredStationsForComplete = Math.max(
    config.requiredStationsForCompleteMin,
    Math.ceil(stationResults.length * config.requiredStationsForCompleteRatio),
  );
  const globalMode = completeStations.length >= requiredStationsForComplete ? 'COMPLETE' : 'PROVISIONAL';
  const demandPressure = completeStations.length
    ? completeStations.reduce((sum, s) => sum + (s.pressure.demandScore as number), 0) / completeStations.length
    : null;

  const components: GlobalPressureComponents = {
    demandPressure: demandPressure === null ? null : round2(demandPressure),
    runwayPressure: round2(globalRunwayPressure),
    inventoryTrendPressure: round2(inventoryTrendPressure),
    inventoryTrendPctPerHour: inventoryTrendPctPerHour === null ? null : round2(inventoryTrendPctPerHour),
    stationsWithoutFuel,
    stationsWithoutFuelPressure: round2(stationsWithoutFuelPressure),
    flowBalancePressure: round2(flowBalancePressure),
  };

  const weights = globalMode === 'COMPLETE' ? config.completeWeights : config.provisionalWeights;
  const pressureScore =
    globalMode === 'COMPLETE' ? completePressureScoreFor(components, weights) : provisionalPressureScoreFor(components, weights);

  const snapshot: Snapshot = {
    scrapedAt,
    sourceMeasuredAt,
    baseline: {
      minimumCleanDays: config.baselineMinCleanDays,
      windowDays: config.baselineWindowDays,
      retentionDays: config.retentionDays,
      currentDateInConfiguredCrisis: currentIsCrisis,
      configuredCrises: crises.filter((c) => c && c.enabled !== false && c.start).length,
      stationsReady: completeStations.length,
      stationsTotal: stationResults.length,
    },
    global: {
      inventory: {
        score: round2(inventoryScore),
        state: fuelStateFor(inventoryScore),
        totalLiters,
        stationsAvailable: stationResults.filter((s) => s.liters > 0).length,
        stationsTotal: stationResults.length,
      },
      pressure: {
        score: round2(pressureScore),
        state: pressureStateFor(pressureScore),
        mode: globalMode,
        stationsReady: completeStations.length,
        stationsTotal: stationResults.length,
        requiredStationsForComplete,
        components,
      },
      flow: {
        outflowLitersPerHour: round2(globalFlow.out),
        inflowLitersPerHour: round2(globalFlow.in),
        netFlowLitersPerHour: round2(globalFlow.in - globalFlow.out),
      },
    },
    stations: stationResults,
  };

  const previousHistoryEntry = input.previousHistoryEntry ?? null;
  const isNewSnapshot =
    !previousHistoryEntry ||
    previousHistoryEntry.sourceMeasuredAt !== snapshot.sourceMeasuredAt ||
    previousHistoryEntry.totalLiters !== snapshot.global.inventory.totalLiters;

  const nextStats: StatsFile = {
    version: 3,
    stations: nextStationsStats,
    updatedAt: scrapedAt,
  };

  return {
    snapshot,
    nextStats: isNewSnapshot ? nextStats : priorStats,
    isNewSnapshot,
  };
}
