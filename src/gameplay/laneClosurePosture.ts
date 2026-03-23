import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import { type PrototypeStructureContactState } from './prototypeLaneOccupancyProducer';
import {
  type StructuralThreatStage,
  type StructureResolutionTierState
} from './structureResolutionMemory';

type TierValues = Record<StructurePressureTier, number>;
type SegmentValues = Record<LanePressureSegment, number>;

export type LaneClosurePosture =
  | 'stable'
  | 'rising-pressure'
  | 'pressured-lane'
  | 'softened-shell'
  | 'accelerated-closure'
  | 'defender-recovery';

export interface LaneClosureCalibrationContext {
  posture: LaneClosurePosture;
  closureThreatScalar: number;
  laneStabilityScalar: number;
  defenderRecoveryScalar: number;
  antiStallAccelerationScalar: number;
  structuralCarryoverScalar: number;
}

export interface LaneClosurePostureSnapshot {
  posture: LaneClosurePosture;
  postureAgeSeconds: number;
  closureThreatLevel: number;
  laneStabilityLevel: number;
  defenderRecoveryLevel: number;
  antiStallAccelerationLevel: number;
  structuralCarryoverLevel: number;
  calibration: LaneClosureCalibrationContext;
}

export interface LaneClosurePostureInput {
  resolutionByTier: Record<StructurePressureTier, StructureResolutionTierState>;
  structurePressureByTier: TierValues;
  structureContactByTier: Record<StructurePressureTier, PrototypeStructureContactState>;
  lanePressureBySegment: SegmentValues;
  consecutiveWaveCarryoverRelevance: number;
}

export interface LaneClosurePostureModel {
  update(dt: number, input: LaneClosurePostureInput): void;
  getSnapshot(): LaneClosurePostureSnapshot;
}

interface LaneClosureLevels {
  closureThreat: number;
  laneStability: number;
  defenderRecovery: number;
  antiStallAcceleration: number;
  structuralCarryover: number;
}

interface LaneClosureRuntimeState {
  posture: LaneClosurePosture;
  postureAgeSeconds: number;
  levels: LaneClosureLevels;
  calibration: LaneClosureCalibrationContext;
}

const tierOrder: StructurePressureTier[] = ['outer', 'inner', 'core'];
const tierWeights: Record<StructurePressureTier, number> = {
  outer: 0.22,
  inner: 0.34,
  core: 0.44
};

const stageThreatValue: Record<StructuralThreatStage, number> = {
  stable: 0.14,
  threatened: 0.38,
  pressured: 0.62,
  softened: 0.82,
  'temporarily-relieved': 0.24,
  escalating: 0.74
};

const postureCalibrationBase: Record<LaneClosurePosture, Omit<LaneClosureCalibrationContext, 'posture'>> = {
  stable: {
    closureThreatScalar: 1,
    laneStabilityScalar: 1,
    defenderRecoveryScalar: 1,
    antiStallAccelerationScalar: 1,
    structuralCarryoverScalar: 1
  },
  'rising-pressure': {
    closureThreatScalar: 1.007,
    laneStabilityScalar: 0.997,
    defenderRecoveryScalar: 0.995,
    antiStallAccelerationScalar: 1.008,
    structuralCarryoverScalar: 1.006
  },
  'pressured-lane': {
    closureThreatScalar: 1.014,
    laneStabilityScalar: 0.992,
    defenderRecoveryScalar: 0.989,
    antiStallAccelerationScalar: 1.013,
    structuralCarryoverScalar: 1.011
  },
  'softened-shell': {
    closureThreatScalar: 1.022,
    laneStabilityScalar: 0.986,
    defenderRecoveryScalar: 0.982,
    antiStallAccelerationScalar: 1.018,
    structuralCarryoverScalar: 1.017
  },
  'accelerated-closure': {
    closureThreatScalar: 1.026,
    laneStabilityScalar: 0.981,
    defenderRecoveryScalar: 0.978,
    antiStallAccelerationScalar: 1.024,
    structuralCarryoverScalar: 1.022
  },
  'defender-recovery': {
    closureThreatScalar: 0.992,
    laneStabilityScalar: 1.011,
    defenderRecoveryScalar: 1.017,
    antiStallAccelerationScalar: 0.992,
    structuralCarryoverScalar: 0.989
  }
};

