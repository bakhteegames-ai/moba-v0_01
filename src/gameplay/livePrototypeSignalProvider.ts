import { type LivePrototypeSignals } from './livePrototypeAdapter';
import {
  type CalibrationResolution,
  type DefenderHoldState,
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import {
  createPrototypeLaneStateLoop,
  type PrototypeLaneOutcomeSample,
  type PrototypeLaneStateSnapshot,
  type StructureConversionInteractionRequest
} from './prototypeLaneStateLoop';
import {
  type BoundedClosureState,
  type PressureCalibrationMeaning,
  type PressureWindowEndResult
} from './structurePressureEventTracker';
import { type StructuralThreatStage } from './structureResolutionMemory';
import { type ClosurePacingState } from './closurePacingInterpreter';
import { type ClosurePacingHealthState } from './closurePacingWatch';
import { type LaneClosurePosture } from './laneClosurePosture';
import {
  type ClosureDoctrineConfidence,
  type ClosureDoctrineDriftCause,
  type ClosureDoctrineFitVerdict,
  type ClosureDoctrineRetuningDirection
} from './closureDoctrineFitEvaluator';
import {
  type CalibrationRetuningDirection,
  type CalibrationRetuningDomain,
  type CalibrationRetuningStrength
} from './calibrationRetuningSuggestions';
import {
  type CalibrationDigestPriority,
  type CalibrationDigestResetSummary,
  type CalibrationDigestStickinessSummary,
  type CalibrationDigestTimingSummary
} from './calibrationDigestSummary';
import {
  type CalibrationDigestComparisonVerdict
} from './calibrationDigestComparison';
import {
  type CalibrationEvidenceDriver,
  type CalibrationEvidenceDriverDirection
} from './calibrationEvidenceExplainer';
import {
  type CalibrationPassActionCueSnapshot,
  type CalibrationPassReadinessVerdict,
  type CalibrationPassRecommendedAction
} from './calibrationPassActionCue';
import {
  type CalibrationPassReviewHandoffSnapshot,
  type CalibrationPassReviewTrigger,
  type CalibrationPassReviewTriggerSource
} from './calibrationPassReviewHandoff';
import {
  type CalibrationOperatorActionId,
  type CalibrationOperatorControlsSnapshot,
  type CalibrationOperatorFeedbackSeverity
} from './calibrationOperatorControls';
import {
  type CalibrationOperatorWorkflowGuideSnapshot,
  type CalibrationOperatorWorkflowNextStep,
  type CalibrationOperatorWorkflowPhase
} from './calibrationOperatorWorkflowGuide';
import {
  type CalibrationOperatorDisposition,
  type CalibrationOperatorLoopClosureSnapshot,
  type CalibrationOperatorLoopClosureState
} from './calibrationOperatorLoopClosure';
import {
  cloneHeadlessBridgeLaneConsequenceSnapshot,
  type HeadlessBridgeLaneConsequenceSnapshot
} from './headlessBridgeConsequenceAdapter';
import {
  cloneSharedSiegeWindowSnapshot,
  type SharedSiegeWindowTriggerReason
} from './sharedSiegeWindowConversion';
import {
  cloneSharedStructureConversionSnapshot,
  type SharedStructureConversionSnapshot
} from './sharedStructureConversionStep';
import {
  cloneSharedClosureAdvancementSnapshot,
  type SharedClosureAdvancementSnapshot
} from './sharedClosureAdvancementHook';
import {
  cloneSharedDefenderResponseSnapshot,
  type SharedDefenderResponseSnapshot
} from './sharedDefenderResponseSlice';
import {
  cloneSharedPushReassertionSnapshot,
  type SharedPushReassertionSnapshot
} from './sharedPushReassertionSlice';
import { gameplayTuningConfig } from './gameplayTuningConfig';

type TierScalars = Record<StructurePressureTier, number>;
type SegmentScalars = Record<LanePressureSegment, number>;

export interface LivePrototypeSignalScenarioContext {
  id: string;
  pressureSegmentStart: LanePressureSegment;
  structureTier: StructurePressureTier;
  waveCount: number;
}

export interface LivePrototypeSignalOutcome {
  id: string;
  resolution: CalibrationResolution;
  completionRatio: number;
  remainingWindowSeconds: number;
}

export interface LivePrototypeSignalProviderDebugState {
  elapsedSeconds: number;
  phase: number;
  carryoverState: number;
  carryoverRelevance: number;
  scenarioSamples: number;
  activeSegment: LanePressureSegment;
  frontWaveSegment: LanePressureSegment;
  frontWaveProgress: number;
  spawnedWaveCount: number;
  activeWaveCount: number;
  lanePressureBySegment: SegmentScalars;
  waveOccupancyBySegment: SegmentScalars;
  segmentOccupancyCount: SegmentScalars;
  segmentOccupancyPresence: SegmentScalars;
  segmentTimeInSegmentSeconds: SegmentScalars;
  structurePressureByTier: TierScalars;
  structureContactByTier: Record<
    StructurePressureTier,
    {
      active: boolean;
      windowSeconds: number;
      pressure: number;
    }
  >;
  structurePressureEventsByTier: Record<
    StructurePressureTier,
    {
      eventCount: number;
      active: {
        id: number;
        ageSeconds: number;
        peakPressure: number;
        currentPressure: number;
        qualifiedSiegeAttempt: boolean;
        boundedClosureState: BoundedClosureState;
      } | null;
      lastCompleted: {
        id: number;
        durationSeconds: number;
        peakPressure: number;
        finalPressure: number;
        result: PressureWindowEndResult;
        calibrationMeaning: PressureCalibrationMeaning;
        qualifiedSiegeAttempt: boolean;
        boundedClosureState: BoundedClosureState;
      } | null;
      calibration: {
        meaning: PressureCalibrationMeaning;
        boundedClosureState: BoundedClosureState;
        progressionScalar: number;
        carryoverScalar: number;
        towerHoldScalar: number;
        defenderDelayScalar: number;
        defenderReclearScalar: number;
        pressureDecayScalar: number;
      };
    }
  >;
  structureResolutionByTier: Record<
    StructurePressureTier,
    {
      threatStage: StructuralThreatStage;
      recentOutcomeMemory: PressureWindowEndResult | 'none';
      recentOutcomeWeight: number;
      accumulatedPartialProgress: number;
      defendedReliefStrength: number;
      repeatedPressureEscalation: number;
      timeSinceLastMeaningfulSiegeSeconds: number;
      lastMeaningfulSiegeResult: PressureWindowEndResult | 'none';
      meaningfulAttemptCount: number;
      calibration: {
        stage: StructuralThreatStage;
        progressionScalar: number;
        carryoverScalar: number;
        towerHoldScalar: number;
        defenderDelayScalar: number;
        defenderReclearScalar: number;
        pressureDecayScalar: number;
      };
    }
  >;
  laneClosure: {
    posture: LaneClosurePosture;
    postureAgeSeconds: number;
    closureThreatLevel: number;
    laneStabilityLevel: number;
    defenderRecoveryLevel: number;
    antiStallAccelerationLevel: number;
    structuralCarryoverLevel: number;
    closureThreatScalar: number;
    laneStabilityScalar: number;
    defenderRecoveryScalar: number;
    antiStallAccelerationScalar: number;
    structuralCarryoverScalar: number;
  };
  closurePacing: {
    state: ClosurePacingState;
    stateAgeSeconds: number;
    closureReadinessLevel: number;
    antiStallReadinessLevel: number;
    defenderResetLevel: number;
    closureWindowLevel: number;
    pacingPressureLevel: number;
    closureReadinessScalar: number;
    antiStallReadinessScalar: number;
    defenderResetScalar: number;
    closureWindowScalar: number;
    pacingPressureScalar: number;
  };
  closurePacingWatch: {
    healthState: ClosurePacingHealthState;
    healthStateAgeSeconds: number;
    currentStateDwellSeconds: number;
    firstEntrySecondsByState: {
      'normal-pressure': number | null;
      'rising-anti-stall': number | null;
      'closure-readiness': number | null;
      'accelerated-closure-window': number | null;
      'defender-reset-window': number | null;
    };
    cumulativeDwellSecondsByState: {
      'normal-pressure': number;
      'rising-anti-stall': number;
      'closure-readiness': number;
      'accelerated-closure-window': number;
      'defender-reset-window': number;
    };
    entryCountByState: {
      'normal-pressure': number;
      'rising-anti-stall': number;
      'closure-readiness': number;
      'accelerated-closure-window': number;
      'defender-reset-window': number;
    };
    exitCountByState: {
      'normal-pressure': number;
      'rising-anti-stall': number;
      'closure-readiness': number;
      'accelerated-closure-window': number;
      'defender-reset-window': number;
    };
    stickyAntiStallEvents: number;
    stickyClosureWindowEvents: number;
    prolongedReadinessEvents: number;
    prematureResetEvents: number;
    legitimateResetWindows: number;
    orderFlags: {
      risingSeenBeforeReadiness: boolean;
      readinessSeenBeforeClosureWindow: boolean;
      resetSeenAfterReadiness: boolean;
    };
    pacingHealthScalar: number;
    escalationTimingScalar: number;
    closureStickinessScalar: number;
    defenderResetQualityScalar: number;
    progressionOrderScalar: number;
  };
  closureDoctrineFit: {
    verdict: ClosureDoctrineFitVerdict;
    verdictAgeSeconds: number;
    doctrineFitLevel: number;
    earlySiegeBiasLevel: number;
    lateClosureDragLevel: number;
    resetCadenceRiskLevel: number;
    antiStallOverhangLevel: number;
    retuningUrgencyLevel: number;
    doctrineFitScalar: number;
    earlySiegeBiasScalar: number;
    lateClosureDragScalar: number;
    resetCadenceRiskScalar: number;
    antiStallOverhangScalar: number;
    retuningUrgencyScalar: number;
    hint: {
      dominantDriftCause: ClosureDoctrineDriftCause;
      likelyRetuningDirection: ClosureDoctrineRetuningDirection;
      confidence: ClosureDoctrineConfidence;
    };
  };
  calibrationRetuning: {
    dominantCalibrationDomain: CalibrationRetuningDomain;
    overallRetuningPressure: number;
    suggestionConfidenceBlend: number;
    recommendationCount: number;
    suggestions: {
      earlyEscalation: {
        direction: CalibrationRetuningDirection;
        strength: CalibrationRetuningStrength;
        urgency: number;
        confidence: ClosureDoctrineConfidence;
        confidenceScalar: number;
      };
      closureTiming: {
        direction: CalibrationRetuningDirection;
        strength: CalibrationRetuningStrength;
        urgency: number;
        confidence: ClosureDoctrineConfidence;
        confidenceScalar: number;
      };
      resetCadence: {
        direction: CalibrationRetuningDirection;
        strength: CalibrationRetuningStrength;
        urgency: number;
        confidence: ClosureDoctrineConfidence;
        confidenceScalar: number;
      };
      antiStallDwell: {
        direction: CalibrationRetuningDirection;
        strength: CalibrationRetuningStrength;
        urgency: number;
        confidence: ClosureDoctrineConfidence;
        confidenceScalar: number;
      };
    };
  };
  calibrationDigest: {
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
  };
  calibrationDigestComparison: {
    baselineAvailable: boolean;
    baselineWindowDurationSeconds: number;
    currentWindowDurationSeconds: number;
    verdict: CalibrationDigestComparisonVerdict;
    dominantDriftChange: {
      baseline: ClosureDoctrineFitVerdict | 'none';
      current: ClosureDoctrineFitVerdict;
      changed: boolean;
    };
    dominantCalibrationDomainChange: {
      baseline: CalibrationRetuningDomain | 'none';
      current: CalibrationRetuningDomain;
      changed: boolean;
    };
    overallTuningPriorityChange: {
      baseline: CalibrationDigestPriority | 'none';
      current: CalibrationDigestPriority;
      changed: boolean;
      rankDelta: number;
    };
    escalationTimingSummaryChange: {
      baseline: CalibrationDigestTimingSummary | 'none';
      current: CalibrationDigestTimingSummary;
      changed: boolean;
    };
    resetQualitySummaryChange: {
      baseline: CalibrationDigestResetSummary | 'none';
      current: CalibrationDigestResetSummary;
      changed: boolean;
    };
    closureStickinessSummaryChange: {
      baseline: CalibrationDigestStickinessSummary | 'none';
      current: CalibrationDigestStickinessSummary;
      changed: boolean;
    };
    recommendationStabilityDelta: number;
    confidenceBlendDelta: number;
    averageRetuningPressureDelta: number;
    comparisonScore: number;
  };
  calibrationEvidence: {
    topEvidenceDrivers: CalibrationEvidenceDriver[];
    topPositiveDrivers: CalibrationEvidenceDriver[];
    topNegativeDrivers: CalibrationEvidenceDriver[];
    primaryExplanation: string;
    secondaryExplanation: string;
    explanationConfidence: number;
    evidencePressureScore: number;
    evidenceSignalSufficient: boolean;
  };
  calibrationPassAction: {
    readinessVerdict: CalibrationPassReadinessVerdict;
    recommendedAction: CalibrationPassRecommendedAction;
    recommendedDomain: CalibrationRetuningDomain;
    baselinePromotionAllowed: boolean;
    actionConfidence: number;
    primaryActionReason: string;
    secondaryActionReason: string;
    blockingFactors: string[];
    actionSignalSufficient: boolean;
  };
  calibrationPassReview: {
    hasFrozenReview: boolean;
    frozenAtRuntimeSeconds: number | null;
    sourceActionTrigger: CalibrationPassReviewTriggerSource;
    finalReadinessVerdict: CalibrationPassReadinessVerdict | 'none';
    finalRecommendedAction: CalibrationPassRecommendedAction | 'none';
    finalRecommendedDomain: CalibrationRetuningDomain;
    finalBaselinePromotionAllowed: boolean;
    finalActionConfidence: number;
    finalPrimaryReason: string;
    finalSecondaryReason: string;
    finalBlockingFactors: string[];
    finalComparisonVerdict: CalibrationDigestComparisonVerdict | 'none';
    finalPrimaryExplanation: string;
    finalEvidencePressureScore: number;
    finalSignalSufficient: boolean;
    finalDoctrineFitLevel: number;
    finalRetuningPressure: number;
  };
  calibrationOperatorControls: {
    lastActionId: CalibrationOperatorActionId;
    lastActionLabel: string;
    lastActionRuntimeSeconds: number | null;
    actionFeedbackText: string;
    actionFeedbackSeverity: CalibrationOperatorFeedbackSeverity;
  };
  calibrationOperatorWorkflow: {
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
  };
  calibrationOperatorLoopClosure: {
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
  };
  sharedLaneConsequence: HeadlessBridgeLaneConsequenceSnapshot;
  sharedSiegeWindow: {
    siegeWindowActive: boolean;
    siegeWindowRemainingSeconds: number;
    sourceSegment: LanePressureSegment;
    sourceTier: StructurePressureTier;
    triggerReason: SharedSiegeWindowTriggerReason;
    pressureSupportLevel: number;
    occupancySupportLevel: number;
    summary: string;
  };
  sharedStructureConversion: SharedStructureConversionSnapshot;
  sharedClosureAdvancement: SharedClosureAdvancementSnapshot;
  sharedDefenderResponse: SharedDefenderResponseSnapshot;
  sharedPushReassertion: SharedPushReassertionSnapshot;
  defenderStateByTier: Record<StructurePressureTier, DefenderHoldState>;
}

export interface LivePrototypeSignalEventContext {
  byTier: LivePrototypeSignalProviderDebugState['structurePressureEventsByTier'];
  resolutionByTier: LivePrototypeSignalProviderDebugState['structureResolutionByTier'];
  laneClosure: LivePrototypeSignalProviderDebugState['laneClosure'];
  closurePacing: LivePrototypeSignalProviderDebugState['closurePacing'];
  closurePacingWatch: LivePrototypeSignalProviderDebugState['closurePacingWatch'];
  closureDoctrineFit: LivePrototypeSignalProviderDebugState['closureDoctrineFit'];
  calibrationRetuning: LivePrototypeSignalProviderDebugState['calibrationRetuning'];
  calibrationDigest: LivePrototypeSignalProviderDebugState['calibrationDigest'];
  calibrationDigestComparison: LivePrototypeSignalProviderDebugState['calibrationDigestComparison'];
  calibrationEvidence: LivePrototypeSignalProviderDebugState['calibrationEvidence'];
  calibrationPassAction: LivePrototypeSignalProviderDebugState['calibrationPassAction'];
  calibrationPassReview: LivePrototypeSignalProviderDebugState['calibrationPassReview'];
  calibrationOperatorControls: LivePrototypeSignalProviderDebugState['calibrationOperatorControls'];
  calibrationOperatorWorkflow: LivePrototypeSignalProviderDebugState['calibrationOperatorWorkflow'];
  calibrationOperatorLoopClosure: LivePrototypeSignalProviderDebugState['calibrationOperatorLoopClosure'];
  sharedLaneConsequence: LivePrototypeSignalProviderDebugState['sharedLaneConsequence'];
  sharedSiegeWindow: LivePrototypeSignalProviderDebugState['sharedSiegeWindow'];
  sharedStructureConversion: LivePrototypeSignalProviderDebugState['sharedStructureConversion'];
  sharedClosureAdvancement: LivePrototypeSignalProviderDebugState['sharedClosureAdvancement'];
  sharedDefenderResponse: LivePrototypeSignalProviderDebugState['sharedDefenderResponse'];
  sharedPushReassertion: LivePrototypeSignalProviderDebugState['sharedPushReassertion'];
}

export interface LivePrototypeSignalProvider {
  update(
    dt: number,
    sharedLaneConsequence?: HeadlessBridgeLaneConsequenceSnapshot,
    structureInteractionRequest?: StructureConversionInteractionRequest | null
  ): void;
  getGlobalSignals(): LivePrototypeSignals;
  getScenarioSignals(
    context: LivePrototypeSignalScenarioContext
  ): LivePrototypeSignals;
  recordScenarioOutcome(outcome: LivePrototypeSignalOutcome): void;
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
  getEventContext(): LivePrototypeSignalEventContext;
  getDebugState(): LivePrototypeSignalProviderDebugState;
}

interface MomentumState {
  scenarioSamples: number;
}

const carryoverStateMin =
  gameplayTuningConfig.prototypeLaneStateLoop.carryoverPressureStateClamp.min;
const carryoverStateMax =
  gameplayTuningConfig.prototypeLaneStateLoop.carryoverPressureStateClamp.max;

export const createLivePrototypeSignalProvider =
  (): LivePrototypeSignalProvider => {
    const laneStateLoop = createPrototypeLaneStateLoop();
    const state: MomentumState = {
      scenarioSamples: 0
    };

    return {
      update(dt, sharedLaneConsequence, structureInteractionRequest) {
        if (sharedLaneConsequence) {
          laneStateLoop.setSharedLaneConsequence(sharedLaneConsequence);
        }
        if (structureInteractionRequest) {
          laneStateLoop.submitStructureConversionInteraction(
            structureInteractionRequest
          );
        }
        laneStateLoop.update(dt);
      },
      getGlobalSignals() {
        return buildGlobalSignals(laneStateLoop.getSnapshot());
      },
      getScenarioSignals(context) {
        state.scenarioSamples += 1;
        const snapshot = laneStateLoop.getSnapshot();
        const base = buildGlobalSignals(snapshot);
        return buildScenarioSignals(base, context, snapshot);
      },
      recordScenarioOutcome(outcome) {
        const sample: PrototypeLaneOutcomeSample = {
          id: outcome.id,
          resolution: outcome.resolution,
          completionRatio: outcome.completionRatio,
          remainingWindowSeconds: outcome.remainingWindowSeconds
        };
        laneStateLoop.recordOutcome(sample);
      },
      resetCalibrationDigest() {
        laneStateLoop.resetCalibrationDigest();
      },
      captureCurrentCalibrationBaseline() {
        laneStateLoop.captureCurrentCalibrationBaseline();
      },
      clearCalibrationBaseline() {
        laneStateLoop.clearCalibrationBaseline();
      },
      freezeCurrentCalibrationPassReview(reason) {
        laneStateLoop.freezeCurrentCalibrationPassReview(reason);
      },
      clearFrozenCalibrationPassReview() {
        laneStateLoop.clearFrozenCalibrationPassReview();
      },
      acknowledgeCalibrationLoopDisposition(disposition) {
        laneStateLoop.acknowledgeCalibrationLoopDisposition(disposition);
      },
      clearCalibrationLoopClosureDecision() {
        laneStateLoop.clearCalibrationLoopClosureDecision();
      },
      getEventContext() {
        const snapshot = laneStateLoop.getSnapshot();
        return {
          byTier: buildEventDebugByTier(snapshot),
          resolutionByTier: buildResolutionDebugByTier(snapshot),
          laneClosure: cloneLaneClosureDebug(snapshot),
          closurePacing: cloneClosurePacingDebug(snapshot),
          closurePacingWatch: cloneClosurePacingWatchDebug(snapshot),
          closureDoctrineFit: cloneClosureDoctrineFitDebug(snapshot),
          calibrationRetuning: cloneCalibrationRetuningDebug(snapshot),
          calibrationDigest: cloneCalibrationDigestDebug(snapshot),
          calibrationDigestComparison: cloneCalibrationDigestComparisonDebug(snapshot),
          calibrationEvidence: cloneCalibrationEvidenceDebug(snapshot),
          calibrationPassAction: cloneCalibrationPassActionDebug(snapshot),
          calibrationPassReview: cloneCalibrationPassReviewDebug(snapshot),
          calibrationOperatorControls: cloneCalibrationOperatorControlsDebug(snapshot),
          calibrationOperatorWorkflow: cloneCalibrationOperatorWorkflowDebug(snapshot),
          calibrationOperatorLoopClosure:
            cloneCalibrationOperatorLoopClosureDebug(snapshot),
          sharedLaneConsequence: cloneSharedLaneConsequenceDebug(snapshot),
          sharedSiegeWindow: cloneSharedSiegeWindowDebug(snapshot),
          sharedStructureConversion:
            cloneSharedStructureConversionDebug(snapshot),
          sharedClosureAdvancement:
            cloneSharedClosureAdvancementDebug(snapshot),
          sharedDefenderResponse:
            cloneSharedDefenderResponseDebug(snapshot),
          sharedPushReassertion:
            cloneSharedPushReassertionDebug(snapshot)
        };
      },
      getDebugState() {
        const snapshot = laneStateLoop.getSnapshot();

        return {
          elapsedSeconds: snapshot.elapsedSeconds,
          phase: snapshot.phase,
          carryoverState: snapshot.carryoverPressureState,
          carryoverRelevance: snapshot.consecutiveWaveCarryoverRelevance,
          scenarioSamples: state.scenarioSamples,
          activeSegment: snapshot.activeSegment,
          frontWaveSegment: snapshot.frontWaveSegment,
          frontWaveProgress: snapshot.frontWaveProgress,
          spawnedWaveCount: snapshot.spawnedWaveCount,
          activeWaveCount: snapshot.activeWaveCount,
          lanePressureBySegment: { ...snapshot.lanePressureBySegment },
          waveOccupancyBySegment: { ...snapshot.waveOccupancyBySegment },
          segmentOccupancyCount: { ...snapshot.segmentOccupancyCount },
          segmentOccupancyPresence: { ...snapshot.segmentOccupancyPresence },
          segmentTimeInSegmentSeconds: { ...snapshot.segmentTimeInSegmentSeconds },
          structurePressureByTier: { ...snapshot.structurePressureByTier },
          structureContactByTier: {
            outer: { ...snapshot.structureContactByTier.outer },
            inner: { ...snapshot.structureContactByTier.inner },
            core: { ...snapshot.structureContactByTier.core }
          },
          structurePressureEventsByTier: buildEventDebugByTier(snapshot),
          structureResolutionByTier: buildResolutionDebugByTier(snapshot),
          laneClosure: cloneLaneClosureDebug(snapshot),
          closurePacing: cloneClosurePacingDebug(snapshot),
          closurePacingWatch: cloneClosurePacingWatchDebug(snapshot),
          closureDoctrineFit: cloneClosureDoctrineFitDebug(snapshot),
          calibrationRetuning: cloneCalibrationRetuningDebug(snapshot),
          calibrationDigest: cloneCalibrationDigestDebug(snapshot),
          calibrationDigestComparison: cloneCalibrationDigestComparisonDebug(snapshot),
          calibrationEvidence: cloneCalibrationEvidenceDebug(snapshot),
          calibrationPassAction: cloneCalibrationPassActionDebug(snapshot),
          calibrationPassReview: cloneCalibrationPassReviewDebug(snapshot),
          calibrationOperatorControls: cloneCalibrationOperatorControlsDebug(snapshot),
          calibrationOperatorWorkflow: cloneCalibrationOperatorWorkflowDebug(snapshot),
          calibrationOperatorLoopClosure:
            cloneCalibrationOperatorLoopClosureDebug(snapshot),
          sharedLaneConsequence: cloneSharedLaneConsequenceDebug(snapshot),
          sharedSiegeWindow: cloneSharedSiegeWindowDebug(snapshot),
          sharedStructureConversion:
            cloneSharedStructureConversionDebug(snapshot),
          sharedClosureAdvancement:
            cloneSharedClosureAdvancementDebug(snapshot),
          sharedDefenderResponse:
            cloneSharedDefenderResponseDebug(snapshot),
          sharedPushReassertion:
            cloneSharedPushReassertionDebug(snapshot),
          defenderStateByTier: { ...snapshot.defenderStateByTier }
        };
      }
    };
  };

const buildGlobalSignals = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignals => {
  const event = snapshot.eventCalibrationByTier;
  const resolution = snapshot.resolutionCalibrationByTier;
  const laneClosure = snapshot.laneClosure.calibration;
  const closurePacing = snapshot.closurePacing.calibration;
  const inverseClosureThreat = clamp(2 - laneClosure.closureThreatScalar, 0.95, 1.08);
  const laneWaveScalarOuter = mix(
    laneClosure.laneStabilityScalar,
    laneClosure.antiStallAccelerationScalar,
    0.2
  );
  const laneWaveScalarInner = average(
    laneClosure.antiStallAccelerationScalar,
    laneClosure.structuralCarryoverScalar
  );
  const laneWaveScalarCore = average(
    laneClosure.closureThreatScalar,
    laneClosure.antiStallAccelerationScalar
  );
  const laneTowerScalar = mix(laneClosure.laneStabilityScalar, inverseClosureThreat, 0.42);
  const laneDefenderScalar = average(
    laneClosure.defenderRecoveryScalar,
    laneClosure.laneStabilityScalar
  );
  const laneDecayScalar = clamp(
    average(laneClosure.laneStabilityScalar, laneClosure.defenderRecoveryScalar) *
      mix(1, 2 - laneClosure.antiStallAccelerationScalar, 0.42),
    0.95,
    1.08
  );
  const pacingWaveScalarOuter = average(
    closurePacing.pacingPressureScalar,
    closurePacing.antiStallReadinessScalar
  );
  const pacingWaveScalarInner = average(
    closurePacing.closureReadinessScalar,
    closurePacing.pacingPressureScalar
  );
  const pacingWaveScalarCore = average(
    closurePacing.closureWindowScalar,
    closurePacing.closureReadinessScalar
  );
  const pacingTowerScalar = mix(
    closurePacing.defenderResetScalar,
    clamp(2 - closurePacing.closureWindowScalar, 0.95, 1.08),
    0.56
  );
  const pacingDefenderScalar = average(
    closurePacing.defenderResetScalar,
    clamp(2 - closurePacing.antiStallReadinessScalar, 0.95, 1.08)
  );
  const pacingDecayScalar = average(
    closurePacing.defenderResetScalar,
    clamp(2 - closurePacing.pacingPressureScalar, 0.95, 1.08)
  );

  return {
    wave: {
      progressionBySegment: {
        'outer-front': clamp(
          scalarFromNormalized(
            snapshot.waveProgressionBySegment['outer-front'],
            0.965,
            1.04
          ) *
            event.outer.progressionScalar *
            resolution.outer.progressionScalar *
            laneWaveScalarOuter *
            pacingWaveScalarOuter,
          0.95,
          1.08
        ),
        'inner-siege': clamp(
          scalarFromNormalized(
            snapshot.waveProgressionBySegment['inner-siege'],
            0.965,
            1.04
          ) *
            event.inner.progressionScalar *
            resolution.inner.progressionScalar *
            laneWaveScalarInner *
            pacingWaveScalarInner,
          0.95,
          1.08
        ),
        'core-approach': clamp(
          scalarFromNormalized(
            snapshot.waveProgressionBySegment['core-approach'],
            0.965,
            1.04
          ) *
            event.core.progressionScalar *
            resolution.core.progressionScalar *
            laneWaveScalarCore *
            pacingWaveScalarCore,
          0.95,
          1.08
        )
      },
      carryoverScalar: clamp(
        snapshot.carryoverPressureState *
          average(
            event.inner.carryoverScalar * resolution.inner.carryoverScalar,
            event.core.carryoverScalar * resolution.core.carryoverScalar
          ) *
          laneClosure.structuralCarryoverScalar *
          average(
            closurePacing.closureReadinessScalar,
            closurePacing.pacingPressureScalar
          ),
        carryoverStateMin,
        carryoverStateMax
      )
    },
    tower: {
      holdByTier: {
        outer: clamp(
          scalarFromNormalized(snapshot.structurePressureByTier.outer, 0.97, 1.045) *
            event.outer.towerHoldScalar *
            resolution.outer.towerHoldScalar *
            laneTowerScalar *
            pacingTowerScalar,
          0.95,
          1.08
        ),
        inner: clamp(
          scalarFromNormalized(snapshot.structurePressureByTier.inner, 0.97, 1.045) *
            event.inner.towerHoldScalar *
            resolution.inner.towerHoldScalar *
            laneTowerScalar *
            pacingTowerScalar,
          0.95,
          1.08
        ),
        core: clamp(
          scalarFromNormalized(snapshot.structurePressureByTier.core, 0.97, 1.045) *
            event.core.towerHoldScalar *
            resolution.core.towerHoldScalar *
            laneTowerScalar *
            pacingTowerScalar,
          0.95,
          1.08
        )
      }
    },
    defender: {
      delayByTier: {
        outer: clamp(
          scalarFromNormalized(snapshot.defenderHoldByTier.outer, 0.965, 1.045) *
            event.outer.defenderDelayScalar *
            resolution.outer.defenderDelayScalar *
            laneDefenderScalar *
            pacingDefenderScalar,
          0.95,
          1.08
        ),
        inner: clamp(
          scalarFromNormalized(snapshot.defenderHoldByTier.inner, 0.965, 1.045) *
            event.inner.defenderDelayScalar *
            resolution.inner.defenderDelayScalar *
            laneDefenderScalar *
            pacingDefenderScalar,
          0.95,
          1.08
        ),
        core: clamp(
          scalarFromNormalized(snapshot.defenderHoldByTier.core, 0.965, 1.045) *
            event.core.defenderDelayScalar *
            resolution.core.defenderDelayScalar *
            laneDefenderScalar *
            pacingDefenderScalar,
          0.95,
          1.08
        )
      },
      reclearByTier: {
        outer: clamp(
          scalarFromNormalized(snapshot.defenderReclearByTier.outer, 0.96, 1.06) *
            event.outer.defenderReclearScalar *
            resolution.outer.defenderReclearScalar *
            laneDefenderScalar *
            pacingDefenderScalar,
          0.95,
          1.08
        ),
        inner: clamp(
          scalarFromNormalized(snapshot.defenderReclearByTier.inner, 0.96, 1.06) *
            event.inner.defenderReclearScalar *
            resolution.inner.defenderReclearScalar *
            laneDefenderScalar *
            pacingDefenderScalar,
          0.95,
          1.08
        ),
        core: clamp(
          scalarFromNormalized(snapshot.defenderReclearByTier.core, 0.96, 1.06) *
            event.core.defenderReclearScalar *
            resolution.core.defenderReclearScalar *
            laneDefenderScalar *
            pacingDefenderScalar,
          0.95,
          1.08
        )
      },
      pressureDecayByTier: {
        outer: clamp(
          scalarFromNormalized(
            mix(snapshot.defenderHoldByTier.outer, snapshot.defenderReclearByTier.outer, 0.55),
            0.965,
            1.055
          ) *
            event.outer.pressureDecayScalar *
            resolution.outer.pressureDecayScalar *
            laneDecayScalar *
            pacingDecayScalar,
          0.95,
          1.08
        ),
        inner: clamp(
          scalarFromNormalized(
            mix(snapshot.defenderHoldByTier.inner, snapshot.defenderReclearByTier.inner, 0.55),
            0.965,
            1.055
          ) *
            event.inner.pressureDecayScalar *
            resolution.inner.pressureDecayScalar *
            laneDecayScalar *
            pacingDecayScalar,
          0.95,
          1.08
        ),
        core: clamp(
          scalarFromNormalized(
            mix(snapshot.defenderHoldByTier.core, snapshot.defenderReclearByTier.core, 0.55),
            0.965,
            1.055
          ) *
            event.core.pressureDecayScalar *
            resolution.core.pressureDecayScalar *
            laneDecayScalar *
            pacingDecayScalar,
          0.95,
          1.08
        )
      }
    }
  };
};

const buildScenarioSignals = (
  baseSignals: LivePrototypeSignals,
  context: LivePrototypeSignalScenarioContext,
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignals => {
  const signals = cloneSignals(baseSignals);
  const tierEvent = snapshot.structurePressureEventsByTier[context.structureTier];
  const tierResolution = snapshot.structureResolutionByTier[context.structureTier];
  const laneClosure = snapshot.laneClosure;
  const laneClosureScalars = laneClosure.calibration;
  const closurePacing = snapshot.closurePacing;
  const closurePacingScalars = closurePacing.calibration;

  if (context.waveCount > 1) {
    signals.wave.carryoverScalar = clamp(
      signals.wave.carryoverScalar *
        scalarFromNormalized(snapshot.waveOccupancyBySegment['inner-siege'], 0.995, 1.03) *
        laneClosureScalars.structuralCarryoverScalar *
        closurePacingScalars.closureReadinessScalar,
      0.95,
      1.06
    );
  }

  signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
    signals.wave.progressionBySegment[context.pressureSegmentStart] *
      scalarFromNormalized(
        snapshot.lanePressureBySegment[context.pressureSegmentStart],
        0.995,
        1.035
      ),
    0.95,
    1.06
  );

  signals.tower.holdByTier[context.structureTier] = clamp(
    signals.tower.holdByTier[context.structureTier] *
      scalarFromNormalized(snapshot.structurePressureByTier[context.structureTier], 0.995, 1.03),
    0.95,
    1.06
  );

  signals.defender.delayByTier[context.structureTier] = clamp(
    signals.defender.delayByTier[context.structureTier] *
      scalarFromNormalized(snapshot.defenderHoldByTier[context.structureTier], 0.995, 1.03),
    0.95,
    1.06
  );

  signals.defender.reclearByTier[context.structureTier] = clamp(
    signals.defender.reclearByTier[context.structureTier] *
      scalarFromNormalized(snapshot.defenderReclearByTier[context.structureTier], 0.99, 1.04),
    0.95,
    1.08
  );

  signals.defender.pressureDecayByTier[context.structureTier] = clamp(
    signals.defender.pressureDecayByTier[context.structureTier] *
      scalarFromNormalized(snapshot.defenderReclearByTier[context.structureTier], 0.99, 1.035),
    0.95,
    1.08
  );

  if (context.id === 'defender-reclear-live') {
    signals.defender.reclearByTier.core = clamp(
      signals.defender.reclearByTier.core *
        scalarFromNormalized(snapshot.defenderReclearByTier.core, 1.0, 1.03),
      0.95,
      1.08
    );
    signals.defender.delayByTier.core = clamp(
      signals.defender.delayByTier.core *
        scalarFromNormalized(snapshot.defenderHoldByTier.core, 0.98, 1.01),
      0.95,
      1.06
    );
  }

  if (context.id === 'two-wave-live') {
    signals.wave.carryoverScalar = clamp(
      signals.wave.carryoverScalar *
        scalarFromNormalized(snapshot.carryoverPressureState, 0.99, 1.04) *
        laneClosureScalars.structuralCarryoverScalar *
        closurePacingScalars.closureWindowScalar,
      0.95,
      1.08
    );
  }

  if (tierEvent.active?.qualifiedSiegeAttempt) {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 1.01,
      0.95,
      1.08
    );
    signals.defender.pressureDecayByTier[context.structureTier] = clamp(
      signals.defender.pressureDecayByTier[context.structureTier] * 0.995,
      0.95,
      1.08
    );
  } else if (
    !tierEvent.active &&
    tierEvent.lastCompleted?.calibrationMeaning === 'defended-reset'
  ) {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 0.99,
      0.95,
      1.08
    );
    signals.defender.reclearByTier[context.structureTier] = clamp(
      signals.defender.reclearByTier[context.structureTier] * 1.01,
      0.95,
      1.08
    );
  }

  if (
    tierResolution.threatStage === 'softened' ||
    tierResolution.threatStage === 'escalating'
  ) {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 1.008,
      0.95,
      1.08
    );
    signals.tower.holdByTier[context.structureTier] = clamp(
      signals.tower.holdByTier[context.structureTier] * 0.996,
      0.95,
      1.08
    );
  } else if (tierResolution.threatStage === 'temporarily-relieved') {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 0.994,
      0.95,
      1.08
    );
    signals.defender.reclearByTier[context.structureTier] = clamp(
      signals.defender.reclearByTier[context.structureTier] * 1.006,
      0.95,
      1.08
    );
  }

  if (laneClosure.posture === 'accelerated-closure' && context.structureTier !== 'outer') {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 1.007,
      0.95,
      1.08
    );
    signals.tower.holdByTier[context.structureTier] = clamp(
      signals.tower.holdByTier[context.structureTier] * 0.997,
      0.95,
      1.08
    );
  } else if (laneClosure.posture === 'defender-recovery') {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 0.994,
      0.95,
      1.08
    );
    signals.defender.reclearByTier[context.structureTier] = clamp(
      signals.defender.reclearByTier[context.structureTier] * 1.006,
      0.95,
      1.08
    );
  } else if (laneClosure.posture === 'softened-shell') {
    signals.wave.carryoverScalar = clamp(signals.wave.carryoverScalar * 1.004, 0.95, 1.08);
  }

  if (
    closurePacing.state === 'accelerated-closure-window' &&
    context.structureTier !== 'outer'
  ) {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 1.006,
      0.95,
      1.08
    );
    signals.tower.holdByTier[context.structureTier] = clamp(
      signals.tower.holdByTier[context.structureTier] * 0.997,
      0.95,
      1.08
    );
    signals.defender.pressureDecayByTier[context.structureTier] = clamp(
      signals.defender.pressureDecayByTier[context.structureTier] * 0.997,
      0.95,
      1.08
    );
  } else if (closurePacing.state === 'defender-reset-window') {
    signals.wave.progressionBySegment[context.pressureSegmentStart] = clamp(
      signals.wave.progressionBySegment[context.pressureSegmentStart] * 0.994,
      0.95,
      1.08
    );
    signals.defender.reclearByTier[context.structureTier] = clamp(
      signals.defender.reclearByTier[context.structureTier] * 1.006,
      0.95,
      1.08
    );
    signals.defender.pressureDecayByTier[context.structureTier] = clamp(
      signals.defender.pressureDecayByTier[context.structureTier] * 1.004,
      0.95,
      1.08
    );
  } else if (closurePacing.state === 'closure-readiness') {
    signals.wave.carryoverScalar = clamp(
      signals.wave.carryoverScalar * 1.004,
      0.95,
      1.08
    );
  }

  return signals;
};

