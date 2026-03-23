export type LanePressureSegment = 'outer-front' | 'inner-siege' | 'core-approach';
export type StructurePressureTier = 'outer' | 'inner' | 'core';
export type DefenderHoldState = 'delay' | 'hold' | 'reclear';
export type CalibrationResolution = 'attacker-window' | 'defender-hold' | 'stalled';

export interface GameplayCalibrationCoefficients {
  waveAdvanceRate: number;
  towerHoldResistance: number;
  defenderReclearRate: number;
  defenderDelayScalar: number;
  pressureDecayRate: number;
  twoWaveCarryover: number;
  attackerPushPressureCoeff: number;
  defenderBaseReclearCoeff: number;
  waveHoldDurationSeconds: number;
}

export interface GameplayCalibrationScenarioDef {
  id: string;
  label: string;
  targetSeconds: number;
  waveCount: number;
  towerResistance: number;
  defenderDelaySeconds: number;
  maxDurationSeconds: number;
  pressureSegmentStart: LanePressureSegment;
  structureTier: StructurePressureTier;
}

export interface LanePressureState {
  segment: LanePressureSegment;
  baseWindowSeconds: number;
  remainingWindowSeconds: number;
  waveWindowMultiplier: number;
  decayRatePerSecond: number;
}

export interface WavePresenceState {
  waveCountCommitted: number;
  progressionSeconds: number;
  targetSeconds: number;
  progressionRatePerSecond: number;
}

export interface StructurePressureState {
  tier: StructurePressureTier;
  resistance: number;
  holdBandActive: boolean;
  towerDrag: number;
  progressedSeconds: number;
  targetSeconds: number;
}

export interface DefenderControlState {
  state: DefenderHoldState;
  active: boolean;
  delaySeconds: number;
  elapsedSeconds: number;
  reclearRatePerSecond: number;
}

export interface GameplayCalibrationSnapshot {
  elapsedSeconds: number;
  completionRatio: number;
  lanePressure: LanePressureState;
  wavePresence: WavePresenceState;
  structurePressure: StructurePressureState;
  defenderControl: DefenderControlState;
}

export interface GameplayCalibrationOutcome {
  resolution: CalibrationResolution;
  completionRatio: number;
  elapsedSeconds: number;
  remainingWindowSeconds: number;
  snapshot: GameplayCalibrationSnapshot;
}

export interface GameplayCalibrationSimulation {
  step(dt: number): void;
  runToEnd(stepSeconds: number): GameplayCalibrationOutcome;
  isComplete(): boolean;
  getSnapshot(): GameplayCalibrationSnapshot;
  getOutcome(): GameplayCalibrationOutcome | null;
}

const holdBandThreshold = 0.55;
const stalledCompletionThreshold = 0.88;
const maxRunIterations = 20000;

export const createGameplayCalibrationSimulation = (
  scenario: GameplayCalibrationScenarioDef,
  coefficients: GameplayCalibrationCoefficients
): GameplayCalibrationSimulation => {
  const baseWindowSeconds =
    coefficients.waveHoldDurationSeconds * coefficients.attackerPushPressureCoeff;
  const waveWindowMultiplier = scenario.waveCount <= 1
    ? scenario.waveCount
    : 1 + (scenario.waveCount - 1) * coefficients.twoWaveCarryover;
  const defenderDelaySeconds =
    scenario.defenderDelaySeconds * coefficients.defenderDelayScalar;

  let elapsedSeconds = 0;
  let progressSeconds = 0;
  let remainingWindowSeconds = baseWindowSeconds * waveWindowMultiplier;
  let complete = false;
  let outcome: GameplayCalibrationOutcome | null = null;
  let snapshot = buildSnapshot({
    scenario,
    elapsedSeconds,
    progressSeconds,
    remainingWindowSeconds,
    baseWindowSeconds,
    waveWindowMultiplier,
    defenderDelaySeconds,
    progressionRatePerSecond: 0,
    towerDrag: 1,
    inTowerHoldBand: false,
    defenderActive: false,
    defenderReclearRatePerSecond: 0,
    totalDecayRatePerSecond: 0
  });

  return {
    step(dt) {
      if (complete) {
        return;
      }

      const completionRatioBefore =
        progressSeconds / Math.max(0.001, scenario.targetSeconds);
      const inTowerHoldBand = completionRatioBefore >= holdBandThreshold;
      const towerDrag = inTowerHoldBand
        ? scenario.towerResistance * coefficients.towerHoldResistance
        : 1;
      const progressionRatePerSecond = coefficients.waveAdvanceRate / towerDrag;

      progressSeconds += progressionRatePerSecond * dt;

      const defenderActive = elapsedSeconds >= defenderDelaySeconds;
      const baseDecayRatePerSecond = coefficients.pressureDecayRate;
      const defenderReclearRatePerSecond = defenderActive
        ? coefficients.defenderReclearRate *
          coefficients.defenderBaseReclearCoeff *
          (inTowerHoldBand ? 1.15 : 0.95)
        : 0;
      const totalDecayRatePerSecond =
        baseDecayRatePerSecond + defenderReclearRatePerSecond;

      remainingWindowSeconds = Math.max(
        0,
        remainingWindowSeconds - totalDecayRatePerSecond * dt
      );
      elapsedSeconds += dt;

      snapshot = buildSnapshot({
        scenario,
        elapsedSeconds,
        progressSeconds,
        remainingWindowSeconds,
        baseWindowSeconds,
        waveWindowMultiplier,
        defenderDelaySeconds,
        progressionRatePerSecond,
        towerDrag,
        inTowerHoldBand,
        defenderActive,
        defenderReclearRatePerSecond,
        totalDecayRatePerSecond
      });

      if (
        elapsedSeconds >= scenario.maxDurationSeconds ||
        remainingWindowSeconds <= 0 ||
        progressSeconds >= scenario.targetSeconds
      ) {
        const completionRatio = clamp01(
          progressSeconds / Math.max(0.001, scenario.targetSeconds)
        );

        const resolution: CalibrationResolution =
          progressSeconds >= scenario.targetSeconds && remainingWindowSeconds > 0
            ? 'attacker-window'
            : (elapsedSeconds >= scenario.maxDurationSeconds || remainingWindowSeconds <= 0) &&
                completionRatio >= stalledCompletionThreshold
              ? 'stalled'
              : 'defender-hold';

        outcome = {
          resolution,
          completionRatio,
          elapsedSeconds,
          remainingWindowSeconds,
          snapshot
        };
        complete = true;
      }
    },
    runToEnd(stepSeconds) {
      let iterations = 0;
      while (!complete && iterations < maxRunIterations) {
        this.step(stepSeconds);
        iterations += 1;
      }

      if (!outcome) {
        throw new Error(
          `Gameplay calibration simulation did not converge for "${scenario.id}".`
        );
      }

      return outcome;
    },
    isComplete() {
      return complete;
    },
    getSnapshot() {
      return snapshot;
    },
    getOutcome() {
      return outcome;
    }
  };
};