const scalarMin = 0.95;
const scalarMax = 1.08;

export const createLaneClosurePostureModel = (): LaneClosurePostureModel => {
  const state: LaneClosureRuntimeState = {
    posture: 'stable',
    postureAgeSeconds: 0,
    levels: {
      closureThreat: 0.24,
      laneStability: 0.59,
      defenderRecovery: 0.47,
      antiStallAcceleration: 0.29,
      structuralCarryover: 0.28
    },
    calibration: {
      posture: 'stable',
      ...postureCalibrationBase.stable
    }
  };

  return {
    update(dt, input) {
      const targetLevels = deriveTargetLevels(input);
      const blend = clamp(dt * 0.92, 0.08, 1);
      state.levels.closureThreat = approach(state.levels.closureThreat, targetLevels.closureThreat, blend);
      state.levels.laneStability = approach(state.levels.laneStability, targetLevels.laneStability, blend);
      state.levels.defenderRecovery = approach(state.levels.defenderRecovery, targetLevels.defenderRecovery, blend);
      state.levels.antiStallAcceleration = approach(
        state.levels.antiStallAcceleration,
        targetLevels.antiStallAcceleration,
        blend
      );
      state.levels.structuralCarryover = approach(
        state.levels.structuralCarryover,
        targetLevels.structuralCarryover,
        blend
      );

      const nextPosture = derivePosture(state.levels);
      if (nextPosture === state.posture) {
        state.postureAgeSeconds += Math.max(0, dt);
      } else {
        state.posture = nextPosture;
        state.postureAgeSeconds = 0;
      }

      state.calibration = deriveCalibration(state.posture, state.levels);
    },
    getSnapshot() {
      return {
        posture: state.posture,
        postureAgeSeconds: state.postureAgeSeconds,
        closureThreatLevel: state.levels.closureThreat,
        laneStabilityLevel: state.levels.laneStability,
        defenderRecoveryLevel: state.levels.defenderRecovery,
        antiStallAccelerationLevel: state.levels.antiStallAcceleration,
        structuralCarryoverLevel: state.levels.structuralCarryover,
        calibration: {
          ...state.calibration
        }
      };
    }
  };
};

const deriveTargetLevels = (
  input: LaneClosurePostureInput
): LaneClosureLevels => {
  const stageThreat = weightedTierValue((tier) =>
    stageThreatValue[input.resolutionByTier[tier].threatStage]
  );
  const partialProgress = weightedTierValue((tier) =>
    input.resolutionByTier[tier].accumulatedPartialProgress
  );
  const pressureEscalation = weightedTierValue((tier) =>
    input.resolutionByTier[tier].repeatedPressureEscalation
  );
  const defendedRelief = weightedTierValue((tier) =>
    input.resolutionByTier[tier].defendedReliefStrength
  );
  const meaningfulSiegeRecency = weightedTierValue((tier) =>
    meaningfulSiegeRecencyIndex(input.resolutionByTier[tier])
  );
  const structurePressure = weightedTierValue((tier) =>
    input.structurePressureByTier[tier]
  );
  const contactPressure = weightedTierValue((tier) =>
    input.structureContactByTier[tier].pressure *
      (input.structureContactByTier[tier].active ? 1 : 0.75)
  );
  const lanePressure = weightedSegmentValue(input.lanePressureBySegment);
  const livePressureIndex = clamp(
    structurePressure * 0.38 + contactPressure * 0.47 + lanePressure * 0.15,
    0,
    1
  );

  return {
    closureThreat: clamp(
      stageThreat * 0.34 +
        partialProgress * 0.22 +
        pressureEscalation * 0.2 +
        livePressureIndex * 0.15 +
        meaningfulSiegeRecency * 0.09 -
        defendedRelief * 0.22,
      0,
      1
    ),
    laneStability: clamp(
      0.57 +
        defendedRelief * 0.29 -
        stageThreat * 0.17 -
        pressureEscalation * 0.17 -
        livePressureIndex * 0.17 -
        partialProgress * 0.09,
      0,
      1
    ),
    defenderRecovery: clamp(
      0.28 +
        defendedRelief * 0.5 +
        (1 - livePressureIndex) * 0.16 +
        (1 - meaningfulSiegeRecency) * 0.1 -
        pressureEscalation * 0.17 -
        partialProgress * 0.1,
      0,
      1
    ),
    antiStallAcceleration: clamp(
      0.2 +
        stageThreat * 0.23 +
        partialProgress * 0.23 +
        pressureEscalation * 0.22 +
        meaningfulSiegeRecency * 0.13 +
        input.consecutiveWaveCarryoverRelevance * 0.12 -
        defendedRelief * 0.15,
      0,
      1
    ),
    structuralCarryover: clamp(
      0.18 +
        input.consecutiveWaveCarryoverRelevance * 0.35 +
        partialProgress * 0.24 +
        pressureEscalation * 0.18 +
        stageThreat * 0.11 -
        defendedRelief * 0.16,
      0,
      1
    )
  };
};

