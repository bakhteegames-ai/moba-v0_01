import {
  type ClosurePacingSnapshot,
  type ClosurePacingState
} from './closurePacingInterpreter';
import { type ClosurePacingWatchSnapshot } from './closurePacingWatch';
import { gameplayTuningConfig } from './gameplayTuningConfig';

type PacingStateTimingMap = Record<ClosurePacingState, number | null>;

export type ClosureDoctrineFitVerdict =
  | 'doctrine-fit'
  | 'early-siege-bias'
  | 'late-closure-drag'
  | 'unstable-reset-cadence'
  | 'anti-stall-overhang';

export type ClosureDoctrineDriftCause =
  | 'none'
  | 'early-siege-bias'
  | 'late-closure-drag'
  | 'unstable-reset-cadence'
  | 'anti-stall-overhang';

export type ClosureDoctrineRetuningDirection =
  | 'hold-course'
  | 'tone-down-early-escalation'
  | 'pull-closure-forward'
  | 'stabilize-reset-cadence'
  | 'shorten-anti-stall-dwell';

export type ClosureDoctrineConfidence = 'low' | 'medium' | 'high';

export interface ClosureDoctrineFitHint {
  dominantDriftCause: ClosureDoctrineDriftCause;
  likelyRetuningDirection: ClosureDoctrineRetuningDirection;
  confidence: ClosureDoctrineConfidence;
}

export interface ClosureDoctrineFitCalibrationContext {
  verdict: ClosureDoctrineFitVerdict;
  doctrineFitScalar: number;
  earlySiegeBiasScalar: number;
  lateClosureDragScalar: number;
  resetCadenceRiskScalar: number;
  antiStallOverhangScalar: number;
  retuningUrgencyScalar: number;
}

export interface ClosureDoctrineFitSnapshot {
  verdict: ClosureDoctrineFitVerdict;
  verdictAgeSeconds: number;
  doctrineFitLevel: number;
  earlySiegeBiasLevel: number;
  lateClosureDragLevel: number;
  resetCadenceRiskLevel: number;
  antiStallOverhangLevel: number;
  retuningUrgencyLevel: number;
  calibration: ClosureDoctrineFitCalibrationContext;
  hint: ClosureDoctrineFitHint;
}

export interface ClosureDoctrineFitEvaluatorInput {
  elapsedSeconds: number;
  cycleSeconds: number;
  pacing: ClosurePacingSnapshot;
  watch: ClosurePacingWatchSnapshot;
}

export interface ClosureDoctrineFitEvaluator {
  update(dt: number, input: ClosureDoctrineFitEvaluatorInput): void;
  getSnapshot(): ClosureDoctrineFitSnapshot;
}

interface RuntimeLevels {
  doctrineFit: number;
  earlySiegeBias: number;
  lateClosureDrag: number;
  resetCadenceRisk: number;
  antiStallOverhang: number;
  retuningUrgency: number;
}

interface RuntimeState {
  verdict: ClosureDoctrineFitVerdict;
  verdictAgeSeconds: number;
  levels: RuntimeLevels;
  calibration: ClosureDoctrineFitCalibrationContext;
  hint: ClosureDoctrineFitHint;
}

const closureDoctrineFitTuning =
  gameplayTuningConfig.closureDoctrineFitEvaluator;
const observedConfidenceStates: ClosurePacingState[] = [
  'rising-anti-stall',
  'closure-readiness',
  'accelerated-closure-window',
  'defender-reset-window'
];

