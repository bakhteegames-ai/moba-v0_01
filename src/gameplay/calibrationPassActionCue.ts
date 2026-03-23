import {
  type CalibrationRetuningDomain,
  type CalibrationRetuningSuggestionsSnapshot
} from './calibrationRetuningSuggestions';
import {
  type CalibrationDigestComparisonSnapshot
} from './calibrationDigestComparison';
import { type CalibrationDigestSummarySnapshot } from './calibrationDigestSummary';
import { type CalibrationEvidenceExplainerSnapshot } from './calibrationEvidenceExplainer';
import { type ClosureDoctrineFitSnapshot } from './closureDoctrineFitEvaluator';

export type CalibrationPassReadinessVerdict =
  | 'ready-to-promote'
  | 'promising-but-observe'
  | 'targeted-retune-needed'
  | 'regressed-do-not-promote'
  | 'insufficient-signal';

export type CalibrationPassRecommendedAction =
  | 'promote-current-as-baseline'
  | 'keep-current-baseline'
  | 'observe-longer'
  | 'retune-early-escalation'
  | 'retune-closure-timing'
  | 'retune-reset-cadence'
  | 'retune-anti-stall-dwell'
  | 'recapture-baseline'
  | 'rerun-for-signal';

export interface CalibrationPassActionCueSnapshot {
  readinessVerdict: CalibrationPassReadinessVerdict;
  recommendedAction: CalibrationPassRecommendedAction;
  recommendedDomain: CalibrationRetuningDomain;
  baselinePromotionAllowed: boolean;
  actionConfidence: number;
  primaryActionReason: string;
  secondaryActionReason: string;
  blockingFactors: string[];
  actionSignalSufficient: boolean;
}

export interface CalibrationPassActionCueInput {
  doctrineFit: ClosureDoctrineFitSnapshot;
  retuning: CalibrationRetuningSuggestionsSnapshot;
  digest: CalibrationDigestSummarySnapshot;
  comparison: CalibrationDigestComparisonSnapshot;
  evidence: CalibrationEvidenceExplainerSnapshot;
}

export interface CalibrationPassActionCueModel {
  update(dt: number, input: CalibrationPassActionCueInput): void;
  reset(): void;
  getSnapshot(): CalibrationPassActionCueSnapshot;
}

interface RuntimeState {
  snapshot: CalibrationPassActionCueSnapshot;
}

const minimumSignalWindowSeconds = 6;
const minimumSignalSamples = 4;
const blockingLimit = 3;

export const createCalibrationPassActionCueModel =
  (): CalibrationPassActionCueModel => {
    const state: RuntimeState = {
      snapshot: createDefaultSnapshot()
    };

    return {
      update(dt, input) {
        const target = deriveSnapshot(input);
        const blend = dt <= 0 ? 1 : clamp(dt * 0.9, 0.08, 1);

        state.snapshot = {
          ...target,
          actionConfidence: approach(
            state.snapshot.actionConfidence,
            target.actionConfidence,
            blend
          )
        };
      },
      reset() {
        state.snapshot = createDefaultSnapshot();
      },
      getSnapshot() {
        return cloneSnapshot(state.snapshot);
      }
    };
  };

