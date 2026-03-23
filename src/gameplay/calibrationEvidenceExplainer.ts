import {
  type CalibrationRetuningSuggestionsSnapshot
} from './calibrationRetuningSuggestions';
import {
  type CalibrationDigestComparisonSnapshot,
  type CalibrationDigestComparisonVerdict
} from './calibrationDigestComparison';
import { type CalibrationDigestSummarySnapshot } from './calibrationDigestSummary';
import { type ClosureDoctrineFitSnapshot } from './closureDoctrineFitEvaluator';

export type CalibrationEvidenceDriverId =
  | 'early-escalation-pressure'
  | 'late-closure-drag-pressure'
  | 'unstable-reset-cadence-pressure'
  | 'anti-stall-dwell-pressure'
  | 'closure-stickiness-pressure'
  | 'dominant-doctrine-drift-instability'
  | 'dominant-calibration-domain-instability'
  | 'recommendation-instability'
  | 'weak-confidence-blend'
  | 'elevated-average-retuning-pressure'
  | 'prolonged-insufficient-signal'
  | 'stable-doctrine-fit'
  | 'healthy-escalation-timing'
  | 'healthy-reset-quality'
  | 'stable-calibration-domain'
  | 'stable-recommendations'
  | 'strong-confidence-blend';

export type CalibrationEvidenceDriverDirection =
  | 'positive'
  | 'negative'
  | 'neutral';

export interface CalibrationEvidenceDriver {
  id: CalibrationEvidenceDriverId;
  direction: CalibrationEvidenceDriverDirection;
  weight: number;
  shortLabel: string;
  shortReason: string;
}

export interface CalibrationEvidenceExplainerSnapshot {
  topEvidenceDrivers: CalibrationEvidenceDriver[];
  topPositiveDrivers: CalibrationEvidenceDriver[];
  topNegativeDrivers: CalibrationEvidenceDriver[];
  primaryExplanation: string;
  secondaryExplanation: string;
  explanationConfidence: number;
  evidencePressureScore: number;
  evidenceSignalSufficient: boolean;
}

export interface CalibrationEvidenceExplainerInput {
  doctrineFit: ClosureDoctrineFitSnapshot;
  retuning: CalibrationRetuningSuggestionsSnapshot;
  digest: CalibrationDigestSummarySnapshot;
  comparison: CalibrationDigestComparisonSnapshot;
}

export interface CalibrationEvidenceExplainerModel {
  update(dt: number, input: CalibrationEvidenceExplainerInput): void;
  reset(): void;
  getSnapshot(): CalibrationEvidenceExplainerSnapshot;
}

type DriverWeightMap = Record<CalibrationEvidenceDriverId, number>;
type DriverDraftMap = Record<CalibrationEvidenceDriverId, CalibrationEvidenceDriver>;

interface RuntimeState {
  weightsByDriver: DriverWeightMap;
  snapshot: CalibrationEvidenceExplainerSnapshot;
}

const driverIds: CalibrationEvidenceDriverId[] = [
  'early-escalation-pressure',
  'late-closure-drag-pressure',
  'unstable-reset-cadence-pressure',
  'anti-stall-dwell-pressure',
  'closure-stickiness-pressure',
  'dominant-doctrine-drift-instability',
  'dominant-calibration-domain-instability',
  'recommendation-instability',
  'weak-confidence-blend',
  'elevated-average-retuning-pressure',
  'prolonged-insufficient-signal',
  'stable-doctrine-fit',
  'healthy-escalation-timing',
  'healthy-reset-quality',
  'stable-calibration-domain',
  'stable-recommendations',
  'strong-confidence-blend'
];

const minimumSignalWindowSeconds = 6;
const minimumSignalSamples = 4;
const minimumDriverWeight = 0.18;
const topDriverLimit = 4;
const topPositiveLimit = 3;
const topNegativeLimit = 3;