const buildEventDebugByTier = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['structurePressureEventsByTier'] => ({
  outer: cloneTierEventDebug(snapshot, 'outer'),
  inner: cloneTierEventDebug(snapshot, 'inner'),
  core: cloneTierEventDebug(snapshot, 'core')
});

const cloneTierEventDebug = (
  snapshot: PrototypeLaneStateSnapshot,
  tier: StructurePressureTier
) => {
  const event = snapshot.structurePressureEventsByTier[tier];
  return {
    eventCount: event.eventCount,
    active: event.active
      ? {
          id: event.active.id,
          ageSeconds: event.active.ageSeconds,
          peakPressure: event.active.peakPressure,
          currentPressure: event.active.currentPressure,
          qualifiedSiegeAttempt: event.active.qualifiedSiegeAttempt,
          boundedClosureState: event.active.boundedClosureState
        }
      : null,
    lastCompleted: event.lastCompleted
      ? {
          id: event.lastCompleted.id,
          durationSeconds: event.lastCompleted.durationSeconds,
          peakPressure: event.lastCompleted.peakPressure,
          finalPressure: event.lastCompleted.finalPressure,
          result: event.lastCompleted.result,
          calibrationMeaning: event.lastCompleted.calibrationMeaning,
          qualifiedSiegeAttempt: event.lastCompleted.qualifiedSiegeAttempt,
          boundedClosureState: event.lastCompleted.boundedClosureState
        }
      : null,
    calibration: {
      meaning: event.calibration.meaning,
      boundedClosureState: event.calibration.boundedClosureState,
      progressionScalar: event.calibration.progressionScalar,
      carryoverScalar: event.calibration.carryoverScalar,
      towerHoldScalar: event.calibration.towerHoldScalar,
      defenderDelayScalar: event.calibration.defenderDelayScalar,
      defenderReclearScalar: event.calibration.defenderReclearScalar,
      pressureDecayScalar: event.calibration.pressureDecayScalar
    }
  };
};