const deriveSnapshot = (
  input: CalibrationPassActionCueInput
): CalibrationPassActionCueSnapshot => {
  const currentSignalSufficient =
    input.digest.windowDurationSeconds >= minimumSignalWindowSeconds &&
    input.digest.sampleCount >= minimumSignalSamples;
  const signalConfidence = clamp(
    input.digest.confidenceBlend * 0.58 +
      input.evidence.explanationConfidence * 0.42,
    0,
    1
  );
  const domainDecision = deriveRecommendedDomain(input);
  const blockingFactors = deriveBlockingFactors(
    input,
    currentSignalSufficient,
    domainDecision.domain
  );
  const promoteReady =
    currentSignalSufficient &&
    signalConfidence >= 0.66 &&
    input.evidence.evidencePressureScore <= 0.28 &&
    input.doctrineFit.doctrineFitLevel >= 0.68 &&
    input.retuning.overallRetuningPressure <= 0.28 &&
    input.comparison.verdict !== 'regressed';

  if (!input.comparison.baselineAvailable) {
    if (promoteReady) {
      return {
        readinessVerdict: 'ready-to-promote',
        recommendedAction: 'promote-current-as-baseline',
        recommendedDomain: 'none',
        baselinePromotionAllowed: true,
        actionConfidence: clamp(signalConfidence * 0.9 + 0.08, 0, 1),
        primaryActionReason: 'Current-pass evidence is strong enough to stand as a baseline.',
        secondaryActionReason: 'No accepted baseline is stored, and the current pass is stable enough to promote.',
        blockingFactors,
        actionSignalSufficient: true
      };
    }

    return {
      readinessVerdict: 'insufficient-signal',
      recommendedAction: currentSignalSufficient
        ? 'observe-longer'
        : 'rerun-for-signal',
      recommendedDomain: 'none',
      baselinePromotionAllowed: false,
      actionConfidence: clamp(signalConfidence * 0.74, 0, 1),
      primaryActionReason: currentSignalSufficient
        ? 'A baseline has not been captured yet, and the current pass is not baseline-worthy yet.'
        : 'The current pass still needs more run-level signal before it should anchor a baseline.',
      secondaryActionReason: blockingFactors[0] ?? 'Let the pass stabilize before acting.',
      blockingFactors,
      actionSignalSufficient: currentSignalSufficient
    };
  }

  if (
    input.comparison.verdict === 'insufficient-signal' ||
    !currentSignalSufficient ||
    signalConfidence < 0.42
  ) {
    const weakBaseline =
      input.comparison.baselineWindowDurationSeconds < minimumSignalWindowSeconds;

    return {
      readinessVerdict: 'insufficient-signal',
      recommendedAction: weakBaseline
        ? 'recapture-baseline'
        : 'rerun-for-signal',
      recommendedDomain: 'none',
      baselinePromotionAllowed: false,
      actionConfidence: clamp(signalConfidence * 0.72, 0, 1),
      primaryActionReason: weakBaseline
        ? 'The stored baseline does not provide enough comparison signal.'
        : 'The current pass still needs more runtime evidence.',
      secondaryActionReason: input.evidence.primaryExplanation,
      blockingFactors,
      actionSignalSufficient: currentSignalSufficient
    };
  }

  if (input.comparison.verdict === 'regressed') {
    return {
      readinessVerdict: 'regressed-do-not-promote',
      recommendedAction:
        domainDecision.domain !== 'none'
          ? domainToAction(domainDecision.domain)
          : 'keep-current-baseline',
      recommendedDomain: domainDecision.domain,
      baselinePromotionAllowed: false,
      actionConfidence: clamp(signalConfidence * 0.82 + domainDecision.confidence * 0.12, 0, 1),
      primaryActionReason: 'The current pass is worse than the stored baseline.',
      secondaryActionReason:
        domainDecision.domain !== 'none'
          ? `The clearest next move is a bounded ${formatDomainReason(domainDecision.domain)} retune.`
          : input.evidence.primaryExplanation,
      blockingFactors,
      actionSignalSufficient: true
    };
  }

  if (promoteReady && input.comparison.verdict === 'improved') {
    return {
      readinessVerdict: 'ready-to-promote',
      recommendedAction: 'promote-current-as-baseline',
      recommendedDomain: 'none',
      baselinePromotionAllowed: true,
      actionConfidence: clamp(signalConfidence * 0.88 + 0.08, 0, 1),
      primaryActionReason: 'The current pass is improved and the remaining evidence pressure is low.',
      secondaryActionReason: 'This pass is strong enough to replace the stored baseline without widening doctrine drift.',
      blockingFactors,
      actionSignalSufficient: true
    };
  }

  if (
    domainDecision.domain !== 'none' &&
    (input.comparison.verdict === 'mixed' ||
      input.retuning.overallRetuningPressure >= 0.34)
  ) {
    return {
      readinessVerdict: 'targeted-retune-needed',
      recommendedAction: domainToAction(domainDecision.domain),
      recommendedDomain: domainDecision.domain,
      baselinePromotionAllowed: false,
      actionConfidence: clamp(signalConfidence * 0.68 + domainDecision.confidence * 0.24, 0, 1),
      primaryActionReason: `One bounded domain is still carrying the strongest calibration drag: ${formatDomainReason(domainDecision.domain)}.`,
      secondaryActionReason: domainDecision.reason,
      blockingFactors,
      actionSignalSufficient: true
    };
  }

  if (
    input.comparison.verdict === 'unchanged' &&
    input.evidence.evidencePressureScore <= 0.26 &&
    input.evidence.topPositiveDrivers.length > 0
  ) {
    return {
      readinessVerdict: 'promising-but-observe',
      recommendedAction: 'keep-current-baseline',
      recommendedDomain: 'none',
      baselinePromotionAllowed: false,
      actionConfidence: clamp(signalConfidence * 0.82, 0, 1),
      primaryActionReason: 'The pass is unchanged in a healthy way, but not clearly better than baseline.',
      secondaryActionReason: 'Keep the stored baseline and only promote a pass that separates more cleanly.',
      blockingFactors,
      actionSignalSufficient: true
    };
  }

  return {
    readinessVerdict: 'promising-but-observe',
    recommendedAction: 'observe-longer',
    recommendedDomain: 'none',
    baselinePromotionAllowed: false,
    actionConfidence: clamp(signalConfidence * 0.78, 0, 1),
    primaryActionReason: input.comparison.verdict === 'improved'
      ? 'The pass is moving in the right direction, but it is not baseline-worthy yet.'
      : 'The pass still needs more observation before the next operator action is clear.',
    secondaryActionReason: input.evidence.secondaryExplanation,
    blockingFactors,
    actionSignalSufficient: true
  };
};

