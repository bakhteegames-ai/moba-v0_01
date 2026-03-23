import { type StructurePressureTier } from './pressureCalibrationScaffold';
import {
  type PressureWindowEndResult,
  type StructurePressureEventSnapshot
} from './structurePressureEventTracker';

type TierValues = Record<StructurePressureTier, number>;

export type StructuralThreatStage =
  | 'stable'
  | 'threatened'
  | 'pressured'
  | 'softened'
  | 'temporarily-relieved'
  | 'escalating';

export interface StructureResolutionCalibrationContext {
  stage: StructuralThreatStage;
  progressionScalar: number;
  carryoverScalar: number;
  towerHoldScalar: number;
  defenderDelayScalar: number;
  defenderReclearScalar: number;
  pressureDecayScalar: number;
}

export interface StructureResolutionTierState {
  threatStage: StructuralThreatStage;
  recentOutcomeMemory: PressureWindowEndResult | 'none';
  recentOutcomeWeight: number;
  accumulatedPartialProgress: number;
  defendedReliefStrength: number;
  repeatedPressureEscalation: number;
  timeSinceLastMeaningfulSiegeSeconds: number;
  lastMeaningfulSiegeResult: PressureWindowEndResult | 'none';
  meaningfulAttemptCount: number;
  calibration: StructureResolutionCalibrationContext;
}

export interface StructureResolutionSnapshot {
  byTier: Record<StructurePressureTier, StructureResolutionTierState>;
  calibrationByTier: Record<StructurePressureTier, StructureResolutionCalibrationContext>;
}

export interface StructureResolutionMemory {
  update(
    dt: number,
    nowSeconds: number,
    structurePressureByTier: TierValues,
    eventSnapshot: StructurePressureEventSnapshot
  ): void;
  getSnapshot(): StructureResolutionSnapshot;
}

interface TierRuntimeState {
  threatStage: StructuralThreatStage;
  recentOutcomeMemory: PressureWindowEndResult | 'none';
  recentOutcomeWeight: number;
  accumulatedPartialProgress: number;
  defendedReliefStrength: number;
  repeatedPressureEscalation: number;
  timeSinceLastMeaningfulSiegeSeconds: number;
  lastMeaningfulSiegeResult: PressureWindowEndResult | 'none';
  meaningfulAttemptCount: number;
  lastProcessedEventId: number;
  calibration: StructureResolutionCalibrationContext;
}

interface StageCalibration {
  progressionScalar: number;
  carryoverScalar: number;
  towerHoldScalar: number;
  defenderDelayScalar: number;
  defenderReclearScalar: number;
  pressureDecayScalar: number;
}

const tierOrder: StructurePressureTier[] = ['outer', 'inner', 'core'];

const stageCalibration: Record<StructuralThreatStage, StageCalibration> = {
  stable: {
    progressionScalar: 1,
    carryoverScalar: 1,
    towerHoldScalar: 1,
    defenderDelayScalar: 1,
    defenderReclearScalar: 1,
    pressureDecayScalar: 1
  },
  threatened: {
    progressionScalar: 1.007,
    carryoverScalar: 1.006,
    towerHoldScalar: 0.997,
    defenderDelayScalar: 1.004,
    defenderReclearScalar: 0.996,
    pressureDecayScalar: 0.997
  },
  pressured: {
    progressionScalar: 1.014,
    carryoverScalar: 1.012,
    towerHoldScalar: 0.992,
    defenderDelayScalar: 1.008,
    defenderReclearScalar: 0.99,
    pressureDecayScalar: 0.992
  },
  softened: {
    progressionScalar: 1.022,
    carryoverScalar: 1.018,
    towerHoldScalar: 0.986,
    defenderDelayScalar: 1.012,
    defenderReclearScalar: 0.984,
    pressureDecayScalar: 0.986
  },
  'temporarily-relieved': {
    progressionScalar: 0.992,
    carryoverScalar: 0.988,
    towerHoldScalar: 1.01,
    defenderDelayScalar: 0.997,
    defenderReclearScalar: 1.012,
    pressureDecayScalar: 1.01
  },
  escalating: {
    progressionScalar: 1.02,
    carryoverScalar: 1.016,
    towerHoldScalar: 0.989,
    defenderDelayScalar: 1.011,
    defenderReclearScalar: 0.986,
    pressureDecayScalar: 0.988
  }
};

const recentOutcomeDecayPerSecond = 0.09;
const partialProgressDecayPerSecond = 0.018;
const reliefDecayPerSecond = 0.064;
const escalationDecayPerSecond = 0.036;

const stageScalarMin = 0.95;
const stageScalarMax = 1.08;