const buildResolutionDebugByTier = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['structureResolutionByTier'] => ({
  outer: cloneTierResolutionDebug(snapshot, 'outer'),
  inner: cloneTierResolutionDebug(snapshot, 'inner'),
  core: cloneTierResolutionDebug(snapshot, 'core')
});

const cloneTierResolutionDebug = (
  snapshot: PrototypeLaneStateSnapshot,
  tier: StructurePressureTier
) => {
  const resolution = snapshot.structureResolutionByTier[tier];

  return {
    threatStage: resolution.threatStage,
    recentOutcomeMemory: resolution.recentOutcomeMemory,
    recentOutcomeWeight: resolution.recentOutcomeWeight,
    accumulatedPartialProgress: resolution.accumulatedPartialProgress,
    defendedReliefStrength: resolution.defendedReliefStrength,
    repeatedPressureEscalation: resolution.repeatedPressureEscalation,
    timeSinceLastMeaningfulSiegeSeconds:
      resolution.timeSinceLastMeaningfulSiegeSeconds,
    lastMeaningfulSiegeResult: resolution.lastMeaningfulSiegeResult,
    meaningfulAttemptCount: resolution.meaningfulAttemptCount,
    calibration: {
      stage: resolution.calibration.stage,
      progressionScalar: resolution.calibration.progressionScalar,
      carryoverScalar: resolution.calibration.carryoverScalar,
      towerHoldScalar: resolution.calibration.towerHoldScalar,
      defenderDelayScalar: resolution.calibration.defenderDelayScalar,
      defenderReclearScalar: resolution.calibration.defenderReclearScalar,
      pressureDecayScalar: resolution.calibration.pressureDecayScalar
    }
  };
};

const cloneLaneClosureDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['laneClosure'] => ({
  posture: snapshot.laneClosure.posture,
  postureAgeSeconds: snapshot.laneClosure.postureAgeSeconds,
  closureThreatLevel: snapshot.laneClosure.closureThreatLevel,
  laneStabilityLevel: snapshot.laneClosure.laneStabilityLevel,
  defenderRecoveryLevel: snapshot.laneClosure.defenderRecoveryLevel,
  antiStallAccelerationLevel: snapshot.laneClosure.antiStallAccelerationLevel,
  structuralCarryoverLevel: snapshot.laneClosure.structuralCarryoverLevel,
  closureThreatScalar: snapshot.laneClosure.calibration.closureThreatScalar,
  laneStabilityScalar: snapshot.laneClosure.calibration.laneStabilityScalar,
  defenderRecoveryScalar: snapshot.laneClosure.calibration.defenderRecoveryScalar,
  antiStallAccelerationScalar: snapshot.laneClosure.calibration.antiStallAccelerationScalar,
  structuralCarryoverScalar: snapshot.laneClosure.calibration.structuralCarryoverScalar
});

const cloneClosurePacingDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['closurePacing'] => ({
  state: snapshot.closurePacing.state,
  stateAgeSeconds: snapshot.closurePacing.stateAgeSeconds,
  closureReadinessLevel: snapshot.closurePacing.closureReadinessLevel,
  antiStallReadinessLevel: snapshot.closurePacing.antiStallReadinessLevel,
  defenderResetLevel: snapshot.closurePacing.defenderResetLevel,
  closureWindowLevel: snapshot.closurePacing.closureWindowLevel,
  pacingPressureLevel: snapshot.closurePacing.pacingPressureLevel,
  closureReadinessScalar: snapshot.closurePacing.calibration.closureReadinessScalar,
  antiStallReadinessScalar: snapshot.closurePacing.calibration.antiStallReadinessScalar,
  defenderResetScalar: snapshot.closurePacing.calibration.defenderResetScalar,
  closureWindowScalar: snapshot.closurePacing.calibration.closureWindowScalar,
  pacingPressureScalar: snapshot.closurePacing.calibration.pacingPressureScalar
});

const cloneClosurePacingWatchDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['closurePacingWatch'] => ({
  healthState: snapshot.closurePacingWatch.healthState,
  healthStateAgeSeconds: snapshot.closurePacingWatch.healthStateAgeSeconds,
  currentStateDwellSeconds: snapshot.closurePacingWatch.currentStateDwellSeconds,
  firstEntrySecondsByState: {
    ...snapshot.closurePacingWatch.firstEntrySecondsByState
  },
  cumulativeDwellSecondsByState: {
    ...snapshot.closurePacingWatch.cumulativeDwellSecondsByState
  },
  entryCountByState: {
    ...snapshot.closurePacingWatch.entryCountByState
  },
  exitCountByState: {
    ...snapshot.closurePacingWatch.exitCountByState
  },
  stickyAntiStallEvents: snapshot.closurePacingWatch.stickyAntiStallEvents,
  stickyClosureWindowEvents: snapshot.closurePacingWatch.stickyClosureWindowEvents,
  prolongedReadinessEvents: snapshot.closurePacingWatch.prolongedReadinessEvents,
  prematureResetEvents: snapshot.closurePacingWatch.prematureResetEvents,
  legitimateResetWindows: snapshot.closurePacingWatch.legitimateResetWindows,
  orderFlags: {
    ...snapshot.closurePacingWatch.orderFlags
  },
  pacingHealthScalar: snapshot.closurePacingWatch.calibration.pacingHealthScalar,
  escalationTimingScalar: snapshot.closurePacingWatch.calibration.escalationTimingScalar,
  closureStickinessScalar: snapshot.closurePacingWatch.calibration.closureStickinessScalar,
  defenderResetQualityScalar:
    snapshot.closurePacingWatch.calibration.defenderResetQualityScalar,
  progressionOrderScalar: snapshot.closurePacingWatch.calibration.progressionOrderScalar
});

const cloneClosureDoctrineFitDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['closureDoctrineFit'] => ({
  verdict: snapshot.closureDoctrineFit.verdict,
  verdictAgeSeconds: snapshot.closureDoctrineFit.verdictAgeSeconds,
  doctrineFitLevel: snapshot.closureDoctrineFit.doctrineFitLevel,
  earlySiegeBiasLevel: snapshot.closureDoctrineFit.earlySiegeBiasLevel,
  lateClosureDragLevel: snapshot.closureDoctrineFit.lateClosureDragLevel,
  resetCadenceRiskLevel: snapshot.closureDoctrineFit.resetCadenceRiskLevel,
  antiStallOverhangLevel: snapshot.closureDoctrineFit.antiStallOverhangLevel,
  retuningUrgencyLevel: snapshot.closureDoctrineFit.retuningUrgencyLevel,
  doctrineFitScalar: snapshot.closureDoctrineFit.calibration.doctrineFitScalar,
  earlySiegeBiasScalar: snapshot.closureDoctrineFit.calibration.earlySiegeBiasScalar,
  lateClosureDragScalar: snapshot.closureDoctrineFit.calibration.lateClosureDragScalar,
  resetCadenceRiskScalar: snapshot.closureDoctrineFit.calibration.resetCadenceRiskScalar,
  antiStallOverhangScalar: snapshot.closureDoctrineFit.calibration.antiStallOverhangScalar,
  retuningUrgencyScalar: snapshot.closureDoctrineFit.calibration.retuningUrgencyScalar,
  hint: {
    ...snapshot.closureDoctrineFit.hint
  }
});

const cloneCalibrationRetuningDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationRetuning'] => ({
  dominantCalibrationDomain: snapshot.calibrationRetuning.dominantCalibrationDomain,
  overallRetuningPressure: snapshot.calibrationRetuning.overallRetuningPressure,
  suggestionConfidenceBlend: snapshot.calibrationRetuning.suggestionConfidenceBlend,
  recommendationCount: snapshot.calibrationRetuning.recommendationCount,
  suggestions: {
    earlyEscalation: {
      ...snapshot.calibrationRetuning.suggestions.earlyEscalation
    },
    closureTiming: {
      ...snapshot.calibrationRetuning.suggestions.closureTiming
    },
    resetCadence: {
      ...snapshot.calibrationRetuning.suggestions.resetCadence
    },
    antiStallDwell: {
      ...snapshot.calibrationRetuning.suggestions.antiStallDwell
    }
  }
});

const cloneCalibrationDigestDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationDigest'] => ({
  windowDurationSeconds: snapshot.calibrationDigest.windowDurationSeconds,
  sampleCount: snapshot.calibrationDigest.sampleCount,
  dominantDriftOverRun: snapshot.calibrationDigest.dominantDriftOverRun,
  dominantCalibrationDomainConsensus:
    snapshot.calibrationDigest.dominantCalibrationDomainConsensus,
  overallTuningPriority: snapshot.calibrationDigest.overallTuningPriority,
  escalationTimingSummary: snapshot.calibrationDigest.escalationTimingSummary,
  resetQualitySummary: snapshot.calibrationDigest.resetQualitySummary,
  closureStickinessSummary: snapshot.calibrationDigest.closureStickinessSummary,
  recommendationStabilityScalar: snapshot.calibrationDigest.recommendationStabilityScalar,
  confidenceBlend: snapshot.calibrationDigest.confidenceBlend,
  driftConsensusLevel: snapshot.calibrationDigest.driftConsensusLevel,
  domainConsensusLevel: snapshot.calibrationDigest.domainConsensusLevel,
  averageRetuningPressure: snapshot.calibrationDigest.averageRetuningPressure
});

const cloneCalibrationDigestComparisonDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationDigestComparison'] => ({
  baselineAvailable: snapshot.calibrationDigestComparison.baselineAvailable,
  baselineWindowDurationSeconds:
    snapshot.calibrationDigestComparison.baselineWindowDurationSeconds,
  currentWindowDurationSeconds:
    snapshot.calibrationDigestComparison.currentWindowDurationSeconds,
  verdict: snapshot.calibrationDigestComparison.verdict,
  dominantDriftChange: {
    ...snapshot.calibrationDigestComparison.dominantDriftChange
  },
  dominantCalibrationDomainChange: {
    ...snapshot.calibrationDigestComparison.dominantCalibrationDomainChange
  },
  overallTuningPriorityChange: {
    ...snapshot.calibrationDigestComparison.overallTuningPriorityChange
  },
  escalationTimingSummaryChange: {
    ...snapshot.calibrationDigestComparison.escalationTimingSummaryChange
  },
  resetQualitySummaryChange: {
    ...snapshot.calibrationDigestComparison.resetQualitySummaryChange
  },
  closureStickinessSummaryChange: {
    ...snapshot.calibrationDigestComparison.closureStickinessSummaryChange
  },
  recommendationStabilityDelta:
    snapshot.calibrationDigestComparison.recommendationStabilityDelta,
  confidenceBlendDelta: snapshot.calibrationDigestComparison.confidenceBlendDelta,
  averageRetuningPressureDelta:
    snapshot.calibrationDigestComparison.averageRetuningPressureDelta,
  comparisonScore: snapshot.calibrationDigestComparison.comparisonScore
});

const cloneCalibrationEvidenceDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationEvidence'] => ({
  topEvidenceDrivers: snapshot.calibrationEvidence.topEvidenceDrivers.map(
    cloneCalibrationEvidenceDriverDebug
  ),
  topPositiveDrivers: snapshot.calibrationEvidence.topPositiveDrivers.map(
    cloneCalibrationEvidenceDriverDebug
  ),
  topNegativeDrivers: snapshot.calibrationEvidence.topNegativeDrivers.map(
    cloneCalibrationEvidenceDriverDebug
  ),
  primaryExplanation: snapshot.calibrationEvidence.primaryExplanation,
  secondaryExplanation: snapshot.calibrationEvidence.secondaryExplanation,
  explanationConfidence: snapshot.calibrationEvidence.explanationConfidence,
  evidencePressureScore: snapshot.calibrationEvidence.evidencePressureScore,
  evidenceSignalSufficient: snapshot.calibrationEvidence.evidenceSignalSufficient
});

const cloneCalibrationEvidenceDriverDebug = (
  driver: CalibrationEvidenceDriver
): CalibrationEvidenceDriver => ({
  id: driver.id,
  direction: cloneCalibrationEvidenceDirection(driver.direction),
  weight: driver.weight,
  shortLabel: driver.shortLabel,
  shortReason: driver.shortReason
});

const cloneCalibrationEvidenceDirection = (
  direction: CalibrationEvidenceDriverDirection
): CalibrationEvidenceDriverDirection => direction;

const cloneCalibrationPassActionDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationPassAction'] =>
  cloneCalibrationPassActionSnapshot(snapshot.calibrationPassAction);

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

const cloneCalibrationPassReviewDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationPassReview'] =>
  cloneCalibrationPassReviewSnapshot(snapshot.calibrationPassReview);

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

const cloneCalibrationOperatorControlsDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationOperatorControls'] =>
  cloneCalibrationOperatorControlsSnapshot(snapshot.calibrationOperatorControls);

const cloneCalibrationOperatorControlsSnapshot = (
  snapshot: CalibrationOperatorControlsSnapshot
): CalibrationOperatorControlsSnapshot => ({
  lastActionId: snapshot.lastActionId,
  lastActionLabel: snapshot.lastActionLabel,
  lastActionRuntimeSeconds: snapshot.lastActionRuntimeSeconds,
  actionFeedbackText: snapshot.actionFeedbackText,
  actionFeedbackSeverity: snapshot.actionFeedbackSeverity
});

const cloneCalibrationOperatorWorkflowDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationOperatorWorkflow'] =>
  cloneCalibrationOperatorWorkflowSnapshot(snapshot.calibrationOperatorWorkflow);

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

const cloneCalibrationOperatorLoopClosureDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['calibrationOperatorLoopClosure'] =>
  cloneCalibrationOperatorLoopClosureSnapshot(
    snapshot.calibrationOperatorLoopClosure
  );

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

const cloneSharedLaneConsequenceDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['sharedLaneConsequence'] =>
  cloneHeadlessBridgeLaneConsequenceSnapshot(snapshot.sharedLaneConsequence);

const cloneSharedSiegeWindowDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['sharedSiegeWindow'] =>
  cloneSharedSiegeWindowSnapshot(snapshot.sharedSiegeWindow);

const cloneSharedStructureConversionDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['sharedStructureConversion'] =>
  cloneSharedStructureConversionSnapshot(snapshot.sharedStructureConversion);

const cloneSharedClosureAdvancementDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['sharedClosureAdvancement'] =>
  cloneSharedClosureAdvancementSnapshot(snapshot.sharedClosureAdvancement);

const cloneSharedDefenderResponseDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['sharedDefenderResponse'] =>
  cloneSharedDefenderResponseSnapshot(snapshot.sharedDefenderResponse);

const cloneSharedPushReassertionDebug = (
  snapshot: PrototypeLaneStateSnapshot
): LivePrototypeSignalProviderDebugState['sharedPushReassertion'] =>
  cloneSharedPushReassertionSnapshot(snapshot.sharedPushReassertion);

const cloneSignals = (signals: LivePrototypeSignals): LivePrototypeSignals => ({
  wave: {
    progressionBySegment: { ...signals.wave.progressionBySegment },
    carryoverScalar: signals.wave.carryoverScalar
  },
  tower: {
    holdByTier: { ...signals.tower.holdByTier }
  },
  defender: {
    delayByTier: { ...signals.defender.delayByTier },
    reclearByTier: { ...signals.defender.reclearByTier },
    pressureDecayByTier: { ...signals.defender.pressureDecayByTier }
  }
});

const scalarFromNormalized = (value: number, min: number, max: number): number =>
  clamp(min + clamp(value, 0, 1) * (max - min), min, max);

const mix = (a: number, b: number, t: number): number =>
  a * (1 - t) + b * t;

const average = (a: number, b: number): number =>
  (a + b) * 0.5;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
