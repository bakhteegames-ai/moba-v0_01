import {
  type CalibrationRetuningDomain,
  type CalibrationRetuningSuggestionsSnapshot
} from './calibrationRetuningSuggestions';
import {
  type CalibrationDigestComparisonSnapshot,
  type CalibrationDigestComparisonVerdict
} from './calibrationDigestComparison';
import { type CalibrationDigestSummarySnapshot } from './calibrationDigestSummary';
import { type CalibrationEvidenceExplainerSnapshot } from './calibrationEvidenceExplainer';
import {
  type CalibrationPassActionCueSnapshot,
  type CalibrationPassReadinessVerdict,
  type CalibrationPassRecommendedAction
} from './calibrationPassActionCue';
import { type ClosureDoctrineFitSnapshot } from './closureDoctrineFitEvaluator';

export type CalibrationPassReviewTrigger =
  | 'operator-handoff'
  | 'reset-calibration-digest'
  | 'capture-current-calibration-baseline'
  | 'clear-calibration-baseline';

export type CalibrationPassReviewTriggerSource =
  | CalibrationPassReviewTrigger
  | 'none';

export interface CalibrationPassReviewHandoffSnapshot {
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
}

export interface CalibrationPassReviewHandoffInput {
  runtimeSeconds: number;
  doctrineFit: ClosureDoctrineFitSnapshot;
  retuning: CalibrationRetuningSuggestionsSnapshot;
  digest: CalibrationDigestSummarySnapshot;
  comparison: CalibrationDigestComparisonSnapshot;
  evidence: CalibrationEvidenceExplainerSnapshot;
  actionCue: CalibrationPassActionCueSnapshot;
}

export interface CalibrationPassReviewHandoffModel {
  update(input: CalibrationPassReviewHandoffInput): void;
  freezeCurrentCalibrationPassReview(
    reason: CalibrationPassReviewTrigger,
    force?: boolean
  ): void;
  clearFrozenCalibrationPassReview(): void;
  getSnapshot(): CalibrationPassReviewHandoffSnapshot;
}

interface CurrentPassReviewCandidate {
  runtimeSeconds: number;
  doctrineFit: ClosureDoctrineFitSnapshot;
  retuning: CalibrationRetuningSuggestionsSnapshot;
  digest: CalibrationDigestSummarySnapshot;
  comparison: CalibrationDigestComparisonSnapshot;
  evidence: CalibrationEvidenceExplainerSnapshot;
  actionCue: CalibrationPassActionCueSnapshot;
}

interface RuntimeState {
  current: CurrentPassReviewCandidate;
  frozen: CalibrationPassReviewHandoffSnapshot;
}

const autoFreezeWindowSeconds = 2.5;
const autoFreezeSampleCount = 2;

export const createCalibrationPassReviewHandoffModel =
  (): CalibrationPassReviewHandoffModel => {
    const state: RuntimeState = {
      current: createDefaultCurrentCandidate(),
      frozen: createDefaultSnapshot()
    };

    return {
      update(input) {
        state.current = cloneCurrentCandidate(input);
      },
      freezeCurrentCalibrationPassReview(reason, force = false) {
        if (!force && !hasMeaningfulCurrentPass(state.current)) {
          return;
        }

        state.frozen = freezeSnapshot(state.current, reason);
      },
      clearFrozenCalibrationPassReview() {
        state.frozen = createDefaultSnapshot();
      },
      getSnapshot() {
        return cloneSnapshot(state.frozen);
      }
    };
  };

const hasMeaningfulCurrentPass = (
  current: CurrentPassReviewCandidate
): boolean =>
  current.digest.windowDurationSeconds >= autoFreezeWindowSeconds ||
  current.digest.sampleCount >= autoFreezeSampleCount ||
  current.actionCue.actionSignalSufficient ||
  current.comparison.verdict !== 'insufficient-signal';