export const createCalibrationEvidenceExplainerModel =
  (): CalibrationEvidenceExplainerModel => {
    const state: RuntimeState = {
      weightsByDriver: createWeightMap(0),
      snapshot: createDefaultSnapshot()
    };

    return {
      update(dt, input) {
        const drafts = buildDriverDrafts(input);
        const blend = dt <= 0 ? 1 : clamp(dt * 0.86, 0.08, 1);

        for (const id of driverIds) {
          state.weightsByDriver[id] = approach(
            state.weightsByDriver[id],
            drafts[id].weight,
            blend
          );
        }

        const drivers = driverIds.map((id) => ({
          ...drafts[id],
          weight: state.weightsByDriver[id]
        }));
        const topPositiveDrivers = selectTopDrivers(
          drivers,
          'positive',
          topPositiveLimit
        );
        const topNegativeDrivers = selectTopDrivers(
          drivers,
          'negative',
          topNegativeLimit
        );
        const topEvidenceDrivers = selectTopEvidenceDrivers(
          drivers,
          input.comparison.verdict
        );
        const evidencePressureScore = deriveEvidencePressureScore(topNegativeDrivers);
        const evidenceSignalSufficient = deriveEvidenceSignalSufficient(input);
        const explanationConfidence = deriveExplanationConfidence(
          input,
          topEvidenceDrivers,
          evidenceSignalSufficient
        );
        const explanation = deriveExplanation(
          input,
          topPositiveDrivers,
          topNegativeDrivers,
          evidenceSignalSufficient
        );

        state.snapshot = {
          topEvidenceDrivers,
          topPositiveDrivers,
          topNegativeDrivers,
          primaryExplanation: explanation.primaryExplanation,
          secondaryExplanation: explanation.secondaryExplanation,
          explanationConfidence,
          evidencePressureScore,
          evidenceSignalSufficient
        };
      },
      reset() {
        state.weightsByDriver = createWeightMap(0);
        state.snapshot = createDefaultSnapshot();
      },
      getSnapshot() {
        return cloneSnapshot(state.snapshot);
      }
    };
  };