export const createStructureResolutionMemory = (): StructureResolutionMemory => {
  const stateByTier: Record<StructurePressureTier, TierRuntimeState> = {
    outer: createTierState(),
    inner: createTierState(),
    core: createTierState()
  };

  return {
    update(dt, nowSeconds, structurePressureByTier, eventSnapshot) {
      if (dt <= 0) {
        return;
      }

      for (const tier of tierOrder) {
        const state = stateByTier[tier];
        const pressure = clamp(structurePressureByTier[tier], 0, 1);
        const tierEvent = eventSnapshot.byTier[tier];
        tickTierMemory(state, dt, pressure, tierEvent.active?.qualifiedSiegeAttempt ?? false);
        applyCompletedEvent(state, tierEvent.lastCompleted);

        const stage = deriveThreatStage(
          pressure,
          state,
          tierEvent.active?.qualifiedSiegeAttempt ?? false,
          tierEvent.active?.peakPressure ?? 0
        );
        state.threatStage = stage;
        state.calibration = deriveCalibrationContext(stage, state, nowSeconds);
      }
    },
    getSnapshot() {
      const byTier = {
        outer: cloneTierState(stateByTier.outer),
        inner: cloneTierState(stateByTier.inner),
        core: cloneTierState(stateByTier.core)
      };

      return {
        byTier,
        calibrationByTier: {
          outer: { ...byTier.outer.calibration },
          inner: { ...byTier.inner.calibration },
          core: { ...byTier.core.calibration }
        }
      };
    }
  };
};

const createTierState = (): TierRuntimeState => ({
  threatStage: 'stable',
  recentOutcomeMemory: 'none',
  recentOutcomeWeight: 0,
  accumulatedPartialProgress: 0,
  defendedReliefStrength: 0,
  repeatedPressureEscalation: 0,
  timeSinceLastMeaningfulSiegeSeconds: 999,
  lastMeaningfulSiegeResult: 'none',
  meaningfulAttemptCount: 0,
  lastProcessedEventId: 0,
  calibration: {
    stage: 'stable',
    ...stageCalibration.stable
  }
});

const tickTierMemory = (
  state: TierRuntimeState,
  dt: number,
  pressure: number,
  activeQualifiedAttempt: boolean
): void => {
  state.recentOutcomeWeight = Math.max(
    0,
    state.recentOutcomeWeight - dt * recentOutcomeDecayPerSecond
  );
  state.defendedReliefStrength = Math.max(
    0,
    state.defendedReliefStrength -
      dt * (reliefDecayPerSecond + state.repeatedPressureEscalation * 0.02)
  );
  state.repeatedPressureEscalation = Math.max(
    0,
    state.repeatedPressureEscalation -
      dt * (escalationDecayPerSecond + state.defendedReliefStrength * 0.015)
  );

  const passivePressureGain = pressure * 0.006;
  const activeGain = activeQualifiedAttempt ? 0.011 : 0;
  const reliefDrag = state.defendedReliefStrength * 0.012;
  state.accumulatedPartialProgress = clamp(
    state.accumulatedPartialProgress +
      dt *
        (passivePressureGain + activeGain - partialProgressDecayPerSecond - reliefDrag),
    0,
    1
  );

  if (activeQualifiedAttempt) {
    state.timeSinceLastMeaningfulSiegeSeconds = 0;
    state.repeatedPressureEscalation = clamp(
      state.repeatedPressureEscalation + dt * (0.048 + pressure * 0.026),
      0,
      1
    );
  } else {
    state.timeSinceLastMeaningfulSiegeSeconds += dt;
  }
};

