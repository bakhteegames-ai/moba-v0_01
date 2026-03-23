import {
  createGameplayCalibrationSimulation,
  type GameplayCalibrationCoefficients,
  type GameplayCalibrationScenarioDef,
  type GameplayCalibrationSimulation,
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';

type TierScalars = Record<StructurePressureTier, number>;
type SegmentScalars = Record<LanePressureSegment, number>;

export interface LivePrototypeSignals {
  wave: {
    progressionBySegment: SegmentScalars;
    carryoverScalar: number;
  };
  tower: {
    holdByTier: TierScalars;
  };
  defender: {
    delayByTier: TierScalars;
    reclearByTier: TierScalars;
    pressureDecayByTier: TierScalars;
  };
}

export interface LivePrototypeScenarioSignals {
  waveProgressionScalar: number;
  twoWaveCarryoverScalar: number;
  towerHoldScalar: number;
  defenderDelayScalar: number;
  defenderReclearScalar: number;
  pressureDecayScalar: number;
}

export interface LivePrototypeAdaptation {
  scenarioSignals: LivePrototypeScenarioSignals;
  coefficients: GameplayCalibrationCoefficients;
}

export interface LivePrototypeSimulationAdapter {
  adaptation: LivePrototypeAdaptation;
  simulation: GameplayCalibrationSimulation;
}

export interface LivePrototypeAdapter {
  getSignals(): LivePrototypeSignals;
  adaptScenario(
    scenario: GameplayCalibrationScenarioDef,
    baseCoefficients: GameplayCalibrationCoefficients,
    runtimeSignals?: LivePrototypeSignals
  ): LivePrototypeAdaptation;
  createSimulation(
    scenario: GameplayCalibrationScenarioDef,
    baseCoefficients: GameplayCalibrationCoefficients,
    runtimeSignals?: LivePrototypeSignals
  ): LivePrototypeSimulationAdapter;
}

const scalarRange = {
  min: 0.75,
  max: 1.25
} as const;

export const createLivePrototypeAdapter = (
  overrides?: Partial<LivePrototypeSignals>
): LivePrototypeAdapter => {
  const signals = mergeSignals(createDefaultSignals(), overrides);

  return {
    getSignals() {
      return cloneSignals(signals);
    },
    adaptScenario(scenario, baseCoefficients, runtimeSignals) {
      const activeSignals = resolveSignals(signals, runtimeSignals);
      const scenarioSignals = buildScenarioSignals(scenario, activeSignals);
      return {
        scenarioSignals,
        coefficients: buildScenarioCoefficients(baseCoefficients, scenarioSignals)
      };
    },
    createSimulation(scenario, baseCoefficients, runtimeSignals) {
      const adaptation = this.adaptScenario(
        scenario,
        baseCoefficients,
        runtimeSignals
      );
      const simulation = createGameplayCalibrationSimulation(
        scenario,
        adaptation.coefficients
      );

      return {
        adaptation,
        simulation
      };
    }
  };
};

const resolveSignals = (
  baseSignals: LivePrototypeSignals,
  runtimeSignals?: LivePrototypeSignals
): LivePrototypeSignals => {
  if (!runtimeSignals) {
    return baseSignals;
  }

  return mergeSignals(baseSignals, runtimeSignals);
};

const createDefaultSignals = (): LivePrototypeSignals => ({
  wave: {
    progressionBySegment: {
      'outer-front': 1,
      'inner-siege': 1,
      'core-approach': 1
    },
    carryoverScalar: 1
  },
  tower: {
    holdByTier: {
      outer: 1,
      inner: 1,
      core: 1
    }
  },
  defender: {
    delayByTier: {
      outer: 1,
      inner: 1,
      core: 1
    },
    reclearByTier: {
      outer: 1,
      inner: 1,
      core: 1
    },
    pressureDecayByTier: {
      outer: 1,
      inner: 1,
      core: 1
    }
  }
});

const mergeSignals = (
  base: LivePrototypeSignals,
  overrides?: Partial<LivePrototypeSignals>
): LivePrototypeSignals => {
  if (!overrides) {
    return base;
  }

  return {
    wave: {
      progressionBySegment: {
        ...base.wave.progressionBySegment,
        ...overrides.wave?.progressionBySegment
      },
      carryoverScalar: overrides.wave?.carryoverScalar ?? base.wave.carryoverScalar
    },
    tower: {
      holdByTier: {
        ...base.tower.holdByTier,
        ...overrides.tower?.holdByTier
      }
    },
    defender: {
      delayByTier: {
        ...base.defender.delayByTier,
        ...overrides.defender?.delayByTier
      },
      reclearByTier: {
        ...base.defender.reclearByTier,
        ...overrides.defender?.reclearByTier
      },
      pressureDecayByTier: {
        ...base.defender.pressureDecayByTier,
        ...overrides.defender?.pressureDecayByTier
      }
    }
  };
};

const buildScenarioSignals = (
  scenario: GameplayCalibrationScenarioDef,
  signals: LivePrototypeSignals
): LivePrototypeScenarioSignals => ({
  waveProgressionScalar: clampScalar(
    signals.wave.progressionBySegment[scenario.pressureSegmentStart]
  ),
  twoWaveCarryoverScalar: clampScalar(signals.wave.carryoverScalar),
  towerHoldScalar: clampScalar(signals.tower.holdByTier[scenario.structureTier]),
  defenderDelayScalar: clampScalar(
    signals.defender.delayByTier[scenario.structureTier]
  ),
  defenderReclearScalar: clampScalar(
    signals.defender.reclearByTier[scenario.structureTier]
  ),
  pressureDecayScalar: clampScalar(
    signals.defender.pressureDecayByTier[scenario.structureTier]
  )
});

const buildScenarioCoefficients = (
  base: GameplayCalibrationCoefficients,
  scenarioSignals: LivePrototypeScenarioSignals
): GameplayCalibrationCoefficients => ({
  ...base,
  waveAdvanceRate: roundTo(base.waveAdvanceRate * scenarioSignals.waveProgressionScalar),
  twoWaveCarryover: roundTo(
    clamp(base.twoWaveCarryover * scenarioSignals.twoWaveCarryoverScalar, 0.2, 1.2)
  ),
  towerHoldResistance: roundTo(
    clamp(base.towerHoldResistance * scenarioSignals.towerHoldScalar, 0.2, 2.5)
  ),
  defenderDelayScalar: roundTo(
    clamp(base.defenderDelayScalar * scenarioSignals.defenderDelayScalar, 0.2, 2.5)
  ),
  defenderReclearRate: roundTo(
    clamp(base.defenderReclearRate * scenarioSignals.defenderReclearScalar, 0.2, 2.5)
  ),
  pressureDecayRate: roundTo(
    clamp(base.pressureDecayRate * scenarioSignals.pressureDecayScalar, 0.2, 2.5)
  )
});

const cloneSignals = (signals: LivePrototypeSignals): LivePrototypeSignals => ({
  wave: {
    progressionBySegment: { ...signals.wave.progressionBySegment },
    carryoverScalar: signals.wave.carryoverScalar
  },
  tower: {
    holdByTier: { ...signals.tower.holdByTier }
  },
  defender: {
    delayByTier: { ...signals.defender.delayByTier },
    reclearByTier: { ...signals.defender.reclearByTier },
    pressureDecayByTier: { ...signals.defender.pressureDecayByTier }
  }
});

const clampScalar = (value: number): number =>
  clamp(value, scalarRange.min, scalarRange.max);

const roundTo = (value: number): number =>
  Math.round(value * 10000) / 10000;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
