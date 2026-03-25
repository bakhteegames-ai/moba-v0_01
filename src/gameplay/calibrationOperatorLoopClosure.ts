import { clamp } from './calibrationUtils';
import { type CalibrationDigestComparisonSnapshot } from './calibrationDigestComparison';
import { type CalibrationEvidenceExplainerSnapshot } from './calibrationEvidenceExplainer';
import {
  type CalibrationOperatorActionId,
  type CalibrationOperatorControlsSnapshot
} from './calibrationOperatorControls';
import {
  type CalibrationOperatorWorkflowGuideSnapshot
} from './calibrationOperatorWorkflowGuide';
import {
  type CalibrationPassActionCueSnapshot
} from './calibrationPassActionCue';
import {
  type CalibrationPassReviewHandoffSnapshot
} from './calibrationPassReviewHandoff';
import { type CalibrationRetuningDomain } from './calibrationRetuningSuggestions';

export type CalibrationOperatorDisposition =
  | 'none'
  | 'promote-current-as-baseline'
  | 'keep-existing-baseline'
  | 'observe-longer'
  | 'run-targeted-retune'
  | 'rerun-for-signal'
  | 'clear-frozen-review';

export type CalibrationOperatorLoopClosureState =
  | 'open-awaiting-review-freeze'
  | 'open-awaiting-baseline-decision'
  | 'open-awaiting-observation'
  | 'open-awaiting-targeted-retune'
  | 'open-awaiting-rerun'
  | 'resolved-promoted-baseline'
  | 'resolved-kept-baseline'
  | 'resolved-observe-longer'
  | 'resolved-targeted-retune'
  | 'resolved-rerun-for-signal'
  | 'resolved-cleared-review';

export interface CalibrationOperatorLoopClosureSnapshot {
  loopClosureState: CalibrationOperatorLoopClosureState;
  operatorDisposition: CalibrationOperatorDisposition;
  dispositionDomain: CalibrationRetuningDomain;
  closureConfidence: number;
  closurePrimaryReason: string;
  closureSecondaryReason: string;
  closureBlockers: string[];
  loopResolved: boolean;
  baselineDecisionApplied: boolean;
  frozenReviewRequired: boolean;
  decisionSignalSufficient: boolean;
}

export interface CalibrationOperatorLoopClosureInput {
  runtimeSeconds: number;
  actionCue: CalibrationPassActionCueSnapshot;
  comparison: CalibrationDigestComparisonSnapshot;
  evidence: CalibrationEvidenceExplainerSnapshot;
  passReview: CalibrationPassReviewHandoffSnapshot;
  workflow: CalibrationOperatorWorkflowGuideSnapshot;
  operatorControls: CalibrationOperatorControlsSnapshot;
}

export interface CalibrationOperatorLoopClosureModel {
  update(input: CalibrationOperatorLoopClosureInput): void;
  acknowledgeDisposition(
    disposition: Exclude<CalibrationOperatorDisposition, 'none'>
  ): void;
  clearLoopClosureDecision(): void;
  hasResolvedDisposition(): boolean;
  getSnapshot(): CalibrationOperatorLoopClosureSnapshot;
}

interface RuntimeState {
  current: CalibrationOperatorLoopClosureInput | null;
  resolvedSnapshot: CalibrationOperatorLoopClosureSnapshot | null;
}

const recentActionWindowSeconds = 8;
const blockerLimit = 3;

export const createCalibrationOperatorLoopClosureModel =
  (): CalibrationOperatorLoopClosureModel => {
    const state: RuntimeState = {
      current: null,
      resolvedSnapshot: null
    };

    return {
      update(input) {
        state.current = cloneInput(input);
      },
      acknowledgeDisposition(disposition) {
        if (!state.current) {
          return;
        }

        state.resolvedSnapshot = deriveResolvedSnapshot(state.current, disposition);
      },
      clearLoopClosureDecision() {
        state.resolvedSnapshot = null;
      },
      hasResolvedDisposition() {
        return state.resolvedSnapshot !== null;
      },
      getSnapshot() {
        if (state.resolvedSnapshot) {
          return cloneSnapshot(state.resolvedSnapshot);
        }

        if (!state.current) {
          return createDefaultSnapshot();
        }

        return deriveOpenSnapshot(state.current);
      }
    };
  };