export const createClosureDoctrineFitEvaluator =
  (): ClosureDoctrineFitEvaluator => {
    const state: RuntimeState = createInitialRuntimeState();

    return {
      update(dt, input) {
        const target = deriveTargetLevels(input);
        const blend = clamp(
          dt * closureDoctrineFitTuning.blendRatePerSecond,
          closureDoctrineFitTuning.blendClamp.min,
          closureDoctrineFitTuning.blendClamp.max
        );

        state.levels.doctrineFit = approach(
          state.levels.doctrineFit,
          target.doctrineFit,
          blend
        );
        state.levels.earlySiegeBias = approach(
          state.levels.earlySiegeBias,
          target.earlySiegeBias,
          blend
        );
        state.levels.lateClosureDrag = approach(
          state.levels.lateClosureDrag,
          target.lateClosureDrag,
          blend
        );
        state.levels.resetCadenceRisk = approach(
          state.levels.resetCadenceRisk,
          target.resetCadenceRisk,
          blend
        );
        state.levels.antiStallOverhang = approach(
          state.levels.antiStallOverhang,
          target.antiStallOverhang,
          blend
        );
        state.levels.retuningUrgency = approach(
          state.levels.retuningUrgency,
          target.retuningUrgency,
          blend
        );

        const nextVerdict = deriveVerdict(state.levels);
        if (nextVerdict === state.verdict) {
          state.verdictAgeSeconds += Math.max(0, dt);
        } else {
          state.verdict = nextVerdict;
          state.verdictAgeSeconds = 0;
        }

        state.calibration = deriveCalibration(state.verdict, state.levels);
        state.hint = deriveHint(state.verdict, input);
      },
      getSnapshot() {
        return {
          verdict: state.verdict,
          verdictAgeSeconds: state.verdictAgeSeconds,
          doctrineFitLevel: state.levels.doctrineFit,
          earlySiegeBiasLevel: state.levels.earlySiegeBias,
          lateClosureDragLevel: state.levels.lateClosureDrag,
          resetCadenceRiskLevel: state.levels.resetCadenceRisk,
          antiStallOverhangLevel: state.levels.antiStallOverhang,
          retuningUrgencyLevel: state.levels.retuningUrgency,
          calibration: {
            ...state.calibration
          },
          hint: {
            ...state.hint
          }
        };
      }
    };
  };

