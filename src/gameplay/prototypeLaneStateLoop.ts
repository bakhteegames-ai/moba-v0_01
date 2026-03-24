import {
  type CalibrationResolution,
  type DefenderHoldState,
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import { layoutConfig } from '../config/layout';
import {
  createPrototypeLaneOccupancyProducer,
  type PrototypeLaneOccupancySnapshot,
  type PrototypeStructureContactState,
  type PrototypeDefenderTimingTag
} from './prototypeLaneOccupancyProducer';
import {
  createStructurePressureEventTracker,
  type StructurePressureEventSnapshot,
  type StructurePressureCalibrationContext,
  type StructurePressureTierEventState,
  type StructurePressureEventTrackerInput
} from './structurePressureEventTracker';
import {
  createStructureResolutionMemory,
  type StructureResolutionSnapshot,
  type StructureResolutionTierState,
  type StructureResolutionCalibrationContext
} from './structureResolutionMemory';
import {
  createLaneClosurePostureModel,
  type LaneClosurePostureSnapshot
} from './laneClosurePosture';
import {
  createClosurePacingInterpreter,
  type ClosurePacingSnapshot
} from './closurePacingInterpreter';
import {
  createClosurePacingWatch,
  type ClosurePacingWatchSnapshot
} from './closurePacingWatch';
import {
  createClosureDoctrineFitEvaluator,
  type ClosureDoctrineFitSnapshot
} from './closureDoctrineFitEvaluator';
import {
  createCalibrationRetuningSuggestionsModel,
  type CalibrationRetuningSuggestionsSnapshot
} from './calibrationRetuningSuggestions';
import {
  createCalibrationDigestSummaryModel,
  type CalibrationDigestSummarySnapshot
} from './calibrationDigestSummary';
import {
  createCalibrationDigestComparisonModel,
  type CalibrationDigestComparisonSnapshot
} from './calibrationDigestComparison';
import {
  createCalibrationEvidenceExplainerModel,
  type CalibrationEvidenceExplainerSnapshot
} from './calibrationEvidenceExplainer';
import {
  createCalibrationPassActionCueModel,
  type CalibrationPassActionCueSnapshot
} from './calibrationPassActionCue';
import {
  createCalibrationPassReviewHandoffModel,
  type CalibrationPassReviewHandoffSnapshot,
  type CalibrationPassReviewTrigger
} from './calibrationPassReviewHandoff';
import {
  createCalibrationOperatorControlsModel,
  type CalibrationOperatorActionId,
  type CalibrationOperatorControlsSnapshot,
  type CalibrationOperatorFeedbackSeverity
} from './calibrationOperatorControls';
import {
  createCalibrationOperatorWorkflowGuideModel,
  type CalibrationOperatorWorkflowGuideSnapshot
} from './calibrationOperatorWorkflowGuide';
import {
  createCalibrationOperatorLoopClosureModel,
  type CalibrationOperatorDisposition,
  type CalibrationOperatorLoopClosureSnapshot
} from './calibrationOperatorLoopClosure';
import {
  buildHeadlessBridgeLaneModifier,
  cloneHeadlessBridgeLaneConsequenceSnapshot,
  createDefaultHeadlessBridgeLaneConsequenceSnapshot,
  type HeadlessBridgeLaneConsequenceSnapshot
} from './headlessBridgeConsequenceAdapter';

type SegmentValues = Record<LanePressureSegment, number>;
type TierValues = Record<StructurePressureTier, number>;
type TierStates = Record<StructurePressureTier, DefenderHoldState>;
type SegmentCounts = Record<LanePressureSegment, number>;
type ContactByTier = Record<StructurePressureTier, PrototypeStructureContactState>;
type TimingTagsByTier = Record<StructurePressureTier, PrototypeDefenderTimingTag>;
type TierPressureEvents = Record<StructurePressureTier, StructurePressureTierEventState>;
type TierEventCalibration = Record<StructurePressureTier, StructurePressureCalibrationContext>;
type TierResolutionState = Record<StructurePressureTier, StructureResolutionTierState>;
type TierResolutionCalibration = Record<StructurePressureTier, StructureResolutionCalibrationContext>;

export interface PrototypeLaneStateSnapshot {
  elapsedSeconds: number;
  cycleSeconds: number;
  phase: number;
  activeSegment: LanePressureSegment;
  frontWaveSegment: LanePressureSegment;
  frontWaveProgress: number;
  spawnedWaveCount: number;
  activeWaveCount: number;
  segmentOccupancyCount: SegmentCounts;
  segmentOccupancyPresence: SegmentValues;
  segmentTimeInSegmentSeconds: SegmentValues;
  structureContactByTier: ContactByTier;
  defenderTimingTagsByTier: TimingTagsByTier;
  structurePressureEventsByTier: TierPressureEvents;
  eventCalibrationByTier: TierEventCalibration;
  structureResolutionByTier: TierResolutionState;
  resolutionCalibrationByTier: TierResolutionCalibration;
  consecutiveWaveCarryoverRelevance: number;
  lanePressureBySegment: SegmentValues;
  waveOccupancyBySegment: SegmentValues;
  waveProgressionBySegment: SegmentValues;
  structurePressureByTier: TierValues;
  defenderHoldByTier: TierValues;
  defenderReclearByTier: TierValues;
  defenderStateByTier: TierStates;
  carryoverPressureState: number;
  laneClosure: LaneClosurePostureSnapshot;
  closurePacing: ClosurePacingSnapshot;
  closurePacingWatch: ClosurePacingWatchSnapshot;
  closureDoctrineFit: ClosureDoctrineFitSnapshot;
  calibrationRetuning: CalibrationRetuningSuggestionsSnapshot;
  calibrationDigest: CalibrationDigestSummarySnapshot;
  calibrationDigestComparison: CalibrationDigestComparisonSnapshot;
  calibrationEvidence: CalibrationEvidenceExplainerSnapshot;
  calibrationPassAction: CalibrationPassActionCueSnapshot;
  calibrationPassReview: CalibrationPassReviewHandoffSnapshot;
  calibrationOperatorControls: CalibrationOperatorControlsSnapshot;
  calibrationOperatorWorkflow: CalibrationOperatorWorkflowGuideSnapshot;
  calibrationOperatorLoopClosure: CalibrationOperatorLoopClosureSnapshot;
  sharedLaneConsequence: HeadlessBridgeLaneConsequenceSnapshot;
}

export interface PrototypeLaneOutcomeSample {
  id: string;
  resolution: CalibrationResolution;
  completionRatio: number;
  remainingWindowSeconds: number;
}

export interface PrototypeLaneStateLoop {
  update(dt: number): void;
  setSharedLaneConsequence(
    consequence: HeadlessBridgeLaneConsequenceSnapshot
  ): void;
  getSnapshot(): PrototypeLaneStateSnapshot;
  recordOutcome(sample: PrototypeLaneOutcomeSample): void;
  resetCalibrationDigest(): void;
  captureCurrentCalibrationBaseline(): void;
  clearCalibrationBaseline(): void;
  freezeCurrentCalibrationPassReview(reason: CalibrationPassReviewTrigger): void;
  clearFrozenCalibrationPassReview(): void;
  acknowledgeCalibrationLoopDisposition(
    disposition: Extract<
      CalibrationOperatorDisposition,
      | 'keep-existing-baseline'
      | 'observe-longer'
      | 'run-targeted-retune'
      | 'rerun-for-signal'
    >
  ): void;
  clearCalibrationLoopClosureDecision(): void;
}

interface LaneStateMemory {
  elapsedSeconds: number;
  carryoverPressureState: number;
  outcomeBias: number;
}

const carryoverStateMin = 0.95;
const carryoverStateMax = 1.08;
const biasMin = -0.05;
const biasMax = 0.06;

const segmentOrder: LanePressureSegment[] = [
  'outer-front',
  'inner-siege',
  'core-approach'
];

const segmentReferenceSeconds: SegmentValues = {
  'outer-front': 30 / Math.max(0.5, layoutConfig.player.moveSpeed),
  'inner-siege': 26 / Math.max(0.5, layoutConfig.player.moveSpeed),
  'core-approach': 10 / Math.max(0.5, layoutConfig.player.moveSpeed)
};

export const createPrototypeLaneStateLoop = (): PrototypeLaneStateLoop => {
  const occupancyProducer = createPrototypeLaneOccupancyProducer();
  const structureEventTracker = createStructurePressureEventTracker();
  const structureResolutionMemory = createStructureResolutionMemory();
  const laneClosurePosture = createLaneClosurePostureModel();
  const closurePacingInterpreter = createClosurePacingInterpreter();
  const closurePacingWatch = createClosurePacingWatch();
  const closureDoctrineFitEvaluator = createClosureDoctrineFitEvaluator();
  const calibrationRetuningSuggestions = createCalibrationRetuningSuggestionsModel();
  const calibrationDigestSummary = createCalibrationDigestSummaryModel();
  const calibrationDigestComparison = createCalibrationDigestComparisonModel();
  const calibrationEvidenceExplainer = createCalibrationEvidenceExplainerModel();
  const calibrationPassActionCue = createCalibrationPassActionCueModel();
  const calibrationPassReviewHandoff = createCalibrationPassReviewHandoffModel();
  const calibrationOperatorControls = createCalibrationOperatorControlsModel();
  const calibrationOperatorWorkflowGuide = createCalibrationOperatorWorkflowGuideModel();
  const calibrationOperatorLoopClosure = createCalibrationOperatorLoopClosureModel();
  let sharedLaneConsequence =
    createDefaultHeadlessBridgeLaneConsequenceSnapshot();
  const memory: LaneStateMemory = {
    elapsedSeconds: 0,
    carryoverPressureState: 1,
    outcomeBias: 0
  };

  const syncCalibrationActionCue = (dt: number): void => {
    const closureDoctrineFitSnapshot = closureDoctrineFitEvaluator.getSnapshot();
    const calibrationRetuningSnapshot = calibrationRetuningSuggestions.getSnapshot();
    const calibrationDigestSnapshot = calibrationDigestSummary.getSnapshot();

    calibrationDigestComparison.update(calibrationDigestSnapshot);
    const calibrationDigestComparisonSnapshot =
      calibrationDigestComparison.getSnapshot();
    calibrationEvidenceExplainer.update(dt, {
      doctrineFit: closureDoctrineFitSnapshot,
      retuning: calibrationRetuningSnapshot,
      digest: calibrationDigestSnapshot,
      comparison: calibrationDigestComparisonSnapshot
    });
    calibrationPassActionCue.update(dt, {
      doctrineFit: closureDoctrineFitSnapshot,
      retuning: calibrationRetuningSnapshot,
      digest: calibrationDigestSnapshot,
      comparison: calibrationDigestComparisonSnapshot,
      evidence: calibrationEvidenceExplainer.getSnapshot()
    });
    calibrationPassReviewHandoff.update({
      runtimeSeconds: memory.elapsedSeconds,
      doctrineFit: closureDoctrineFitSnapshot,
      retuning: calibrationRetuningSnapshot,
      digest: calibrationDigestSnapshot,
      comparison: calibrationDigestComparisonSnapshot,
      evidence: calibrationEvidenceExplainer.getSnapshot(),
      actionCue: calibrationPassActionCue.getSnapshot()
    });
    calibrationOperatorWorkflowGuide.update({
      runtimeSeconds: memory.elapsedSeconds,
      actionCue: calibrationPassActionCue.getSnapshot(),
      comparison: calibrationDigestComparisonSnapshot,
      evidence: calibrationEvidenceExplainer.getSnapshot(),
      passReview: calibrationPassReviewHandoff.getSnapshot(),
      operatorControls: calibrationOperatorControls.getSnapshot()
    });
    calibrationOperatorLoopClosure.update({
      runtimeSeconds: memory.elapsedSeconds,
      actionCue: calibrationPassActionCue.getSnapshot(),
      comparison: calibrationDigestComparisonSnapshot,
      evidence: calibrationEvidenceExplainer.getSnapshot(),
      passReview: calibrationPassReviewHandoff.getSnapshot(),
      workflow: calibrationOperatorWorkflowGuide.getSnapshot(),
      operatorControls: calibrationOperatorControls.getSnapshot()
    });
  };

  const recordCalibrationOperatorAction = (
    actionId: Exclude<CalibrationOperatorActionId, 'none'>,
    actionFeedbackText: string,
    actionFeedbackSeverity: CalibrationOperatorFeedbackSeverity
  ): void => {
    calibrationOperatorControls.recordAction({
      actionId,
      runtimeSeconds: memory.elapsedSeconds,
      actionFeedbackText,
      actionFeedbackSeverity
    });
    syncCalibrationActionCue(0);
  };

  return {
    update(dt) {
      if (dt <= 0) {
        return;
      }

      memory.elapsedSeconds += dt;
      occupancyProducer.update(dt);
      const occupancy = occupancyProducer.getSnapshot();
      const sharedLaneModifier =
        buildHeadlessBridgeLaneModifier(sharedLaneConsequence);
      structureEventTracker.update(
        dt,
        memory.elapsedSeconds,
        buildStructureEventInput(occupancy, sharedLaneModifier)
      );
      const eventSnapshot = structureEventTracker.getSnapshot(memory.elapsedSeconds);
      const structurePressureEstimate = buildStructurePressureEstimate(
        occupancy,
        sharedLaneModifier
      );
      structureResolutionMemory.update(
        dt,
        memory.elapsedSeconds,
        structurePressureEstimate,
        eventSnapshot
      );
      const resolutionSnapshot = structureResolutionMemory.getSnapshot();
      const lanePressureEstimate = buildLanePressureEstimate(
        occupancy,
        sharedLaneModifier
      );
      laneClosurePosture.update(dt, {
        resolutionByTier: {
          outer: resolutionSnapshot.byTier.outer,
          inner: resolutionSnapshot.byTier.inner,
          core: resolutionSnapshot.byTier.core
        },
        structurePressureByTier: structurePressureEstimate,
        structureContactByTier: occupancy.structureContactByTier,
        lanePressureBySegment: lanePressureEstimate,
        consecutiveWaveCarryoverRelevance: occupancy.consecutiveWaveCarryoverRelevance
      });
      const laneClosureSnapshot = laneClosurePosture.getSnapshot();
      closurePacingInterpreter.update(dt, {
        laneClosure: laneClosureSnapshot,
        resolutionByTier: {
          outer: resolutionSnapshot.byTier.outer,
          inner: resolutionSnapshot.byTier.inner,
          core: resolutionSnapshot.byTier.core
        },
        structurePressureByTier: structurePressureEstimate,
        structureContactByTier: occupancy.structureContactByTier,
        lanePressureBySegment: lanePressureEstimate,
        carryoverPressureState: memory.carryoverPressureState,
        consecutiveWaveCarryoverRelevance: occupancy.consecutiveWaveCarryoverRelevance
      });
      const closurePacingSnapshot = closurePacingInterpreter.getSnapshot();
      closurePacingWatch.update(dt, {
        elapsedSeconds: memory.elapsedSeconds,
        cycleSeconds: occupancy.cycleSeconds,
        pacing: closurePacingSnapshot,
        laneClosure: laneClosureSnapshot,
        resolutionByTier: {
          outer: resolutionSnapshot.byTier.outer,
          inner: resolutionSnapshot.byTier.inner,
          core: resolutionSnapshot.byTier.core
        }
      });
      const closurePacingWatchSnapshot = closurePacingWatch.getSnapshot();
      closureDoctrineFitEvaluator.update(dt, {
        elapsedSeconds: memory.elapsedSeconds,
        cycleSeconds: occupancy.cycleSeconds,
        pacing: closurePacingSnapshot,
        watch: closurePacingWatchSnapshot
      });
      const closureDoctrineFitSnapshot = closureDoctrineFitEvaluator.getSnapshot();
      calibrationRetuningSuggestions.update({
        doctrineFit: closureDoctrineFitSnapshot,
        pacing: closurePacingSnapshot,
        watch: closurePacingWatchSnapshot
      });
      const calibrationRetuningSnapshot = calibrationRetuningSuggestions.getSnapshot();
      calibrationDigestSummary.update(dt, {
        doctrineFit: closureDoctrineFitSnapshot,
        pacing: closurePacingSnapshot,
        watch: closurePacingWatchSnapshot,
        retuning: calibrationRetuningSnapshot
      });
      const calibrationDigestSnapshot = calibrationDigestSummary.getSnapshot();
      calibrationDigestComparison.update(calibrationDigestSnapshot);
      const calibrationDigestComparisonSnapshot =
        calibrationDigestComparison.getSnapshot();
      calibrationEvidenceExplainer.update(dt, {
        doctrineFit: closureDoctrineFitSnapshot,
        retuning: calibrationRetuningSnapshot,
        digest: calibrationDigestSnapshot,
        comparison: calibrationDigestComparisonSnapshot
      });
      calibrationPassActionCue.update(dt, {
        doctrineFit: closureDoctrineFitSnapshot,
        retuning: calibrationRetuningSnapshot,
        digest: calibrationDigestSnapshot,
        comparison: calibrationDigestComparisonSnapshot,
        evidence: calibrationEvidenceExplainer.getSnapshot()
      });
      const carryoverTarget = computeCarryoverTarget(
        occupancy,
        eventSnapshot,
        resolutionSnapshot,
        laneClosureSnapshot,
        closurePacingSnapshot,
        memory.outcomeBias
      );

      memory.carryoverPressureState = approach(memory.carryoverPressureState, carryoverTarget, dt * 0.35);
      memory.outcomeBias = approach(memory.outcomeBias, 0, dt * 0.09);
    },
    setSharedLaneConsequence(consequence) {
      sharedLaneConsequence =
        cloneHeadlessBridgeLaneConsequenceSnapshot(consequence);
    },
    getSnapshot() {
      const occupancy = occupancyProducer.getSnapshot();
      const eventSnapshot = structureEventTracker.getSnapshot(memory.elapsedSeconds);
      const resolutionSnapshot = structureResolutionMemory.getSnapshot();
      const laneClosureSnapshot = laneClosurePosture.getSnapshot();
      const closurePacingSnapshot = closurePacingInterpreter.getSnapshot();
      const closurePacingWatchSnapshot = closurePacingWatch.getSnapshot();
      const closureDoctrineFitSnapshot = closureDoctrineFitEvaluator.getSnapshot();
      const calibrationRetuningSnapshot = calibrationRetuningSuggestions.getSnapshot();
      const calibrationDigestSnapshot = calibrationDigestSummary.getSnapshot();
      const calibrationDigestComparisonSnapshot =
        calibrationDigestComparison.getSnapshot();
      const calibrationEvidenceSnapshot =
        calibrationEvidenceExplainer.getSnapshot();
      const calibrationPassActionSnapshot =
        calibrationPassActionCue.getSnapshot();
      const calibrationPassReviewSnapshot =
        calibrationPassReviewHandoff.getSnapshot();
      const calibrationOperatorControlsSnapshot =
        calibrationOperatorControls.getSnapshot();
      const calibrationOperatorWorkflowSnapshot =
        calibrationOperatorWorkflowGuide.getSnapshot();
      const calibrationOperatorLoopClosureSnapshot =
        calibrationOperatorLoopClosure.getSnapshot();
      return computeSnapshot(
        memory,
        occupancy,
        eventSnapshot,
        resolutionSnapshot,
        laneClosureSnapshot,
        closurePacingSnapshot,
        closurePacingWatchSnapshot,
        closureDoctrineFitSnapshot,
        calibrationRetuningSnapshot,
        calibrationDigestSnapshot,
        calibrationDigestComparisonSnapshot,
        calibrationEvidenceSnapshot,
        calibrationPassActionSnapshot,
        calibrationPassReviewSnapshot,
        calibrationOperatorControlsSnapshot,
        calibrationOperatorWorkflowSnapshot,
        calibrationOperatorLoopClosureSnapshot,
        sharedLaneConsequence
      );
    },
    recordOutcome(sample) {
      if (sample.id !== 'two-wave-live') {
        return;
      }

      const target = sample.resolution === 'attacker-window'
        ? clamp(
            0.995 +
              sample.completionRatio * 0.022 +
              Math.min(0.018, sample.remainingWindowSeconds * 0.0055),
            carryoverStateMin,
            carryoverStateMax
          )
        : sample.resolution === 'stalled'
          ? 0.988
          : 0.978;

      const biasDelta = sample.resolution === 'attacker-window'
        ? clamp(sample.completionRatio * 0.022 + sample.remainingWindowSeconds * 0.004, 0, 0.03)
        : sample.resolution === 'stalled'
          ? -0.005
          : -clamp((1 - sample.completionRatio) * 0.02 + 0.006, 0.006, 0.026);
      memory.outcomeBias = clamp(memory.outcomeBias + biasDelta, biasMin, biasMax);

      memory.carryoverPressureState = clamp(
        memory.carryoverPressureState * 0.78 + target * 0.22,
        carryoverStateMin,
        carryoverStateMax
      );
    },
    resetCalibrationDigest() {
      syncCalibrationActionCue(0);
      calibrationPassReviewHandoff.freezeCurrentCalibrationPassReview(
        'reset-calibration-digest'
      );
      calibrationDigestSummary.reset();
      calibrationEvidenceExplainer.reset();
      calibrationPassActionCue.reset();
      syncCalibrationActionCue(0);
      const comparisonSnapshot = calibrationDigestComparison.getSnapshot();
      const passReviewSnapshot = calibrationPassReviewHandoff.getSnapshot();
      recordCalibrationOperatorAction(
        'reset-calibration-digest',
        `Calibration digest reset; baseline ${comparisonSnapshot.baselineAvailable ? 'kept' : 'absent'}, frozen review ${passReviewSnapshot.hasFrozenReview ? 'stored' : 'absent'}.`,
        'info'
      );
    },
    captureCurrentCalibrationBaseline() {
      syncCalibrationActionCue(0);
      calibrationPassReviewHandoff.freezeCurrentCalibrationPassReview(
        'capture-current-calibration-baseline'
      );
      calibrationDigestComparison.captureCurrentCalibrationBaseline();
      syncCalibrationActionCue(0);
      calibrationOperatorLoopClosure.acknowledgeDisposition(
        'promote-current-as-baseline'
      );
      const passReviewSnapshot = calibrationPassReviewHandoff.getSnapshot();
      recordCalibrationOperatorAction(
        'capture-current-calibration-baseline',
        `Current calibration digest captured as the baseline; loop closure marked promoted baseline${passReviewSnapshot.hasFrozenReview ? ' with frozen review retained' : ''}.`,
        'success'
      );
    },
    clearCalibrationBaseline() {
      syncCalibrationActionCue(0);
      calibrationPassReviewHandoff.freezeCurrentCalibrationPassReview(
        'clear-calibration-baseline'
      );
      calibrationDigestComparison.clearCalibrationBaseline();
      syncCalibrationActionCue(0);
      const passReviewSnapshot = calibrationPassReviewHandoff.getSnapshot();
      recordCalibrationOperatorAction(
        'clear-calibration-baseline',
        `Stored calibration baseline cleared; frozen review ${passReviewSnapshot.hasFrozenReview ? 'preserved' : 'absent'}.`,
        'warning'
      );
    },
    freezeCurrentCalibrationPassReview(reason) {
      syncCalibrationActionCue(0);
      calibrationPassReviewHandoff.freezeCurrentCalibrationPassReview(reason, true);
      recordCalibrationOperatorAction(
        'freeze-current-calibration-pass-review',
        'Current pass review frozen for operator handoff.',
        'success'
      );
    },
    clearFrozenCalibrationPassReview() {
      const passReviewSnapshot = calibrationPassReviewHandoff.getSnapshot();
      const hasResolvedDisposition =
        calibrationOperatorLoopClosure.hasResolvedDisposition();
      calibrationPassReviewHandoff.clearFrozenCalibrationPassReview();
      if (passReviewSnapshot.hasFrozenReview && !hasResolvedDisposition) {
        calibrationOperatorLoopClosure.acknowledgeDisposition(
          'clear-frozen-review'
        );
      }
      recordCalibrationOperatorAction(
        'clear-frozen-calibration-pass-review',
        passReviewSnapshot.hasFrozenReview
          ? 'Frozen pass review cleared.'
          : 'No frozen pass review was present to clear.',
        passReviewSnapshot.hasFrozenReview ? 'warning' : 'info'
      );
    },
    acknowledgeCalibrationLoopDisposition(disposition) {
      syncCalibrationActionCue(0);
      const passReviewSnapshot = calibrationPassReviewHandoff.getSnapshot();
      const comparisonSnapshot = calibrationDigestComparison.getSnapshot();
      const workflowSnapshot = calibrationOperatorWorkflowGuide.getSnapshot();

      if (!passReviewSnapshot.hasFrozenReview) {
        recordCalibrationOperatorAction(
          disposition === 'keep-existing-baseline'
            ? 'acknowledge-keep-existing-baseline'
            : disposition === 'observe-longer'
              ? 'acknowledge-observe-longer'
              : disposition === 'run-targeted-retune'
                ? 'acknowledge-run-targeted-retune'
                : 'acknowledge-rerun-for-signal',
          'Freeze a pass review before acknowledging a final loop disposition.',
          'warning'
        );
        return;
      }

      if (
        disposition === 'keep-existing-baseline' &&
        !comparisonSnapshot.baselineAvailable
      ) {
        recordCalibrationOperatorAction(
          'acknowledge-keep-existing-baseline',
          'No stored baseline is present to keep for this loop.',
          'warning'
        );
        return;
      }

      calibrationOperatorLoopClosure.acknowledgeDisposition(disposition);
      const closureSnapshot = calibrationOperatorLoopClosure.getSnapshot();
      const domainSuffix =
        disposition === 'run-targeted-retune' &&
        workflowSnapshot.suggestedDomain !== 'none'
          ? ` in ${workflowSnapshot.suggestedDomain}`
          : '';
      recordCalibrationOperatorAction(
        disposition === 'keep-existing-baseline'
          ? 'acknowledge-keep-existing-baseline'
          : disposition === 'observe-longer'
            ? 'acknowledge-observe-longer'
            : disposition === 'run-targeted-retune'
              ? 'acknowledge-run-targeted-retune'
              : 'acknowledge-rerun-for-signal',
        disposition === 'keep-existing-baseline'
          ? 'Existing baseline explicitly kept for this calibration loop.'
          : disposition === 'observe-longer'
            ? 'Observe-longer disposition explicitly acknowledged for this calibration loop.'
            : disposition === 'run-targeted-retune'
              ? `Targeted-retune disposition explicitly acknowledged${domainSuffix}.`
              : 'Rerun-for-signal disposition explicitly acknowledged for this calibration loop.',
        closureSnapshot.loopResolved ? 'success' : 'info'
      );
    },
    clearCalibrationLoopClosureDecision() {
      calibrationOperatorLoopClosure.clearLoopClosureDecision();
      recordCalibrationOperatorAction(
        'clear-calibration-loop-closure-decision',
        'Operator loop-closure decision cleared; the current cycle is open again.',
        'info'
      );
    }
  };
};

const computeSnapshot = (
  memory: LaneStateMemory,
  occupancy: PrototypeLaneOccupancySnapshot,
  eventSnapshot: StructurePressureEventSnapshot,
  resolutionSnapshot: StructureResolutionSnapshot,
  laneClosureSnapshot: LaneClosurePostureSnapshot,
  closurePacingSnapshot: ClosurePacingSnapshot,
  closurePacingWatchSnapshot: ClosurePacingWatchSnapshot,
  closureDoctrineFitSnapshot: ClosureDoctrineFitSnapshot,
  calibrationRetuningSnapshot: CalibrationRetuningSuggestionsSnapshot,
  calibrationDigestSnapshot: CalibrationDigestSummarySnapshot,
  calibrationDigestComparisonSnapshot: CalibrationDigestComparisonSnapshot,
  calibrationEvidenceSnapshot: CalibrationEvidenceExplainerSnapshot,
  calibrationPassActionSnapshot: CalibrationPassActionCueSnapshot,
  calibrationPassReviewSnapshot: CalibrationPassReviewHandoffSnapshot,
  calibrationOperatorControlsSnapshot: CalibrationOperatorControlsSnapshot,
  calibrationOperatorWorkflowSnapshot: CalibrationOperatorWorkflowGuideSnapshot,
  calibrationOperatorLoopClosureSnapshot: CalibrationOperatorLoopClosureSnapshot,
  sharedLaneConsequenceSnapshot: HeadlessBridgeLaneConsequenceSnapshot
): PrototypeLaneStateSnapshot => {
  const sharedLaneModifier =
    buildHeadlessBridgeLaneModifier(sharedLaneConsequenceSnapshot);
  const phase = computePhase(occupancy.frontWaveSegment, occupancy.frontWaveProgress);
  const frontBoostOuter = occupancy.frontWaveSegment === 'outer-front' ? occupancy.frontWaveProgress : 0;
  const frontBoostInner = occupancy.frontWaveSegment === 'inner-siege' ? occupancy.frontWaveProgress : 0;
  const frontBoostCore = occupancy.frontWaveSegment === 'core-approach' ? occupancy.frontWaveProgress : 0;
  const occupancyPresence = occupancy.segmentOccupancyPresence;
  const timeInSegment = occupancy.segmentTimeInSegmentSeconds;

  const waveOccupancyBySegment: SegmentValues = {
    'outer-front': clamp(
      0.08 +
        occupancyPresence['outer-front'] * 0.68 +
        clamp(occupancy.segmentOccupancyCount['outer-front'] / 3, 0, 1) * 0.22 +
        sharedLaneModifier.occupancyBySegment['outer-front'],
      0,
      1
    ),
    'inner-siege': clamp(
      0.08 +
        occupancyPresence['inner-siege'] * 0.7 +
        clamp(occupancy.segmentOccupancyCount['inner-siege'] / 3, 0, 1) * 0.22 +
        sharedLaneModifier.occupancyBySegment['inner-siege'],
      0,
      1
    ),
    'core-approach': clamp(
      0.08 +
        occupancyPresence['core-approach'] * 0.72 +
        clamp(occupancy.segmentOccupancyCount['core-approach'] / 3, 0, 1) * 0.2 +
        sharedLaneModifier.occupancyBySegment['core-approach'],
      0,
      1
    )
  };

  const lanePressureBySegment: SegmentValues = {
    'outer-front': clamp(
      0.17 +
        waveOccupancyBySegment['outer-front'] * 0.46 +
        occupancy.structureContactByTier.outer.pressure * 0.29 +
        frontBoostOuter * 0.17 +
        sharedLaneModifier.lanePressureBySegment['outer-front'],
      0,
      1
    ),
    'inner-siege': clamp(
      0.18 +
        waveOccupancyBySegment['inner-siege'] * 0.45 +
        occupancy.structureContactByTier.inner.pressure * 0.3 +
        frontBoostInner * 0.18 +
        occupancy.consecutiveWaveCarryoverRelevance * 0.1 +
        sharedLaneModifier.lanePressureBySegment['inner-siege'],
      0,
      1
    ),
    'core-approach': clamp(
      0.15 +
        waveOccupancyBySegment['core-approach'] * 0.47 +
        occupancy.structureContactByTier.core.pressure * 0.31 +
        frontBoostCore * 0.2 +
        occupancy.consecutiveWaveCarryoverRelevance * 0.09 +
        sharedLaneModifier.lanePressureBySegment['core-approach'],
      0,
      1
    )
  };

  const waveProgressionBySegment: SegmentValues = {
    'outer-front': clamp(
      0.45 +
        lanePressureBySegment['outer-front'] * 0.33 +
        waveOccupancyBySegment['outer-front'] * 0.21 +
        frontBoostOuter * 0.18 +
        normalizeTimeInSegment('outer-front', timeInSegment['outer-front']) * 0.1,
      0,
      1
    ),
    'inner-siege': clamp(
      0.45 +
        lanePressureBySegment['inner-siege'] * 0.34 +
        waveOccupancyBySegment['inner-siege'] * 0.22 +
        frontBoostInner * 0.19 +
        normalizeTimeInSegment('inner-siege', timeInSegment['inner-siege']) * 0.09,
      0,
      1
    ),
    'core-approach': clamp(
      0.44 +
        lanePressureBySegment['core-approach'] * 0.35 +
        waveOccupancyBySegment['core-approach'] * 0.24 +
        frontBoostCore * 0.2 +
        normalizeTimeInSegment('core-approach', timeInSegment['core-approach']) * 0.08,
      0,
      1
    )
  };

  const structurePressureByTier: TierValues = {
    outer: clamp(
      lanePressureBySegment['outer-front'] * 0.3 +
        occupancy.structureContactByTier.outer.pressure * 0.7 +
        sharedLaneModifier.structurePressureByTier.outer,
      0,
      1
    ),
    inner: clamp(
      lanePressureBySegment['inner-siege'] * 0.32 +
        occupancy.structureContactByTier.inner.pressure * 0.68 +
        sharedLaneModifier.structurePressureByTier.inner,
      0,
      1
    ),
    core: clamp(
      lanePressureBySegment['core-approach'] * 0.34 +
        occupancy.structureContactByTier.core.pressure * 0.66 +
        sharedLaneModifier.structurePressureByTier.core,
      0,
      1
    )
  };

  const defenderDelayNormalized: TierValues = {
    outer: normalizeDelayTag('outer', occupancy.defenderTimingTagsByTier.outer.delayTagSeconds),
    inner: normalizeDelayTag('inner', occupancy.defenderTimingTagsByTier.inner.delayTagSeconds),
    core: normalizeDelayTag('core', occupancy.defenderTimingTagsByTier.core.delayTagSeconds)
  };
  const defenderReclearNormalized: TierValues = {
    outer: normalizeReclearTag('outer', occupancy.defenderTimingTagsByTier.outer.reclearTagSeconds),
    inner: normalizeReclearTag('inner', occupancy.defenderTimingTagsByTier.inner.reclearTagSeconds),
    core: normalizeReclearTag('core', occupancy.defenderTimingTagsByTier.core.reclearTagSeconds)
  };

  const defenderHoldByTier: TierValues = {
    outer: clamp(
      0.22 +
        defenderDelayNormalized.outer * 0.55 +
        (1 - occupancy.structureContactByTier.outer.pressure) * 0.15 -
        occupancyPresence['outer-front'] * 0.08,
      0,
      1
    ),
    inner: clamp(
      0.22 +
        defenderDelayNormalized.inner * 0.55 +
        (1 - occupancy.structureContactByTier.inner.pressure) * 0.15 -
        occupancyPresence['inner-siege'] * 0.08,
      0,
      1
    ),
    core: clamp(
      0.22 +
        defenderDelayNormalized.core * 0.55 +
        (1 - occupancy.structureContactByTier.core.pressure) * 0.15 -
        occupancyPresence['core-approach'] * 0.08,
      0,
      1
    )
  };

  const defenderReclearByTier: TierValues = {
    outer: clamp(
      0.23 +
        defenderReclearNormalized.outer * 0.5 +
        occupancy.structureContactByTier.outer.pressure * 0.2 +
        occupancyPresence['outer-front'] * 0.12,
      0,
      1
    ),
    inner: clamp(
      0.23 +
        defenderReclearNormalized.inner * 0.5 +
        occupancy.structureContactByTier.inner.pressure * 0.2 +
        occupancyPresence['inner-siege'] * 0.12,
      0,
      1
    ),
    core: clamp(
      0.23 +
        defenderReclearNormalized.core * 0.5 +
        occupancy.structureContactByTier.core.pressure * 0.2 +
        occupancyPresence['core-approach'] * 0.12,
      0,
      1
    )
  };

  const defenderStateByTier: TierStates = {
    outer: deriveDefenderState(defenderHoldByTier.outer, defenderReclearByTier.outer),
    inner: deriveDefenderState(defenderHoldByTier.inner, defenderReclearByTier.inner),
    core: deriveDefenderState(defenderHoldByTier.core, defenderReclearByTier.core)
  };

  const carryoverPressureState = clamp(
    memory.carryoverPressureState +
      occupancy.consecutiveWaveCarryoverRelevance * 0.008 +
      occupancy.structureContactByTier.core.pressure * 0.004,
    carryoverStateMin,
    carryoverStateMax
  );

  return {
    elapsedSeconds: occupancy.elapsedSeconds,
    cycleSeconds: occupancy.cycleSeconds,
    phase,
    activeSegment: occupancy.frontWaveSegment,
    frontWaveSegment: occupancy.frontWaveSegment,
    frontWaveProgress: occupancy.frontWaveProgress,
    spawnedWaveCount: occupancy.spawnedWaveCount,
    activeWaveCount: occupancy.activeWaveCount,
    segmentOccupancyCount: { ...occupancy.segmentOccupancyCount },
    segmentOccupancyPresence: { ...occupancy.segmentOccupancyPresence },
    segmentTimeInSegmentSeconds: { ...occupancy.segmentTimeInSegmentSeconds },
    structureContactByTier: {
      outer: { ...occupancy.structureContactByTier.outer },
      inner: { ...occupancy.structureContactByTier.inner },
      core: { ...occupancy.structureContactByTier.core }
    },
    structurePressureEventsByTier: {
      outer: cloneTierEventState(eventSnapshot.byTier.outer),
      inner: cloneTierEventState(eventSnapshot.byTier.inner),
      core: cloneTierEventState(eventSnapshot.byTier.core)
    },
    eventCalibrationByTier: {
      outer: { ...eventSnapshot.calibrationByTier.outer },
      inner: { ...eventSnapshot.calibrationByTier.inner },
      core: { ...eventSnapshot.calibrationByTier.core }
    },
    structureResolutionByTier: {
      outer: cloneResolutionTierState(resolutionSnapshot.byTier.outer),
      inner: cloneResolutionTierState(resolutionSnapshot.byTier.inner),
      core: cloneResolutionTierState(resolutionSnapshot.byTier.core)
    },
    resolutionCalibrationByTier: {
      outer: { ...resolutionSnapshot.calibrationByTier.outer },
      inner: { ...resolutionSnapshot.calibrationByTier.inner },
      core: { ...resolutionSnapshot.calibrationByTier.core }
    },
    defenderTimingTagsByTier: {
      outer: { ...occupancy.defenderTimingTagsByTier.outer },
      inner: { ...occupancy.defenderTimingTagsByTier.inner },
      core: { ...occupancy.defenderTimingTagsByTier.core }
    },
    consecutiveWaveCarryoverRelevance: occupancy.consecutiveWaveCarryoverRelevance,
    lanePressureBySegment,
    waveOccupancyBySegment,
    waveProgressionBySegment,
    structurePressureByTier,
    defenderHoldByTier,
    defenderReclearByTier,
    defenderStateByTier,
    carryoverPressureState,
    laneClosure: cloneLaneClosureSnapshot(laneClosureSnapshot),
    closurePacing: cloneClosurePacingSnapshot(closurePacingSnapshot),
    closurePacingWatch: cloneClosurePacingWatchSnapshot(closurePacingWatchSnapshot),
    closureDoctrineFit: cloneClosureDoctrineFitSnapshot(closureDoctrineFitSnapshot),
    calibrationRetuning: cloneCalibrationRetuningSnapshot(calibrationRetuningSnapshot),
    calibrationDigest: cloneCalibrationDigestSnapshot(calibrationDigestSnapshot),
    calibrationDigestComparison: cloneCalibrationDigestComparisonSnapshot(
      calibrationDigestComparisonSnapshot
    ),
    calibrationEvidence: cloneCalibrationEvidenceSnapshot(
      calibrationEvidenceSnapshot
    ),
    calibrationPassAction: cloneCalibrationPassActionSnapshot(
      calibrationPassActionSnapshot
    ),
    calibrationPassReview: cloneCalibrationPassReviewSnapshot(
      calibrationPassReviewSnapshot
    ),
    calibrationOperatorControls: cloneCalibrationOperatorControlsSnapshot(
      calibrationOperatorControlsSnapshot
    ),
    calibrationOperatorWorkflow: cloneCalibrationOperatorWorkflowSnapshot(
      calibrationOperatorWorkflowSnapshot
    ),
    calibrationOperatorLoopClosure: cloneCalibrationOperatorLoopClosureSnapshot(
      calibrationOperatorLoopClosureSnapshot
    ),
    sharedLaneConsequence: cloneHeadlessBridgeLaneConsequenceSnapshot(
      sharedLaneConsequenceSnapshot
    )
  };
};

const computeCarryoverTarget = (
  occupancy: PrototypeLaneOccupancySnapshot,
  events: StructurePressureEventSnapshot,
  resolution: StructureResolutionSnapshot,
  laneClosure: LaneClosurePostureSnapshot,
  closurePacing: ClosurePacingSnapshot,
  outcomeBias: number
): number =>
  clamp(
    0.985 +
      occupancy.consecutiveWaveCarryoverRelevance * 0.06 +
      occupancy.structureContactByTier.inner.pressure * 0.015 +
      occupancy.structureContactByTier.core.pressure * 0.024 +
      (events.calibrationByTier.inner.carryoverScalar - 1) * 0.22 +
      (events.calibrationByTier.core.carryoverScalar - 1) * 0.32 +
      (resolution.calibrationByTier.inner.carryoverScalar - 1) * 0.24 +
      (resolution.calibrationByTier.core.carryoverScalar - 1) * 0.34 +
      (laneClosure.calibration.structuralCarryoverScalar - 1) * 0.26 +
      (laneClosure.calibration.closureThreatScalar - 1) * 0.09 -
      (closurePacing.calibration.defenderResetScalar - 1) * 0.04 +
      (closurePacing.calibration.closureReadinessScalar - 1) * 0.06 +
      (closurePacing.calibration.closureWindowScalar - 1) * 0.05 +
      (laneClosure.calibration.defenderRecoveryScalar - 1) * 0.05 +
      outcomeBias,
    carryoverStateMin,
    carryoverStateMax
  );

const buildStructureEventInput = (
  occupancy: PrototypeLaneOccupancySnapshot,
  sharedLaneModifier: ReturnType<typeof buildHeadlessBridgeLaneModifier>
): StructurePressureEventTrackerInput => {
  const segmentPresence = occupancy.segmentOccupancyPresence;
  const contact = occupancy.structureContactByTier;

  return {
    byTier: {
      outer: {
        pressure: clamp(
          contact.outer.pressure * 0.72 +
            segmentPresence['outer-front'] * 0.28 +
            sharedLaneModifier.structurePressureByTier.outer,
          0,
          1
        ),
        contactActive: contact.outer.active,
        contactWindowSeconds: contact.outer.windowSeconds,
        lanePressure: clamp(
          segmentPresence['outer-front'] * 0.62 +
            contact.outer.pressure * 0.38 +
            sharedLaneModifier.lanePressureBySegment['outer-front'],
          0,
          1
        )
      },
      inner: {
        pressure: clamp(
          contact.inner.pressure * 0.72 +
            segmentPresence['inner-siege'] * 0.28 +
            sharedLaneModifier.structurePressureByTier.inner,
          0,
          1
        ),
        contactActive: contact.inner.active,
        contactWindowSeconds: contact.inner.windowSeconds,
        lanePressure: clamp(
          segmentPresence['inner-siege'] * 0.62 +
            contact.inner.pressure * 0.38 +
            sharedLaneModifier.lanePressureBySegment['inner-siege'],
          0,
          1
        )
      },
      core: {
        pressure: clamp(
          contact.core.pressure * 0.72 +
            segmentPresence['core-approach'] * 0.28 +
            sharedLaneModifier.structurePressureByTier.core,
          0,
          1
        ),
        contactActive: contact.core.active,
        contactWindowSeconds: contact.core.windowSeconds,
        lanePressure: clamp(
          segmentPresence['core-approach'] * 0.62 +
            contact.core.pressure * 0.38 +
            sharedLaneModifier.lanePressureBySegment['core-approach'],
          0,
          1
        )
      }
    }
  };
};

const buildStructurePressureEstimate = (
  occupancy: PrototypeLaneOccupancySnapshot,
  sharedLaneModifier: ReturnType<typeof buildHeadlessBridgeLaneModifier>
): TierValues => ({
  outer: clamp(
    occupancy.structureContactByTier.outer.pressure * 0.72 +
      occupancy.segmentOccupancyPresence['outer-front'] * 0.28 +
      sharedLaneModifier.structurePressureByTier.outer,
    0,
    1
  ),
  inner: clamp(
    occupancy.structureContactByTier.inner.pressure * 0.72 +
      occupancy.segmentOccupancyPresence['inner-siege'] * 0.28 +
      sharedLaneModifier.structurePressureByTier.inner,
    0,
    1
  ),
  core: clamp(
    occupancy.structureContactByTier.core.pressure * 0.72 +
      occupancy.segmentOccupancyPresence['core-approach'] * 0.28 +
      sharedLaneModifier.structurePressureByTier.core,
    0,
    1
  )
});

const buildLanePressureEstimate = (
  occupancy: PrototypeLaneOccupancySnapshot,
  sharedLaneModifier: ReturnType<typeof buildHeadlessBridgeLaneModifier>
): SegmentValues => {
  const frontBoostOuter =
    occupancy.frontWaveSegment === 'outer-front' ? occupancy.frontWaveProgress : 0;
  const frontBoostInner =
    occupancy.frontWaveSegment === 'inner-siege' ? occupancy.frontWaveProgress : 0;
  const frontBoostCore =
    occupancy.frontWaveSegment === 'core-approach' ? occupancy.frontWaveProgress : 0;

  return {
    'outer-front': clamp(
      0.18 +
        occupancy.segmentOccupancyPresence['outer-front'] * 0.5 +
        occupancy.structureContactByTier.outer.pressure * 0.24 +
        frontBoostOuter * 0.14 +
        sharedLaneModifier.lanePressureBySegment['outer-front'] +
        sharedLaneModifier.occupancyBySegment['outer-front'],
      0,
      1
    ),
    'inner-siege': clamp(
      0.18 +
        occupancy.segmentOccupancyPresence['inner-siege'] * 0.48 +
        occupancy.structureContactByTier.inner.pressure * 0.26 +
        frontBoostInner * 0.14 +
        occupancy.consecutiveWaveCarryoverRelevance * 0.08 +
        sharedLaneModifier.lanePressureBySegment['inner-siege'] +
        sharedLaneModifier.occupancyBySegment['inner-siege'],
      0,
      1
    ),
    'core-approach': clamp(
      0.16 +
        occupancy.segmentOccupancyPresence['core-approach'] * 0.5 +
        occupancy.structureContactByTier.core.pressure * 0.27 +
        frontBoostCore * 0.15 +
        occupancy.consecutiveWaveCarryoverRelevance * 0.09 +
        sharedLaneModifier.lanePressureBySegment['core-approach'] +
        sharedLaneModifier.occupancyBySegment['core-approach'],
      0,
      1
    )
  };
};

const computePhase = (
  frontWaveSegment: LanePressureSegment,
  frontWaveProgress: number
): number => {
  const segmentIndex = segmentOrder.indexOf(frontWaveSegment);
  if (segmentIndex < 0) {
    return 0;
  }

  return clamp((segmentIndex + frontWaveProgress) / segmentOrder.length, 0, 1);
};

const normalizeTimeInSegment = (
  segment: LanePressureSegment,
  timeInSegmentSeconds: number
): number =>
  clamp(timeInSegmentSeconds / Math.max(0.001, segmentReferenceSeconds[segment]), 0, 1);

const normalizeDelayTag = (
  tier: StructurePressureTier,
  delayTagSeconds: number
): number => {
  const min = 0.3;
  const max = tier === 'outer' ? 1.95 : tier === 'inner' ? 1.65 : 1.45;
  return clamp((delayTagSeconds - min) / Math.max(0.001, max - min), 0, 1);
};

const normalizeReclearTag = (
  tier: StructurePressureTier,
  reclearTagSeconds: number
): number => {
  const min = 0.45;
  const max = tier === 'outer' ? 2.85 : tier === 'inner' ? 2.55 : 2.35;
  return clamp((reclearTagSeconds - min) / Math.max(0.001, max - min), 0, 1);
};

const cloneTierEventState = (
  event: StructurePressureTierEventState
): StructurePressureTierEventState => ({
  eventCount: event.eventCount,
  active: event.active
    ? {
        ...event.active
      }
    : null,
  lastCompleted: event.lastCompleted
    ? {
        ...event.lastCompleted
      }
    : null,
  calibration: {
    ...event.calibration
  }
});

const cloneResolutionTierState = (
  state: StructureResolutionTierState
): StructureResolutionTierState => ({
  threatStage: state.threatStage,
  recentOutcomeMemory: state.recentOutcomeMemory,
  recentOutcomeWeight: state.recentOutcomeWeight,
  accumulatedPartialProgress: state.accumulatedPartialProgress,
  defendedReliefStrength: state.defendedReliefStrength,
  repeatedPressureEscalation: state.repeatedPressureEscalation,
  timeSinceLastMeaningfulSiegeSeconds: state.timeSinceLastMeaningfulSiegeSeconds,
  lastMeaningfulSiegeResult: state.lastMeaningfulSiegeResult,
  meaningfulAttemptCount: state.meaningfulAttemptCount,
  calibration: {
    ...state.calibration
  }
});

const cloneLaneClosureSnapshot = (
  snapshot: LaneClosurePostureSnapshot
): LaneClosurePostureSnapshot => ({
  posture: snapshot.posture,
  postureAgeSeconds: snapshot.postureAgeSeconds,
  closureThreatLevel: snapshot.closureThreatLevel,
  laneStabilityLevel: snapshot.laneStabilityLevel,
  defenderRecoveryLevel: snapshot.defenderRecoveryLevel,
  antiStallAccelerationLevel: snapshot.antiStallAccelerationLevel,
  structuralCarryoverLevel: snapshot.structuralCarryoverLevel,
  calibration: {
    ...snapshot.calibration
  }
});

const cloneClosurePacingSnapshot = (
  snapshot: ClosurePacingSnapshot
): ClosurePacingSnapshot => ({
  state: snapshot.state,
  stateAgeSeconds: snapshot.stateAgeSeconds,
  closureReadinessLevel: snapshot.closureReadinessLevel,
  antiStallReadinessLevel: snapshot.antiStallReadinessLevel,
  defenderResetLevel: snapshot.defenderResetLevel,
  closureWindowLevel: snapshot.closureWindowLevel,
  pacingPressureLevel: snapshot.pacingPressureLevel,
  calibration: {
    ...snapshot.calibration
  }
});

const cloneClosurePacingWatchSnapshot = (
  snapshot: ClosurePacingWatchSnapshot
): ClosurePacingWatchSnapshot => ({
  healthState: snapshot.healthState,
  healthStateAgeSeconds: snapshot.healthStateAgeSeconds,
  currentStateDwellSeconds: snapshot.currentStateDwellSeconds,
  firstEntrySecondsByState: {
    ...snapshot.firstEntrySecondsByState
  },
  cumulativeDwellSecondsByState: {
    ...snapshot.cumulativeDwellSecondsByState
  },
  entryCountByState: {
    ...snapshot.entryCountByState
  },
  exitCountByState: {
    ...snapshot.exitCountByState
  },
  stickyAntiStallEvents: snapshot.stickyAntiStallEvents,
  stickyClosureWindowEvents: snapshot.stickyClosureWindowEvents,
  prolongedReadinessEvents: snapshot.prolongedReadinessEvents,
  prematureResetEvents: snapshot.prematureResetEvents,
  legitimateResetWindows: snapshot.legitimateResetWindows,
  orderFlags: {
    ...snapshot.orderFlags
  },
  calibration: {
    ...snapshot.calibration
  }
});

const cloneClosureDoctrineFitSnapshot = (
  snapshot: ClosureDoctrineFitSnapshot
): ClosureDoctrineFitSnapshot => ({
  verdict: snapshot.verdict,
  verdictAgeSeconds: snapshot.verdictAgeSeconds,
  doctrineFitLevel: snapshot.doctrineFitLevel,
  earlySiegeBiasLevel: snapshot.earlySiegeBiasLevel,
  lateClosureDragLevel: snapshot.lateClosureDragLevel,
  resetCadenceRiskLevel: snapshot.resetCadenceRiskLevel,
  antiStallOverhangLevel: snapshot.antiStallOverhangLevel,
  retuningUrgencyLevel: snapshot.retuningUrgencyLevel,
  calibration: {
    ...snapshot.calibration
  },
  hint: {
    ...snapshot.hint
  }
});

const cloneCalibrationRetuningSnapshot = (
  snapshot: CalibrationRetuningSuggestionsSnapshot
): CalibrationRetuningSuggestionsSnapshot => ({
  dominantCalibrationDomain: snapshot.dominantCalibrationDomain,
  overallRetuningPressure: snapshot.overallRetuningPressure,
  suggestionConfidenceBlend: snapshot.suggestionConfidenceBlend,
  recommendationCount: snapshot.recommendationCount,
  suggestions: {
    earlyEscalation: {
      ...snapshot.suggestions.earlyEscalation
    },
    closureTiming: {
      ...snapshot.suggestions.closureTiming
    },
    resetCadence: {
      ...snapshot.suggestions.resetCadence
    },
    antiStallDwell: {
      ...snapshot.suggestions.antiStallDwell
    }
  }
});

const cloneCalibrationDigestSnapshot = (
  snapshot: CalibrationDigestSummarySnapshot
): CalibrationDigestSummarySnapshot => ({
  windowDurationSeconds: snapshot.windowDurationSeconds,
  sampleCount: snapshot.sampleCount,
  dominantDriftOverRun: snapshot.dominantDriftOverRun,
  dominantCalibrationDomainConsensus: snapshot.dominantCalibrationDomainConsensus,
  overallTuningPriority: snapshot.overallTuningPriority,
  escalationTimingSummary: snapshot.escalationTimingSummary,
  resetQualitySummary: snapshot.resetQualitySummary,
  closureStickinessSummary: snapshot.closureStickinessSummary,
  recommendationStabilityScalar: snapshot.recommendationStabilityScalar,
  confidenceBlend: snapshot.confidenceBlend,
  driftConsensusLevel: snapshot.driftConsensusLevel,
  domainConsensusLevel: snapshot.domainConsensusLevel,
  averageRetuningPressure: snapshot.averageRetuningPressure
});

const cloneCalibrationDigestComparisonSnapshot = (
  snapshot: CalibrationDigestComparisonSnapshot
): CalibrationDigestComparisonSnapshot => ({
  baselineAvailable: snapshot.baselineAvailable,
  baselineWindowDurationSeconds: snapshot.baselineWindowDurationSeconds,
  currentWindowDurationSeconds: snapshot.currentWindowDurationSeconds,
  verdict: snapshot.verdict,
  dominantDriftChange: {
    ...snapshot.dominantDriftChange
  },
  dominantCalibrationDomainChange: {
    ...snapshot.dominantCalibrationDomainChange
  },
  overallTuningPriorityChange: {
    ...snapshot.overallTuningPriorityChange
  },
  escalationTimingSummaryChange: {
    ...snapshot.escalationTimingSummaryChange
  },
  resetQualitySummaryChange: {
    ...snapshot.resetQualitySummaryChange
  },
  closureStickinessSummaryChange: {
    ...snapshot.closureStickinessSummaryChange
  },
  recommendationStabilityDelta: snapshot.recommendationStabilityDelta,
  confidenceBlendDelta: snapshot.confidenceBlendDelta,
  averageRetuningPressureDelta: snapshot.averageRetuningPressureDelta,
  comparisonScore: snapshot.comparisonScore
});

const cloneCalibrationEvidenceSnapshot = (
  snapshot: CalibrationEvidenceExplainerSnapshot
): CalibrationEvidenceExplainerSnapshot => ({
  topEvidenceDrivers: snapshot.topEvidenceDrivers.map((driver) => ({
    ...driver
  })),
  topPositiveDrivers: snapshot.topPositiveDrivers.map((driver) => ({
    ...driver
  })),
  topNegativeDrivers: snapshot.topNegativeDrivers.map((driver) => ({
    ...driver
  })),
  primaryExplanation: snapshot.primaryExplanation,
  secondaryExplanation: snapshot.secondaryExplanation,
  explanationConfidence: snapshot.explanationConfidence,
  evidencePressureScore: snapshot.evidencePressureScore,
  evidenceSignalSufficient: snapshot.evidenceSignalSufficient
});

const cloneCalibrationPassActionSnapshot = (
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

const cloneCalibrationPassReviewSnapshot = (
  snapshot: CalibrationPassReviewHandoffSnapshot
): CalibrationPassReviewHandoffSnapshot => ({
  hasFrozenReview: snapshot.hasFrozenReview,
  frozenAtRuntimeSeconds: snapshot.frozenAtRuntimeSeconds,
  sourceActionTrigger: snapshot.sourceActionTrigger,
  finalReadinessVerdict: snapshot.finalReadinessVerdict,
  finalRecommendedAction: snapshot.finalRecommendedAction,
  finalRecommendedDomain: snapshot.finalRecommendedDomain,
  finalBaselinePromotionAllowed: snapshot.finalBaselinePromotionAllowed,
  finalActionConfidence: snapshot.finalActionConfidence,
  finalPrimaryReason: snapshot.finalPrimaryReason,
  finalSecondaryReason: snapshot.finalSecondaryReason,
  finalBlockingFactors: [...snapshot.finalBlockingFactors],
  finalComparisonVerdict: snapshot.finalComparisonVerdict,
  finalPrimaryExplanation: snapshot.finalPrimaryExplanation,
  finalEvidencePressureScore: snapshot.finalEvidencePressureScore,
  finalSignalSufficient: snapshot.finalSignalSufficient,
  finalDoctrineFitLevel: snapshot.finalDoctrineFitLevel,
  finalRetuningPressure: snapshot.finalRetuningPressure
});

const cloneCalibrationOperatorControlsSnapshot = (
  snapshot: CalibrationOperatorControlsSnapshot
): CalibrationOperatorControlsSnapshot => ({
  lastActionId: snapshot.lastActionId,
  lastActionLabel: snapshot.lastActionLabel,
  lastActionRuntimeSeconds: snapshot.lastActionRuntimeSeconds,
  actionFeedbackText: snapshot.actionFeedbackText,
  actionFeedbackSeverity: snapshot.actionFeedbackSeverity
});

const cloneCalibrationOperatorWorkflowSnapshot = (
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

const cloneCalibrationOperatorLoopClosureSnapshot = (
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

const deriveDefenderState = (
  holdValue: number,
  reclearValue: number
): DefenderHoldState => {
  if (reclearValue >= holdValue + 0.05) {
    return 'reclear';
  }

  if (holdValue >= reclearValue + 0.04) {
    return 'hold';
  }

  return 'delay';
};

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
