import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import { type PrototypeStructureContactState } from './prototypeLaneOccupancyProducer';
import {
  type LaneClosurePosture,
  type LaneClosurePostureSnapshot
} from './laneClosurePosture';
import { type StructureResolutionTierState } from './structureResolutionMemory';

type TierValues = Record<StructurePressureTier, number>;
type SegmentValues = Record<LanePressureSegment, number>;

export type ClosurePacingState =
  | 'normal-pressure'
  | 'rising-anti-stall'
  | 'closure-readiness'
  | 'accelerated-closure-window'
  | 'defender-reset-window';

export interface ClosurePacingCalibrationContext {
  state: ClosurePacingState;
  closureReadinessScalar: number;
  antiStallReadinessScalar: number;
  defenderResetScalar: number;
  closureWindowScalar: number;
  pacingPressureScalar: number;
}

export interface ClosurePacingSnapshot {
  state: ClosurePacingState;
  stateAgeSeconds: number;
  closureReadinessLevel: number;
  antiStallReadinessLevel: number;
  defenderResetLevel: number;
  closureWindowLevel: number;
  pacingPressureLevel: number;
  calibration: ClosurePacingCalibrationContext;
}

export interface ClosurePacingInterpreterInput {
  laneClosure: LaneClosurePostureSnapshot;
  resolutionByTier: Record<StructurePressureTier, StructureResolutionTierState>;
  structurePressureByTier: TierValues;
  structureContactByTier: Record<StructurePressureTier, PrototypeStructureContactState>;
  lanePressureBySegment: SegmentValues;
  carryoverPressureState: number;
  consecutiveWaveCarryoverRelevance: number;
}

export interface ClosurePacingInterpreter {
  update(dt: number, input: ClosurePacingInterpreterInput): void;
  getSnapshot(): ClosurePacingSnapshot;
}

interface RuntimeLevels {
  closureReadiness: number;
  antiStallReadiness: number;
  defenderReset: number;
  closureWindow: number;
  pacingPressure: number;
}

interface RuntimeState {
  state: ClosurePacingState;
  stateAgeSeconds: number;
  levels: RuntimeLevels;
  calibration: ClosurePacingCalibrationContext;
}

const tierOrder: StructurePressureTier[] = ['outer', 'inner', 'core'];
const tierWeights: Record<StructurePressureTier, number> = {
  outer: 0.22,
  inner: 0.34,
  core: 0.44
};

const posturePressureBias: Record<LaneClosurePosture, number> = {
  stable: 0.08,
  'rising-pressure': 0.26,
  'pressured-lane': 0.48,
  'softened-shell': 0.66,
  'accelerated-closure': 0.82,
  'defender-recovery': 0.14
};

const calibrationBase: Record<
  ClosurePacingState,
  Omit<ClosurePacingCalibrationContext, 'state'>
> = {
  'normal-pressure': {
    closureReadinessScalar: 1,
    antiStallReadinessScalar: 1,
    defenderResetScalar: 1,
    closureWindowScalar: 1,
    pacingPressureScalar: 1
  },
  'rising-anti-stall': {
    closureReadinessScalar: 1.006,
    antiStallReadinessScalar: 1.01,
    defenderResetScalar: 0.995,
    closureWindowScalar: 1.008,
    pacingPressureScalar: 1.008
  },
  'closure-readiness': {
    closureReadinessScalar: 1.012,
    antiStallReadinessScalar: 1.014,
    defenderResetScalar: 0.989,
    closureWindowScalar: 1.015,
    pacingPressureScalar: 1.014
  },
  'accelerated-closure-window': {
    closureReadinessScalar: 1.018,
    antiStallReadinessScalar: 1.022,
    defenderResetScalar: 0.983,
    closureWindowScalar: 1.022,
    pacingPressureScalar: 1.018
  },
  'defender-reset-window': {
    closureReadinessScalar: 0.992,
    antiStallReadinessScalar: 0.994,
    defenderResetScalar: 1.016,
    closureWindowScalar: 0.99,
    pacingPressureScalar: 0.992
  }
};

const scalarMin = 0.95;
const scalarMax = 1.08;

