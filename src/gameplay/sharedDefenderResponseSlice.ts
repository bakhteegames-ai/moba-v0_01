import {
  clamp,
  cloneSnapshot
} from './calibrationUtils';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import {
  type LaneClosurePostureSnapshot
} from './laneClosurePosture';
import {
  type SharedSiegeWindowSnapshot
} from './sharedSiegeWindowConversion';
import {
  type SharedStructureConversionSnapshot
} from './sharedStructureConversionStep';
import { gameplayTuningConfig } from './gameplayTuningConfig';

export type SharedDefenderResponseAction =
  | 'none'
  | 'contest-pulse-fired';

export type SharedDefenderResponseTriggerReason =
  | 'none'
  | 'waiting-for-window'
  | 'waiting-for-conversion'
  | 'cooldown'
  | 'contest-pulse-fired'
  | 'effect-expired';

export interface SharedDefenderResponseSnapshot {
  defenderId: string;
  responseActive: boolean;
  responseEligible: boolean;
  actionKind: SharedDefenderResponseAction;
  responseCooldownRemaining: number;
  responseRemainingSeconds: number;
  sourceSegment: LanePressureSegment;
  sourceTier: StructurePressureTier;
  structureConversionSuppression: number;
  closureAdvancementSuppression: number;
  lastResolvedResponseAction: SharedDefenderResponseAction;
  triggerReason: SharedDefenderResponseTriggerReason;
  summary: string;
}

export interface SharedDefenderResponseInput {
  dt: number;
  previous: SharedDefenderResponseSnapshot;
  sharedSiegeWindow: SharedSiegeWindowSnapshot;
  structureConversion: SharedStructureConversionSnapshot;
  laneClosure: LaneClosurePostureSnapshot;
}

const defenderId = 'red-outer-contest-proxy';
export const advanceSharedDefenderResponseSnapshot = (
  input: SharedDefenderResponseInput
): SharedDefenderResponseSnapshot => {
  const tuning = gameplayTuningConfig.sharedDefenderResponse;
  const dt = Math.max(0, input.dt);
  const sourceSegment = input.sharedSiegeWindow.sourceSegment;
  const sourceTier = input.sharedSiegeWindow.sourceTier;
  const cooldownRemaining = Math.max(
    0,
    input.previous.responseCooldownRemaining - dt
  );
  const remainingSeconds = Math.max(
    0,
    input.previous.responseRemainingSeconds - dt
  );
  const responseEligible =
    input.sharedSiegeWindow.siegeWindowActive &&
    (input.structureConversion.conversionActive ||
      input.structureConversion.lastResolvedStructureStep !== 'none' ||
      input.structureConversion.conversionProgress >=
        tuning.minimumConversionPressure) &&
    (input.laneClosure.closureThreatLevel >= tuning.minimumClosureThreat ||
      input.laneClosure.antiStallAccelerationLevel >=
        tuning.minimumAntiStallAcceleration);

  if (input.previous.responseActive && remainingSeconds > 0) {
    const intensity = clamp(
      remainingSeconds / tuning.contestPulseDurationSeconds,
      0,
      1
    );
    return buildSnapshot(
      true,
      responseEligible,
      'contest-pulse-fired',
      cooldownRemaining,
      remainingSeconds,
      sourceSegment,
      sourceTier,
      tuning.activeStructureSuppressionBase +
        intensity * tuning.activeStructureSuppressionIntensity,
      tuning.activeClosureSuppressionBase +
        intensity * tuning.activeClosureSuppressionIntensity,
      input.previous.lastResolvedResponseAction,
      'contest-pulse-fired',
      'Red-side defender contest pulse is actively suppressing the blue push.'
    );
  }

  if (input.previous.responseActive && remainingSeconds <= 0) {
    return buildSnapshot(
      false,
      responseEligible,
      'none',
      cooldownRemaining,
      0,
      sourceSegment,
      sourceTier,
      0,
      0,
      input.previous.lastResolvedResponseAction,
      'effect-expired',
      'Red-side contest pulse expired and the suppression window closed.'
    );
  }

  if (cooldownRemaining > 0) {
    return buildSnapshot(
      false,
      responseEligible,
      'none',
      cooldownRemaining,
      0,
      sourceSegment,
      sourceTier,
      0,
      0,
      input.previous.lastResolvedResponseAction,
      responseEligible ? 'cooldown' : deriveWaitingReason(input.sharedSiegeWindow),
      responseEligible
        ? 'Red-side defender is eligible but still recharging the contest pulse.'
        : buildWaitingSummary(input.sharedSiegeWindow, input.structureConversion)
    );
  }

  if (responseEligible) {
    return buildSnapshot(
      true,
      true,
      'contest-pulse-fired',
      tuning.contestPulseCooldownSeconds,
      tuning.contestPulseDurationSeconds,
      sourceSegment,
      sourceTier,
      tuning.firedStructureSuppression,
      tuning.firedClosureSuppression,
      'contest-pulse-fired',
      'contest-pulse-fired',
      'Red-side defender fired a contest pulse into the active blue-side push.'
    );
  }

  return buildSnapshot(
    false,
    false,
    'none',
    cooldownRemaining,
    0,
    sourceSegment,
    sourceTier,
    0,
    0,
    input.previous.lastResolvedResponseAction,
    deriveWaitingReason(input.sharedSiegeWindow),
    buildWaitingSummary(input.sharedSiegeWindow, input.structureConversion)
  );
};

