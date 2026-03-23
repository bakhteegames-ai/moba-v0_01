import { layoutConfig, type ValidationBand } from '../config/layout';
import {
  createLivePrototypeAdapter,
  type LivePrototypeScenarioSignals,
  type LivePrototypeSignals
} from '../gameplay/livePrototypeAdapter';
import {
  createLivePrototypeSignalProvider,
  type LivePrototypeSignalProviderDebugState
} from '../gameplay/livePrototypeSignalProvider';
import {
  type CalibrationResolution,
  type DefenderHoldState,
  type GameplayCalibrationCoefficients,
  type GameplayCalibrationScenarioDef,
  type LanePressureSegment,
  type StructurePressureTier
} from '../gameplay/pressureCalibrationScaffold';

type LiveScenarioId =
  | 'outer-inner-live'
  | 'inner-core-live'
  | 'two-wave-live'
  | 'defender-reclear-live'
  | 'anti-stall-live';

type LiveResolution = CalibrationResolution;

interface LiveScenarioDef {
  id: LiveScenarioId;
  label: string;
  targetSeconds: number;
  waveCount: number;
  towerResistance: number;
  defenderDelaySeconds: number;
  maxDurationSeconds: number;
  desiredRemainingWindowSeconds: number;
  pressureSegmentStart: LanePressureSegment;
  structureTier: StructurePressureTier;
}

type LiveCoefficients = GameplayCalibrationCoefficients;

export interface LiveScenarioResult {
  id: LiveScenarioId;
  label: string;
  status: ValidationBand;
  resolution: LiveResolution;
  completionRatio: number;
  elapsedSeconds: number;
  targetSeconds: number;
  remainingWindowSeconds: number;
  lanePressureSegment: LanePressureSegment;
  structureTier: StructurePressureTier;
  defenderState: DefenderHoldState;
  waveProgressSeconds: number;
  prototypeSignals: LivePrototypeScenarioSignals;
  note: string;
}

export interface LiveInteractionDebugState {
  overall: ValidationBand;
  summary: {
    pass: number;
    nearMiss: number;
    fail: number;
  };
  coefficients: LiveCoefficients;
  prototypeSignals: LivePrototypeSignals;
  signalProvider: LivePrototypeSignalProviderDebugState;
  scenarios: LiveScenarioResult[];
}

export interface LiveInteractionCalibrationOperatorControls {
  resetCalibrationDigest(): void;
  captureCurrentCalibrationBaseline(): void;
  clearCalibrationBaseline(): void;
  freezeCurrentCalibrationPassReview(): void;
  clearFrozenCalibrationPassReview(): void;
  acknowledgeCalibrationLoopDisposition(
    disposition:
      | 'keep-existing-baseline'
      | 'observe-longer'
      | 'run-targeted-retune'
      | 'rerun-for-signal'
  ): void;
  clearCalibrationLoopClosureDecision(): void;
}

export interface LiveInteractionValidator {
  update(dt: number): void;
  getDebugState(): LiveInteractionDebugState;
  getCalibrationOperatorControls(): LiveInteractionCalibrationOperatorControls;
  destroy(): void;
}

const refreshIntervalSeconds = 0.25;
const simulationStepSeconds = 0.1;
const prototypeAdapter = createLivePrototypeAdapter();
const signalProvider = createLivePrototypeSignalProvider();

export const createLiveInteractionValidator = (): LiveInteractionValidator => {
  let elapsedSinceRefresh = 0;
  let debugState = computeDebugState();

  const refreshDebugState = (): void => {
    elapsedSinceRefresh = 0;
    debugState = computeDebugState();
  };

  const calibrationOperatorControls: LiveInteractionCalibrationOperatorControls = {
    resetCalibrationDigest() {
      signalProvider.resetCalibrationDigest();
      refreshDebugState();
    },
    captureCurrentCalibrationBaseline() {
      signalProvider.captureCurrentCalibrationBaseline();
      refreshDebugState();
    },
    clearCalibrationBaseline() {
      signalProvider.clearCalibrationBaseline();
      refreshDebugState();
    },
    freezeCurrentCalibrationPassReview() {
      signalProvider.freezeCurrentCalibrationPassReview('operator-handoff');
      refreshDebugState();
    },
    clearFrozenCalibrationPassReview() {
      signalProvider.clearFrozenCalibrationPassReview();
      refreshDebugState();
    },
    acknowledgeCalibrationLoopDisposition(disposition) {
      signalProvider.acknowledgeCalibrationLoopDisposition(disposition);
      refreshDebugState();
    },
    clearCalibrationLoopClosureDecision() {
      signalProvider.clearCalibrationLoopClosureDecision();
      refreshDebugState();
    }
  };

  return {
    update(dt) {
      elapsedSinceRefresh += dt;
      signalProvider.update(dt);
      if (elapsedSinceRefresh < refreshIntervalSeconds) {
        return;
      }
      elapsedSinceRefresh = 0;
      debugState = computeDebugState();
    },
    getDebugState() {
      return debugState;
    },
    getCalibrationOperatorControls() {
      return calibrationOperatorControls;
    },
    destroy() {
      // Validation-only numeric simulation; no runtime entities/listeners.
    }
  };
};