const deriveTargetLevels = (
  input: ClosureDoctrineFitEvaluatorInput
): RuntimeLevels => {
  const cycle = Math.max(
    closureDoctrineFitTuning.minimumCycleSeconds,
    input.cycleSeconds
  );
  const watch = input.watch;
  const pacing = input.pacing;
  const firstEntry = watch.firstEntrySecondsByState;
  const healthQuality = normalizeQualityScalar(
    watch.calibration.pacingHealthScalar
  );
  const timingQuality = normalizeQualityScalar(
    watch.calibration.escalationTimingScalar
  );
  const stickinessQuality = normalizeQualityScalar(
    watch.calibration.closureStickinessScalar
  );
  const resetQuality = normalizeQualityScalar(
    watch.calibration.defenderResetQualityScalar
  );
  const orderQuality = normalizeQualityScalar(
    watch.calibration.progressionOrderScalar
  );
  const earlySiegeBiasTuning = closureDoctrineFitTuning.earlySiegeBias;
  const lateClosureDragTuning = closureDoctrineFitTuning.lateClosureDrag;
  const resetCadenceRiskTuning = closureDoctrineFitTuning.resetCadenceRisk;
  const antiStallOverhangTuning = closureDoctrineFitTuning.antiStallOverhang;
  const doctrineFitTuning = closureDoctrineFitTuning.doctrineFit;
  const retuningUrgencyTuning = closureDoctrineFitTuning.retuningUrgency;

  const earlySiegeBias = clamp(
    earlyHealthBias(watch.healthState) *
      earlySiegeBiasTuning.weights.healthBias +
      earlyTimingRisk(
        firstEntry['rising-anti-stall'],
        cycle * earlySiegeBiasTuning.timingThresholdCycleFractions.risingAntiStall
      ) *
        earlySiegeBiasTuning.weights.risingAntiStallTimingRisk +
      earlyTimingRisk(
        firstEntry['closure-readiness'],
        cycle *
          earlySiegeBiasTuning.timingThresholdCycleFractions.closureReadiness
      ) *
        earlySiegeBiasTuning.weights.closureReadinessTimingRisk +
      earlyTimingRisk(
        firstEntry['accelerated-closure-window'],
        cycle *
          earlySiegeBiasTuning.timingThresholdCycleFractions
            .acceleratedClosureWindow
      ) *
        earlySiegeBiasTuning.weights.acceleratedClosureWindowTimingRisk +
      earlyStateBias(input, cycle) *
        earlySiegeBiasTuning.weights.currentStateBias +
      (1 - orderQuality) * earlySiegeBiasTuning.weights.progressionOrderPenalty +
      (1 - timingQuality) *
        earlySiegeBiasTuning.weights.escalationTimingPenalty,
    0,
    1
  );

  const lateClosureDrag = clamp(
    lateHealthBias(watch.healthState) *
      lateClosureDragTuning.weights.healthBias +
      lateTimingRisk(
        firstEntry['rising-anti-stall'],
        cycle *
          lateClosureDragTuning.timingThresholdCycleMultipliers.risingAntiStall
            .max,
        input.elapsedSeconds,
        cycle *
          lateClosureDragTuning.timingThresholdCycleMultipliers.risingAntiStall
            .overdue
      ) *
        lateClosureDragTuning.weights.risingAntiStallTimingRisk +
      lateTimingRisk(
        firstEntry['closure-readiness'],
        cycle *
          lateClosureDragTuning.timingThresholdCycleMultipliers
            .closureReadiness.max,
        input.elapsedSeconds,
        cycle *
          lateClosureDragTuning.timingThresholdCycleMultipliers
            .closureReadiness.overdue
      ) *
        lateClosureDragTuning.weights.closureReadinessTimingRisk +
      lateTimingRisk(
        firstEntry['accelerated-closure-window'],
        cycle *
          lateClosureDragTuning.timingThresholdCycleMultipliers
            .acceleratedClosureWindow.max,
        input.elapsedSeconds,
        cycle *
          lateClosureDragTuning.timingThresholdCycleMultipliers
            .acceleratedClosureWindow.overdue
      ) *
        lateClosureDragTuning.weights.acceleratedClosureWindowTimingRisk +
      lateStateBias(input, cycle) *
        lateClosureDragTuning.weights.currentStateBias +
      prolongedReadinessRisk(watch, cycle, pacing) *
        lateClosureDragTuning.weights.prolongedReadinessRisk +
      (1 - timingQuality) *
        lateClosureDragTuning.weights.escalationTimingPenalty,
    0,
    1
  );

  const resetCadenceRisk = clamp(
    resetHealthBias(watch.healthState) *
      resetCadenceRiskTuning.weights.healthBias +
      prematureResetRisk(watch) *
        resetCadenceRiskTuning.weights.prematureResetRisk +
      resetWindowInstabilityRisk(watch, pacing, cycle) *
        resetCadenceRiskTuning.weights.resetWindowInstabilityRisk +
      (1 - resetQuality) *
        resetCadenceRiskTuning.weights.defenderResetQualityPenalty,
    0,
    1
  );

  const antiStallOverhang = clamp(
    overhangHealthBias(watch.healthState) *
      antiStallOverhangTuning.weights.healthBias +
      stickyEventRisk(
        watch.stickyAntiStallEvents,
        antiStallOverhangTuning.stickyEventMaxCount
      ) *
        antiStallOverhangTuning.weights.stickyAntiStallRisk +
      stickyEventRisk(
        watch.stickyClosureWindowEvents,
        antiStallOverhangTuning.stickyEventMaxCount
      ) *
        antiStallOverhangTuning.weights.stickyClosureWindowRisk +
      prolongedReadinessRisk(watch, cycle, pacing) *
        antiStallOverhangTuning.weights.prolongedReadinessRisk +
      currentOverhangRisk(pacing, watch, cycle) *
        antiStallOverhangTuning.weights.currentOverhangRisk +
      (1 - stickinessQuality) *
        antiStallOverhangTuning.weights.stickinessPenalty,
    0,
    1
  );

  const doctrineFit = clamp(
    healthQuality * doctrineFitTuning.weights.pacingHealthQuality +
      timingQuality * doctrineFitTuning.weights.escalationTimingQuality +
      orderQuality * doctrineFitTuning.weights.progressionOrderQuality +
      resetQuality * doctrineFitTuning.weights.defenderResetQuality +
      (1 - earlySiegeBias) * doctrineFitTuning.weights.earlySiegeBiasRelief +
      (1 - lateClosureDrag) * doctrineFitTuning.weights.lateClosureDragRelief +
      (1 - resetCadenceRisk) *
        doctrineFitTuning.weights.resetCadenceRiskRelief +
      (1 - antiStallOverhang) *
        doctrineFitTuning.weights.antiStallOverhangRelief,
    0,
    1
  );

  const retuningUrgency = clamp(
    Math.max(
      earlySiegeBias,
      lateClosureDrag,
      resetCadenceRisk,
      antiStallOverhang
    ) *
      retuningUrgencyTuning.dominantRiskWeight +
      (1 - doctrineFit) * retuningUrgencyTuning.doctrineFitGapWeight,
    0,
    1
  );

  return {
    doctrineFit,
    earlySiegeBias,
    lateClosureDrag,
    resetCadenceRisk,
    antiStallOverhang,
    retuningUrgency
  };
};

