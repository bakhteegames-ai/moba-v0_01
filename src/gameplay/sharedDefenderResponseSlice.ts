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
const contestPulseDurationSeconds = 1.35;
const contestPulseCooldownSeconds = 3.6;
const minimumClosureThreat = 0.44;
const minimumAntiStallAcceleration = 0.32;
const minimumConversionPressure = 0.08;

export const advanceSharedDefenderResponseSnapshot = (
  input: SharedDefenderResponseInput
): SharedDefenderResponseSnapshot => {
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
      input.structureConversion.conversionProgress >= minimumConversionPressure) &&
    (input.laneClosure.closureThreatLevel >= minimumClosureThreat ||
      input.laneClosure.antiStallAccelerationLevel >=
        minimumAntiStallAcceleration);

  if (input.previous.responseActive && remainingSeconds > 0) {
    const intensity = clamp(
      remainingSeconds / contestPulseDurationSeconds,
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
      0.07 + intensity * 0.05,
      0.16 + intensity * 0.08,
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
      contestPulseCooldownSeconds,
      contestPulseDurationSeconds,
      sourceSegment,
      sourceTier,
      0.12,
      0.24,
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
): SharedDefenderResponseSnapshot => ({
  defenderId: snapshot.defenderId,
  responseActive: snapshot.responseActive,
  responseEligible: snapshot.responseEligible,
  actionKind: snapshot.actionKind,
  responseCooldownRemaining: snapshot.responseCooldownRemaining,
  responseRemainingSeconds: snapshot.responseRemainingSeconds,
  sourceSegment: snapshot.sourceSegment,
  sourceTier: snapshot.sourceTier,
  structureConversionSuppression: snapshot.structureConversionSuppression,
  closureAdvancementSuppression: snapshot.closureAdvancementSuppression,
  lastResolvedResponseAction: snapshot.lastResolvedResponseAction,
  triggerReason: snapshot.triggerReason,
  summary: snapshot.summary
});

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
  structureConversionSuppression: clamp(structureConversionSuppression, 0, 0.2),
  closureAdvancementSuppression: clamp(closureAdvancementSuppression, 0, 0.3),
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
        structureConversion.conversionProgress >= minimumConversionPressure
      ? 'Red-side defender is holding the contest pulse until the trigger rule is satisfied.'
      : 'Red-side defender is waiting for blue structure conversion to become contestable.';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