const buildDriverDrafts = (
  input: CalibrationEvidenceExplainerInput
): DriverDraftMap => {
  const currentSignalGap = deriveCurrentSignalGap(input);
  const currentSignalReady = deriveCurrentSignalReady(input.digest);
  const comparisonSignalReady =
    input.comparison.baselineAvailable &&
    input.comparison.baselineWindowDurationSeconds >= minimumSignalWindowSeconds &&
    currentSignalReady;
  const earlyEscalationPressure = clamp(
    input.retuning.suggestions.earlyEscalation.direction === 'decrease' ||
      input.doctrineFit.verdict === 'early-siege-bias'
      ? input.doctrineFit.earlySiegeBiasLevel * 0.74 +
          input.retuning.suggestions.earlyEscalation.urgency * 0.26
      : input.doctrineFit.earlySiegeBiasLevel * 0.28,
    0,
    1
  );
  const lateClosureDragPressure = clamp(
    input.retuning.suggestions.closureTiming.direction === 'shorten' ||
      input.doctrineFit.verdict === 'late-closure-drag'
      ? input.doctrineFit.lateClosureDragLevel * 0.72 +
          input.retuning.suggestions.closureTiming.urgency * 0.28
      : input.doctrineFit.lateClosureDragLevel * 0.3,
    0,
    1
  );
  const unstableResetCadencePressure = clamp(
    input.retuning.suggestions.resetCadence.direction === 'stabilize' ||
      input.doctrineFit.verdict === 'unstable-reset-cadence'
      ? input.doctrineFit.resetCadenceRiskLevel * 0.7 +
          input.retuning.suggestions.resetCadence.urgency * 0.3
      : input.doctrineFit.resetCadenceRiskLevel * 0.32,
    0,
    1
  );
  const antiStallDwellPressure = clamp(
    input.retuning.suggestions.antiStallDwell.direction === 'shorten' ||
      input.doctrineFit.verdict === 'anti-stall-overhang'
      ? input.doctrineFit.antiStallOverhangLevel * 0.72 +
          input.retuning.suggestions.antiStallDwell.urgency * 0.28
      : input.doctrineFit.antiStallOverhangLevel * 0.34,
    0,
    1
  );
  const closureStickinessPressure = clamp(
    stickinessSummaryWeight(input.digest.closureStickinessSummary) * 0.7 +
      summaryChangePenalty(
        input.comparison.closureStickinessSummaryChange.changed,
        input.comparison.closureStickinessSummaryChange.current === 'problematic'
      ) *
        0.2 +
      input.doctrineFit.antiStallOverhangLevel * 0.1,
    0,
    1
  );
  const doctrineDriftInstability = clamp(
    doctrineDriftWeight(input.digest.dominantDriftOverRun) * 0.52 +
      (1 - input.digest.driftConsensusLevel) * 0.28 +
      (input.comparison.dominantDriftChange.changed ? 0.2 : 0.04),
    0,
    1
  );
  const calibrationDomainInstability = clamp(
    domainInstabilityBase(input) * 0.56 +
      (1 - input.digest.domainConsensusLevel) * 0.24 +
      (input.comparison.dominantCalibrationDomainChange.changed ? 0.2 : 0.05),
    0,
    1
  );
  const recommendationInstability = clamp(
    1 - input.digest.recommendationStabilityScalar,
    0,
    1
  );
  const weakConfidenceBlend = clamp(1 - input.digest.confidenceBlend, 0, 1);
  const elevatedRetuningPressure = clamp(input.digest.averageRetuningPressure, 0, 1);
  const prolongedInsufficientSignal = clamp(
    currentSignalGap.weight * 0.64 +
      (comparisonSignalReady ? 0 : 0.14) +
      (input.comparison.verdict === 'insufficient-signal' ? 0.22 : 0),
    0,
    1
  );

  const stableDoctrineFit = clamp(
    input.doctrineFit.doctrineFitLevel * 0.48 +
      (input.digest.dominantDriftOverRun === 'doctrine-fit' ? 0.24 : 0.06) +
      input.digest.driftConsensusLevel * 0.18 +
      (input.comparison.verdict === 'improved' ? 0.1 : 0),
    0,
    1
  );
  const healthyEscalationTiming = clamp(
    timingSummaryWeight(input.digest.escalationTimingSummary) * 0.72 +
      (input.comparison.escalationTimingSummaryChange.current === 'healthy' ? 0.12 : 0) +
      (1 - input.doctrineFit.earlySiegeBiasLevel) * 0.08 +
      (1 - input.doctrineFit.lateClosureDragLevel) * 0.08,
    0,
    1
  );
  const healthyResetQuality = clamp(
    resetSummaryWeight(input.digest.resetQualitySummary) * 0.72 +
      (1 - input.doctrineFit.resetCadenceRiskLevel) * 0.18 +
      (input.comparison.resetQualitySummaryChange.current === 'healthy' ? 0.1 : 0),
    0,
    1
  );
  const stableCalibrationDomain = clamp(
    (input.digest.dominantCalibrationDomainConsensus === 'none' ? 0.26 : 0.1) +
      input.digest.domainConsensusLevel * 0.44 +
      (input.comparison.dominantCalibrationDomainChange.changed ? 0.02 : 0.16) +
      (1 - input.digest.averageRetuningPressure) * 0.12,
    0,
    1
  );
  const stableRecommendations = clamp(
    input.digest.recommendationStabilityScalar * 0.82 +
      (input.comparison.recommendationStabilityDelta > 0 ? 0.08 : 0),
    0,
    1
  );
  const strongConfidenceBlend = clamp(
    input.digest.confidenceBlend * 0.84 +
      (input.comparison.confidenceBlendDelta > 0 ? 0.08 : 0),
    0,
    1
  );

  return {
    'early-escalation-pressure': createDriver(
      'early-escalation-pressure',
      'negative',
      earlyEscalationPressure,
      'Early Escalation',
      input.doctrineFit.verdict === 'early-siege-bias'
        ? 'Early-siege bias is still the dominant drift.'
        : 'Early escalation still needs to be toned down.'
    ),
    'late-closure-drag-pressure': createDriver(
      'late-closure-drag-pressure',
      'negative',
      lateClosureDragPressure,
      'Late Closure Drag',
      input.doctrineFit.verdict === 'late-closure-drag'
        ? 'Closure timing is still arriving too late.'
        : 'Closure timing still needs to be pulled forward.'
    ),
    'unstable-reset-cadence-pressure': createDriver(
      'unstable-reset-cadence-pressure',
      'negative',
      unstableResetCadencePressure,
      'Reset Cadence',
      input.doctrineFit.verdict === 'unstable-reset-cadence'
        ? 'Defender reset cadence is still unstable.'
        : 'Reset cadence still needs stabilizing.'
    ),
    'anti-stall-dwell-pressure': createDriver(
      'anti-stall-dwell-pressure',
      'negative',
      antiStallDwellPressure,
      'Anti-Stall Dwell',
      input.doctrineFit.verdict === 'anti-stall-overhang'
        ? 'Anti-stall escalation is still overhanging.'
        : 'Anti-stall dwell is still asking to shorten.'
    ),
    'closure-stickiness-pressure': createDriver(
      'closure-stickiness-pressure',
      'negative',
      closureStickinessPressure,
      'Closure Stickiness',
      input.digest.closureStickinessSummary === 'problematic'
        ? 'Closure states are sticking for too long.'
        : input.digest.closureStickinessSummary === 'watch'
          ? 'Closure dwell is still close to sticky territory.'
          : 'Closure stickiness pressure remains elevated.'
    ),
    'dominant-doctrine-drift-instability': createDriver(
      'dominant-doctrine-drift-instability',
      'negative',
      doctrineDriftInstability,
      'Drift Instability',
      input.comparison.dominantDriftChange.changed
        ? 'Dominant doctrine drift is still moving between passes.'
        : input.digest.dominantDriftOverRun === 'doctrine-fit'
          ? 'Doctrine drift is stable but not fully settled.'
          : 'Dominant doctrine drift is still unstable.'
    ),
    'dominant-calibration-domain-instability': createDriver(
      'dominant-calibration-domain-instability',
      'negative',
      calibrationDomainInstability,
      'Domain Instability',
      input.comparison.dominantCalibrationDomainChange.changed
        ? 'The dominant calibration domain is still shifting.'
        : input.digest.dominantCalibrationDomainConsensus === 'none'
          ? 'Calibration pressure is still split across domains.'
          : 'Calibration-domain consensus is still soft.'
    ),
    'recommendation-instability': createDriver(
      'recommendation-instability',
      'negative',
      recommendationInstability,
      'Recommendation Stability',
      'Recommendation stability is still soft across the run.'
    ),
    'weak-confidence-blend': createDriver(
      'weak-confidence-blend',
      'negative',
      weakConfidenceBlend,
      'Confidence Blend',
      'The run-level confidence blend is still weak.'
    ),
    'elevated-average-retuning-pressure': createDriver(
      'elevated-average-retuning-pressure',
      'negative',
      elevatedRetuningPressure,
      'Retuning Pressure',
      'Average retuning pressure is still elevated.'
    ),
    'prolonged-insufficient-signal': createDriver(
      'prolonged-insufficient-signal',
      'negative',
      prolongedInsufficientSignal,
      'Signal Gap',
      currentSignalGap.reason
    ),
    'stable-doctrine-fit': createDriver(
      'stable-doctrine-fit',
      'positive',
      stableDoctrineFit,
      'Stable Doctrine Fit',
      input.digest.dominantDriftOverRun === 'doctrine-fit'
        ? 'Doctrine fit is carrying most of the run.'
        : 'Doctrine-fit support is still present.'
    ),
    'healthy-escalation-timing': createDriver(
      'healthy-escalation-timing',
      'positive',
      healthyEscalationTiming,
      'Healthy Timing',
      input.digest.escalationTimingSummary === 'healthy'
        ? 'Escalation timing has stayed broadly healthy.'
        : 'Timing pressure is still partly controlled.'
    ),
    'healthy-reset-quality': createDriver(
      'healthy-reset-quality',
      'positive',
      healthyResetQuality,
      'Healthy Reset',
      input.digest.resetQualitySummary === 'healthy'
        ? 'Reset quality has stayed broadly healthy.'
        : 'Reset quality still has some healthy support.'
    ),
    'stable-calibration-domain': createDriver(
      'stable-calibration-domain',
      'positive',
      stableCalibrationDomain,
      'Stable Domain',
      input.digest.dominantCalibrationDomainConsensus === 'none'
        ? 'Domain pressure is staying bounded.'
        : 'Calibration-domain consensus is holding together.'
    ),
    'stable-recommendations': createDriver(
      'stable-recommendations',
      'positive',
      stableRecommendations,
      'Stable Recommendations',
      'Recommendation stability is holding over the run.'
    ),
    'strong-confidence-blend': createDriver(
      'strong-confidence-blend',
      'positive',
      strongConfidenceBlend,
      'Strong Confidence',
      'Confidence blend is holding with the current evidence.'
    )
  };
};