const deriveVerdict = (
  levels: RuntimeLevels
): ClosureDoctrineFitVerdict => {
  const dominantRisk = Math.max(
    levels.earlySiegeBias,
    levels.lateClosureDrag,
    levels.resetCadenceRisk,
    levels.antiStallOverhang
  );
  const thresholds = closureDoctrineFitTuning.verdictThresholds;

  if (
    levels.doctrineFit >= thresholds.doctrineFitMinimum &&
    dominantRisk < thresholds.dominantRiskMaximum
  ) {
    return 'doctrine-fit';
  }

  if (
    levels.earlySiegeBias >= levels.lateClosureDrag &&
    levels.earlySiegeBias >= levels.resetCadenceRisk &&
    levels.earlySiegeBias >= levels.antiStallOverhang
  ) {
    return 'early-siege-bias';
  }

  if (
    levels.lateClosureDrag >= levels.resetCadenceRisk &&
    levels.lateClosureDrag >= levels.antiStallOverhang
  ) {
    return 'late-closure-drag';
  }

  if (levels.resetCadenceRisk >= levels.antiStallOverhang) {
    return 'unstable-reset-cadence';
  }

  return 'anti-stall-overhang';
};

const deriveCalibration = (
  verdict: ClosureDoctrineFitVerdict,
  levels: RuntimeLevels
): ClosureDoctrineFitCalibrationContext => ({
  verdict,
  doctrineFitScalar: qualityToScalar(levels.doctrineFit),
  earlySiegeBiasScalar: riskToScalar(levels.earlySiegeBias),
  lateClosureDragScalar: riskToScalar(levels.lateClosureDrag),
  resetCadenceRiskScalar: riskToScalar(levels.resetCadenceRisk),
  antiStallOverhangScalar: riskToScalar(levels.antiStallOverhang),
  retuningUrgencyScalar: riskToScalar(levels.retuningUrgency)
});

const deriveHint = (
  verdict: ClosureDoctrineFitVerdict,
  input: ClosureDoctrineFitEvaluatorInput
): ClosureDoctrineFitHint => ({
  dominantDriftCause: verdict === 'doctrine-fit' ? 'none' : verdict,
  likelyRetuningDirection:
    verdict === 'early-siege-bias'
      ? 'tone-down-early-escalation'
      : verdict === 'late-closure-drag'
        ? 'pull-closure-forward'
        : verdict === 'unstable-reset-cadence'
          ? 'stabilize-reset-cadence'
          : verdict === 'anti-stall-overhang'
            ? 'shorten-anti-stall-dwell'
            : 'hold-course',
  confidence: deriveConfidence(input)
});