const freezeSnapshot = (
  current: CurrentPassReviewCandidate,
  reason: CalibrationPassReviewTrigger
): CalibrationPassReviewHandoffSnapshot => ({
  hasFrozenReview: true,
  frozenAtRuntimeSeconds: current.runtimeSeconds,
  sourceActionTrigger: reason,
  finalReadinessVerdict: current.actionCue.readinessVerdict,
  finalRecommendedAction: current.actionCue.recommendedAction,
  finalRecommendedDomain: current.actionCue.recommendedDomain,
  finalBaselinePromotionAllowed: current.actionCue.baselinePromotionAllowed,
  finalActionConfidence: current.actionCue.actionConfidence,
  finalPrimaryReason: current.actionCue.primaryActionReason,
  finalSecondaryReason: current.actionCue.secondaryActionReason,
  finalBlockingFactors: [...current.actionCue.blockingFactors],
  finalComparisonVerdict: current.comparison.verdict,
  finalPrimaryExplanation: current.evidence.primaryExplanation,
  finalEvidencePressureScore: current.evidence.evidencePressureScore,
  finalSignalSufficient: current.actionCue.actionSignalSufficient,
  finalDoctrineFitLevel: current.doctrineFit.doctrineFitLevel,
  finalRetuningPressure: current.retuning.overallRetuningPressure
});

const createDefaultCurrentCandidate = (): CurrentPassReviewCandidate => ({
  runtimeSeconds: 0,
  doctrineFit: {
    verdict: 'doctrine-fit',
    verdictAgeSeconds: 0,
    doctrineFitLevel: 0,
    earlySiegeBiasLevel: 0,
    lateClosureDragLevel: 0,
    resetCadenceRiskLevel: 0,
    antiStallOverhangLevel: 0,
    retuningUrgencyLevel: 0,
    calibration: {
      verdict: 'doctrine-fit',
      doctrineFitScalar: 0.96,
      earlySiegeBiasScalar: 1,
      lateClosureDragScalar: 1,
      resetCadenceRiskScalar: 1,
      antiStallOverhangScalar: 1,
      retuningUrgencyScalar: 1
    },
    hint: {
      dominantDriftCause: 'none',
      likelyRetuningDirection: 'hold-course',
      confidence: 'low'
    }
  },
  retuning: {
    dominantCalibrationDomain: 'none',
    overallRetuningPressure: 0,
    suggestionConfidenceBlend: 0.42,
    recommendationCount: 0,
    suggestions: {
      earlyEscalation: {
        direction: 'hold',
        strength: 'none',
        urgency: 0,
        confidence: 'low',
        confidenceScalar: 0.4
      },
      closureTiming: {
        direction: 'hold',
        strength: 'none',
        urgency: 0,
        confidence: 'low',
        confidenceScalar: 0.4
      },
      resetCadence: {
        direction: 'hold',
        strength: 'none',
        urgency: 0,
        confidence: 'low',
        confidenceScalar: 0.4
      },
      antiStallDwell: {
        direction: 'hold',
        strength: 'none',
        urgency: 0,
        confidence: 'low',
        confidenceScalar: 0.4
      }
    }
  },
  digest: {
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
  },
  comparison: {
    baselineAvailable: false,
    baselineWindowDurationSeconds: 0,
    currentWindowDurationSeconds: 0,
    verdict: 'insufficient-signal',
    dominantDriftChange: {
      baseline: 'none',
      current: 'doctrine-fit',
      changed: false
    },
    dominantCalibrationDomainChange: {
      baseline: 'none',
      current: 'none',
      changed: false
    },
    overallTuningPriorityChange: {
      baseline: 'none',
      current: 'low',
      changed: false,
      rankDelta: 0
    },
    escalationTimingSummaryChange: {
      baseline: 'none',
      current: 'limited-signal',
      changed: false
    },
    resetQualitySummaryChange: {
      baseline: 'none',
      current: 'limited-signal',
      changed: false
    },
    closureStickinessSummaryChange: {
      baseline: 'none',
      current: 'limited-signal',
      changed: false
    },
    recommendationStabilityDelta: 0,
    confidenceBlendDelta: 0,
    averageRetuningPressureDelta: 0,
    comparisonScore: 0
  },
  evidence: {
    topEvidenceDrivers: [],
    topPositiveDrivers: [],
    topNegativeDrivers: [],
    primaryExplanation: '',
    secondaryExplanation: '',
    explanationConfidence: 0.24,
    evidencePressureScore: 0,
    evidenceSignalSufficient: false
  },
  actionCue: {
    readinessVerdict: 'insufficient-signal',
    recommendedAction: 'rerun-for-signal',
    recommendedDomain: 'none',
    baselinePromotionAllowed: false,
    actionConfidence: 0.24,
    primaryActionReason: '',
    secondaryActionReason: '',
    blockingFactors: [],
    actionSignalSufficient: false
  }
});

