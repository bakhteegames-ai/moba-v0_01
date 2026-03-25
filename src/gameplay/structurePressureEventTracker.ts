import { clamp } from './calibrationUtils';
import { type StructurePressureTier } from './pressureCalibrationScaffold';

export type PressureWindowEndResult =
  | 'stall'
  | 'repel'
  | 'partial-convert'
  | 'attacker-window';

export type PressureCalibrationMeaning =
  | 'none'
  | 'stalled-pressure-window'
  | 'defended-reset'
  | 'partial-structural-progress'
  | 'meaningful-attacker-window';

export type BoundedClosureState =
  | 'none'
  | 'forming'
  | 'bounded'
  | 'overextended';

export interface StructurePressureTierInput {
  pressure: number;
  contactActive: boolean;
  contactWindowSeconds: number;
  lanePressure: number;
}

export interface StructurePressureEventTrackerInput {
  byTier: Record<StructurePressureTier, StructurePressureTierInput>;
}

interface ActiveEventRuntime {
  id: number;
  startedAtSeconds: number;
  ageSeconds: number;
  peakPressure: number;
  currentPressure: number;
  maxContactWindowSeconds: number;
  maxLanePressure: number;
  qualifiedSiegeAttempt: boolean;
  boundedClosureState: BoundedClosureState;
}

interface CompletedEventRuntime {
  id: number;
  startedAtSeconds: number;
  endedAtSeconds: number;
  durationSeconds: number;
  peakPressure: number;
  finalPressure: number;
  result: PressureWindowEndResult;
  qualifiedSiegeAttempt: boolean;
  boundedClosureState: BoundedClosureState;
  calibrationMeaning: PressureCalibrationMeaning;
}

interface TierRuntimeState {
  nextEventId: number;
  eventCount: number;
  active: ActiveEventRuntime | null;
  lastCompleted: CompletedEventRuntime | null;
}

export interface StructurePressureActiveEvent {
  id: number;
  startedAtSeconds: number;
  ageSeconds: number;
  peakPressure: number;
  currentPressure: number;
  qualifiedSiegeAttempt: boolean;
  boundedClosureState: BoundedClosureState;
}

export interface StructurePressureCompletedEvent {
  id: number;
  startedAtSeconds: number;
  endedAtSeconds: number;
  durationSeconds: number;
  peakPressure: number;
  finalPressure: number;
  result: PressureWindowEndResult;
  qualifiedSiegeAttempt: boolean;
  boundedClosureState: BoundedClosureState;
  calibrationMeaning: PressureCalibrationMeaning;
}

export interface StructurePressureCalibrationContext {
  meaning: PressureCalibrationMeaning;
  boundedClosureState: BoundedClosureState;
  progressionScalar: number;
  carryoverScalar: number;
  towerHoldScalar: number;
  defenderDelayScalar: number;
  defenderReclearScalar: number;
  pressureDecayScalar: number;
}

export interface StructurePressureTierEventState {
  eventCount: number;
  active: StructurePressureActiveEvent | null;
  lastCompleted: StructurePressureCompletedEvent | null;
  calibration: StructurePressureCalibrationContext;
}

export interface StructurePressureEventSnapshot {
  byTier: Record<StructurePressureTier, StructurePressureTierEventState>;
  calibrationByTier: Record<StructurePressureTier, StructurePressureCalibrationContext>;
}

export interface StructurePressureEventTracker {
  update(
    dt: number,
    nowSeconds: number,
    input: StructurePressureEventTrackerInput
  ): void;
  getSnapshot(nowSeconds: number): StructurePressureEventSnapshot;
}

interface TierTuning {
  startThreshold: number;
  endThreshold: number;
  qualifyPeak: number;
  qualifyDurationSeconds: number;
  attackerPeak: number;
  attackerDurationSeconds: number;
  partialPeak: number;
  partialDurationSeconds: number;
  stallDurationSeconds: number;
  maxWindowDurationSeconds: number;
  boundedPeak: number;
  boundedMinSeconds: number;
  boundedMaxSeconds: number;
  decaySeconds: number;
}

const tierOrder: StructurePressureTier[] = ['outer', 'inner', 'core'];

const neutralCalibration: StructurePressureCalibrationContext = {
  meaning: 'none',
  boundedClosureState: 'none',
  progressionScalar: 1,
  carryoverScalar: 1,
  towerHoldScalar: 1,
  defenderDelayScalar: 1,
  defenderReclearScalar: 1,
  pressureDecayScalar: 1
};

