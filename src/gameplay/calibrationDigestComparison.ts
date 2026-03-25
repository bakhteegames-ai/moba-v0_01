import { type CalibrationRetuningDomain } from './calibrationRetuningSuggestions';
import { clamp, cloneSnapshot } from './calibrationUtils';
import {
  type CalibrationDigestPriority,
  type CalibrationDigestResetSummary,
  type CalibrationDigestStickinessSummary,
  type CalibrationDigestSummarySnapshot,
  type CalibrationDigestTimingSummary
} from './calibrationDigestSummary';
import { type ClosureDoctrineFitVerdict } from './closureDoctrineFitEvaluator';

export type CalibrationDigestComparisonVerdict =
  | 'improved'
  | 'mixed'
  | 'unchanged'
  | 'regressed'
  | 'insufficient-signal';

interface ComparisonCategoryChange<T extends string> {
  baseline: T | 'none';
  current: T;
  changed: boolean;
}

export interface CalibrationDigestComparisonSnapshot {
  baselineAvailable: boolean;
  baselineWindowDurationSeconds: number;
  currentWindowDurationSeconds: number;
  verdict: CalibrationDigestComparisonVerdict;
  dominantDriftChange: ComparisonCategoryChange<ClosureDoctrineFitVerdict>;
  dominantCalibrationDomainChange: ComparisonCategoryChange<CalibrationRetuningDomain>;
  overallTuningPriorityChange: ComparisonCategoryChange<CalibrationDigestPriority> & {
    rankDelta: number;
  };
  escalationTimingSummaryChange: ComparisonCategoryChange<CalibrationDigestTimingSummary>;
  resetQualitySummaryChange: ComparisonCategoryChange<CalibrationDigestResetSummary>;
  closureStickinessSummaryChange: ComparisonCategoryChange<CalibrationDigestStickinessSummary>;
  recommendationStabilityDelta: number;
  confidenceBlendDelta: number;
  averageRetuningPressureDelta: number;
  comparisonScore: number;
}

export interface CalibrationDigestComparisonModel {
  update(currentDigest: CalibrationDigestSummarySnapshot): void;
  captureCurrentCalibrationBaseline(): void;
  clearCalibrationBaseline(): void;
  getSnapshot(): CalibrationDigestComparisonSnapshot;
}

interface RuntimeState {
  baseline: CalibrationDigestSummarySnapshot | null;
  current: CalibrationDigestSummarySnapshot;
}

const minimumSignalWindowSeconds = 6;
const minimumSignalSamples = 4;

export const createCalibrationDigestComparisonModel =
  (): CalibrationDigestComparisonModel => {
    const state: RuntimeState = {
      baseline: null,
      current: createEmptyDigestSnapshot()
    };

    return {
      update(currentDigest) {
        state.current = cloneSnapshot(currentDigest);
      },
      captureCurrentCalibrationBaseline() {
        state.baseline = cloneSnapshot(state.current);
      },
      clearCalibrationBaseline() {
        state.baseline = null;
      },
      getSnapshot() {
        return deriveSnapshot(state.baseline, state.current);
      }
    };
  };