const deriveOpenSnapshot = (
  input: CalibrationOperatorLoopClosureInput
): CalibrationOperatorLoopClosureSnapshot => {
  const baselinePresent = input.comparison.baselineAvailable;
  const frozenReviewPresent = input.passReview.hasFrozenReview;
  const recentActionId = getRecentActionId(input);
  const decisionSignalSufficient = getDecisionSignalSufficient(input);
  const dispositionDomain = deriveDispositionDomain(input, 'none');
  const baseConfidence = deriveOpenConfidence(input);
  const mergedBlockers = mergeBlockers(
    input.workflow.workflowBlockers,
    input.actionCue.blockingFactors,
    frozenReviewPresent ? input.passReview.finalBlockingFactors : []
  );

  if (
    !frozenReviewPresent &&
    input.workflow.nextSuggestedStep === 'freeze-current-review'
  ) {
    return buildSnapshot(
      'open-awaiting-review-freeze',
      'none',
      dispositionDomain,
      baseConfidence,
      'The current pass is ready to freeze into a review snapshot.',
      input.workflow.workflowPrimaryReason,
      mergeBlockers(mergedBlockers, ['Freeze review']),
      false,
      false,
      true,
      decisionSignalSufficient
    );
  }

  if (
    !decisionSignalSufficient ||
    input.actionCue.readinessVerdict === 'insufficient-signal' ||
    input.workflow.workflowPhase === 'post-action-reset-state' ||
    input.workflow.workflowPhase === 'rerun-for-signal' ||
    recentActionId === 'reset-calibration-digest' ||
    recentActionId === 'clear-calibration-baseline'
  ) {
    return buildSnapshot(
      'open-awaiting-rerun',
      'none',
      dispositionDomain,
      clamp(baseConfidence * 0.82, 0, 1),
      recentActionId === 'reset-calibration-digest'
        ? 'The calibration loop was just reset and now needs a fresh rerun.'
        : recentActionId === 'clear-calibration-baseline'
          ? 'The baseline was just cleared, so the loop needs a fresh rerun.'
          : 'The current loop still needs more runtime signal before it can close.',
      input.workflow.workflowSecondaryReason || input.evidence.primaryExplanation,
      mergeBlockers(mergedBlockers, ['Signal still thin']),
      false,
      false,
      true,
      decisionSignalSufficient
    );
  }

  if (
    input.actionCue.readinessVerdict === 'targeted-retune-needed' ||
    input.actionCue.readinessVerdict === 'regressed-do-not-promote' ||
    input.workflow.workflowPhase === 'targeted-retune-pending'
  ) {
    return buildSnapshot(
      'open-awaiting-targeted-retune',
      'none',
      dispositionDomain,
      clamp(baseConfidence * 0.94 + 0.02, 0, 1),
      dispositionDomain !== 'none'
        ? `A bounded ${formatDomainReason(dispositionDomain)} retune is still waiting for operator acknowledgement.`
        : 'A targeted retune decision is still waiting for operator acknowledgement.',
      input.actionCue.secondaryActionReason || input.workflow.workflowPrimaryReason,
      mergeBlockers(
        mergedBlockers,
        dispositionDomain === 'none' ? ['No single domain'] : ['Targeted retune pending']
      ),
      false,
      false,
      true,
      decisionSignalSufficient
    );
  }

  if (
    frozenReviewPresent &&
    (input.actionCue.readinessVerdict === 'ready-to-promote' ||
      input.workflow.workflowPhase === 'baseline-candidate' ||
      input.workflow.workflowPhase === 'review-frozen-awaiting-decision')
  ) {
    return buildSnapshot(
      'open-awaiting-baseline-decision',
      'none',
      dispositionDomain,
      clamp(baseConfidence * 0.96 + 0.02, 0, 1),
      'A frozen review is present, but the operator has not closed the baseline decision yet.',
      baselinePresent
        ? 'Choose whether to keep the existing baseline or promote the current pass.'
        : 'Choose whether to promote the current pass as the first stored baseline.',
      mergeBlockers(
        mergedBlockers,
        baselinePresent ? ['Baseline decision still open'] : ['Baseline missing']
      ),
      false,
      false,
      true,
      decisionSignalSufficient
    );
  }

  return buildSnapshot(
    'open-awaiting-observation',
    'none',
    dispositionDomain,
    clamp(baseConfidence * 0.9, 0, 1),
    input.actionCue.readinessVerdict === 'promising-but-observe'
      ? 'The operator still needs to decide whether this pass should simply be observed longer.'
      : frozenReviewPresent
        ? 'The frozen review is still open, but the strongest current signal is continued observation.'
        : 'The loop is still open while the current pass continues to separate.',
    input.workflow.workflowPrimaryReason,
    mergeBlockers(
      mergedBlockers,
      frozenReviewPresent ? ['Observation decision still open'] : ['Frozen review missing']
    ),
    false,
    false,
    true,
    decisionSignalSufficient
  );
};