const selectTopEvidenceDrivers = (
  drivers: CalibrationEvidenceDriver[],
  verdict: CalibrationDigestComparisonVerdict
): CalibrationEvidenceDriver[] => {
  const positive = selectTopDrivers(drivers, 'positive', topPositiveLimit);
  const negative = selectTopDrivers(drivers, 'negative', topNegativeLimit);
  const combined =
    verdict === 'mixed'
      ? interleaveDrivers(negative, positive, topDriverLimit)
      : verdict === 'improved' || isHealthyUnchanged(verdict, negative)
        ? [...positive, ...negative].slice(0, topDriverLimit)
        : [...negative, ...positive].slice(0, topDriverLimit);

  if (combined.length > 0) {
    return combined;
  }

  return [...drivers]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, topDriverLimit);
};

const selectTopDrivers = (
  drivers: CalibrationEvidenceDriver[],
  direction: CalibrationEvidenceDriverDirection,
  limit: number
): CalibrationEvidenceDriver[] =>
  drivers
    .filter(
      (driver) =>
        driver.direction === direction && driver.weight >= minimumDriverWeight
    )
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit);

const deriveEvidencePressureScore = (
  negativeDrivers: CalibrationEvidenceDriver[]
): number => {
  if (negativeDrivers.length === 0) {
    return 0;
  }

  const peak = negativeDrivers[0]?.weight ?? 0;
  const average =
    negativeDrivers.reduce((sum, driver) => sum + driver.weight, 0) /
    negativeDrivers.length;

  return clamp(peak * 0.62 + average * 0.38, 0, 1);
};

