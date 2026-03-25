import { type CalibrationRetuningDomain, type CalibrationRetuningSuggestionsSnapshot } from './calibrationRetuningSuggestions';
import { clamp } from './calibrationUtils';
import { type ClosureDoctrineFitSnapshot, type ClosureDoctrineFitVerdict } from './closureDoctrineFitEvaluator';
import { type ClosurePacingSnapshot } from './closurePacingInterpreter';
import { type ClosurePacingHealthState, type ClosurePacingWatchSnapshot } from './closurePacingWatch';
import { gameplayTuningConfig } from './gameplayTuningConfig';

type VerdictSecondsMap = Record<ClosureDoctrineFitVerdict, number>;
type DomainUrgencyMap = Record<CalibrationRetuningDomain, number>;

export type CalibrationDigestTimingSummary =
  | 'limited-signal'
  | 'healthy'
  | 'early-drift'
  | 'late-drift'
  | 'mixed';

export type CalibrationDigestResetSummary =
  | 'limited-signal'
  | 'healthy'
  | 'unstable'
  | 'mixed';

export type CalibrationDigestStickinessSummary =
  | 'limited-signal'
  | 'healthy'
  | 'watch'
  | 'problematic';

export type CalibrationDigestPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CalibrationDigestSummarySnapshot {
  windowDurationSeconds: number;
  sampleCount: number;
  dominantDriftOverRun: ClosureDoctrineFitVerdict;
  dominantCalibrationDomainConsensus: CalibrationRetuningDomain;
  overallTuningPriority: CalibrationDigestPriority;
  escalationTimingSummary: CalibrationDigestTimingSummary;
  resetQualitySummary: CalibrationDigestResetSummary;
  closureStickinessSummary: CalibrationDigestStickinessSummary;
  recommendationStabilityScalar: number;
  confidenceBlend: number;
  driftConsensusLevel: number;
  domainConsensusLevel: number;
  averageRetuningPressure: number;
}

export interface CalibrationDigestSummaryInput {
  doctrineFit: ClosureDoctrineFitSnapshot;
  pacing: ClosurePacingSnapshot;
  watch: ClosurePacingWatchSnapshot;
  retuning: CalibrationRetuningSuggestionsSnapshot;
}

export interface CalibrationDigestSummaryModel {
  update(dt: number, input: CalibrationDigestSummaryInput): void;
  reset(): void;
  getSnapshot(): CalibrationDigestSummarySnapshot;
}

interface RuntimeState {
  windowDurationSeconds: number;
  sampleCount: number;
  verdictSecondsByType: VerdictSecondsMap;
  domainUrgencyByType: DomainUrgencyMap;
  dominantDomainSwitchCount: number;
  verdictSwitchCount: number;
  previousDominantDomain: CalibrationRetuningDomain;
  previousVerdict: ClosureDoctrineFitVerdict;
  averageRetuningPressureAccumulator: number;
  confidenceBlendAccumulator: number;
  recommendationCountAccumulator: number;
  timingSummarySeconds: Record<CalibrationDigestTimingSummary, number>;
  resetSummarySeconds: Record<CalibrationDigestResetSummary, number>;
  stickinessSummarySeconds: Record<CalibrationDigestStickinessSummary, number>;
}

const doctrineVerdicts: ClosureDoctrineFitVerdict[] = [
  'doctrine-fit',
  'early-siege-bias',
  'late-closure-drag',
  'unstable-reset-cadence',
  'anti-stall-overhang'
];

const calibrationDomains: CalibrationRetuningDomain[] = [
  'none',
  'early-escalation',
  'closure-timing',
  'reset-cadence',
  'anti-stall-dwell'
];

const timingSummaryTypes: CalibrationDigestTimingSummary[] = [
  'limited-signal',
  'healthy',
  'early-drift',
  'late-drift',
  'mixed'
];

const resetSummaryTypes: CalibrationDigestResetSummary[] = [
  'limited-signal',
  'healthy',
  'unstable',
  'mixed'
];

const stickinessSummaryTypes: CalibrationDigestStickinessSummary[] = [
  'limited-signal',
  'healthy',
  'watch',
  'problematic'
];

const { scalarMin, scalarMax } = gameplayTuningConfig.calibrationScalars;