const deriveResolvedSnapshot = (
  input: CalibrationOperatorLoopClosureInput,
  disposition: Exclude<CalibrationOperatorDisposition, 'none'>
): CalibrationOperatorLoopClosureSnapshot => {
  const dispositionDomain = deriveDispositionDomain(input, disposition);
  const decisionSignalSufficient = getDecisionSignalSufficient(input);
  const closureConfidence = deriveResolvedConfidence(input, disposition);

  if (disposition === 'promote-current-as-baseline') {
    return buildSnapshot(
      'resolved-promoted-baseline',
      disposition,
      'none',
      closureConfidence,
      'The operator explicitly promoted the current pass as the active baseline.',
      input.passReview.finalPrimaryReason ||
        'The frozen review was accepted as strong enough to anchor the next pass.',
      [],
      true,
      true,
      false,
      decisionSignalSufficient
    );
  }

  if (disposition === 'keep-existing-baseline') {
    return buildSnapshot(
      'resolved-kept-baseline',
      disposition,
      'none',
      closureConfidence,
      'The operator explicitly kept the existing baseline for this loop.',
      input.workflow.workflowPrimaryReason ||
        'The current pass was reviewed, but it was not promoted over the stored baseline.',
      [],
      true,
      true,
      false,
      decisionSignalSufficient
    );
  }

  if (disposition === 'observe-longer') {
    return buildSnapshot(
      'resolved-observe-longer',
      disposition,
      'none',
      closureConfidence,
      'The operator explicitly chose to observe longer before taking a stronger baseline action.',
      input.workflow.workflowPrimaryReason || input.actionCue.primaryActionReason,
      [],
      true,
      false,
      false,
      decisionSignalSufficient
    );
  }

  if (disposition === 'run-targeted-retune') {
    return buildSnapshot(
      'resolved-targeted-retune',
      disposition,
      dispositionDomain,
      closureConfidence,
      dispositionDomain !== 'none'
        ? `The operator explicitly chose a bounded ${formatDomainReason(dispositionDomain)} retune for the next pass.`
        : 'The operator explicitly chose a targeted retune for the next pass.',
      input.workflow.workflowPrimaryReason || input.actionCue.secondaryActionReason,
      [],
      true,
      false,
      false,
      decisionSignalSufficient
    );
  }

  if (disposition === 'rerun-for-signal') {
    return buildSnapshot(
      'resolved-rerun-for-signal',
      disposition,
      'none',
      closureConfidence,
      'The operator explicitly chose to rerun this calibration loop for stronger evidence.',
      input.workflow.workflowPrimaryReason || input.evidence.primaryExplanation,
      [],
      true,
      false,
      false,
      decisionSignalSufficient
    );
  }

  return buildSnapshot(
    'resolved-cleared-review',
    disposition,
    'none',
    closureConfidence,
    'The operator explicitly cleared the frozen review and closed the current loop handoff.',
    input.workflow.workflowPrimaryReason || 'The next calibration cycle can now start with a clean review state.',
    [],
    true,
    false,
    false,
    decisionSignalSufficient
  );
};

