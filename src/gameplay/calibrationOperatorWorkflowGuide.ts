import { clamp } from './calibrationUtils';
import { type CalibrationRetuningDomain } from './calibrationRetuningSuggestions';
import { type CalibrationDigestComparisonSnapshot } from './calibrationDigestComparison';
import { type CalibrationEvidenceExplainerSnapshot } from './calibrationEvidenceExplainer';
import { type CalibrationOperatorControlsSnapshot } from './calibrationOperatorControls';
import { type CalibrationPassActionCueSnapshot } from './calibrationPassActionCue';
import { type CalibrationPassReviewHandoffSnapshot } from './calibrationPassReviewHandoff';

export type CalibrationOperatorWorkflowPhase =
  | 'collecting-signal'
  | 'ready-for-review'
  | 'review-frozen-awaiting-decision'
  | 'baseline-candidate'
  | 'observe-before-promotion'
  | 'targeted-retune-pending'
  | 'rerun-for-signal'
  | 'post-action-reset-state';

export type CalibrationOperatorWorkflowNextStep =
  | 'keep-running'
  | 'freeze-current-review'
  | 'capture-current-as-baseline'
  | 'keep-existing-baseline'
  | 'observe-longer'
  | 'run-targeted-retune'
  | 'clear-and-rerun'
  | 'clear-frozen-review';

export interface CalibrationOperatorWorkflowGuideSnapshot {
  workflowPhase: CalibrationOperatorWorkflowPhase;
  nextSuggestedStep: CalibrationOperatorWorkflowNextStep;
  suggestedDomain: CalibrationRetuningDomain;
  stepConfidence: number;
  workflowPrimaryReason: string;
  workflowSecondaryReason: string;
  workflowBlockers: string[];
  workflowSignalSufficient: boolean;
  baselinePresent: boolean;
  frozenReviewPresent: boolean;
}

export interface CalibrationOperatorWorkflowGuideInput {
  runtimeSeconds: number;
  actionCue: CalibrationPassActionCueSnapshot;
  comparison: CalibrationDigestComparisonSnapshot;
  evidence: CalibrationEvidenceExplainerSnapshot;
  passReview: CalibrationPassReviewHandoffSnapshot;
  operatorControls: CalibrationOperatorControlsSnapshot;
}

export interface CalibrationOperatorWorkflowGuideModel {
  update(input: CalibrationOperatorWorkflowGuideInput): void;
  getSnapshot(): CalibrationOperatorWorkflowGuideSnapshot;
}

interface RuntimeState {
  snapshot: CalibrationOperatorWorkflowGuideSnapshot;
}

const recentActionWindowSeconds = 8;
const blockerLimit = 3;

export const createCalibrationOperatorWorkflowGuideModel =
  (): CalibrationOperatorWorkflowGuideModel => {
    const state: RuntimeState = {
      snapshot: createDefaultSnapshot()
    };

    return {
      update(input) {
        state.snapshot = deriveSnapshot(input);
      },
      getSnapshot() {
        return cloneSnapshot(state.snapshot);
      }
    };
  };

