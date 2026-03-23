import {
  type ClosurePacingSnapshot,
  type ClosurePacingState
} from './closurePacingInterpreter';
import { type ClosurePacingWatchSnapshot } from './closurePacingWatch';

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

const scalarMin = 0.95;
const scalarMax = 1.08;

export const createClosureDoctrineFitEvaluator =
  (): ClosureDoctrineFitEvaluator => {
    const state: RuntimeState = {
      verdict: 'doctrine-fit',
      verdictAgeSeconds: 0,
      levels: {
        doctrineFit: 0.72,
        earlySiegeBias: 0.16,
        lateClosureDrag: 0.18,
        resetCadenceRisk: 0.16,
        antiStallOverhang: 0.17,
        retuningUrgency: 0.18
      },
      calibration: {
        verdict: 'doctrine-fit',
        doctrineFitScalar: 1.03,
        earlySiegeBiasScalar: 0.995,
        lateClosureDragScalar: 0.995,
        resetCadenceRiskScalar: 0.995,
        antiStallOverhangScalar: 0.995,
        retuningUrgencyScalar: 0.992
      },
      hint: {
        dominantDriftCause: 'none',
        likelyRetuningDirection: 'hold-course',
        confidence: 'low'
      }
    };

    return {
      update(dt, input) {
        const target = deriveTargetLevels(input);
        const blend = clamp(dt * 0.9, 0.08, 1);

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
  const cycle = Math.max(6, input.cycleSeconds);
  const watch = input.watch;
  const pacing = input.pacing;
  const firstEntry = watch.firstEntrySecondsByState;
  const healthQuality = normalizeQualityScalar(watch.calibration.pacingHealthScalar);
  const timingQuality = normalizeQualityScalar(watch.calibration.escalationTimingScalar);
  const stickinessQuality = normalizeQualityScalar(watch.calibration.closureStickinessScalar);
  const resetQuality = normalizeQualityScalar(watch.calibration.defenderResetQualityScalar);
  const orderQuality = normalizeQualityScalar(watch.calibration.progressionOrderScalar);

  const earlySiegeBias = clamp(
    earlyHealthBias(watch.healthState) * 0.34 +
      earlyTimingRisk(firstEntry['rising-anti-stall'], cycle * 0.22) * 0.17 +
      earlyTimingRisk(firstEntry['closure-readiness'], cycle * 0.48) * 0.23 +
      earlyTimingRisk(firstEntry['accelerated-closure-window'], cycle * 0.8) * 0.12 +
      earlyStateBias(input) * 0.1 +
      (1 - orderQuality) * 0.12 +
      (1 - timingQuality) * 0.08,
    0,
    1
  );

  const lateClosureDrag = clamp(
    lateHealthBias(watch.healthState) * 0.29 +
      lateTimingRisk(
        firstEntry['rising-anti-stall'],
        cycle * 2.2,
        input.elapsedSeconds,
        cycle * 2.6
      ) *
        0.12 +
      lateTimingRisk(
        firstEntry['closure-readiness'],
        cycle * 3.1,
        input.elapsedSeconds,
        cycle * 3.6
      ) *
        0.25 +
      lateTimingRisk(
        firstEntry['accelerated-closure-window'],
        cycle * 4.2,
        input.elapsedSeconds,
        cycle * 4.8
      ) *
        0.11 +
      lateStateBias(input) * 0.08 +
      prolongedReadinessRisk(watch, cycle, pacing) * 0.1 +
      (1 - timingQuality) * 0.05,
    0,
    1
  );

  const resetCadenceRisk = clamp(
    resetHealthBias(watch.healthState) * 0.32 +
      prematureResetRisk(watch) * 0.3 +
      resetWindowInstabilityRisk(watch, pacing, cycle) * 0.18 +
      (1 - resetQuality) * 0.2,
    0,
    1
  );

  const antiStallOverhang = clamp(
    overhangHealthBias(watch.healthState) * 0.34 +
      stickyEventRisk(watch.stickyAntiStallEvents, 2) * 0.16 +
      stickyEventRisk(watch.stickyClosureWindowEvents, 2) * 0.18 +
      prolongedReadinessRisk(watch, cycle, pacing) * 0.14 +
      currentOverhangRisk(pacing, watch, cycle) * 0.08 +
      (1 - stickinessQuality) * 0.1,
    0,
    1
  );

  const doctrineFit = clamp(
    healthQuality * 0.26 +
      timingQuality * 0.21 +
      orderQuality * 0.18 +
      resetQuality * 0.12 +
      (1 - earlySiegeBias) * 0.08 +
      (1 - lateClosureDrag) * 0.07 +
      (1 - resetCadenceRisk) * 0.04 +
      (1 - antiStallOverhang) * 0.04,
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
      0.72 +
      (1 - doctrineFit) * 0.28,
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

  if (levels.doctrineFit >= 0.64 && dominantRisk < 0.46) {
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
  dominantDriftCause:
    verdict === 'doctrine-fit' ? 'none' : verdict,
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
  const cycle = Math.max(6, input.cycleSeconds);
  const watch = input.watch;
  const seenStates = countObservedStates(watch.firstEntrySecondsByState);
  const eventEvidence =
    watch.stickyAntiStallEvents +
    watch.stickyClosureWindowEvents +
    watch.prolongedReadinessEvents +
    watch.prematureResetEvents +
    watch.legitimateResetWindows;

  if (input.elapsedSeconds >= cycle * 3.25 || seenStates >= 3 || eventEvidence >= 2) {
    return 'high';
  }

  if (input.elapsedSeconds >= cycle * 1.75 || seenStates >= 2 || eventEvidence >= 1) {
    return 'medium';
  }

  return 'low';
};

const countObservedStates = (
  firstEntrySecondsByState: PacingStateTimingMap
): number =>
  (firstEntrySecondsByState['rising-anti-stall'] !== null ? 1 : 0) +
  (firstEntrySecondsByState['closure-readiness'] !== null ? 1 : 0) +
  (firstEntrySecondsByState['accelerated-closure-window'] !== null ? 1 : 0) +
  (firstEntrySecondsByState['defender-reset-window'] !== null ? 1 : 0);

const earlyStateBias = (
  input: ClosureDoctrineFitEvaluatorInput
): number => {
  const cycle = Math.max(6, input.cycleSeconds);
  return (
    input.pacing.state === 'closure-readiness' && input.elapsedSeconds < cycle * 0.55
      ? 0.72
      : input.pacing.state === 'accelerated-closure-window' &&
          input.elapsedSeconds < cycle * 0.9
        ? 0.88
        : input.pacing.state === 'rising-anti-stall' && input.elapsedSeconds < cycle * 0.25
          ? 0.52
          : 0
  );
};

const lateStateBias = (
  input: ClosureDoctrineFitEvaluatorInput
): number => {
  const cycle = Math.max(6, input.cycleSeconds);
  return (
    input.pacing.state === 'normal-pressure' && input.elapsedSeconds > cycle * 2.45
      ? 0.74
      : input.pacing.state === 'rising-anti-stall' && input.elapsedSeconds > cycle * 3.1
        ? 0.68
        : input.pacing.state === 'closure-readiness' && input.elapsedSeconds > cycle * 4.45
          ? 0.44
          : 0
  );
};

const currentOverhangRisk = (
  pacing: ClosurePacingSnapshot,
  watch: ClosurePacingWatchSnapshot,
  cycle: number
): number =>
  pacing.state === 'rising-anti-stall'
    ? clamp(
        (watch.currentStateDwellSeconds - cycle * 1.1) / Math.max(0.001, cycle * 0.8),
        0,
        1
      )
    : pacing.state === 'closure-readiness'
      ? clamp(
          (watch.currentStateDwellSeconds - cycle * 1.35) / Math.max(0.001, cycle),
          0,
          1
        )
      : pacing.state === 'accelerated-closure-window'
        ? clamp(
            (watch.currentStateDwellSeconds - cycle * 0.9) / Math.max(0.001, cycle * 0.7),
            0,
            1
          )
        : 0;

const resetWindowInstabilityRisk = (
  watch: ClosurePacingWatchSnapshot,
  pacing: ClosurePacingSnapshot,
  cycle: number
): number => {
  const resetEntries = watch.entryCountByState['defender-reset-window'];
  const readinessEntries = watch.entryCountByState['closure-readiness'];
  const excessReset = clamp(
    (resetEntries - Math.max(1, readinessEntries)) / Math.max(1, readinessEntries + 1),
    0,
    1
  );
  const activeBias =
    pacing.state === 'defender-reset-window'
      ? clamp(pacing.stateAgeSeconds / Math.max(0.001, cycle * 0.8), 0, 1) * 0.22
      : 0;

  return clamp(excessReset * 0.78 + activeBias, 0, 1);
};

const prematureResetRisk = (
  watch: ClosurePacingWatchSnapshot
): number =>
  clamp(
    watch.prematureResetEvents * 0.48 -
      watch.legitimateResetWindows * 0.08,
    0,
    1
  );

const prolongedReadinessRisk = (
  watch: ClosurePacingWatchSnapshot,
  cycle: number,
  pacing: ClosurePacingSnapshot
): number => {
  const cumulativeRisk = clamp(
    watch.cumulativeDwellSecondsByState['closure-readiness'] /
      Math.max(0.001, cycle * 2.3),
    0,
    1
  );
  const eventRisk = clamp(watch.prolongedReadinessEvents * 0.42, 0, 1);
  const activeBias =
    pacing.state === 'closure-readiness'
      ? clamp(
          (watch.currentStateDwellSeconds - cycle * 1.3) / Math.max(0.001, cycle),
          0,
          1
        ) * 0.28
      : 0;

  return clamp(cumulativeRisk * 0.34 + eventRisk * 0.46 + activeBias, 0, 1);
};

const stickyEventRisk = (count: number, maxCount: number): number =>
  clamp(count / Math.max(1, maxCount), 0, 1);

const earlyHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'early-escalation'
    ? 0.88
    : healthState === 'premature-reset'
      ? 0.18
      : 0;

const lateHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'late-escalation'
    ? 0.88
    : healthState === 'prolonged-readiness'
      ? 0.46
      : healthState === 'sticky-anti-stall'
        ? 0.24
        : 0;

const resetHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'premature-reset'
    ? 0.92
    : 0;

const overhangHealthBias = (
  healthState: ClosurePacingWatchSnapshot['healthState']
): number =>
  healthState === 'sticky-closure-window'
    ? 0.94
    : healthState === 'sticky-anti-stall'
      ? 0.78
      : healthState === 'prolonged-readiness'
        ? 0.58
        : 0;

const earlyTimingRisk = (
  firstEntrySeconds: number | null,
  minSeconds: number
): number => {
  if (firstEntrySeconds === null || firstEntrySeconds >= minSeconds) {
    return 0;
  }

  return clamp((minSeconds - firstEntrySeconds) / Math.max(1, minSeconds), 0, 1);
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
      (firstEntrySeconds - maxSeconds) / Math.max(1, overdueSeconds - maxSeconds),
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
  clamp((scalar - scalarMin) / Math.max(0.001, scalarMax - scalarMin), 0, 1);

const qualityToScalar = (quality: number): number =>
  clamp(scalarMin + clamp(quality, 0, 1) * (scalarMax - scalarMin), scalarMin, scalarMax);

const riskToScalar = (risk: number): number =>
  clamp(1 + clamp(risk, 0, 1) * 0.04, scalarMin, scalarMax);

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};