const deriveEvidenceSignalSufficient = (
  input: CalibrationEvidenceExplainerInput
): boolean =>
  input.comparison.verdict !== 'insufficient-signal' &&
  deriveCurrentSignalReady(input.digest);

const deriveExplanationConfidence = (
  input: CalibrationEvidenceExplainerInput,
  topEvidenceDrivers: CalibrationEvidenceDriver[],
  evidenceSignalSufficient: boolean
): number => {
  const leadWeight = topEvidenceDrivers[0]?.weight ?? 0;
  const secondWeight = topEvidenceDrivers[1]?.weight ?? 0;
  const concentration = clamp(leadWeight - secondWeight + 0.28, 0, 1);
  const signalFactor = evidenceSignalSufficient ? 0.18 : 0.08;
  const baselineFactor = input.comparison.baselineAvailable ? 0.1 : 0.04;

  return clamp(
    input.digest.confidenceBlend * 0.44 +
      concentration * 0.24 +
      signalFactor +
      baselineFactor +
      (input.comparison.verdict === 'mixed' ? 0.02 : 0.08),
    0,
    1
  );
};

const deriveExplanation = (
  input: CalibrationEvidenceExplainerInput,
  topPositiveDrivers: CalibrationEvidenceDriver[],
  topNegativeDrivers: CalibrationEvidenceDriver[],
  evidenceSignalSufficient: boolean
): {
  primaryExplanation: string;
  secondaryExplanation: string;
} => {
  const bestPositive = topPositiveDrivers[0];
  const secondPositive = topPositiveDrivers[1];
  const bestNegative = topNegativeDrivers[0];
  const secondNegative = topNegativeDrivers[1];

  if (input.comparison.verdict === 'insufficient-signal') {
    return {
      primaryExplanation: bestNegative?.id === 'prolonged-insufficient-signal'
        ? `Comparison is still signal-limited: ${bestNegative.shortReason}`
        : 'Comparison is still signal-limited for this pass.',
      secondaryExplanation: bestNegative && bestNegative.id !== 'prolonged-insufficient-signal'
        ? `Current pass pressure is led by ${bestNegative.shortLabel.toLowerCase()}.`
        : evidenceSignalSufficient
          ? 'Current-pass evidence is usable, but the baseline comparison is not ready yet.'
          : 'Current-pass evidence is still building as the digest window fills in.'
    };
  }

  if (input.comparison.verdict === 'improved') {
    return {
      primaryExplanation: bestPositive
        ? `Improvement is mainly coming from ${bestPositive.shortLabel.toLowerCase()}.`
        : 'Improvement is visible in the current comparison.',
      secondaryExplanation: bestNegative && bestNegative.weight >= 0.3
        ? `The main remaining drag is ${bestNegative.shortLabel.toLowerCase()}.`
        : secondPositive
          ? `Secondary support is ${secondPositive.shortLabel.toLowerCase()}.`
          : 'The healthier drivers are outweighing the remaining drag.'
    };
  }

  if (input.comparison.verdict === 'regressed') {
    return {
      primaryExplanation: bestNegative
        ? `Regression is mainly driven by ${bestNegative.shortLabel.toLowerCase()}.`
        : 'Regression is visible in the current comparison.',
      secondaryExplanation: secondNegative
        ? `The next drag is ${secondNegative.shortLabel.toLowerCase()}.`
        : bestPositive
          ? `The main offset is ${bestPositive.shortLabel.toLowerCase()}.`
          : 'Current negative drivers are outweighing the healthy support.'
    };
  }

  if (input.comparison.verdict === 'mixed') {
    return {
      primaryExplanation:
        bestPositive && bestNegative
          ? `Signals are split between ${bestPositive.shortLabel.toLowerCase()} and ${bestNegative.shortLabel.toLowerCase()}.`
          : bestNegative
            ? `Signals are mixed, with ${bestNegative.shortLabel.toLowerCase()} still pulling against the pass.`
            : 'Signals are mixed across the current comparison.',
      secondaryExplanation:
        bestPositive && bestNegative
          ? `${bestPositive.shortReason} ${bestNegative.shortReason}`
          : secondNegative
            ? secondNegative.shortReason
            : secondPositive?.shortReason ?? 'The current pass has conflicting evidence drivers.'
    };
  }

  if (isHealthyUnchanged(input.comparison.verdict, topNegativeDrivers)) {
    return {
      primaryExplanation: bestPositive
        ? `The pass is unchanged in a healthy way, led by ${bestPositive.shortLabel.toLowerCase()}.`
        : 'The pass is unchanged and broadly healthy.',
      secondaryExplanation: secondPositive
        ? `Support also comes from ${secondPositive.shortLabel.toLowerCase()}.`
        : 'The stable drivers are holding without adding new drift.'
    };
  }

  return {
    primaryExplanation: 'The pass is largely unchanged because the evidence is flat or weak.',
    secondaryExplanation: bestNegative
      ? `The main limiter is ${bestNegative.shortLabel.toLowerCase()}.`
      : 'No strong driver has separated from the rest of the evidence yet.'
  };
};