const deriveSnapshot = (
  input: CalibrationOperatorWorkflowGuideInput
): CalibrationOperatorWorkflowGuideSnapshot => {
  const baselinePresent = input.comparison.baselineAvailable;
  const frozenReviewPresent = input.passReview.hasFrozenReview;
  const workflowSignalSufficient = input.actionCue.actionSignalSufficient;
  const lastActionAgeSeconds =
    typeof input.operatorControls.lastActionRuntimeSeconds === 'number'
      ? Math.max(0, input.runtimeSeconds - input.operatorControls.lastActionRuntimeSeconds)
      : null;
  const recentResetAction =
    input.operatorControls.lastActionId === 'reset-calibration-digest' &&
    typeof lastActionAgeSeconds === 'number' &&
    lastActionAgeSeconds <= recentActionWindowSeconds;
  const recentBaselineDecision =
    (input.operatorControls.lastActionId === 'capture-current-calibration-baseline' ||
      input.operatorControls.lastActionId === 'clear-calibration-baseline') &&
    typeof lastActionAgeSeconds === 'number' &&
    lastActionAgeSeconds <= recentActionWindowSeconds;
  const currentOrFrozenDomain = deriveSuggestedDomain(input);

  if (recentResetAction && !workflowSignalSufficient) {
    return buildSnapshot(
      'post-action-reset-state',
      'keep-running',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.74 + 0.12, 0, 1),
      'The calibration digest was just reset, so this pass needs fresh accumulation.',
      frozenReviewPresent
        ? 'The previous review is still frozen while the new pass rebuilds signal.'
        : baselinePresent
          ? 'A baseline is still present, but the new pass has not matured yet.'
          : 'There is no baseline yet, so the loop needs fresh signal before review.',
      buildBlockers(
        'Fresh signal not accumulated',
        frozenReviewPresent ? 'Frozen review still open' : null,
        baselinePresent ? null : 'Baseline missing'
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  if (!workflowSignalSufficient) {
    const rerunState =
      baselinePresent &&
      (input.actionCue.recommendedAction === 'rerun-for-signal' ||
        input.comparison.verdict === 'insufficient-signal');

    return buildSnapshot(
      rerunState ? 'rerun-for-signal' : 'collecting-signal',
      rerunState ? 'clear-and-rerun' : 'keep-running',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.7 + input.evidence.explanationConfidence * 0.12, 0, 1),
      rerunState
        ? 'This pass is still too thin to compare cleanly against the stored baseline.'
        : 'The current pass is still gathering enough run-level signal for review.',
      rerunState
        ? 'Clear and rerun if this pass is already known to be noisy or partial.'
        : baselinePresent
          ? 'Keep the existing baseline while this run accumulates more evidence.'
          : 'Keep running until the pass has enough evidence to review.',
      buildBlockers(
        'Signal still thin',
        baselinePresent ? null : 'Baseline missing',
        input.evidence.explanationConfidence < 0.46 ? 'Explanation still soft' : null
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  if (!frozenReviewPresent) {
    return buildSnapshot(
      'ready-for-review',
      'freeze-current-review',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.82 + 0.12, 0, 1),
      'The current pass is mature enough to freeze as an operator review snapshot.',
      input.actionCue.primaryActionReason,
      buildBlockers(
        baselinePresent ? null : 'Baseline missing',
        input.evidence.explanationConfidence < 0.5 ? 'Explanation still soft' : null,
        null
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  if (recentBaselineDecision) {
    return buildSnapshot(
      'review-frozen-awaiting-decision',
      'clear-frozen-review',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.7 + 0.16, 0, 1),
      'A baseline decision was just applied, and the frozen review can now be cleared when the handoff is complete.',
      baselinePresent
        ? 'The stored baseline has been updated or confirmed; clear the frozen review once it is no longer needed.'
        : 'The baseline was just cleared; clear the frozen review after the operator finishes the handoff.',
      buildBlockers(
        'Frozen review still open',
        baselinePresent ? null : 'Baseline missing',
        null
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  if (
    input.actionCue.readinessVerdict === 'ready-to-promote' &&
    input.actionCue.baselinePromotionAllowed
  ) {
    return buildSnapshot(
      'baseline-candidate',
      'capture-current-as-baseline',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.88 + 0.06, 0, 1),
      'The frozen review now looks like a credible baseline candidate.',
      baselinePresent
        ? 'This pass appears strong enough to replace the existing baseline.'
        : 'No stored baseline exists, so this pass can be captured as the first baseline.',
      buildBlockers(
        'Frozen review awaiting baseline decision',
        null,
        null
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  if (
    input.actionCue.readinessVerdict === 'targeted-retune-needed' ||
    input.actionCue.readinessVerdict === 'regressed-do-not-promote'
  ) {
    return buildSnapshot(
      'targeted-retune-pending',
      currentOrFrozenDomain !== 'none' ? 'run-targeted-retune' : 'keep-existing-baseline',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.84 + 0.06, 0, 1),
      currentOrFrozenDomain !== 'none'
        ? `The frozen review points to a bounded ${formatDomainReason(currentOrFrozenDomain)} retune before the next pass.`
        : 'The current pass should not be promoted over the existing baseline.',
      currentOrFrozenDomain !== 'none'
        ? input.actionCue.secondaryActionReason
        : 'Keep the existing baseline and rerun only after a bounded manual retune.',
      buildBlockers(
        input.actionCue.readinessVerdict === 'regressed-do-not-promote'
          ? 'Current pass still regressed'
          : 'Targeted retune still pending',
        currentOrFrozenDomain === 'none' ? 'No single domain' : null,
        input.comparison.verdict === 'mixed' ? 'Comparison still mixed' : null
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  if (input.actionCue.readinessVerdict === 'promising-but-observe') {
    return buildSnapshot(
      'observe-before-promotion',
      baselinePresent ? 'keep-existing-baseline' : 'observe-longer',
      currentOrFrozenDomain,
      clamp(input.actionCue.actionConfidence * 0.8, 0, 1),
      'The pass is usable, but it still needs observation before any promotion decision.',
      baselinePresent
        ? 'Keep the existing baseline until a future pass separates more cleanly.'
        : 'Observe longer before promoting this pass into the first baseline.',
      buildBlockers(
        'Promotion case not separated',
        input.comparison.verdict === 'mixed' ? 'Comparison still mixed' : null,
        input.evidence.evidencePressureScore >= 0.3 ? 'Evidence pressure still elevated' : null
      ),
      workflowSignalSufficient,
      baselinePresent,
      frozenReviewPresent
    );
  }

  return buildSnapshot(
    'review-frozen-awaiting-decision',
    baselinePresent ? 'keep-existing-baseline' : 'observe-longer',
    currentOrFrozenDomain,
    clamp(input.actionCue.actionConfidence * 0.72, 0, 1),
    'The frozen review is ready, but the next manual decision is still lightweight.',
    baselinePresent
      ? 'Keep the existing baseline unless a later pass produces a cleaner promotion case.'
      : 'Observe longer until the operator is comfortable promoting a first baseline.',
    buildBlockers(
      'Frozen review awaiting decision',
      baselinePresent ? null : 'Baseline missing',
      null
    ),
    workflowSignalSufficient,
    baselinePresent,
    frozenReviewPresent
  );
};

const deriveSuggestedDomain = (
  input: CalibrationOperatorWorkflowGuideInput
): CalibrationRetuningDomain =>
  input.actionCue.recommendedDomain !== 'none'
    ? input.actionCue.recommendedDomain
    : input.passReview.finalRecommendedDomain !== 'none'
      ? input.passReview.finalRecommendedDomain
      : 'none';

const buildSnapshot = (
  workflowPhase: CalibrationOperatorWorkflowPhase,
  nextSuggestedStep: CalibrationOperatorWorkflowNextStep,
  suggestedDomain: CalibrationRetuningDomain,
  stepConfidence: number,
  workflowPrimaryReason: string,
  workflowSecondaryReason: string,
  workflowBlockers: string[],
  workflowSignalSufficient: boolean,
  baselinePresent: boolean,
  frozenReviewPresent: boolean
): CalibrationOperatorWorkflowGuideSnapshot => ({
  workflowPhase,
  nextSuggestedStep,
  suggestedDomain,
  stepConfidence: clamp(stepConfidence, 0, 1),
  workflowPrimaryReason,
  workflowSecondaryReason,
  workflowBlockers,
  workflowSignalSufficient,
  baselinePresent,
  frozenReviewPresent
});

const buildBlockers = (
  first: string | null,
  second: string | null,
  third: string | null
): string[] =>
  [first, second, third]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, blockerLimit);

const createDefaultSnapshot = (): CalibrationOperatorWorkflowGuideSnapshot => ({
  workflowPhase: 'collecting-signal',
  nextSuggestedStep: 'keep-running',
  suggestedDomain: 'none',
  stepConfidence: 0.24,
  workflowPrimaryReason: 'The calibration loop is waiting for usable runtime signal.',
  workflowSecondaryReason: 'Keep the pass running until the action and review layers have enough evidence.',
  workflowBlockers: ['Signal still thin'],
  workflowSignalSufficient: false,
  baselinePresent: false,
  frozenReviewPresent: false
});

const cloneSnapshot = (
  snapshot: CalibrationOperatorWorkflowGuideSnapshot
): CalibrationOperatorWorkflowGuideSnapshot => ({
  workflowPhase: snapshot.workflowPhase,
  nextSuggestedStep: snapshot.nextSuggestedStep,
  suggestedDomain: snapshot.suggestedDomain,
  stepConfidence: snapshot.stepConfidence,
  workflowPrimaryReason: snapshot.workflowPrimaryReason,
  workflowSecondaryReason: snapshot.workflowSecondaryReason,
  workflowBlockers: [...snapshot.workflowBlockers],
  workflowSignalSufficient: snapshot.workflowSignalSufficient,
  baselinePresent: snapshot.baselinePresent,
  frozenReviewPresent: snapshot.frozenReviewPresent
});

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