const deriveSnapshot = (
  baseline: CalibrationDigestSummarySnapshot | null,
  current: CalibrationDigestSummarySnapshot
): CalibrationDigestComparisonSnapshot => {
  const baselineAvailable = baseline !== null;
  const baselineSnapshot = baseline ?? createEmptyDigestSnapshot();
  const baselineSignalSufficient =
    baselineAvailable &&
    baselineSnapshot.windowDurationSeconds >= minimumSignalWindowSeconds &&
    baselineSnapshot.sampleCount >= minimumSignalSamples;
  const currentSignalSufficient =
    current.windowDurationSeconds >= minimumSignalWindowSeconds &&
    current.sampleCount >= minimumSignalSamples;

  const dominantDriftChange = buildCategoryChange(
    baselineAvailable ? baselineSnapshot.dominantDriftOverRun : 'none',
    current.dominantDriftOverRun
  );
  const dominantCalibrationDomainChange = buildCategoryChange(
    baselineAvailable ? baselineSnapshot.dominantCalibrationDomainConsensus : 'none',
    current.dominantCalibrationDomainConsensus
  );
  const overallTuningPriorityChange = {
    ...buildCategoryChange(
      baselineAvailable ? baselineSnapshot.overallTuningPriority : 'none',
      current.overallTuningPriority
    ),
    rankDelta: baselineAvailable
      ? priorityRank(current.overallTuningPriority) -
        priorityRank(baselineSnapshot.overallTuningPriority)
      : 0
  };
  const escalationTimingSummaryChange = buildCategoryChange(
    baselineAvailable ? baselineSnapshot.escalationTimingSummary : 'none',
    current.escalationTimingSummary
  );
  const resetQualitySummaryChange = buildCategoryChange(
    baselineAvailable ? baselineSnapshot.resetQualitySummary : 'none',
    current.resetQualitySummary
  );
  const closureStickinessSummaryChange = buildCategoryChange(
    baselineAvailable ? baselineSnapshot.closureStickinessSummary : 'none',
    current.closureStickinessSummary
  );

  const recommendationStabilityDelta = baselineAvailable
    ? current.recommendationStabilityScalar - baselineSnapshot.recommendationStabilityScalar
    : 0;
  const confidenceBlendDelta = baselineAvailable
    ? current.confidenceBlend - baselineSnapshot.confidenceBlend
    : 0;
  const averageRetuningPressureDelta = baselineAvailable
    ? current.averageRetuningPressure - baselineSnapshot.averageRetuningPressure
    : 0;

  const comparisonScore =
    baselineSignalSufficient && currentSignalSufficient
      ? deriveComparisonScore(baselineSnapshot, current)
      : 0;

  return {
    baselineAvailable,
    baselineWindowDurationSeconds: baselineSnapshot.windowDurationSeconds,
    currentWindowDurationSeconds: current.windowDurationSeconds,
    verdict: deriveVerdict(
      baselineAvailable,
      baselineSignalSufficient,
      currentSignalSufficient,
      comparisonScore,
      dominantDriftChange.changed,
      dominantCalibrationDomainChange.changed,
      overallTuningPriorityChange.changed,
      escalationTimingSummaryChange.changed,
      resetQualitySummaryChange.changed,
      closureStickinessSummaryChange.changed,
      recommendationStabilityDelta,
      confidenceBlendDelta,
      averageRetuningPressureDelta
    ),
    dominantDriftChange,
    dominantCalibrationDomainChange,
    overallTuningPriorityChange,
    escalationTimingSummaryChange,
    resetQualitySummaryChange,
    closureStickinessSummaryChange,
    recommendationStabilityDelta,
    confidenceBlendDelta,
    averageRetuningPressureDelta,
    comparisonScore
  };
};

const deriveVerdict = (
  baselineAvailable: boolean,
  baselineSignalSufficient: boolean,
  currentSignalSufficient: boolean,
  comparisonScore: number,
  driftChanged: boolean,
  domainChanged: boolean,
  priorityChanged: boolean,
  timingChanged: boolean,
  resetChanged: boolean,
  stickinessChanged: boolean,
  recommendationStabilityDelta: number,
  confidenceBlendDelta: number,
  averageRetuningPressureDelta: number
): CalibrationDigestComparisonVerdict => {
  if (!baselineAvailable || !baselineSignalSufficient || !currentSignalSufficient) {
    return 'insufficient-signal';
  }

  const smallNumericDelta =
    Math.abs(recommendationStabilityDelta) < 0.03 &&
    Math.abs(confidenceBlendDelta) < 0.03 &&
    Math.abs(averageRetuningPressureDelta) < 0.03;
  const noCategoryChange =
    !driftChanged &&
    !domainChanged &&
    !priorityChanged &&
    !timingChanged &&
    !resetChanged &&
    !stickinessChanged;

  if (noCategoryChange && smallNumericDelta) {
    return 'unchanged';
  }

  if (comparisonScore >= 0.9) {
    return 'improved';
  }

  if (comparisonScore <= -0.9) {
    return 'regressed';
  }

  if (Math.abs(comparisonScore) < 0.28 && !priorityChanged && smallNumericDelta) {
    return 'unchanged';
  }

  return 'mixed';
};

