import { clamp } from './calibrationUtils';
import {
  type ClosureDoctrineConfidence,
  type ClosureDoctrineFitSnapshot
} from './closureDoctrineFitEvaluator';
import { type ClosurePacingSnapshot } from './closurePacingInterpreter';
import { type ClosurePacingWatchSnapshot } from './closurePacingWatch';

export type CalibrationRetuningDomain =
  | 'none'
  | 'early-escalation'
  | 'closure-timing'
  | 'reset-cadence'
  | 'anti-stall-dwell';

export type CalibrationRetuningDirection =
  | 'hold'
  | 'increase'
  | 'decrease'
  | 'shorten'
  | 'lengthen'
  | 'stabilize';

export type CalibrationRetuningStrength = 'none' | 'low' | 'medium' | 'high';

export interface CalibrationRetuningDomainSuggestion {
  direction: CalibrationRetuningDirection;
  strength: CalibrationRetuningStrength;
  urgency: number;
  confidence: ClosureDoctrineConfidence;
  confidenceScalar: number;
}

export interface CalibrationRetuningSuggestionsSnapshot {
  dominantCalibrationDomain: CalibrationRetuningDomain;
  overallRetuningPressure: number;
  suggestionConfidenceBlend: number;
  recommendationCount: number;
  suggestions: {
    earlyEscalation: CalibrationRetuningDomainSuggestion;
    closureTiming: CalibrationRetuningDomainSuggestion;
    resetCadence: CalibrationRetuningDomainSuggestion;
    antiStallDwell: CalibrationRetuningDomainSuggestion;
  };
}

export interface CalibrationRetuningSuggestionsInput {
  doctrineFit: ClosureDoctrineFitSnapshot;
  pacing: ClosurePacingSnapshot;
  watch: ClosurePacingWatchSnapshot;
}

export interface CalibrationRetuningSuggestionsModel {
  update(input: CalibrationRetuningSuggestionsInput): void;
  getSnapshot(): CalibrationRetuningSuggestionsSnapshot;
}

interface RuntimeState {
  snapshot: CalibrationRetuningSuggestionsSnapshot;
}