const deriveCurrentSignalGap = (
  input: CalibrationEvidenceExplainerInput
): { weight: number; reason: string } => {
  const digest = input.digest;
  const currentWindowGap = clamp(
    (minimumSignalWindowSeconds - digest.windowDurationSeconds) /
      minimumSignalWindowSeconds,
    0,
    1
  );
  const currentSampleGap = clamp(
    (minimumSignalSamples - digest.sampleCount) / minimumSignalSamples,
    0,
    1
  );

  if (!input.comparison.baselineAvailable) {
    return {
      weight: 0.94,
      reason: 'No baseline digest has been captured yet.'
    };
  }

  if (digest.windowDurationSeconds < minimumSignalWindowSeconds) {
    return {
      weight: clamp(currentWindowGap * 0.86 + 0.1, 0, 1),
      reason: 'The current digest window is still too short.'
    };
  }

  if (digest.sampleCount < minimumSignalSamples) {
    return {
      weight: clamp(currentSampleGap * 0.84 + 0.08, 0, 1),
      reason: 'The current pass still has too few digest samples.'
    };
  }

  if (
    input.comparison.baselineWindowDurationSeconds < minimumSignalWindowSeconds
  ) {
    return {
      weight: 0.74,
      reason: 'The captured baseline window is still too short.'
    };
  }

  return {
    weight: 0.08,
    reason: 'Signal sufficiency is no longer the main limiter.'
  };
};

const deriveCurrentSignalReady = (
  digest: CalibrationDigestSummarySnapshot
): boolean =>
  digest.windowDurationSeconds >= minimumSignalWindowSeconds &&
  digest.sampleCount >= minimumSignalSamples;

const isHealthyUnchanged = (
  verdict: CalibrationDigestComparisonVerdict,
  negativeDrivers: CalibrationEvidenceDriver[]
): boolean =>
  verdict === 'unchanged' &&
  (negativeDrivers[0]?.weight ?? 0) < 0.34;

const doctrineDriftWeight = (
  verdict: CalibrationDigestSummarySnapshot['dominantDriftOverRun']
): number =>
  verdict === 'doctrine-fit'
    ? 0.14
    : verdict === 'late-closure-drag' || verdict === 'anti-stall-overhang'
      ? 0.74
      : 0.78;

const domainInstabilityBase = (
  input: CalibrationEvidenceExplainerInput
): number =>
  input.digest.dominantCalibrationDomainConsensus === 'none'
    ? clamp(input.retuning.recommendationCount / 3, 0, 1)
    : clamp(
        input.retuning.recommendationCount > 1
          ? 0.5
          : input.retuning.overallRetuningPressure * 0.62,
        0,
        1
      );