export const createClosurePacingInterpreter =
  (): ClosurePacingInterpreter => {
    const state: RuntimeState = {
      state: 'normal-pressure',
      stateAgeSeconds: 0,
      levels: {
        closureReadiness: 0.24,
        antiStallReadiness: 0.22,
        defenderReset: 0.42,
        closureWindow: 0.2,
        pacingPressure: 0.27
      },
      calibration: {
        state: 'normal-pressure',
        ...calibrationBase['normal-pressure']
      }
    };

    return {
      update(dt, input) {
        const target = deriveTargetLevels(input);
        const blend = clamp(dt * 0.88, 0.08, 1);

        state.levels.closureReadiness = approach(
          state.levels.closureReadiness,
          target.closureReadiness,
          blend
        );
        state.levels.antiStallReadiness = approach(
          state.levels.antiStallReadiness,
          target.antiStallReadiness,
          blend
        );
        state.levels.defenderReset = approach(
          state.levels.defenderReset,
          target.defenderReset,
          blend
        );
        state.levels.closureWindow = approach(
          state.levels.closureWindow,
          target.closureWindow,
          blend
        );
        state.levels.pacingPressure = approach(
          state.levels.pacingPressure,
          target.pacingPressure,
          blend
        );

        const nextState = deriveState(state.levels);
        if (nextState === state.state) {
          state.stateAgeSeconds += Math.max(0, dt);
        } else {
          state.state = nextState;
          state.stateAgeSeconds = 0;
        }

        state.calibration = deriveCalibration(state.state, state.levels);
      },
      getSnapshot() {
        return {
          state: state.state,
          stateAgeSeconds: state.stateAgeSeconds,
          closureReadinessLevel: state.levels.closureReadiness,
          antiStallReadinessLevel: state.levels.antiStallReadiness,
          defenderResetLevel: state.levels.defenderReset,
          closureWindowLevel: state.levels.closureWindow,
          pacingPressureLevel: state.levels.pacingPressure,
          calibration: {
            ...state.calibration
          }
        };
      }
    };
  };

const deriveTargetLevels = (
  input: ClosurePacingInterpreterInput
): RuntimeLevels => {
  const laneClosure = input.laneClosure;
  const pressureEscalation = weightedTierValue((tier) =>
    input.resolutionByTier[tier].repeatedPressureEscalation
  );
  const defendedRelief = weightedTierValue((tier) =>
    input.resolutionByTier[tier].defendedReliefStrength
  );
  const partialProgress = weightedTierValue((tier) =>
    input.resolutionByTier[tier].accumulatedPartialProgress
  );
  const meaningfulSiegeRecency = weightedTierValue((tier) =>
    meaningfulSiegeRecencyIndex(input.resolutionByTier[tier])
  );
  const structurePressure = weightedTierValue((tier) =>
    input.structurePressureByTier[tier]
  );
  const contactPressure = weightedTierValue((tier) =>
    input.structureContactByTier[tier].pressure *
      (input.structureContactByTier[tier].active ? 1 : 0.72)
  );
  const lanePressure = weightedSegmentValue(input.lanePressureBySegment);
  const livePressure = clamp(
    structurePressure * 0.37 + contactPressure * 0.43 + lanePressure * 0.2,
    0,
    1
  );
  const carryoverNormalized = clamp(
    (input.carryoverPressureState - 0.95) / (1.08 - 0.95),
    0,
    1
  );
  const postureBias = posturePressureBias[laneClosure.posture];

  const closureReadiness = clamp(
    laneClosure.closureThreatLevel * 0.3 +
      laneClosure.structuralCarryoverLevel * 0.2 +
      pressureEscalation * 0.14 +
      partialProgress * 0.13 +
      meaningfulSiegeRecency * 0.09 +
      carryoverNormalized * 0.08 +
      postureBias * 0.14 -
      defendedRelief * 0.16,
    0,
    1
  );

  const antiStallReadiness = clamp(
    laneClosure.antiStallAccelerationLevel * 0.4 +
      closureReadiness * 0.18 +
      pressureEscalation * 0.13 +
      meaningfulSiegeRecency * 0.1 +
      input.consecutiveWaveCarryoverRelevance * 0.09 +
      livePressure * 0.08 -
      defendedRelief * 0.12,
    0,
    1
  );

  const defenderReset = clamp(
    laneClosure.defenderRecoveryLevel * 0.42 +
      laneClosure.laneStabilityLevel * 0.16 +
      defendedRelief * 0.24 +
      (1 - livePressure) * 0.08 +
      (1 - meaningfulSiegeRecency) * 0.06 -
      antiStallReadiness * 0.14 -
      closureReadiness * 0.12,
    0,
    1
  );

  const closureWindow = clamp(
    closureReadiness * 0.38 +
      antiStallReadiness * 0.22 +
      livePressure * 0.16 +
      carryoverNormalized * 0.12 +
      meaningfulSiegeRecency * 0.06 -
      defenderReset * 0.16,
    0,
    1
  );

  const pacingPressure = clamp(
    livePressure * 0.31 +
      laneClosure.closureThreatLevel * 0.23 +
      laneClosure.structuralCarryoverLevel * 0.14 +
      pressureEscalation * 0.14 +
      postureBias * 0.1 +
      meaningfulSiegeRecency * 0.1 -
      defendedRelief * 0.13,
    0,
    1
  );

  return {
    closureReadiness,
    antiStallReadiness,
    defenderReset,
    closureWindow,
    pacingPressure
  };
};