const deriveComparisonScore = (
  baseline: CalibrationDigestSummarySnapshot,
  current: CalibrationDigestSummarySnapshot
): number => {
  const driftDelta =
    driftQuality(current.dominantDriftOverRun) -
    driftQuality(baseline.dominantDriftOverRun);
  const priorityDelta =
    priorityRank(baseline.overallTuningPriority) -
    priorityRank(current.overallTuningPriority);
  const timingDelta =
    timingQuality(current.escalationTimingSummary) -
    timingQuality(baseline.escalationTimingSummary);
  const resetDelta =
    resetQuality(current.resetQualitySummary) -
    resetQuality(baseline.resetQualitySummary);
  const stickinessDelta =
    stickinessQuality(current.closureStickinessSummary) -
    stickinessQuality(baseline.closureStickinessSummary);
  const stabilityDeltaNormalized = clamp(
    (current.recommendationStabilityScalar - baseline.recommendationStabilityScalar) / 0.16,
    -1,
    1
  );
  const confidenceDeltaNormalized = clamp(
    (current.confidenceBlend - baseline.confidenceBlend) / 0.16,
    -1,
    1
  );
  const pressureDeltaNormalized = clamp(
    (baseline.averageRetuningPressure - current.averageRetuningPressure) / 0.16,
    -1,
    1
  );

  return (
    driftDelta * 0.85 +
    priorityDelta * 0.9 +
    timingDelta * 0.7 +
    resetDelta * 0.55 +
    stickinessDelta * 0.6 +
    stabilityDeltaNormalized * 0.45 +
    confidenceDeltaNormalized * 0.2 +
    pressureDeltaNormalized * 0.65
  );
};

const buildCategoryChange = <T extends string>(
  baseline: T | 'none',
  current: T
): ComparisonCategoryChange<T> => ({
  baseline,
  current,
  changed: baseline !== current
});

const createEmptyDigestSnapshot = (): CalibrationDigestSummarySnapshot => ({
  windowDurationSeconds: 0,
  sampleCount: 0,
  dominantDriftOverRun: 'doctrine-fit',
  dominantCalibrationDomainConsensus: 'none',
  overallTuningPriority: 'low',
  escalationTimingSummary: 'limited-signal',
  resetQualitySummary: 'limited-signal',
  closureStickinessSummary: 'limited-signal',
  recommendationStabilityScalar: 0.42,
  confidenceBlend: 0.42,
  driftConsensusLevel: 0,
  domainConsensusLevel: 0,
  averageRetuningPressure: 0
});

const driftQuality = (verdict: ClosureDoctrineFitVerdict): number =>
  verdict === 'doctrine-fit' ? 2 : 0;

const priorityRank = (priority: CalibrationDigestPriority): number =>
  priority === 'urgent'
    ? 3
    : priority === 'high'
      ? 2
      : priority === 'medium'
        ? 1
        : 0;

const timingQuality = (summary: CalibrationDigestTimingSummary): number =>
  summary === 'healthy'
    ? 2
    : summary === 'mixed'
      ? 1
      : summary === 'limited-signal'
        ? 0
        : -1;

const resetQuality = (summary: CalibrationDigestResetSummary): number =>
  summary === 'healthy'
    ? 2
    : summary === 'mixed'
      ? 1
      : summary === 'limited-signal'
        ? 0
        : -1;

const stickinessQuality = (summary: CalibrationDigestStickinessSummary): number =>
  summary === 'healthy'
    ? 2
    : summary === 'watch'
      ? 1
      : summary === 'limited-signal'
        ? 0
        : -1;