export const createDefaultSharedDefenderResponseSnapshot =
  (): SharedDefenderResponseSnapshot =>
    buildSnapshot(
      false,
      false,
      'none',
      0,
      0,
      'outer-front',
      'outer',
      0,
      0,
      'none',
      'none',
      'Red-side defender contest proxy is idle.'
    );

export const cloneSharedDefenderResponseSnapshot = (
  snapshot: SharedDefenderResponseSnapshot
): SharedDefenderResponseSnapshot => cloneSnapshot(snapshot);

const buildSnapshot = (
  responseActive: boolean,
  responseEligible: boolean,
  actionKind: SharedDefenderResponseAction,
  responseCooldownRemaining: number,
  responseRemainingSeconds: number,
  sourceSegment: LanePressureSegment,
  sourceTier: StructurePressureTier,
  structureConversionSuppression: number,
  closureAdvancementSuppression: number,
  lastResolvedResponseAction: SharedDefenderResponseAction,
  triggerReason: SharedDefenderResponseTriggerReason,
  summary: string
): SharedDefenderResponseSnapshot => ({
  defenderId,
  responseActive,
  responseEligible,
  actionKind,
  responseCooldownRemaining: Math.max(0, responseCooldownRemaining),
  responseRemainingSeconds: Math.max(0, responseRemainingSeconds),
  sourceSegment,
  sourceTier,
  structureConversionSuppression: clamp(
    structureConversionSuppression,
    gameplayTuningConfig.sharedDefenderResponse
      .structureConversionSuppressionClamp.min,
    gameplayTuningConfig.sharedDefenderResponse
      .structureConversionSuppressionClamp.max
  ),
  closureAdvancementSuppression: clamp(
    closureAdvancementSuppression,
    gameplayTuningConfig.sharedDefenderResponse
      .closureAdvancementSuppressionClamp.min,
    gameplayTuningConfig.sharedDefenderResponse
      .closureAdvancementSuppressionClamp.max
  ),
  lastResolvedResponseAction,
  triggerReason,
  summary
});

const deriveWaitingReason = (
  sharedSiegeWindow: SharedSiegeWindowSnapshot
): SharedDefenderResponseTriggerReason =>
  sharedSiegeWindow.siegeWindowActive ? 'waiting-for-conversion' : 'waiting-for-window';

const buildWaitingSummary = (
  sharedSiegeWindow: SharedSiegeWindowSnapshot,
  structureConversion: SharedStructureConversionSnapshot
): string =>
  !sharedSiegeWindow.siegeWindowActive
    ? 'Red-side defender is waiting for a blue siege window to contest.'
    : structureConversion.conversionActive ||
        structureConversion.lastResolvedStructureStep !== 'none' ||
        structureConversion.conversionProgress >=
          gameplayTuningConfig.sharedDefenderResponse.minimumConversionPressure
      ? 'Red-side defender is holding the contest pulse until the trigger rule is satisfied.'
      : 'Red-side defender is waiting for blue structure conversion to become contestable.';
