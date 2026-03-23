import { type ClosurePacingSnapshot, type ClosurePacingState } from './closurePacingInterpreter';
import { type LaneClosurePostureSnapshot } from './laneClosurePosture';
import { type StructurePressureTier } from './pressureCalibrationScaffold';
import { type StructureResolutionTierState } from './structureResolutionMemory';

type TierStateMap = Record<StructurePressureTier, StructureResolutionTierState>;
type PacingStateTimingMap = Record<ClosurePacingState, number | null>;
type PacingStateValueMap = Record<ClosurePacingState, number>;

export type ClosurePacingHealthState =
  | 'healthy-progression'
  | 'early-escalation'
  | 'late-escalation'
  | 'sticky-anti-stall'
  | 'sticky-closure-window'
  | 'premature-reset'
  | 'prolonged-readiness';

export interface ClosurePacingWatchCalibration {
  pacingHealthScalar: number;
  escalationTimingScalar: number;
  closureStickinessScalar: number;
  defenderResetQualityScalar: number;
  progressionOrderScalar: number;
}

export interface ClosurePacingWatchSnapshot {
  healthState: ClosurePacingHealthState;
  healthStateAgeSeconds: number;
  currentStateDwellSeconds: number;
  firstEntrySecondsByState: PacingStateTimingMap;
  cumulativeDwellSecondsByState: PacingStateValueMap;
  entryCountByState: PacingStateValueMap;
  exitCountByState: PacingStateValueMap;
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
  calibration: ClosurePacingWatchCalibration;
}

export interface ClosurePacingWatchInput {
  elapsedSeconds: number;
  cycleSeconds: number;
  pacing: ClosurePacingSnapshot;
  laneClosure: LaneClosurePostureSnapshot;
  resolutionByTier: TierStateMap;
}

export interface ClosurePacingWatch {
  update(dt: number, input: ClosurePacingWatchInput): void;
  getSnapshot(): ClosurePacingWatchSnapshot;
}

interface RuntimeState {
  currentPacingState: ClosurePacingState;
  currentStateDwellSeconds: number;
  firstEntrySecondsByState: PacingStateTimingMap;
  cumulativeDwellSecondsByState: PacingStateValueMap;
  entryCountByState: PacingStateValueMap;
  exitCountByState: PacingStateValueMap;
  stickyAntiStallEvents: number;
  stickyClosureWindowEvents: number;
  prolongedReadinessEvents: number;
  prematureResetEvents: number;
  legitimateResetWindows: number;
  orderFlags: ClosurePacingWatchSnapshot['orderFlags'];
  healthState: ClosurePacingHealthState;
  healthStateAgeSeconds: number;
  currentStateStickyFlagged: boolean;
  currentStateProlongedFlagged: boolean;
  calibration: ClosurePacingWatchCalibration;
}

const pacingStates: ClosurePacingState[] = [
  'normal-pressure',
  'rising-anti-stall',
  'closure-readiness',
  'accelerated-closure-window',
  'defender-reset-window'
];

const scalarMin = 0.95;
const scalarMax = 1.08;