const applyCompletedEvent = (
  state: TierRuntimeState,
  completed: {
    id: number;
    durationSeconds: number;
    peakPressure: number;
    result: PressureWindowEndResult;
    qualifiedSiegeAttempt: boolean;
    boundedClosureState: 'none' | 'forming' | 'bounded' | 'overextended';
  } | null
): void => {
  if (!completed || completed.id === state.lastProcessedEventId) {
    return;
  }

  state.lastProcessedEventId = completed.id;
  state.recentOutcomeMemory = completed.result;
  state.recentOutcomeWeight = 1;

  const magnitude = clamp(
    completed.peakPressure * 0.6 + (completed.durationSeconds / 8.5) * 0.4,
    0,
    1
  );

  if (completed.qualifiedSiegeAttempt) {
    state.timeSinceLastMeaningfulSiegeSeconds = 0;
    state.lastMeaningfulSiegeResult = completed.result;
    state.meaningfulAttemptCount += 1;
  }

  if (completed.result === 'repel') {
    state.defendedReliefStrength = clamp(
      state.defendedReliefStrength + 0.22 + magnitude * 0.2,
      0,
      1
    );
    state.repeatedPressureEscalation = clamp(
      state.repeatedPressureEscalation * 0.72,
      0,
      1
    );
    state.accumulatedPartialProgress = clamp(
      state.accumulatedPartialProgress * 0.9,
      0,
      1
    );
  } else if (completed.result === 'stall') {
    state.accumulatedPartialProgress = clamp(
      state.accumulatedPartialProgress + 0.03 + magnitude * 0.06,
      0,
      1
    );
    state.repeatedPressureEscalation = clamp(
      state.repeatedPressureEscalation + 0.08 + magnitude * 0.08,
      0,
      1
    );
    state.defendedReliefStrength = clamp(
      state.defendedReliefStrength + 0.05 + magnitude * 0.05,
      0,
      1
    );
  } else if (completed.result === 'partial-convert') {
    state.accumulatedPartialProgress = clamp(
      state.accumulatedPartialProgress + 0.15 + magnitude * 0.23,
      0,
      1
    );
    state.repeatedPressureEscalation = clamp(
      state.repeatedPressureEscalation + 0.12 + magnitude * 0.11,
      0,
      1
    );
    state.defendedReliefStrength = clamp(
      state.defendedReliefStrength * 0.78,
      0,
      1
    );
  } else {
    state.accumulatedPartialProgress = clamp(
      state.accumulatedPartialProgress + 0.22 + magnitude * 0.26,
      0,
      1
    );
    state.repeatedPressureEscalation = clamp(
      state.repeatedPressureEscalation + 0.16 + magnitude * 0.14,
      0,
      1
    );
    state.defendedReliefStrength = clamp(
      state.defendedReliefStrength * 0.65,
      0,
      1
    );
  }

  if (completed.boundedClosureState === 'overextended') {
    state.defendedReliefStrength = clamp(
      state.defendedReliefStrength + 0.07,
      0,
      1
    );
    state.repeatedPressureEscalation = clamp(
      state.repeatedPressureEscalation * 0.94,
      0,
      1
    );
  }
};

const deriveThreatStage = (
  pressure: number,
  state: TierRuntimeState,
  activeQualifiedAttempt: boolean,
  activePeakPressure: number
): StructuralThreatStage => {
  const pressureIndex =
    pressure * 0.52 +
    state.accumulatedPartialProgress * 0.32 +
    state.repeatedPressureEscalation * 0.26 -
    state.defendedReliefStrength * 0.3;

  if (
    state.defendedReliefStrength > 0.56 &&
    pressure < 0.38 &&
    state.accumulatedPartialProgress < 0.52
  ) {
    return 'temporarily-relieved';
  }

  if (
    state.accumulatedPartialProgress > 0.74 ||
    (state.recentOutcomeMemory === 'attacker-window' &&
      state.recentOutcomeWeight > 0.22) ||
    (activeQualifiedAttempt && activePeakPressure > 0.85)
  ) {
    return 'softened';
  }

  if (state.repeatedPressureEscalation > 0.62 && pressure > 0.43) {
    return 'escalating';
  }

  if (pressureIndex > 0.6 || (activeQualifiedAttempt && pressure > 0.52)) {
    return 'pressured';
  }

  if (
    pressureIndex > 0.34 ||
    state.accumulatedPartialProgress > 0.24 ||
    (state.recentOutcomeMemory === 'partial-convert' &&
      state.recentOutcomeWeight > 0.2)
  ) {
    return 'threatened';
  }

  return 'stable';
};

const deriveCalibrationContext = (
  stage: StructuralThreatStage,
  state: TierRuntimeState,
  _nowSeconds: number
): StructureResolutionCalibrationContext => {
  const base = stageCalibration[stage];
  const progressBias =
    state.accumulatedPartialProgress * 0.018 +
    state.repeatedPressureEscalation * 0.012 -
    state.defendedReliefStrength * 0.014;
  const holdBias =
    state.defendedReliefStrength * 0.014 - state.accumulatedPartialProgress * 0.012;
  const defenderBias =
    state.defendedReliefStrength * 0.012 - state.repeatedPressureEscalation * 0.008;
  const decayBias =
    state.defendedReliefStrength * 0.012 -
    state.repeatedPressureEscalation * 0.01 -
    state.accumulatedPartialProgress * 0.005;

  return {
    stage,
    progressionScalar: clamp(base.progressionScalar + progressBias, stageScalarMin, stageScalarMax),
    carryoverScalar: clamp(
      base.carryoverScalar + progressBias * 0.8,
      stageScalarMin,
      stageScalarMax
    ),
    towerHoldScalar: clamp(base.towerHoldScalar + holdBias, stageScalarMin, stageScalarMax),
    defenderDelayScalar: clamp(
      base.defenderDelayScalar + defenderBias,
      stageScalarMin,
      stageScalarMax
    ),
    defenderReclearScalar: clamp(
      base.defenderReclearScalar - defenderBias * 0.85,
      stageScalarMin,
      stageScalarMax
    ),
    pressureDecayScalar: clamp(
      base.pressureDecayScalar + decayBias,
      stageScalarMin,
      stageScalarMax
    )
  };
};

const cloneTierState = (state: TierRuntimeState): StructureResolutionTierState => ({
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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