interface SnapshotBuildArgs {
  scenario: GameplayCalibrationScenarioDef;
  elapsedSeconds: number;
  progressSeconds: number;
  remainingWindowSeconds: number;
  baseWindowSeconds: number;
  waveWindowMultiplier: number;
  defenderDelaySeconds: number;
  progressionRatePerSecond: number;
  towerDrag: number;
  inTowerHoldBand: boolean;
  defenderActive: boolean;
  defenderReclearRatePerSecond: number;
  totalDecayRatePerSecond: number;
}

const buildSnapshot = (args: SnapshotBuildArgs): GameplayCalibrationSnapshot => {
  const completionRatio = clamp01(
    args.progressSeconds / Math.max(0.001, args.scenario.targetSeconds)
  );

  return {
    elapsedSeconds: args.elapsedSeconds,
    completionRatio,
    lanePressure: {
      segment: derivePressureSegment(
        args.scenario.pressureSegmentStart,
        args.scenario.structureTier,
        completionRatio
      ),
      baseWindowSeconds: args.baseWindowSeconds,
      remainingWindowSeconds: args.remainingWindowSeconds,
      waveWindowMultiplier: args.waveWindowMultiplier,
      decayRatePerSecond: args.totalDecayRatePerSecond
    },
    wavePresence: {
      waveCountCommitted: args.scenario.waveCount,
      progressionSeconds: args.progressSeconds,
      targetSeconds: args.scenario.targetSeconds,
      progressionRatePerSecond: args.progressionRatePerSecond
    },
    structurePressure: {
      tier: args.scenario.structureTier,
      resistance: args.scenario.towerResistance,
      holdBandActive: args.inTowerHoldBand,
      towerDrag: args.towerDrag,
      progressedSeconds: args.progressSeconds,
      targetSeconds: args.scenario.targetSeconds
    },
    defenderControl: {
      state: deriveDefenderState(args.defenderActive, args.inTowerHoldBand),
      active: args.defenderActive,
      delaySeconds: args.defenderDelaySeconds,
      elapsedSeconds: args.elapsedSeconds,
      reclearRatePerSecond: args.defenderReclearRatePerSecond
    }
  };
};

const derivePressureSegment = (
  start: LanePressureSegment,
  tier: StructurePressureTier,
  completionRatio: number
): LanePressureSegment => {
  if (tier === 'inner') {
    return completionRatio < holdBandThreshold ? 'outer-front' : 'inner-siege';
  }

  if (tier === 'core') {
    if (completionRatio < 0.38) {
      return start;
    }

    if (completionRatio < 0.78) {
      return 'inner-siege';
    }

    return 'core-approach';
  }

  return start;
};

const deriveDefenderState = (
  defenderActive: boolean,
  inTowerHoldBand: boolean
): DefenderHoldState => {
  if (!defenderActive) {
    return 'delay';
  }

  return inTowerHoldBand ? 'reclear' : 'hold';
};

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, value));