export const createClosurePacingWatch = (): ClosurePacingWatch => {
  const state: RuntimeState = {
    currentPacingState: 'normal-pressure',
    currentStateDwellSeconds: 0,
    firstEntrySecondsByState: {
      'normal-pressure': 0,
      'rising-anti-stall': null,
      'closure-readiness': null,
      'accelerated-closure-window': null,
      'defender-reset-window': null
    },
    cumulativeDwellSecondsByState: createStateValueMap(0),
    entryCountByState: {
      ...createStateValueMap(0),
      'normal-pressure': 1
    },
    exitCountByState: createStateValueMap(0),
    stickyAntiStallEvents: 0,
    stickyClosureWindowEvents: 0,
    prolongedReadinessEvents: 0,
    prematureResetEvents: 0,
    legitimateResetWindows: 0,
    orderFlags: {
      risingSeenBeforeReadiness: false,
      readinessSeenBeforeClosureWindow: false,
      resetSeenAfterReadiness: false
    },
    healthState: 'healthy-progression',
    healthStateAgeSeconds: 0,
    currentStateStickyFlagged: false,
    currentStateProlongedFlagged: false,
    calibration: {
      pacingHealthScalar: 1,
      escalationTimingScalar: 1,
      closureStickinessScalar: 1,
      defenderResetQualityScalar: 1,
      progressionOrderScalar: 1
    }
  };

  return {
    update(dt, input) {
      const now = Math.max(0, input.elapsedSeconds);
      const currentPacingState = input.pacing.state;

      if (currentPacingState !== state.currentPacingState) {
        state.exitCountByState[state.currentPacingState] += 1;
        state.currentPacingState = currentPacingState;
        state.currentStateDwellSeconds = 0;
        state.currentStateStickyFlagged = false;
        state.currentStateProlongedFlagged = false;
        state.entryCountByState[currentPacingState] += 1;

        if (state.firstEntrySecondsByState[currentPacingState] === null) {
          state.firstEntrySecondsByState[currentPacingState] = now;
        }

        applyTransitionFlags(state, input, now);
      }

      const step = Math.max(0, dt);
      state.currentStateDwellSeconds += step;
      state.cumulativeDwellSecondsByState[state.currentPacingState] += step;

      trackStickyAndProlongedBehavior(state, input);

      const healthState = deriveHealthState(state, input);
      if (healthState === state.healthState) {
        state.healthStateAgeSeconds += step;
      } else {
        state.healthState = healthState;
        state.healthStateAgeSeconds = 0;
      }

      state.calibration = deriveCalibration(state, input);
    },
    getSnapshot() {
      return {
        healthState: state.healthState,
        healthStateAgeSeconds: state.healthStateAgeSeconds,
        currentStateDwellSeconds: state.currentStateDwellSeconds,
        firstEntrySecondsByState: { ...state.firstEntrySecondsByState },
        cumulativeDwellSecondsByState: { ...state.cumulativeDwellSecondsByState },
        entryCountByState: { ...state.entryCountByState },
        exitCountByState: { ...state.exitCountByState },
        stickyAntiStallEvents: state.stickyAntiStallEvents,
        stickyClosureWindowEvents: state.stickyClosureWindowEvents,
        prolongedReadinessEvents: state.prolongedReadinessEvents,
        prematureResetEvents: state.prematureResetEvents,
        legitimateResetWindows: state.legitimateResetWindows,
        orderFlags: {
          ...state.orderFlags
        },
        calibration: {
          ...state.calibration
        }
      };
    }
  };
};

const applyTransitionFlags = (
  state: RuntimeState,
  input: ClosurePacingWatchInput,
  now: number
): void => {
  const current = state.currentPacingState;
  const firstRising = state.firstEntrySecondsByState['rising-anti-stall'];
  const firstReadiness = state.firstEntrySecondsByState['closure-readiness'];

  if (current === 'closure-readiness') {
    state.orderFlags.risingSeenBeforeReadiness =
      firstRising !== null && firstRising <= now;
  }

  if (current === 'accelerated-closure-window') {
    state.orderFlags.readinessSeenBeforeClosureWindow =
      firstReadiness !== null && firstReadiness <= now;
  }

  if (current === 'defender-reset-window') {
    const timeSinceReadiness = firstReadiness === null ? null : now - firstReadiness;
    const legitimateReset =
      firstReadiness !== null &&
      timeSinceReadiness !== null &&
      timeSinceReadiness >= Math.max(1.5, input.cycleSeconds * 0.08) &&
      input.laneClosure.defenderRecoveryLevel >= 0.42;

    state.orderFlags.resetSeenAfterReadiness = firstReadiness !== null && firstReadiness <= now;

    if (legitimateReset) {
      state.legitimateResetWindows += 1;
    } else {
      state.prematureResetEvents += 1;
    }
  }
};

const trackStickyAndProlongedBehavior = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): void => {
  const cycle = Math.max(6, input.cycleSeconds);
  const stickyAntiThreshold = cycle * 1.25;
  const stickyClosureThreshold = cycle * 0.95;
  const prolongedReadinessThreshold = cycle * 1.45;

  if (
    state.currentPacingState === 'rising-anti-stall' &&
    state.currentStateDwellSeconds >= stickyAntiThreshold &&
    !state.currentStateStickyFlagged &&
    state.firstEntrySecondsByState['closure-readiness'] === null
  ) {
    state.stickyAntiStallEvents += 1;
    state.currentStateStickyFlagged = true;
  }

  if (
    state.currentPacingState === 'accelerated-closure-window' &&
    state.currentStateDwellSeconds >= stickyClosureThreshold &&
    !state.currentStateStickyFlagged
  ) {
    state.stickyClosureWindowEvents += 1;
    state.currentStateStickyFlagged = true;
  }

  if (
    state.currentPacingState === 'closure-readiness' &&
    state.currentStateDwellSeconds >= prolongedReadinessThreshold &&
    !state.currentStateProlongedFlagged &&
    state.firstEntrySecondsByState['accelerated-closure-window'] === null
  ) {
    state.prolongedReadinessEvents += 1;
    state.currentStateProlongedFlagged = true;
  }
};