const tierTuningByTier: Record<StructurePressureTier, TierTuning> = {
  outer: {
    startThreshold: 0.37,
    endThreshold: 0.19,
    qualifyPeak: 0.56,
    qualifyDurationSeconds: 2,
    attackerPeak: 0.82,
    attackerDurationSeconds: 2.6,
    partialPeak: 0.62,
    partialDurationSeconds: 2.2,
    stallDurationSeconds: 3.4,
    maxWindowDurationSeconds: 7.8,
    boundedPeak: 0.6,
    boundedMinSeconds: 2,
    boundedMaxSeconds: 6.1,
    decaySeconds: 9.5
  },
  inner: {
    startThreshold: 0.39,
    endThreshold: 0.2,
    qualifyPeak: 0.58,
    qualifyDurationSeconds: 2.2,
    attackerPeak: 0.83,
    attackerDurationSeconds: 2.7,
    partialPeak: 0.64,
    partialDurationSeconds: 2.35,
    stallDurationSeconds: 3.6,
    maxWindowDurationSeconds: 8.4,
    boundedPeak: 0.62,
    boundedMinSeconds: 2.2,
    boundedMaxSeconds: 6.4,
    decaySeconds: 10
  },
  core: {
    startThreshold: 0.42,
    endThreshold: 0.21,
    qualifyPeak: 0.6,
    qualifyDurationSeconds: 2.35,
    attackerPeak: 0.84,
    attackerDurationSeconds: 2.8,
    partialPeak: 0.66,
    partialDurationSeconds: 2.45,
    stallDurationSeconds: 3.8,
    maxWindowDurationSeconds: 8.8,
    boundedPeak: 0.64,
    boundedMinSeconds: 2.35,
    boundedMaxSeconds: 6.7,
    decaySeconds: 10.5
  }
};

const activeDropGraceSeconds = 0.75;