const deriveConfidence = (
  input: ClosureDoctrineFitEvaluatorInput
): ClosureDoctrineConfidence => {
  const cycle = Math.max(
    closureDoctrineFitTuning.minimumCycleSeconds,
    input.cycleSeconds
  );
  const watch = input.watch;
  const seenStates = countObservedStates(watch.firstEntrySecondsByState);
  const eventEvidence =
    watch.stickyAntiStallEvents +
    watch.stickyClosureWindowEvents +
    watch.prolongedReadinessEvents +
    watch.prematureResetEvents +
    watch.legitimateResetWindows;
  const thresholds = closureDoctrineFitTuning.confidenceThresholds;

  if (
    input.elapsedSeconds >= cycle * thresholds.high.elapsedCycleMultiplier ||
    seenStates >= thresholds.high.seenStates ||
    eventEvidence >= thresholds.high.eventEvidence
  ) {
    return 'high';
  }

  if (
    input.elapsedSeconds >= cycle * thresholds.medium.elapsedCycleMultiplier ||
    seenStates >= thresholds.medium.seenStates ||
    eventEvidence >= thresholds.medium.eventEvidence
  ) {
    return 'medium';
  }

  return 'low';
};

const countObservedStates = (
  firstEntrySecondsByState: PacingStateTimingMap
): number =>
  observedConfidenceStates.reduce(
    (observedCount, state) =>
      observedCount + (firstEntrySecondsByState[state] !== null ? 1 : 0),
    0
  );

const earlyStateBias = (
  input: ClosureDoctrineFitEvaluatorInput,
  cycle: number
): number => {
  const stateBiases = closureDoctrineFitTuning.earlySiegeBias.stateBiases;

  return (
    input.pacing.state === 'closure-readiness' &&
    input.elapsedSeconds <
      cycle * stateBiases.closureReadiness.latestCycleFraction
      ? stateBiases.closureReadiness.bias
      : input.pacing.state === 'accelerated-closure-window' &&
          input.elapsedSeconds <
            cycle *
              stateBiases.acceleratedClosureWindow.latestCycleFraction
        ? stateBiases.acceleratedClosureWindow.bias
        : input.pacing.state === 'rising-anti-stall' &&
            input.elapsedSeconds <
              cycle * stateBiases.risingAntiStall.latestCycleFraction
          ? stateBiases.risingAntiStall.bias
          : 0
  );
};

const lateStateBias = (
  input: ClosureDoctrineFitEvaluatorInput,
  cycle: number
): number => {
  const stateBiases = closureDoctrineFitTuning.lateClosureDrag.stateBiases;

  return (
    input.pacing.state === 'normal-pressure' &&
    input.elapsedSeconds >
      cycle * stateBiases.normalPressure.earliestCycleMultiplier
      ? stateBiases.normalPressure.bias
      : input.pacing.state === 'rising-anti-stall' &&
          input.elapsedSeconds >
            cycle * stateBiases.risingAntiStall.earliestCycleMultiplier
        ? stateBiases.risingAntiStall.bias
        : input.pacing.state === 'closure-readiness' &&
            input.elapsedSeconds >
              cycle * stateBiases.closureReadiness.earliestCycleMultiplier
          ? stateBiases.closureReadiness.bias
          : 0
  );
};