const deriveRecommendedDomain = (
  input: CalibrationPassActionCueInput
): {
  domain: CalibrationRetuningDomain;
  confidence: number;
  reason: string;
} => {
  const scores: Record<CalibrationRetuningDomain, number> = {
    none: 0,
    'early-escalation': clamp(
      input.retuning.suggestions.earlyEscalation.urgency * 0.72 +
        findNegativeDriverWeight(input, 'early-escalation-pressure') * 0.28,
      0,
      1
    ),
    'closure-timing': clamp(
      input.retuning.suggestions.closureTiming.urgency * 0.7 +
        findNegativeDriverWeight(input, 'late-closure-drag-pressure') * 0.3,
      0,
      1
    ),
    'reset-cadence': clamp(
      input.retuning.suggestions.resetCadence.urgency * 0.72 +
        findNegativeDriverWeight(input, 'unstable-reset-cadence-pressure') * 0.28,
      0,
      1
    ),
    'anti-stall-dwell': clamp(
      input.retuning.suggestions.antiStallDwell.urgency * 0.58 +
        Math.max(
          findNegativeDriverWeight(input, 'anti-stall-dwell-pressure'),
          findNegativeDriverWeight(input, 'closure-stickiness-pressure')
        ) *
          0.42,
      0,
      1
    )
  };
  const ranked = (Object.keys(scores) as CalibrationRetuningDomain[])
    .filter((domain) => domain !== 'none')
    .map((domain) => ({
      domain,
      score: scores[domain]
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];

  if (
    !best ||
    best.score < 0.34 ||
    (second && best.score - second.score < 0.08)
  ) {
    return {
      domain: 'none',
      confidence: best?.score ?? 0,
      reason: 'No single calibration domain is separated enough to act on.'
    };
  }

  return {
    domain: best.domain,
    confidence: best.score,
    reason: `The strongest remaining action cue points to ${formatDomainReason(best.domain)}.`
  };
};

const deriveBlockingFactors = (
  input: CalibrationPassActionCueInput,
  currentSignalSufficient: boolean,
  domain: CalibrationRetuningDomain
): string[] => {
  const factors: string[] = [];

  if (!input.comparison.baselineAvailable) {
    factors.push('No baseline');
  }

  if (input.digest.windowDurationSeconds < minimumSignalWindowSeconds) {
    factors.push('Short digest window');
  }

  if (input.digest.sampleCount < minimumSignalSamples) {
    factors.push('Low sample count');
  }

  if (input.digest.confidenceBlend < 0.48 || input.evidence.explanationConfidence < 0.48) {
    factors.push('Soft confidence');
  }

  if (input.evidence.evidencePressureScore >= 0.34) {
    factors.push('Evidence pressure');
  }

  if (input.comparison.verdict === 'mixed') {
    factors.push('Mixed comparison');
  }

  if (input.comparison.verdict === 'regressed') {
    factors.push('Regression vs baseline');
  }

  if (domain === 'none' && input.retuning.recommendationCount > 1) {
    factors.push('No single domain');
  }

  if (!currentSignalSufficient) {
    factors.push('Signal still thin');
  }

  return dedupeFactors(factors).slice(0, blockingLimit);
};

const findNegativeDriverWeight = (
  input: CalibrationPassActionCueInput,
  id:
    | 'early-escalation-pressure'
    | 'late-closure-drag-pressure'
    | 'unstable-reset-cadence-pressure'
    | 'anti-stall-dwell-pressure'
    | 'closure-stickiness-pressure'
): number =>
  input.evidence.topNegativeDrivers.find((driver) => driver.id === id)?.weight ??
  0;

const domainToAction = (
  domain: CalibrationRetuningDomain
): CalibrationPassRecommendedAction =>
  domain === 'early-escalation'
    ? 'retune-early-escalation'
    : domain === 'closure-timing'
      ? 'retune-closure-timing'
      : domain === 'reset-cadence'
        ? 'retune-reset-cadence'
        : domain === 'anti-stall-dwell'
          ? 'retune-anti-stall-dwell'
          : 'observe-longer';

const formatDomainReason = (domain: CalibrationRetuningDomain): string =>
  domain === 'early-escalation'
    ? 'early escalation'
    : domain === 'closure-timing'
      ? 'closure timing'
      : domain === 'reset-cadence'
        ? 'reset cadence'
        : domain === 'anti-stall-dwell'
          ? 'anti-stall dwell'
          : 'observation';

const dedupeFactors = (factors: string[]): string[] =>
  factors.filter(
    (factor, index) => factors.findIndex((candidate) => candidate === factor) === index
  );

const createDefaultSnapshot = (): CalibrationPassActionCueSnapshot => ({
  readinessVerdict: 'insufficient-signal',
  recommendedAction: 'rerun-for-signal',
  recommendedDomain: 'none',
  baselinePromotionAllowed: false,
  actionConfidence: 0.24,
  primaryActionReason: 'The pass action cue is still waiting for usable runtime signal.',
  secondaryActionReason: 'Let the digest and evidence layers stabilize before acting.',
  blockingFactors: ['Signal still thin'],
  actionSignalSufficient: false
});

const cloneSnapshot = (
  snapshot: CalibrationPassActionCueSnapshot
): CalibrationPassActionCueSnapshot => ({
  readinessVerdict: snapshot.readinessVerdict,
  recommendedAction: snapshot.recommendedAction,
  recommendedDomain: snapshot.recommendedDomain,
  baselinePromotionAllowed: snapshot.baselinePromotionAllowed,
  actionConfidence: snapshot.actionConfidence,
  primaryActionReason: snapshot.primaryActionReason,
  secondaryActionReason: snapshot.secondaryActionReason,
  blockingFactors: [...snapshot.blockingFactors],
  actionSignalSufficient: snapshot.actionSignalSufficient
});

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