const computeDebugState = (): LiveInteractionDebugState => {
  const coefficients = buildLiveCoefficients();
  const prototypeSignals = signalProvider.getGlobalSignals();
  const scenarios = createScenarioDefs().map((scenario) =>
    simulateScenario(scenario, coefficients)
  );
  const twoWaveScenario = scenarios.find((scenario) => scenario.id === 'two-wave-live');
  if (twoWaveScenario) {
    signalProvider.recordScenarioOutcome({
      id: twoWaveScenario.id,
      resolution: twoWaveScenario.resolution,
      completionRatio: twoWaveScenario.completionRatio,
      remainingWindowSeconds: twoWaveScenario.remainingWindowSeconds
    });
  }

  const summary = scenarios.reduce(
    (acc, scenario) => {
      if (scenario.status === 'pass') {
        acc.pass += 1;
      } else if (scenario.status === 'near miss') {
        acc.nearMiss += 1;
      } else {
        acc.fail += 1;
      }
      return acc;
    },
    { pass: 0, nearMiss: 0, fail: 0 }
  );

  const overall: ValidationBand = summary.fail > 0
    ? 'fail'
    : summary.nearMiss > 0
      ? 'near miss'
      : 'pass';

  return {
    overall,
    summary,
    coefficients,
    prototypeSignals,
    signalProvider: signalProvider.getDebugState(),
    scenarios
  };
};

const buildLiveCoefficients = (): LiveCoefficients => ({
  waveAdvanceRate: 1.28,
  towerHoldResistance: 0.99,
  defenderReclearRate: 0.82,
  defenderDelayScalar: 1.0,
  pressureDecayRate: 0.72,
  twoWaveCarryover: 0.64,
  attackerPushPressureCoeff: layoutConfig.tempo.coefficients.attackerPushPressureCoeff,
  defenderBaseReclearCoeff: layoutConfig.tempo.coefficients.defenderReclearCoeff,
  waveHoldDurationSeconds: layoutConfig.tempo.coefficients.waveHoldDurationSeconds
});

const createScenarioDefs = (): LiveScenarioDef[] => {
  const moveSpeed = layoutConfig.player.moveSpeed;
  const outerToInnerSeconds =
    Math.abs(
      layoutConfig.nodes.redInnerTower.position.x -
        layoutConfig.nodes.redOuterTower.position.x
    ) / moveSpeed;
  const innerToCoreSeconds = routeSeconds('anti-inner-core-push-blue');
  const twoWaveSeconds = routeSeconds('anti-two-wave-closure-blue');
  const defenderReclearSeconds = routeSeconds('anti-defender-reclear-blue');
  const antiStallCommitSeconds = innerToCoreSeconds + twoWaveSeconds * 0.55;

  return [
    {
      id: 'outer-inner-live',
      label: 'Outer -> Inner Continuation',
      targetSeconds: outerToInnerSeconds * 1.02,
      waveCount: 1,
      towerResistance: 1.08,
      defenderDelaySeconds: 1.4,
      maxDurationSeconds: 13,
      desiredRemainingWindowSeconds: 0.9,
      pressureSegmentStart: 'outer-front',
      structureTier: 'inner'
    },
    {
      id: 'inner-core-live',
      label: 'Inner -> Core Continuation',
      targetSeconds: innerToCoreSeconds * 1.05,
      waveCount: 1,
      towerResistance: 1.12,
      defenderDelaySeconds: 1.1,
      maxDurationSeconds: 13,
      desiredRemainingWindowSeconds: 1,
      pressureSegmentStart: 'inner-siege',
      structureTier: 'core'
    },
    {
      id: 'two-wave-live',
      label: 'Two-Wave Closure',
      targetSeconds: twoWaveSeconds * 1.03,
      waveCount: 2,
      towerResistance: 1.16,
      defenderDelaySeconds: 0.9,
      maxDurationSeconds: 18,
      desiredRemainingWindowSeconds: 0.7,
      pressureSegmentStart: 'inner-siege',
      structureTier: 'core'
    },
    {
      id: 'defender-reclear-live',
      label: 'Defender Hold / Re-clear',
      targetSeconds: defenderReclearSeconds,
      waveCount: 1.2,
      towerResistance: 1.02,
      defenderDelaySeconds: 0.55,
      maxDurationSeconds: 11,
      desiredRemainingWindowSeconds: 0.35,
      pressureSegmentStart: 'core-approach',
      structureTier: 'core'
    },
    {
      id: 'anti-stall-live',
      label: 'Anti-Stall Closure Plausibility',
      targetSeconds: antiStallCommitSeconds,
      waveCount: 2.2,
      towerResistance: 1.2,
      defenderDelaySeconds: 0.9,
      maxDurationSeconds: 22,
      desiredRemainingWindowSeconds: 0.5,
      pressureSegmentStart: 'inner-siege',
      structureTier: 'core'
    }
  ];
};