const deriveState = (levels: RuntimeLevels): ClosurePacingState => {
  if (
    levels.defenderReset >= 0.62 &&
    levels.closureWindow <= 0.48 &&
    levels.pacingPressure <= 0.46
  ) {
    return 'defender-reset-window';
  }

  if (
    levels.antiStallReadiness >= 0.72 &&
    levels.closureWindow >= 0.69 &&
    levels.closureReadiness >= 0.64
  ) {
    return 'accelerated-closure-window';
  }

  if (
    levels.closureReadiness >= 0.63 ||
    levels.closureWindow >= 0.62
  ) {
    return 'closure-readiness';
  }

  if (
    levels.antiStallReadiness >= 0.46 ||
    levels.pacingPressure >= 0.53
  ) {
    return 'rising-anti-stall';
  }

  return 'normal-pressure';
};

const deriveCalibration = (
  state: ClosurePacingState,
  levels: RuntimeLevels
): ClosurePacingCalibrationContext => {
  const base = calibrationBase[state];
  const readinessBias = (levels.closureReadiness - 0.5) * 0.018;
  const antiStallBias = (levels.antiStallReadiness - 0.5) * 0.02;
  const resetBias = (levels.defenderReset - 0.5) * 0.019;
  const windowBias = (levels.closureWindow - 0.5) * 0.02;
  const pressureBias = (levels.pacingPressure - 0.5) * 0.018;

  return {
    state,
    closureReadinessScalar: clamp(
      base.closureReadinessScalar + readinessBias + pressureBias * 0.28,
      scalarMin,
      scalarMax
    ),
    antiStallReadinessScalar: clamp(
      base.antiStallReadinessScalar + antiStallBias + readinessBias * 0.22,
      scalarMin,
      scalarMax
    ),
    defenderResetScalar: clamp(
      base.defenderResetScalar + resetBias - antiStallBias * 0.24,
      scalarMin,
      scalarMax
    ),
    closureWindowScalar: clamp(
      base.closureWindowScalar + windowBias + readinessBias * 0.26,
      scalarMin,
      scalarMax
    ),
    pacingPressureScalar: clamp(
      base.pacingPressureScalar + pressureBias + antiStallBias * 0.24,
      scalarMin,
      scalarMax
    )
  };
};

const meaningfulSiegeRecencyIndex = (
  state: StructureResolutionTierState
): number => {
  if (state.meaningfulAttemptCount <= 0) {
    return 0;
  }

  return 1 - clamp((state.timeSinceLastMeaningfulSiegeSeconds - 2.5) / 17, 0, 1);
};

const weightedTierValue = (selector: (tier: StructurePressureTier) => number): number =>
  tierOrder.reduce((sum, tier) => sum + selector(tier) * tierWeights[tier], 0);

const weightedSegmentValue = (
  lanePressureBySegment: SegmentValues
): number =>
  clamp(
    lanePressureBySegment['outer-front'] * 0.24 +
      lanePressureBySegment['inner-siege'] * 0.36 +
      lanePressureBySegment['core-approach'] * 0.4,
    0,
    1
  );

const approach = (value: number, target: number, amount: number): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