const deriveHealthState = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): ClosurePacingHealthState => {
  if (state.prematureResetEvents > 0) {
    return 'premature-reset';
  }

  if (
    state.stickyClosureWindowEvents > 0 ||
    (state.currentPacingState === 'accelerated-closure-window' &&
      state.currentStateDwellSeconds >= input.cycleSeconds * 0.95)
  ) {
    return 'sticky-closure-window';
  }

  if (
    state.stickyAntiStallEvents > 0 ||
    (state.currentPacingState === 'rising-anti-stall' &&
      state.currentStateDwellSeconds >= input.cycleSeconds * 1.25 &&
      state.firstEntrySecondsByState['closure-readiness'] === null)
  ) {
    return 'sticky-anti-stall';
  }

  if (state.prolongedReadinessEvents > 0) {
    return 'prolonged-readiness';
  }

  if (isEarlyEscalation(state, input)) {
    return 'early-escalation';
  }

  if (isLateEscalation(state, input)) {
    return 'late-escalation';
  }

  return 'healthy-progression';
};

const isEarlyEscalation = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): boolean => {
  const cycle = Math.max(6, input.cycleSeconds);
  const firstRising = state.firstEntrySecondsByState['rising-anti-stall'];
  const firstReadiness = state.firstEntrySecondsByState['closure-readiness'];
  const firstClosureWindow = state.firstEntrySecondsByState['accelerated-closure-window'];

  return (
    (firstRising !== null && firstRising < cycle * 0.22) ||
    (firstReadiness !== null && firstReadiness < cycle * 0.48) ||
    (firstClosureWindow !== null && firstClosureWindow < cycle * 0.8) ||
    (firstReadiness !== null && firstRising === null) ||
    (firstClosureWindow !== null && firstReadiness === null)
  );
};

const isLateEscalation = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): boolean => {
  const cycle = Math.max(6, input.cycleSeconds);
  const elapsed = input.elapsedSeconds;
  const firstRising = state.firstEntrySecondsByState['rising-anti-stall'];
  const firstReadiness = state.firstEntrySecondsByState['closure-readiness'];
  const firstClosureWindow = state.firstEntrySecondsByState['accelerated-closure-window'];

  return (
    (firstRising !== null && firstRising > cycle * 2.2) ||
    (firstReadiness !== null && firstReadiness > cycle * 3.1) ||
    (firstClosureWindow !== null && firstClosureWindow > cycle * 4.2) ||
    (firstRising === null && elapsed > cycle * 2.45) ||
    (firstReadiness === null && elapsed > cycle * 3.45)
  );
};

const deriveCalibration = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): ClosurePacingWatchCalibration => {
  const escalationTimingQuality = deriveEscalationTimingQuality(state, input);
  const closureStickinessQuality = deriveStickinessQuality(state, input);
  const defenderResetQuality = deriveDefenderResetQuality(state);
  const progressionOrderQuality = deriveProgressionOrderQuality(state);
  const pacingHealthQuality = clamp(
    escalationTimingQuality * 0.28 +
      closureStickinessQuality * 0.27 +
      defenderResetQuality * 0.2 +
      progressionOrderQuality * 0.25,
    0,
    1
  );

  return {
    pacingHealthScalar: qualityToScalar(pacingHealthQuality),
    escalationTimingScalar: qualityToScalar(escalationTimingQuality),
    closureStickinessScalar: qualityToScalar(closureStickinessQuality),
    defenderResetQualityScalar: qualityToScalar(defenderResetQuality),
    progressionOrderScalar: qualityToScalar(progressionOrderQuality)
  };
};