const timingSummaryWeight = (
  summary: CalibrationDigestSummarySnapshot['escalationTimingSummary']
): number =>
  summary === 'healthy'
    ? 0.9
    : summary === 'mixed'
      ? 0.5
      : summary === 'limited-signal'
        ? 0.2
        : 0.1;

const resetSummaryWeight = (
  summary: CalibrationDigestSummarySnapshot['resetQualitySummary']
): number =>
  summary === 'healthy'
    ? 0.9
    : summary === 'mixed'
      ? 0.46
      : summary === 'limited-signal'
        ? 0.2
        : 0.08;

const stickinessSummaryWeight = (
  summary: CalibrationDigestSummarySnapshot['closureStickinessSummary']
): number =>
  summary === 'problematic'
    ? 0.9
    : summary === 'watch'
      ? 0.62
      : summary === 'limited-signal'
        ? 0.26
        : 0.18;

const summaryChangePenalty = (changed: boolean, worsened: boolean): number =>
  changed ? (worsened ? 0.9 : 0.42) : 0.18;

const createDriver = (
  id: CalibrationEvidenceDriverId,
  direction: CalibrationEvidenceDriverDirection,
  weight: number,
  shortLabel: string,
  shortReason: string
): CalibrationEvidenceDriver => ({
  id,
  direction,
  weight: clamp(weight, 0, 1),
  shortLabel,
  shortReason
});

const interleaveDrivers = (
  negative: CalibrationEvidenceDriver[],
  positive: CalibrationEvidenceDriver[],
  limit: number
): CalibrationEvidenceDriver[] => {
  const combined: CalibrationEvidenceDriver[] = [];
  const maxLength = Math.max(negative.length, positive.length);

  for (let index = 0; index < maxLength && combined.length < limit; index += 1) {
    if (negative[index]) {
      combined.push(negative[index]);
    }
    if (positive[index] && combined.length < limit) {
      combined.push(positive[index]);
    }
  }

  return combined;
};

const createWeightMap = (value: number): DriverWeightMap => ({
  'early-escalation-pressure': value,
  'late-closure-drag-pressure': value,
  'unstable-reset-cadence-pressure': value,
  'anti-stall-dwell-pressure': value,
  'closure-stickiness-pressure': value,
  'dominant-doctrine-drift-instability': value,
  'dominant-calibration-domain-instability': value,
  'recommendation-instability': value,
  'weak-confidence-blend': value,
  'elevated-average-retuning-pressure': value,
  'prolonged-insufficient-signal': value,
  'stable-doctrine-fit': value,
  'healthy-escalation-timing': value,
  'healthy-reset-quality': value,
  'stable-calibration-domain': value,
  'stable-recommendations': value,
  'strong-confidence-blend': value
});

const createDefaultSnapshot = (): CalibrationEvidenceExplainerSnapshot => ({
  topEvidenceDrivers: [],
  topPositiveDrivers: [],
  topNegativeDrivers: [],
  primaryExplanation: 'Comparison evidence is still building.',
  secondaryExplanation: 'Current-pass pressure will fill in as the digest window stabilizes.',
  explanationConfidence: 0.24,
  evidencePressureScore: 0,
  evidenceSignalSufficient: false
});

const cloneSnapshot = (
  snapshot: CalibrationEvidenceExplainerSnapshot
): CalibrationEvidenceExplainerSnapshot => ({
  topEvidenceDrivers: snapshot.topEvidenceDrivers.map(cloneDriver),
  topPositiveDrivers: snapshot.topPositiveDrivers.map(cloneDriver),
  topNegativeDrivers: snapshot.topNegativeDrivers.map(cloneDriver),
  primaryExplanation: snapshot.primaryExplanation,
  secondaryExplanation: snapshot.secondaryExplanation,
  explanationConfidence: snapshot.explanationConfidence,
  evidencePressureScore: snapshot.evidencePressureScore,
  evidenceSignalSufficient: snapshot.evidenceSignalSufficient
});

const cloneDriver = (
  driver: CalibrationEvidenceDriver
): CalibrationEvidenceDriver => ({
  id: driver.id,
  direction: driver.direction,
  weight: driver.weight,
  shortLabel: driver.shortLabel,
  shortReason: driver.shortReason
});

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