export const createCalibrationDigestSummaryModel =
  (): CalibrationDigestSummaryModel => {
    const state = createInitialState();

    return {
      update(dt, input) {
        if (dt <= 0) {
          return;
        }

        state.windowDurationSeconds += dt;
        state.sampleCount += 1;
        state.verdictSecondsByType[input.doctrineFit.verdict] += dt;
        state.averageRetuningPressureAccumulator += input.retuning.overallRetuningPressure * dt;
        state.confidenceBlendAccumulator += input.retuning.suggestionConfidenceBlend * dt;
        state.recommendationCountAccumulator += input.retuning.recommendationCount * dt;

        for (const domain of calibrationDomains) {
          if (domain === 'none') {
            continue;
          }

          state.domainUrgencyByType[domain] += getDomainUrgency(input.retuning, domain) * dt;
        }

        const timingSummary = deriveTimingSummary(
          state.windowDurationSeconds,
          input.watch,
          input.pacing
        );
        const resetSummary = deriveResetSummary(state.windowDurationSeconds, input.doctrineFit, input.watch);
        const stickinessSummary = deriveStickinessSummary(
          state.windowDurationSeconds,
          input.doctrineFit,
          input.watch,
          input.pacing
        );
        state.timingSummarySeconds[timingSummary] += dt;
        state.resetSummarySeconds[resetSummary] += dt;
        state.stickinessSummarySeconds[stickinessSummary] += dt;

        const dominantDomain = input.retuning.dominantCalibrationDomain;
        if (dominantDomain !== state.previousDominantDomain) {
          state.dominantDomainSwitchCount += 1;
          state.previousDominantDomain = dominantDomain;
        }

        if (input.doctrineFit.verdict !== state.previousVerdict) {
          state.verdictSwitchCount += 1;
          state.previousVerdict = input.doctrineFit.verdict;
        }
      },
      reset() {
        const next = createInitialState();
        Object.assign(state, next);
      },
      getSnapshot() {
        return deriveSnapshot(state);
      }
    };
  };

const createInitialState = (): RuntimeState => ({
  windowDurationSeconds: 0,
  sampleCount: 0,
  verdictSecondsByType: {
    'doctrine-fit': 0,
    'early-siege-bias': 0,
    'late-closure-drag': 0,
    'unstable-reset-cadence': 0,
    'anti-stall-overhang': 0
  },
  domainUrgencyByType: {
    none: 0,
    'early-escalation': 0,
    'closure-timing': 0,
    'reset-cadence': 0,
    'anti-stall-dwell': 0
  },
  dominantDomainSwitchCount: 0,
  verdictSwitchCount: 0,
  previousDominantDomain: 'none',
  previousVerdict: 'doctrine-fit',
  averageRetuningPressureAccumulator: 0,
  confidenceBlendAccumulator: 0,
  recommendationCountAccumulator: 0,
  timingSummarySeconds: createSummaryMap(timingSummaryTypes),
  resetSummarySeconds: createSummaryMap(resetSummaryTypes),
  stickinessSummarySeconds: createSummaryMap(stickinessSummaryTypes)
});

const deriveSnapshot = (
  state: RuntimeState
): CalibrationDigestSummarySnapshot => {
  const windowSeconds = Math.max(0, state.windowDurationSeconds);
  const dominantDriftOverRun = getDominantKey(state.verdictSecondsByType, doctrineVerdicts, 'doctrine-fit');
  const totalDomainUrgency = calibrationDomains
    .filter((domain) => domain !== 'none')
    .reduce((sum, domain) => sum + state.domainUrgencyByType[domain], 0);
  const dominantCalibrationDomainConsensus =
    totalDomainUrgency > 0.001
      ? getDominantKey(
          state.domainUrgencyByType,
          calibrationDomains.filter((domain) => domain !== 'none'),
          'none'
        )
      : 'none';
  const driftConsensusLevel =
    windowSeconds > 0
      ? state.verdictSecondsByType[dominantDriftOverRun] / windowSeconds
      : 0;
  const domainConsensusLevel =
    dominantCalibrationDomainConsensus !== 'none' && totalDomainUrgency > 0
      ? state.domainUrgencyByType[dominantCalibrationDomainConsensus] / totalDomainUrgency
      : 0;
  const averageRetuningPressure =
    windowSeconds > 0
      ? state.averageRetuningPressureAccumulator / windowSeconds
      : 0;
  const confidenceBlend =
    windowSeconds > 0
      ? state.confidenceBlendAccumulator / windowSeconds
      : 0.42;
  const averageRecommendationCount =
    windowSeconds > 0
      ? state.recommendationCountAccumulator / windowSeconds
      : 0;
  const recommendationStabilityScalar = deriveRecommendationStability(
    state,
    averageRecommendationCount
  );

  return {
    windowDurationSeconds: windowSeconds,
    sampleCount: state.sampleCount,
    dominantDriftOverRun,
    dominantCalibrationDomainConsensus,
    overallTuningPriority: deriveTuningPriority(
      averageRetuningPressure,
      driftConsensusLevel,
      domainConsensusLevel
    ),
    escalationTimingSummary: getDominantKey(
      state.timingSummarySeconds,
      timingSummaryTypes,
      'limited-signal'
    ),
    resetQualitySummary: getDominantKey(
      state.resetSummarySeconds,
      resetSummaryTypes,
      'limited-signal'
    ),
    closureStickinessSummary: getDominantKey(
      state.stickinessSummarySeconds,
      stickinessSummaryTypes,
      'limited-signal'
    ),
    recommendationStabilityScalar,
    confidenceBlend,
    driftConsensusLevel,
    domainConsensusLevel,
    averageRetuningPressure
  };
};