const createDefaultSnapshot = (): CalibrationPassReviewHandoffSnapshot => ({
  hasFrozenReview: false,
  frozenAtRuntimeSeconds: null,
  sourceActionTrigger: 'none',
  finalReadinessVerdict: 'none',
  finalRecommendedAction: 'none',
  finalRecommendedDomain: 'none',
  finalBaselinePromotionAllowed: false,
  finalActionConfidence: 0,
  finalPrimaryReason: '',
  finalSecondaryReason: '',
  finalBlockingFactors: [],
  finalComparisonVerdict: 'none',
  finalPrimaryExplanation: '',
  finalEvidencePressureScore: 0,
  finalSignalSufficient: false,
  finalDoctrineFitLevel: 0,
  finalRetuningPressure: 0
});

const cloneCurrentCandidate = (
  input: CalibrationPassReviewHandoffInput
): CurrentPassReviewCandidate => ({
  runtimeSeconds: input.runtimeSeconds,
  doctrineFit: {
    verdict: input.doctrineFit.verdict,
    verdictAgeSeconds: input.doctrineFit.verdictAgeSeconds,
    doctrineFitLevel: input.doctrineFit.doctrineFitLevel,
    earlySiegeBiasLevel: input.doctrineFit.earlySiegeBiasLevel,
    lateClosureDragLevel: input.doctrineFit.lateClosureDragLevel,
    resetCadenceRiskLevel: input.doctrineFit.resetCadenceRiskLevel,
    antiStallOverhangLevel: input.doctrineFit.antiStallOverhangLevel,
    retuningUrgencyLevel: input.doctrineFit.retuningUrgencyLevel,
    calibration: {
      ...input.doctrineFit.calibration
    },
    hint: {
      ...input.doctrineFit.hint
    }
  },
  retuning: {
    dominantCalibrationDomain: input.retuning.dominantCalibrationDomain,
    overallRetuningPressure: input.retuning.overallRetuningPressure,
    suggestionConfidenceBlend: input.retuning.suggestionConfidenceBlend,
    recommendationCount: input.retuning.recommendationCount,
    suggestions: {
      earlyEscalation: { ...input.retuning.suggestions.earlyEscalation },
      closureTiming: { ...input.retuning.suggestions.closureTiming },
      resetCadence: { ...input.retuning.suggestions.resetCadence },
      antiStallDwell: { ...input.retuning.suggestions.antiStallDwell }
    }
  },
  digest: {
    ...input.digest
  },
  comparison: {
    ...input.comparison,
    dominantDriftChange: {
      ...input.comparison.dominantDriftChange
    },
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
    topEvidenceDrivers: input.evidence.topEvidenceDrivers.map(cloneEvidenceDriver),
    topPositiveDrivers: input.evidence.topPositiveDrivers.map(cloneEvidenceDriver),
    topNegativeDrivers: input.evidence.topNegativeDrivers.map(cloneEvidenceDriver),
    primaryExplanation: input.evidence.primaryExplanation,
    secondaryExplanation: input.evidence.secondaryExplanation,
    explanationConfidence: input.evidence.explanationConfidence,
    evidencePressureScore: input.evidence.evidencePressureScore,
    evidenceSignalSufficient: input.evidence.evidenceSignalSufficient
  },
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
  }
});

const cloneEvidenceDriver = (
  driver: CalibrationEvidenceExplainerSnapshot['topEvidenceDrivers'][number]
): CalibrationEvidenceExplainerSnapshot['topEvidenceDrivers'][number] => ({
  id: driver.id,
  direction: driver.direction,
  weight: driver.weight,
  shortLabel: driver.shortLabel,
  shortReason: driver.shortReason
});

const cloneSnapshot = (
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