export const createStructurePressureEventTracker =
  (): StructurePressureEventTracker => {
    const stateByTier: Record<StructurePressureTier, TierRuntimeState> = {
      outer: createTierRuntimeState(),
      inner: createTierRuntimeState(),
      core: createTierRuntimeState()
    };

    return {
      update(dt, nowSeconds, input) {
        if (dt <= 0) {
          return;
        }

        for (const tier of tierOrder) {
          updateTierState(
            tier,
            stateByTier[tier],
            tierTuningByTier[tier],
            dt,
            nowSeconds,
            input.byTier[tier]
          );
        }
      },
      getSnapshot(nowSeconds) {
        const byTier = {
          outer: buildTierSnapshot('outer', stateByTier.outer, tierTuningByTier.outer, nowSeconds),
          inner: buildTierSnapshot('inner', stateByTier.inner, tierTuningByTier.inner, nowSeconds),
          core: buildTierSnapshot('core', stateByTier.core, tierTuningByTier.core, nowSeconds)
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

const createTierRuntimeState = (): TierRuntimeState => ({
  nextEventId: 1,
  eventCount: 0,
  active: null,
  lastCompleted: null
});

const updateTierState = (
  tier: StructurePressureTier,
  state: TierRuntimeState,
  tuning: TierTuning,
  dt: number,
  nowSeconds: number,
  sample: StructurePressureTierInput
): void => {
  const pressure = clamp(sample.pressure, 0, 1);
  const lanePressure = clamp(sample.lanePressure, 0, 1);
  const contactWindowSeconds = Math.max(0, sample.contactWindowSeconds);

  if (!state.active) {
    if (sample.contactActive && pressure >= tuning.startThreshold) {
      state.active = {
        id: state.nextEventId,
        startedAtSeconds: nowSeconds,
        ageSeconds: 0,
        peakPressure: pressure,
        currentPressure: pressure,
        maxContactWindowSeconds: contactWindowSeconds,
        maxLanePressure: lanePressure,
        qualifiedSiegeAttempt: false,
        boundedClosureState: 'forming'
      };
      state.nextEventId += 1;
      state.eventCount += 1;
    }
    return;
  }

  const active = state.active;
  active.ageSeconds += dt;
  active.currentPressure = pressure;
  active.peakPressure = Math.max(active.peakPressure, pressure);
  active.maxContactWindowSeconds = Math.max(active.maxContactWindowSeconds, contactWindowSeconds);
  active.maxLanePressure = Math.max(active.maxLanePressure, lanePressure);
  active.qualifiedSiegeAttempt = isQualifiedSiegeAttempt(active, tuning);
  active.boundedClosureState = deriveBoundedClosureState(active, tuning);

  const attackerWindowHit =
    active.qualifiedSiegeAttempt &&
    active.peakPressure >= tuning.attackerPeak &&
    active.ageSeconds >= tuning.attackerDurationSeconds &&
    active.maxContactWindowSeconds >= 1.7;

  const endedByDrop =
    !sample.contactActive &&
    pressure <= tuning.endThreshold &&
    active.ageSeconds >= activeDropGraceSeconds;
  const endedByTimeout = active.ageSeconds >= tuning.maxWindowDurationSeconds;
  const shouldEnd = attackerWindowHit || endedByDrop || endedByTimeout;

  if (!shouldEnd) {
    return;
  }

  const result = determineEventEndResult(
    attackerWindowHit,
    active,
    tuning
  );

  state.lastCompleted = {
    id: active.id,
    startedAtSeconds: active.startedAtSeconds,
    endedAtSeconds: nowSeconds,
    durationSeconds: active.ageSeconds,
    peakPressure: active.peakPressure,
    finalPressure: pressure,
    result,
    qualifiedSiegeAttempt: active.qualifiedSiegeAttempt,
    boundedClosureState: active.boundedClosureState,
    calibrationMeaning: calibrationMeaningFromResult(result)
  };
  state.active = null;

  if (result === 'stall' && tier !== 'outer') {
    // Keep inner/core closure windows bounded by nudging stale events into reset states faster.
    state.lastCompleted.boundedClosureState = 'overextended';
  }
};

const determineEventEndResult = (
  attackerWindowHit: boolean,
  active: ActiveEventRuntime,
  tuning: TierTuning
): PressureWindowEndResult => {
  if (attackerWindowHit) {
    return 'attacker-window';
  }

  if (
    active.qualifiedSiegeAttempt &&
    active.peakPressure >= tuning.partialPeak &&
    active.ageSeconds >= tuning.partialDurationSeconds
  ) {
    return 'partial-convert';
  }

  if (
    active.ageSeconds >= tuning.stallDurationSeconds &&
    active.peakPressure >= tuning.startThreshold + 0.07
  ) {
    return 'stall';
  }

  return 'repel';
};

const isQualifiedSiegeAttempt = (
  active: ActiveEventRuntime,
  tuning: TierTuning
): boolean =>
  active.peakPressure >= tuning.qualifyPeak &&
  active.ageSeconds >= tuning.qualifyDurationSeconds &&
  active.maxContactWindowSeconds >= 1.15;

const deriveBoundedClosureState = (
  active: ActiveEventRuntime,
  tuning: TierTuning
): BoundedClosureState => {
  if (
    active.peakPressure >= tuning.boundedPeak &&
    active.ageSeconds >= tuning.boundedMinSeconds &&
    active.ageSeconds <= tuning.boundedMaxSeconds
  ) {
    return 'bounded';
  }

  if (active.ageSeconds > tuning.maxWindowDurationSeconds * 0.88) {
    return 'overextended';
  }

  if (active.currentPressure >= tuning.startThreshold) {
    return 'forming';
  }

  return 'none';
};

const buildTierSnapshot = (
  tier: StructurePressureTier,
  state: TierRuntimeState,
  tuning: TierTuning,
  nowSeconds: number
): StructurePressureTierEventState => {
  const active = state.active
    ? {
        id: state.active.id,
        startedAtSeconds: state.active.startedAtSeconds,
        ageSeconds: state.active.ageSeconds,
        peakPressure: state.active.peakPressure,
        currentPressure: state.active.currentPressure,
        qualifiedSiegeAttempt: state.active.qualifiedSiegeAttempt,
        boundedClosureState: state.active.boundedClosureState
      }
    : null;

  const lastCompleted = state.lastCompleted
    ? {
        id: state.lastCompleted.id,
        startedAtSeconds: state.lastCompleted.startedAtSeconds,
        endedAtSeconds: state.lastCompleted.endedAtSeconds,
        durationSeconds: state.lastCompleted.durationSeconds,
        peakPressure: state.lastCompleted.peakPressure,
        finalPressure: state.lastCompleted.finalPressure,
        result: state.lastCompleted.result,
        qualifiedSiegeAttempt: state.lastCompleted.qualifiedSiegeAttempt,
        boundedClosureState: state.lastCompleted.boundedClosureState,
        calibrationMeaning: state.lastCompleted.calibrationMeaning
      }
    : null;

  const calibration = deriveCalibrationContext(
    state.active,
    state.lastCompleted,
    tuning,
    nowSeconds
  );

  return {
    eventCount: state.eventCount,
    active,
    lastCompleted,
    calibration: {
      ...calibration,
      boundedClosureState: calibration.boundedClosureState === 'none' && tier !== 'outer'
        ? calibration.boundedClosureState
        : calibration.boundedClosureState
    }
  };
};

const deriveCalibrationContext = (
  active: ActiveEventRuntime | null,
  lastCompleted: CompletedEventRuntime | null,
  tuning: TierTuning,
  nowSeconds: number
): StructurePressureCalibrationContext => {
  if (active) {
    const pressureBias = clamp(active.currentPressure, 0, 1);
    const qualifyBias = active.qualifiedSiegeAttempt ? 1 : 0;
    return {
      meaning: active.qualifiedSiegeAttempt
        ? active.peakPressure >= tuning.attackerPeak
          ? 'meaningful-attacker-window'
          : 'partial-structural-progress'
        : 'none',
      boundedClosureState: active.boundedClosureState,
      progressionScalar: clamp(1 + pressureBias * 0.018 + qualifyBias * 0.01, 0.96, 1.05),
      carryoverScalar: clamp(1 + active.peakPressure * 0.015 + qualifyBias * 0.012, 0.96, 1.05),
      towerHoldScalar: clamp(1 - pressureBias * 0.01 - qualifyBias * 0.008, 0.95, 1.04),
      defenderDelayScalar: clamp(1 + pressureBias * 0.008 + qualifyBias * 0.007, 0.95, 1.04),
      defenderReclearScalar: clamp(1 - pressureBias * 0.01 - qualifyBias * 0.007, 0.95, 1.05),
      pressureDecayScalar: clamp(1 - pressureBias * 0.009 - qualifyBias * 0.007, 0.95, 1.05)
    };
  }

  if (!lastCompleted) {
    return { ...neutralCalibration };
  }

  const secondsSinceEnd = Math.max(0, nowSeconds - lastCompleted.endedAtSeconds);
  const decay = Math.exp(-secondsSinceEnd / Math.max(0.25, tuning.decaySeconds));
  const outcomeCalibration = outcomeCalibrationFromMeaning(
    lastCompleted.calibrationMeaning,
    lastCompleted.boundedClosureState
  );

  return blendCalibration(outcomeCalibration, neutralCalibration, decay);
};

const calibrationMeaningFromResult = (
  result: PressureWindowEndResult
): PressureCalibrationMeaning => {
  if (result === 'attacker-window') {
    return 'meaningful-attacker-window';
  }
  if (result === 'partial-convert') {
    return 'partial-structural-progress';
  }
  if (result === 'stall') {
    return 'stalled-pressure-window';
  }
  return 'defended-reset';
};

const outcomeCalibrationFromMeaning = (
  meaning: PressureCalibrationMeaning,
  boundedClosureState: BoundedClosureState
): StructurePressureCalibrationContext => {
  if (meaning === 'meaningful-attacker-window') {
    return {
      meaning,
      boundedClosureState,
      progressionScalar: 1.03,
      carryoverScalar: 1.025,
      towerHoldScalar: 0.986,
      defenderDelayScalar: 1.02,
      defenderReclearScalar: 0.98,
      pressureDecayScalar: 0.978
    };
  }

  if (meaning === 'partial-structural-progress') {
    return {
      meaning,
      boundedClosureState,
      progressionScalar: 1.018,
      carryoverScalar: 1.014,
      towerHoldScalar: 0.992,
      defenderDelayScalar: 1.012,
      defenderReclearScalar: 0.988,
      pressureDecayScalar: 0.988
    };
  }

  if (meaning === 'stalled-pressure-window') {
    return {
      meaning,
      boundedClosureState,
      progressionScalar: 0.996,
      carryoverScalar: 0.992,
      towerHoldScalar: 1.008,
      defenderDelayScalar: 0.998,
      defenderReclearScalar: 1.012,
      pressureDecayScalar: 1.01
    };
  }

  if (meaning === 'defended-reset') {
    return {
      meaning,
      boundedClosureState,
      progressionScalar: 0.985,
      carryoverScalar: 0.976,
      towerHoldScalar: 1.016,
      defenderDelayScalar: 0.992,
      defenderReclearScalar: 1.02,
      pressureDecayScalar: 1.019
    };
  }

  return { ...neutralCalibration };
};

const blendCalibration = (
  source: StructurePressureCalibrationContext,
  target: StructurePressureCalibrationContext,
  sourceWeight: number
): StructurePressureCalibrationContext => {
  const w = clamp(sourceWeight, 0, 1);
  const inv = 1 - w;

  return {
    meaning: source.meaning,
    boundedClosureState: source.boundedClosureState,
    progressionScalar: source.progressionScalar * w + target.progressionScalar * inv,
    carryoverScalar: source.carryoverScalar * w + target.carryoverScalar * inv,
    towerHoldScalar: source.towerHoldScalar * w + target.towerHoldScalar * inv,
    defenderDelayScalar:
      source.defenderDelayScalar * w + target.defenderDelayScalar * inv,
    defenderReclearScalar:
      source.defenderReclearScalar * w + target.defenderReclearScalar * inv,
    pressureDecayScalar:
      source.pressureDecayScalar * w + target.pressureDecayScalar * inv
  };
};