const deriveEscalationTimingQuality = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): number => {
  const cycle = Math.max(6, input.cycleSeconds);
  const elapsed = input.elapsedSeconds;

  const risingScore = timingScore(
    state.firstEntrySecondsByState['rising-anti-stall'],
    cycle * 0.22,
    cycle * 2.2,
    elapsed,
    cycle * 2.6
  );
  const readinessScore = timingScore(
    state.firstEntrySecondsByState['closure-readiness'],
    cycle * 0.48,
    cycle * 3.1,
    elapsed,
    cycle * 3.6
  );
  const closureWindowScore = timingScore(
    state.firstEntrySecondsByState['accelerated-closure-window'],
    cycle * 0.8,
    cycle * 4.2,
    elapsed,
    cycle * 4.8
  );

  return clamp(
    risingScore * 0.28 + readinessScore * 0.4 + closureWindowScore * 0.32,
    0,
    1
  );
};

const deriveStickinessQuality = (
  state: RuntimeState,
  input: ClosurePacingWatchInput
): number => {
  const cycle = Math.max(6, input.cycleSeconds);
  const currentDwellPenalty =
    state.currentPacingState === 'rising-anti-stall'
      ? Math.max(0, (state.currentStateDwellSeconds - cycle * 1.25) / (cycle * 1.2))
      : state.currentPacingState === 'closure-readiness'
        ? Math.max(0, (state.currentStateDwellSeconds - cycle * 1.45) / (cycle * 1.35))
        : state.currentPacingState === 'accelerated-closure-window'
          ? Math.max(0, (state.currentStateDwellSeconds - cycle * 0.95) / (cycle * 0.9))
          : 0;
  const eventPenalty =
    state.stickyAntiStallEvents * 0.18 +
    state.stickyClosureWindowEvents * 0.22 +
    state.prolongedReadinessEvents * 0.16;

  return clamp(1 - currentDwellPenalty * 0.28 - eventPenalty, 0, 1);
};

const deriveDefenderResetQuality = (state: RuntimeState): number => {
  if (state.legitimateResetWindows === 0 && state.prematureResetEvents === 0) {
    return 0.78;
  }

  return clamp(
    0.72 +
      state.legitimateResetWindows * 0.15 -
      state.prematureResetEvents * 0.22,
    0,
    1
  );
};

const deriveProgressionOrderQuality = (state: RuntimeState): number => {
  let quality = 1;

  if (
    state.firstEntrySecondsByState['closure-readiness'] !== null &&
    !state.orderFlags.risingSeenBeforeReadiness
  ) {
    quality -= 0.32;
  }

  if (
    state.firstEntrySecondsByState['accelerated-closure-window'] !== null &&
    !state.orderFlags.readinessSeenBeforeClosureWindow
  ) {
    quality -= 0.34;
  }

  if (
    state.firstEntrySecondsByState['defender-reset-window'] !== null &&
    !state.orderFlags.resetSeenAfterReadiness
  ) {
    quality -= 0.18;
  }

  return clamp(quality, 0, 1);
};

const timingScore = (
  firstEntrySeconds: number | null,
  minSeconds: number,
  maxSeconds: number,
  elapsedSeconds: number,
  overdueSeconds: number
): number => {
  if (firstEntrySeconds === null) {
    if (elapsedSeconds <= maxSeconds) {
      return 0.82;
    }

    const overdueRatio = clamp(
      (elapsedSeconds - maxSeconds) / Math.max(1, overdueSeconds - maxSeconds),
      0,
      1
    );
    return clamp(0.82 - overdueRatio * 0.47, 0.25, 0.82);
  }

  if (firstEntrySeconds < minSeconds) {
    const earlyRatio = clamp((minSeconds - firstEntrySeconds) / Math.max(1, minSeconds), 0, 1);
    return clamp(1 - earlyRatio * 0.45, 0.35, 1);
  }

  if (firstEntrySeconds > maxSeconds) {
    const lateRatio = clamp(
      (firstEntrySeconds - maxSeconds) / Math.max(1, overdueSeconds - maxSeconds),
      0,
      1
    );
    return clamp(1 - lateRatio * 0.5, 0.3, 1);
  }

  return 1;
};

const qualityToScalar = (quality: number): number =>
  clamp(scalarMin + clamp(quality, 0, 1) * (scalarMax - scalarMin), scalarMin, scalarMax);

const createStateValueMap = (value: number): PacingStateValueMap => ({
  'normal-pressure': value,
  'rising-anti-stall': value,
  'closure-readiness': value,
  'accelerated-closure-window': value,
  'defender-reset-window': value
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};