const currentOverhangRisk = (
  pacing: ClosurePacingSnapshot,
  watch: ClosurePacingWatchSnapshot,
  cycle: number
): number => {
  const thresholds =
    closureDoctrineFitTuning.antiStallOverhang.currentOverhangThresholds;

  if (pacing.state === 'rising-anti-stall') {
    return clamp(
      (watch.currentStateDwellSeconds -
        cycle * thresholds.risingAntiStall.dwellOffsetCycleMultiplier) /
        Math.max(
          0.001,
          cycle * thresholds.risingAntiStall.dwellWindowCycleMultiplier
        ),
      0,
      1
    );
  }

  if (pacing.state === 'closure-readiness') {
    return clamp(
      (watch.currentStateDwellSeconds -
        cycle * thresholds.closureReadiness.dwellOffsetCycleMultiplier) /
        Math.max(
          0.001,
          cycle * thresholds.closureReadiness.dwellWindowCycleMultiplier
        ),
      0,
      1
    );
  }

  if (pacing.state === 'accelerated-closure-window') {
    return clamp(
      (watch.currentStateDwellSeconds -
        cycle *
          thresholds.acceleratedClosureWindow.dwellOffsetCycleMultiplier) /
        Math.max(
          0.001,
          cycle *
            thresholds.acceleratedClosureWindow.dwellWindowCycleMultiplier
        ),
      0,
      1
    );
  }

  return 0;
};

const resetWindowInstabilityRisk = (
  watch: ClosurePacingWatchSnapshot,
  pacing: ClosurePacingSnapshot,
  cycle: number
): number => {
  const resetEntries = watch.entryCountByState['defender-reset-window'];
  const readinessEntries = watch.entryCountByState['closure-readiness'];
  const excessReset = clamp(
    (resetEntries - Math.max(1, readinessEntries)) /
      Math.max(1, readinessEntries + 1),
    0,
    1
  );
  const instabilityTuning =
    closureDoctrineFitTuning.resetCadenceRisk.resetWindowInstability;
  const activeBias =
    pacing.state === 'defender-reset-window'
      ? clamp(
          pacing.stateAgeSeconds /
            Math.max(
              0.001,
              cycle * instabilityTuning.activeBiasCycleMultiplier
            ),
          0,
          1
        ) * instabilityTuning.activeBiasWeight
      : 0;

  return clamp(
    excessReset * instabilityTuning.excessResetWeight + activeBias,
    0,
    1
  );
};

const prematureResetRisk = (
  watch: ClosurePacingWatchSnapshot
): number =>
  clamp(
    watch.prematureResetEvents *
      closureDoctrineFitTuning.resetCadenceRisk.prematureReset.eventWeight -
      watch.legitimateResetWindows *
        closureDoctrineFitTuning.resetCadenceRisk.prematureReset
          .legitimateWindowReliefWeight,
    0,
    1
  );

const prolongedReadinessRisk = (
  watch: ClosurePacingWatchSnapshot,
  cycle: number,
  pacing: ClosurePacingSnapshot
): number => {
  const prolongedReadinessTuning =
    closureDoctrineFitTuning.antiStallOverhang.prolongedReadiness;
  const cumulativeRisk = clamp(
    watch.cumulativeDwellSecondsByState['closure-readiness'] /
      Math.max(
        0.001,
        cycle * prolongedReadinessTuning.cumulativeDwellCycleMultiplier
      ),
    0,
    1
  );
  const eventRisk = clamp(
    watch.prolongedReadinessEvents * prolongedReadinessTuning.eventWeight,
    0,
    1
  );
  const activeBias =
    pacing.state === 'closure-readiness'
      ? clamp(
          (watch.currentStateDwellSeconds -
            cycle *
              prolongedReadinessTuning.activeBiasThresholdCycleMultiplier) /
            Math.max(
              0.001,
              cycle *
                prolongedReadinessTuning.activeBiasWindowCycleMultiplier
            ),
          0,
          1
        ) * prolongedReadinessTuning.activeBiasWeight
      : 0;

  return clamp(
    cumulativeRisk * prolongedReadinessTuning.cumulativeWeight +
      eventRisk * prolongedReadinessTuning.eventContributionWeight +
      activeBias,
    0,
    1
  );
};