const deriveOpenConfidence = (
  input: CalibrationOperatorLoopClosureInput
): number => {
  const actionConfidence = input.passReview.hasFrozenReview
    ? input.passReview.finalActionConfidence
    : input.actionCue.actionConfidence;

  return clamp(
    input.workflow.stepConfidence * 0.46 +
      actionConfidence * 0.34 +
      input.evidence.explanationConfidence * 0.2,
    0,
    1
  );
};

const deriveResolvedConfidence = (
  input: CalibrationOperatorLoopClosureInput,
  disposition: Exclude<CalibrationOperatorDisposition, 'none'>
): number => {
  const openConfidence = deriveOpenConfidence(input);
  const explicitBoost =
    disposition === 'promote-current-as-baseline' ||
    disposition === 'keep-existing-baseline'
      ? 0.08
      : disposition === 'clear-frozen-review'
        ? 0.03
        : 0.05;

  return clamp(openConfidence * 0.92 + explicitBoost, 0, 1);
};

const deriveDispositionDomain = (
  input: CalibrationOperatorLoopClosureInput,
  disposition: CalibrationOperatorDisposition
): CalibrationRetuningDomain =>
  disposition === 'run-targeted-retune'
    ? input.actionCue.recommendedDomain !== 'none'
      ? input.actionCue.recommendedDomain
      : input.workflow.suggestedDomain !== 'none'
        ? input.workflow.suggestedDomain
        : input.passReview.finalRecommendedDomain
    : 'none';

const getDecisionSignalSufficient = (
  input: CalibrationOperatorLoopClosureInput
): boolean =>
  input.passReview.hasFrozenReview
    ? input.passReview.finalSignalSufficient
    : input.actionCue.actionSignalSufficient;

const getRecentActionId = (
  input: CalibrationOperatorLoopClosureInput
): CalibrationOperatorActionId =>
  typeof input.operatorControls.lastActionRuntimeSeconds === 'number' &&
  Math.max(0, input.runtimeSeconds - input.operatorControls.lastActionRuntimeSeconds) <=
    recentActionWindowSeconds
    ? input.operatorControls.lastActionId
    : 'none';

const buildSnapshot = (
  loopClosureState: CalibrationOperatorLoopClosureState,
  operatorDisposition: CalibrationOperatorDisposition,
  dispositionDomain: CalibrationRetuningDomain,
  closureConfidence: number,
  closurePrimaryReason: string,
  closureSecondaryReason: string,
  closureBlockers: string[],
  loopResolved: boolean,
  baselineDecisionApplied: boolean,
  frozenReviewRequired: boolean,
  decisionSignalSufficient: boolean
): CalibrationOperatorLoopClosureSnapshot => ({
  loopClosureState,
  operatorDisposition,
  dispositionDomain,
  closureConfidence: clamp(closureConfidence, 0, 1),
  closurePrimaryReason,
  closureSecondaryReason,
  closureBlockers: closureBlockers.slice(0, blockerLimit),
  loopResolved,
  baselineDecisionApplied,
  frozenReviewRequired,
  decisionSignalSufficient
});

const mergeBlockers = (...groups: string[][]): string[] =>
  groups
    .flat()
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
    .slice(0, blockerLimit);

const createDefaultSnapshot = (): CalibrationOperatorLoopClosureSnapshot => ({
  loopClosureState: 'open-awaiting-rerun',
  operatorDisposition: 'none',
  dispositionDomain: 'none',
  closureConfidence: 0.24,
  closurePrimaryReason: 'The calibration loop is still open and waiting for usable signal.',
  closureSecondaryReason: 'Freeze a review and acknowledge a final disposition when the pass is ready.',
  closureBlockers: ['Signal still thin'],
  loopResolved: false,
  baselineDecisionApplied: false,
  frozenReviewRequired: true,
  decisionSignalSufficient: false
});