export const createCalibrationRetuningSuggestionsModel =
  (): CalibrationRetuningSuggestionsModel => {
    const state: RuntimeState = {
      snapshot: buildDefaultSnapshot()
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

const buildDefaultSnapshot = (): CalibrationRetuningSuggestionsSnapshot => ({
  dominantCalibrationDomain: 'none',
  overallRetuningPressure: 0,
  suggestionConfidenceBlend: 0.42,
  recommendationCount: 0,
  suggestions: {
    earlyEscalation: buildSuggestion('hold', 0, 0.4),
    closureTiming: buildSuggestion('hold', 0, 0.4),
    resetCadence: buildSuggestion('hold', 0, 0.4),
    antiStallDwell: buildSuggestion('hold', 0, 0.4)
  }
});

const deriveSnapshot = (
  input: CalibrationRetuningSuggestionsInput
): CalibrationRetuningSuggestionsSnapshot => {
  const doctrine = input.doctrineFit;
  const earlyConfidence = deriveDomainConfidence(
    doctrine,
    Math.max(
      doctrine.earlySiegeBiasLevel,
      input.watch.healthState === 'early-escalation' ? 0.82 : 0
    )
  );
  const closureConfidence = deriveDomainConfidence(
    doctrine,
    Math.max(doctrine.earlySiegeBiasLevel * 0.72, doctrine.lateClosureDragLevel)
  );
  const resetConfidence = deriveDomainConfidence(
    doctrine,
    Math.max(
      doctrine.resetCadenceRiskLevel,
      input.watch.healthState === 'premature-reset' ? 0.88 : 0
    )
  );
  const overhangConfidence = deriveDomainConfidence(
    doctrine,
    Math.max(
      doctrine.antiStallOverhangLevel,
      input.watch.healthState === 'sticky-anti-stall' ||
      input.watch.healthState === 'sticky-closure-window' ||
      input.watch.healthState === 'prolonged-readiness'
        ? 0.8
        : 0
    )
  );

  const earlyEscalation = deriveEarlyEscalationSuggestion(
    doctrine,
    input.pacing,
    earlyConfidence
  );
  const closureTiming = deriveClosureTimingSuggestion(
    doctrine,
    input.pacing,
    closureConfidence
  );
  const resetCadence = deriveResetCadenceSuggestion(
    doctrine,
    input.watch,
    resetConfidence
  );
  const antiStallDwell = deriveAntiStallDwellSuggestion(
    doctrine,
    input.pacing,
    input.watch,
    overhangConfidence
  );

  const suggestions = {
    earlyEscalation,
    closureTiming,
    resetCadence,
    antiStallDwell
  };
  const activeEntries = getActiveEntries(suggestions);
  const dominantCalibrationDomain =
    activeEntries.length > 0
      ? activeEntries.reduce((best, current) =>
          current[1].urgency > best[1].urgency ? current : best
        )[0]
      : 'none';
  const recommendationCount = activeEntries.length;
  const overallRetuningPressure =
    activeEntries.length > 0
      ? clamp(
          Math.max(...activeEntries.map((entry) => entry[1].urgency)) * 0.62 +
            average(activeEntries.map((entry) => entry[1].urgency)) * 0.38,
          0,
          1
        )
      : 0;
  const suggestionConfidenceBlend =
    activeEntries.length > 0
      ? average(activeEntries.map((entry) => entry[1].confidenceScalar))
      : average([
          earlyEscalation.confidenceScalar,
          closureTiming.confidenceScalar,
          resetCadence.confidenceScalar,
          antiStallDwell.confidenceScalar
        ]);

  return {
    dominantCalibrationDomain,
    overallRetuningPressure,
    suggestionConfidenceBlend,
    recommendationCount,
    suggestions
  };
};

const deriveEarlyEscalationSuggestion = (
  doctrine: ClosureDoctrineFitSnapshot,
  pacing: ClosurePacingSnapshot,
  confidenceScalar: number
): CalibrationRetuningDomainSuggestion => {
  if (
    doctrine.verdict === 'early-siege-bias' ||
    doctrine.earlySiegeBiasLevel >= 0.34
  ) {
    return buildSuggestion(
      'decrease',
      clamp(
        doctrine.earlySiegeBiasLevel * 0.84 +
          doctrine.retuningUrgencyLevel * 0.16,
        0,
        1
      ),
      confidenceScalar
    );
  }

  if (
    doctrine.verdict === 'late-closure-drag' &&
    doctrine.lateClosureDragLevel >= 0.62 &&
    doctrine.earlySiegeBiasLevel <= 0.26 &&
    pacing.state === 'normal-pressure'
  ) {
    return buildSuggestion(
      'increase',
      clamp(doctrine.lateClosureDragLevel * 0.48, 0, 0.46),
      confidenceScalar * 0.9
    );
  }

  return buildSuggestion('hold', 0, confidenceScalar * 0.72);
};

const deriveClosureTimingSuggestion = (
  doctrine: ClosureDoctrineFitSnapshot,
  pacing: ClosurePacingSnapshot,
  confidenceScalar: number
): CalibrationRetuningDomainSuggestion => {
  if (
    doctrine.verdict === 'late-closure-drag' ||
    doctrine.lateClosureDragLevel >= 0.32
  ) {
    return buildSuggestion(
      'shorten',
      clamp(
        doctrine.lateClosureDragLevel * 0.82 +
          (pacing.state === 'normal-pressure' ? 0.08 : 0),
        0,
        1
      ),
      confidenceScalar
    );
  }

  if (
    doctrine.verdict === 'early-siege-bias' ||
    doctrine.earlySiegeBiasLevel >= 0.38
  ) {
    return buildSuggestion(
      'lengthen',
      clamp(doctrine.earlySiegeBiasLevel * 0.74, 0, 0.9),
      confidenceScalar
    );
  }

  return buildSuggestion('hold', 0, confidenceScalar * 0.7);
};

const deriveResetCadenceSuggestion = (
  doctrine: ClosureDoctrineFitSnapshot,
  watch: ClosurePacingWatchSnapshot,
  confidenceScalar: number
): CalibrationRetuningDomainSuggestion => {
  if (
    doctrine.verdict === 'unstable-reset-cadence' ||
    doctrine.resetCadenceRiskLevel >= 0.3
  ) {
    return buildSuggestion(
      'stabilize',
      clamp(
        doctrine.resetCadenceRiskLevel * 0.8 +
          watch.prematureResetEvents * 0.08,
        0,
        1
      ),
      confidenceScalar
    );
  }

  return buildSuggestion('hold', 0, confidenceScalar * 0.74);
};

const deriveAntiStallDwellSuggestion = (
  doctrine: ClosureDoctrineFitSnapshot,
  pacing: ClosurePacingSnapshot,
  watch: ClosurePacingWatchSnapshot,
  confidenceScalar: number
): CalibrationRetuningDomainSuggestion => {
  if (
    doctrine.verdict === 'anti-stall-overhang' ||
    doctrine.antiStallOverhangLevel >= 0.32
  ) {
    return buildSuggestion(
      'shorten',
      clamp(
        doctrine.antiStallOverhangLevel * 0.84 +
          stickyBias(watch, pacing) * 0.16,
        0,
        1
      ),
      confidenceScalar
    );
  }

  return buildSuggestion('hold', 0, confidenceScalar * 0.74);
};

const stickyBias = (
  watch: ClosurePacingWatchSnapshot,
  pacing: ClosurePacingSnapshot
): number =>
  clamp(
    watch.stickyAntiStallEvents * 0.24 +
      watch.stickyClosureWindowEvents * 0.28 +
      watch.prolongedReadinessEvents * 0.18 +
      (pacing.state === 'rising-anti-stall' ||
      pacing.state === 'closure-readiness' ||
      pacing.state === 'accelerated-closure-window'
        ? 0.12
        : 0),
    0,
    1
  );

const deriveDomainConfidence = (
  doctrine: ClosureDoctrineFitSnapshot,
  evidence: number
): number =>
  clamp(
    confidenceToScalar(doctrine.hint.confidence) * 0.58 +
      clamp(evidence, 0, 1) * 0.42,
    0,
    1
  );

const buildSuggestion = (
  direction: CalibrationRetuningDirection,
  urgency: number,
  confidenceScalar: number
): CalibrationRetuningDomainSuggestion => ({
  direction,
  strength:
    direction === 'hold'
      ? 'none'
      : urgency >= 0.7
        ? 'high'
        : urgency >= 0.42
          ? 'medium'
          : 'low',
  urgency: clamp(urgency, 0, 1),
  confidence: scalarToConfidence(confidenceScalar),
  confidenceScalar: clamp(confidenceScalar, 0, 1)
});

const getActiveEntries = (
  suggestions: CalibrationRetuningSuggestionsSnapshot['suggestions']
): Array<[CalibrationRetuningDomain, CalibrationRetuningDomainSuggestion]> => {
  const entries: Array<[CalibrationRetuningDomain, CalibrationRetuningDomainSuggestion]> = [
    ['early-escalation', suggestions.earlyEscalation],
    ['closure-timing', suggestions.closureTiming],
    ['reset-cadence', suggestions.resetCadence],
    ['anti-stall-dwell', suggestions.antiStallDwell]
  ];

  return entries.filter((entry) => entry[1].direction !== 'hold');
};

const cloneSnapshot = (
  snapshot: CalibrationRetuningSuggestionsSnapshot
): CalibrationRetuningSuggestionsSnapshot => ({
  dominantCalibrationDomain: snapshot.dominantCalibrationDomain,
  overallRetuningPressure: snapshot.overallRetuningPressure,
  suggestionConfidenceBlend: snapshot.suggestionConfidenceBlend,
  recommendationCount: snapshot.recommendationCount,
  suggestions: {
    earlyEscalation: { ...snapshot.suggestions.earlyEscalation },
    closureTiming: { ...snapshot.suggestions.closureTiming },
    resetCadence: { ...snapshot.suggestions.resetCadence },
    antiStallDwell: { ...snapshot.suggestions.antiStallDwell }
  }
});

const confidenceToScalar = (
  confidence: ClosureDoctrineConfidence
): number =>
  confidence === 'high'
    ? 0.86
    : confidence === 'medium'
      ? 0.68
      : 0.46;

const scalarToConfidence = (value: number): ClosureDoctrineConfidence =>
  value >= 0.78 ? 'high' : value >= 0.58 ? 'medium' : 'low';

const average = (values: number[]): number =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