const derivePosture = (
  levels: LaneClosureLevels
): LaneClosurePosture => {
  if (
    levels.defenderRecovery >= 0.62 &&
    levels.closureThreat <= 0.42 &&
    levels.laneStability >= 0.58
  ) {
    return 'defender-recovery';
  }

  if (
    levels.antiStallAcceleration >= 0.74 &&
    levels.closureThreat >= 0.68 &&
    levels.structuralCarryover >= 0.56
  ) {
    return 'accelerated-closure';
  }

  if (levels.closureThreat >= 0.69 || levels.structuralCarryover >= 0.66) {
    return 'softened-shell';
  }

  if (
    levels.closureThreat >= 0.57 ||
    (levels.antiStallAcceleration >= 0.5 && levels.laneStability <= 0.52)
  ) {
    return 'pressured-lane';
  }

  if (
    levels.closureThreat >= 0.41 ||
    levels.antiStallAcceleration >= 0.39 ||
    levels.structuralCarryover >= 0.38
  ) {
    return 'rising-pressure';
  }

  return 'stable';
};

const deriveCalibration = (
  posture: LaneClosurePosture,
  levels: LaneClosureLevels
): LaneClosureCalibrationContext => {
  const base = postureCalibrationBase[posture];
  const threatBias = (levels.closureThreat - 0.5) * 0.018;
  const stabilityBias = (levels.laneStability - 0.5) * 0.018;
  const recoveryBias = (levels.defenderRecovery - 0.5) * 0.02;
  const antiStallBias = (levels.antiStallAcceleration - 0.5) * 0.021;
  const carryoverBias = (levels.structuralCarryover - 0.5) * 0.018;

  return {
    posture,
    closureThreatScalar: clamp(
      base.closureThreatScalar + threatBias + antiStallBias * 0.3,
      scalarMin,
      scalarMax
    ),
    laneStabilityScalar: clamp(
      base.laneStabilityScalar + stabilityBias - threatBias * 0.4,
      scalarMin,
      scalarMax
    ),
    defenderRecoveryScalar: clamp(
      base.defenderRecoveryScalar + recoveryBias + stabilityBias * 0.25,
      scalarMin,
      scalarMax
    ),
    antiStallAccelerationScalar: clamp(
      base.antiStallAccelerationScalar + antiStallBias + threatBias * 0.25,
      scalarMin,
      scalarMax
    ),
    structuralCarryoverScalar: clamp(
      base.structuralCarryoverScalar + carryoverBias + antiStallBias * 0.28,
      scalarMin,
      scalarMax
    )
  };
};

const meaningfulSiegeRecencyIndex = (
  tierState: StructureResolutionTierState
): number => {
  if (tierState.meaningfulAttemptCount <= 0) {
    return 0;
  }

  return 1 - clamp((tierState.timeSinceLastMeaningfulSiegeSeconds - 2.5) / 17, 0, 1);
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