const cloneInput = (
  input: CalibrationOperatorLoopClosureInput
): CalibrationOperatorLoopClosureInput => ({
  runtimeSeconds: input.runtimeSeconds,
  actionCue: {
    readinessVerdict: input.actionCue.readinessVerdict,
    recommendedAction: input.actionCue.recommendedAction,
    recommendedDomain: input.actionCue.recommendedDomain,
    baselinePromotionAllowed: input.actionCue.baselinePromotionAllowed,
    actionConfidence: input.actionCue.actionConfidence,
    primaryActionReason: input.actionCue.primaryActionReason,
    secondaryActionReason: input.actionCue.secondaryActionReason,
    blockingFactors: [...input.actionCue.blockingFactors],
    actionSignalSufficient: input.actionCue.actionSignalSufficient
  },
  comparison: {
    ...input.comparison,
    dominantDriftChange: { ...input.comparison.dominantDriftChange },
    dominantCalibrationDomainChange: {
      ...input.comparison.dominantCalibrationDomainChange
    },
    overallTuningPriorityChange: {
      ...input.comparison.overallTuningPriorityChange
    },
    escalationTimingSummaryChange: {
      ...input.comparison.escalationTimingSummaryChange
    },
    resetQualitySummaryChange: {
      ...input.comparison.resetQualitySummaryChange
    },
    closureStickinessSummaryChange: {
      ...input.comparison.closureStickinessSummaryChange
    }
  },
  evidence: {
    topEvidenceDrivers: input.evidence.topEvidenceDrivers.map((driver) => ({
      ...driver
    })),
    topPositiveDrivers: input.evidence.topPositiveDrivers.map((driver) => ({
      ...driver
    })),
    topNegativeDrivers: input.evidence.topNegativeDrivers.map((driver) => ({
      ...driver
    })),
    primaryExplanation: input.evidence.primaryExplanation,
    secondaryExplanation: input.evidence.secondaryExplanation,
    explanationConfidence: input.evidence.explanationConfidence,
    evidencePressureScore: input.evidence.evidencePressureScore,
    evidenceSignalSufficient: input.evidence.evidenceSignalSufficient
  },
  passReview: {
    ...input.passReview,
    finalBlockingFactors: [...input.passReview.finalBlockingFactors]
  },
  workflow: {
    workflowPhase: input.workflow.workflowPhase,
    nextSuggestedStep: input.workflow.nextSuggestedStep,
    suggestedDomain: input.workflow.suggestedDomain,
    stepConfidence: input.workflow.stepConfidence,
    workflowPrimaryReason: input.workflow.workflowPrimaryReason,
    workflowSecondaryReason: input.workflow.workflowSecondaryReason,
    workflowBlockers: [...input.workflow.workflowBlockers],
    workflowSignalSufficient: input.workflow.workflowSignalSufficient,
    baselinePresent: input.workflow.baselinePresent,
    frozenReviewPresent: input.workflow.frozenReviewPresent
  },
  operatorControls: {
    lastActionId: input.operatorControls.lastActionId,
    lastActionLabel: input.operatorControls.lastActionLabel,
    lastActionRuntimeSeconds: input.operatorControls.lastActionRuntimeSeconds,
    actionFeedbackText: input.operatorControls.actionFeedbackText,
    actionFeedbackSeverity: input.operatorControls.actionFeedbackSeverity
  }
});

const cloneSnapshot = (
  snapshot: CalibrationOperatorLoopClosureSnapshot
): CalibrationOperatorLoopClosureSnapshot => ({
  loopClosureState: snapshot.loopClosureState,
  operatorDisposition: snapshot.operatorDisposition,
  dispositionDomain: snapshot.dispositionDomain,
  closureConfidence: snapshot.closureConfidence,
  closurePrimaryReason: snapshot.closurePrimaryReason,
  closureSecondaryReason: snapshot.closureSecondaryReason,
  closureBlockers: [...snapshot.closureBlockers],
  loopResolved: snapshot.loopResolved,
  baselineDecisionApplied: snapshot.baselineDecisionApplied,
  frozenReviewRequired: snapshot.frozenReviewRequired,
  decisionSignalSufficient: snapshot.decisionSignalSufficient
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
          : 'calibration';