const createInitialRuntimeState = (): RuntimeState => ({
  verdict: 'doctrine-fit',
  verdictAgeSeconds: 0,
  levels: {
    ...closureDoctrineFitTuning.initialLevels
  },
  calibration: {
    verdict: 'doctrine-fit',
    ...closureDoctrineFitTuning.initialCalibrationScalars
  },
  hint: {
    dominantDriftCause: 'none',
    likelyRetuningDirection: 'hold-course',
    confidence: 'low'
  }
});

const stickyEventRisk = (count: number, maxCount: number): number =>
  clamp(count / Math.max(1, maxCount), 0, 1);

const earlyHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'early-escalation'
    ? closureDoctrineFitTuning.healthBiases.earlySiege.earlyEscalation
    : healthState === 'premature-reset'
      ? closureDoctrineFitTuning.healthBiases.earlySiege.prematureReset
      : 0;

const lateHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'late-escalation'
    ? closureDoctrineFitTuning.healthBiases.lateClosure.lateEscalation
    : healthState === 'prolonged-readiness'
      ? closureDoctrineFitTuning.healthBiases.lateClosure.prolongedReadiness
      : healthState === 'sticky-anti-stall'
        ? closureDoctrineFitTuning.healthBiases.lateClosure.stickyAntiStall
        : 0;

const resetHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'premature-reset'
    ? closureDoctrineFitTuning.healthBiases.resetCadence.prematureReset
    : 0;

const overhangHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'sticky-closure-window'
    ? closureDoctrineFitTuning.healthBiases.antiStallOverhang.stickyClosureWindow
    : healthState === 'sticky-anti-stall'
      ? closureDoctrineFitTuning.healthBiases.antiStallOverhang.stickyAntiStall
      : healthState === 'prolonged-readiness'
        ? closureDoctrineFitTuning.healthBiases.antiStallOverhang
            .prolongedReadiness
        : 0;

const earlyTimingRisk = (
  firstEntrySeconds: number | null,
  minSeconds: number
): number => {
  if (firstEntrySeconds === null || firstEntrySeconds >= minSeconds) {
    return 0;
  }

  return clamp(
    (minSeconds - firstEntrySeconds) / Math.max(1, minSeconds),
    0,
    1
  );
};

const lateTimingRisk = (
  firstEntrySeconds: number | null,
  maxSeconds: number,
  elapsedSeconds: number,
  overdueSeconds: number
): number => {
  if (firstEntrySeconds !== null) {
    if (firstEntrySeconds <= maxSeconds) {
      return 0;
    }

    return clamp(
      (firstEntrySeconds - maxSeconds) /
        Math.max(1, overdueSeconds - maxSeconds),
      0,
      1
    );
  }

  if (elapsedSeconds <= maxSeconds) {
    return 0;
  }

  return clamp(
    (elapsedSeconds - maxSeconds) / Math.max(1, overdueSeconds - maxSeconds),
    0,
    1
  );
};

const normalizeQualityScalar = (scalar: number): number =>
  clamp(
    (scalar - closureDoctrineFitTuning.scalarClamp.min) /
      Math.max(
        0.001,
        closureDoctrineFitTuning.scalarClamp.max -
          closureDoctrineFitTuning.scalarClamp.min
      ),
    0,
    1
  );

const qualityToScalar = (quality: number): number =>
  clamp(
    closureDoctrineFitTuning.scalarClamp.min +
      clamp(quality, 0, 1) *
        (closureDoctrineFitTuning.scalarClamp.max -
          closureDoctrineFitTuning.scalarClamp.min),
    closureDoctrineFitTuning.scalarClamp.min,
    closureDoctrineFitTuning.scalarClamp.max
  );

const riskToScalar = (risk: number): number =>
  clamp(
    1 + clamp(risk, 0, 1) * closureDoctrineFitTuning.riskScalarWeight,
    closureDoctrineFitTuning.scalarClamp.min,
    closureDoctrineFitTuning.scalarClamp.max
  );

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};