const deriveTimingSummary = (
  windowDurationSeconds: number,
  watch: ClosurePacingWatchSnapshot,
  pacing: ClosurePacingSnapshot
): CalibrationDigestTimingSummary => {
  if (windowDurationSeconds < 6) {
    return 'limited-signal';
  }

  if (watch.healthState === 'early-escalation') {
    return 'early-drift';
  }

  if (watch.healthState === 'late-escalation') {
    return 'late-drift';
  }

  const timingQuality = normalizeQualityScalar(watch.calibration.escalationTimingScalar);
  if (timingQuality >= 0.58) {
    return 'healthy';
  }

  if (
    pacing.state === 'closure-readiness' ||
    pacing.state === 'accelerated-closure-window'
  ) {
    return watch.healthState === 'healthy-progression'
      ? 'healthy'
      : 'mixed';
  }

  return 'mixed';
};

const deriveResetSummary = (
  windowDurationSeconds: number,
  doctrineFit: ClosureDoctrineFitSnapshot,
  watch: ClosurePacingWatchSnapshot
): CalibrationDigestResetSummary => {
  if (windowDurationSeconds < 6) {
    return 'limited-signal';
  }

  const resetQuality = normalizeQualityScalar(watch.calibration.defenderResetQualityScalar);
  if (
    watch.healthState === 'premature-reset' ||
    doctrineFit.verdict === 'unstable-reset-cadence' ||
    doctrineFit.resetCadenceRiskLevel >= 0.52
  ) {
    return 'unstable';
  }

  if (resetQuality >= 0.58 && doctrineFit.resetCadenceRiskLevel <= 0.28) {
    return 'healthy';
  }

  return 'mixed';
};

const deriveStickinessSummary = (
  windowDurationSeconds: number,
  doctrineFit: ClosureDoctrineFitSnapshot,
  watch: ClosurePacingWatchSnapshot,
  pacing: ClosurePacingSnapshot
): CalibrationDigestStickinessSummary => {
  if (windowDurationSeconds < 6) {
    return 'limited-signal';
  }

  if (
    watch.healthState === 'sticky-anti-stall' ||
    watch.healthState === 'sticky-closure-window' ||
    watch.healthState === 'prolonged-readiness' ||
    doctrineFit.antiStallOverhangLevel >= 0.54
  ) {
    return 'problematic';
  }

  if (
    (pacing.state === 'closure-readiness' &&
      watch.currentStateDwellSeconds >= 10) ||
    (pacing.state === 'accelerated-closure-window' &&
      watch.currentStateDwellSeconds >= 8)
  ) {
    return 'watch';
  }

  if (
    doctrineFit.antiStallOverhangLevel >= 0.3 ||
    watch.stickyAntiStallEvents > 0 ||
    watch.stickyClosureWindowEvents > 0 ||
    watch.prolongedReadinessEvents > 0
  ) {
    return 'watch';
  }

  return 'healthy';
};

const deriveRecommendationStability = (
  state: RuntimeState,
  averageRecommendationCount: number
): number => {
  if (state.windowDurationSeconds <= 0) {
    return 0.42;
  }

  const domainSwitchDensity =
    state.dominantDomainSwitchCount / Math.max(1, state.windowDurationSeconds / 8);
  const verdictSwitchDensity =
    state.verdictSwitchCount / Math.max(1, state.windowDurationSeconds / 10);
  const activePressure = clamp(averageRecommendationCount / 2.5, 0, 1);

  return clamp(
    1 -
      domainSwitchDensity * 0.22 -
      verdictSwitchDensity * 0.18 -
      activePressure * 0.06,
    0,
    1
  );
};

const deriveTuningPriority = (
  averageRetuningPressure: number,
  driftConsensusLevel: number,
  domainConsensusLevel: number
): CalibrationDigestPriority => {
  const pressure = clamp(
    averageRetuningPressure * 0.56 +
      driftConsensusLevel * 0.22 +
      domainConsensusLevel * 0.22,
    0,
    1
  );

  if (pressure >= 0.72) {
    return 'urgent';
  }

  if (pressure >= 0.5) {
    return 'high';
  }

  if (pressure >= 0.28) {
    return 'medium';
  }

  return 'low';
};

const getDomainUrgency = (
  retuning: CalibrationRetuningSuggestionsSnapshot,
  domain: Exclude<CalibrationRetuningDomain, 'none'>
): number =>
  domain === 'early-escalation'
    ? retuning.suggestions.earlyEscalation.urgency
    : domain === 'closure-timing'
      ? retuning.suggestions.closureTiming.urgency
      : domain === 'reset-cadence'
        ? retuning.suggestions.resetCadence.urgency
        : retuning.suggestions.antiStallDwell.urgency;

const createSummaryMap = <T extends string>(keys: readonly T[]): Record<T, number> =>
  keys.reduce((map, key) => {
    map[key] = 0;
    return map;
  }, {} as Record<T, number>);

const getDominantKey = <T extends string>(
  map: Record<T, number>,
  keys: readonly T[],
  fallback: T
): T => {
  let bestKey = fallback;
  let bestValue = map[fallback] ?? -1;

  for (const key of keys) {
    const value = map[key] ?? 0;
    if (value > bestValue) {
      bestKey = key;
      bestValue = value;
    }
  }

  return bestKey;
};

const normalizeQualityScalar = (scalar: number): number =>
  clamp((scalar - scalarMin) / Math.max(0.001, scalarMax - scalarMin), 0, 1);