const simulateScenario = (
  scenario: LiveScenarioDef,
  coefficients: LiveCoefficients
): LiveScenarioResult => {
  const calibrationScenario: GameplayCalibrationScenarioDef = {
    id: scenario.id,
    label: scenario.label,
    targetSeconds: scenario.targetSeconds,
    waveCount: scenario.waveCount,
    towerResistance: scenario.towerResistance,
    defenderDelaySeconds: scenario.defenderDelaySeconds,
    maxDurationSeconds: scenario.maxDurationSeconds,
    pressureSegmentStart: scenario.pressureSegmentStart,
    structureTier: scenario.structureTier
  };
  const runtimeSignals = signalProvider.getScenarioSignals({
    id: scenario.id,
    pressureSegmentStart: scenario.pressureSegmentStart,
    structureTier: scenario.structureTier,
    waveCount: scenario.waveCount
  });
  const { adaptation, simulation } = prototypeAdapter.createSimulation(
    calibrationScenario,
    coefficients,
    runtimeSignals
  );
  const outcome = simulation.runToEnd(simulationStepSeconds);

  const status = classifyScenarioStatus(
    outcome.resolution,
    outcome.completionRatio,
    outcome.remainingWindowSeconds,
    scenario.desiredRemainingWindowSeconds
  );

  return {
    id: scenario.id,
    label: scenario.label,
    status,
    resolution: outcome.resolution,
    completionRatio: outcome.completionRatio,
    elapsedSeconds: outcome.elapsedSeconds,
    targetSeconds: scenario.targetSeconds,
    remainingWindowSeconds: outcome.remainingWindowSeconds,
    lanePressureSegment: outcome.snapshot.lanePressure.segment,
    structureTier: outcome.snapshot.structurePressure.tier,
    defenderState: outcome.snapshot.defenderControl.state,
    waveProgressSeconds: outcome.snapshot.wavePresence.progressionSeconds,
    prototypeSignals: adaptation.scenarioSignals,
    note: buildResolutionNote(outcome.resolution)
  };
};

const classifyScenarioStatus = (
  resolution: LiveResolution,
  completionRatio: number,
  remainingWindowSeconds: number,
  desiredRemainingWindowSeconds: number
): ValidationBand => {
  if (resolution === 'attacker-window') {
    return remainingWindowSeconds >= desiredRemainingWindowSeconds ? 'pass' : 'near miss';
  }

  if (resolution === 'stalled') {
    return completionRatio >= 0.9 ? 'near miss' : 'fail';
  }

  return completionRatio >= 0.82 ? 'near miss' : 'fail';
};

const buildResolutionNote = (resolution: LiveResolution): string => {
  if (resolution === 'attacker-window') {
    return 'Attacker converts pressure window before defender neutralization.';
  }

  if (resolution === 'stalled') {
    return 'Window reaches contested stall band before clean closure.';
  }

  return 'Defender hold/re-clear neutralizes pressure before full conversion.';
};

const routeSeconds = (routeId: string): number => {
  const route = layoutConfig.routes.find((entry) => entry.id === routeId);
  if (!route) {
    throw new Error(`Missing route "${routeId}" for live interaction validation.`);
  }

  const distance = route.waypoints.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }
    const previous = route.waypoints[index - 1];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);

  return distance / layoutConfig.player.moveSpeed;
};
