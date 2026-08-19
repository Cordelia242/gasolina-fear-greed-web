import type {
  BaselineAggregate,
  GlobalPressureComponents,
  PressureState,
  PressureWeights,
  StationPressureBlend,
} from './types.ts';
import { clampScore, round2 } from './fuel-level.ts';

export function pressureStateFor(score: number | null): PressureState {
  if (!Number.isFinite(score)) return 'BASELINE_BUILDING';
  const s = score as number;
  if (s <= 20) return 'SIN_PRESION';
  if (s <= 40) return 'DEMANDA_BAJA';
  if (s <= 60) return 'EQUILIBRIO';
  if (s <= 80) return 'PRESION_ALTA';
  return 'PRESION_EXTREMA';
}

export interface DemandPressure {
  score: number;
  ratio: number;
}

/**
 * Compares a station's recent outflow against ITS OWN baseline for this time
 * slot — never absolute liters/hour across stations. A small station running
 * at 5x its own normal demand scores higher here than a big station running
 * at 1.2x its normal demand, even though the big station moves far more
 * liters/hour in absolute terms.
 *
 * Blends a log-ratio score (symmetric around "at baseline") with a z-score
 * against the baseline's own spread, so a station with historically noisy
 * demand isn't flagged for swings that are normal for it.
 */
export function demandPressureScoreFor(
  recentOutflow: number | null,
  baseline: BaselineAggregate | null,
): DemandPressure | null {
  if (
    !baseline ||
    !Number.isFinite(baseline.meanOutflow) ||
    (baseline.meanOutflow as number) <= 0 ||
    !Number.isFinite(recentOutflow)
  ) {
    return null;
  }
  const meanOutflow = baseline.meanOutflow as number;
  const ratio = (recentOutflow as number) / meanOutflow;
  const ratioScore = clampScore(50 + 35 * Math.log2(Math.max(0.05, ratio)));
  let zScore = 50;
  if (baseline.outflowStd > 0) {
    zScore = clampScore(50 + 20 * (((recentOutflow as number) - meanOutflow) / baseline.outflowStd));
  }
  return { score: round2(clampScore(ratioScore * 0.75 + zScore * 0.25)), ratio: round2(ratio) };
}

/**
 * Autonomy represents RISK, not reward: little autonomy raises pressure,
 * abundant autonomy simply stops penalizing (flattens at 0, never goes
 * negative / never rewards "even more" autonomy).
 */
export function runwayPressureFor(liters: number, recentOutflow: number | null): number {
  const stock = Number(liters) || 0;
  if (stock <= 0) return 100;
  const rate = Number(recentOutflow) || 0;
  if (!(rate > 0)) return 0;
  const hours = stock / rate;
  if (hours <= 2) return 100;
  if (hours <= 4) return 100 - (hours - 2) * 7.5;
  if (hours <= 8) return 85 - (hours - 4) * 5;
  if (hours <= 12) return 65 - (hours - 8) * 5;
  if (hours <= 24) return 45 - (hours - 12) * (25 / 12);
  if (hours <= 48) return 20 - (hours - 24) * (20 / 24);
  return 0;
}

/** Per-station pressure score: blends its own demand-vs-baseline signal (COMPLETE) with its runway risk. */
export function stationPressureScoreFor(
  demand: DemandPressure | null,
  runwayPressure: number,
  blend: StationPressureBlend,
): number {
  if (!demand) return clampScore(runwayPressure);
  return round2(clampScore(demand.score * blend.demand + runwayPressure * blend.runway));
}

function weightedPressureScore(components: GlobalPressureComponents, weights: PressureWeights): number {
  const demandTerm = components.demandPressure ?? 0;
  return round2(
    clampScore(
      demandTerm * weights.demandPressure +
        components.runwayPressure * weights.runwayPressure +
        components.inventoryTrendPressure * weights.inventoryTrendPressure +
        components.stationsWithoutFuelPressure * weights.stationsWithoutFuelPressure +
        components.flowBalancePressure * weights.flowBalancePressure,
    ),
  );
}

export function provisionalPressureScoreFor(
  components: GlobalPressureComponents,
  weights: PressureWeights,
): number {
  return weightedPressureScore(components, weights);
}

export function completePressureScoreFor(components: GlobalPressureComponents, weights: PressureWeights): number {
  return weightedPressureScore(components, weights);
}
