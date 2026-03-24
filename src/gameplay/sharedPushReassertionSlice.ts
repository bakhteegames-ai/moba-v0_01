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
import {
  type SharedDefenderResponseSnapshot
} from './sharedDefenderResponseSlice';
import { gameplayTuningConfig } from './gameplayTuningConfig';

export type SharedPushReassertionAction =
  | 'none'
  | 'push-reassertion-pulse-fired';

export type SharedPushReassertionTriggerReason =
  | 'none'
  | 'waiting-for-contest'
  | 'waiting-for-support'
  | 'cooldown'
  | 'push-reassertion-pulse-fired'
  | 'effect-expired';

export interface SharedPushReassertionSnapshot {
  responderId: string;
  recoveryActive: boolean;
  recoveryEligible: boolean;
  actionKind: SharedPushReassertionAction;
  recoveryCooldownRemaining: number;
  recoveryRemainingSeconds: number;
  sourceSegment: LanePressureSegment;
  sourceTier: StructurePressureTier;
  structureSuppressionRecovery: number;
  closureSuppressionRecovery: number;
  lastResolvedRecoveryAction: SharedPushReassertionAction;
  triggerReason: SharedPushReassertionTriggerReason;
  summary: string;
}

export interface SharedPushReassertionInput {
  dt: number;
  previous: SharedPushReassertionSnapshot;
  sharedSiegeWindow: SharedSiegeWindowSnapshot;
  structureConversion: SharedStructureConversionSnapshot;
  defenderResponse: SharedDefenderResponseSnapshot;
  laneClosure: LaneClosurePostureSnapshot;
}

const responderId = 'blue-push-reassertion-proxy';
export const advanceSharedPushReassertionSnapshot = (
  input: SharedPushReassertionInput
): SharedPushReassertionSnapshot => {
  const tuning = gameplayTuningConfig.sharedPushReassertion;
  const dt = Math.max(0, input.dt);
  const sourceSegment = input.sharedSiegeWindow.sourceSegment;
  const sourceTier = input.sharedSiegeWindow.sourceTier;
  const cooldownRemaining = Math.max(
    0,
    input.previous.recoveryCooldownRemaining - dt
  );
  const remainingSeconds = Math.max(
    0,
    input.previous.recoveryRemainingSeconds - dt
  );
  const recoveryEligible =
    input.defenderResponse.responseActive &&
    input.sharedSiegeWindow.siegeWindowActive &&
    (input.structureConversion.conversionActive ||
      input.structureConversion.conversionEligible ||
      input.structureConversion.conversionProgress >=
        tuning.minimumContestableProgress ||
      input.laneClosure.structuralCarryoverLevel >=
        tuning.minimumStructuralCarryover) &&
    (input.sharedSiegeWindow.pressureSupportLevel >=
      tuning.minimumPressureSupport ||
      input.sharedSiegeWindow.occupancySupportLevel >=
        tuning.minimumOccupancySupport);

  if (input.previous.recoveryActive && remainingSeconds > 0) {
    const intensity = clamp(
      remainingSeconds / tuning.pulseDurationSeconds,
      0,
      1
    );
    return buildSnapshot(
      true,
      recoveryEligible,
      'push-reassertion-pulse-fired',
      cooldownRemaining,
      remainingSeconds,
      sourceSegment,
      sourceTier,
      tuning.activeStructureRecoveryBase +
        intensity * tuning.activeStructureRecoveryIntensity,
      tuning.activeClosureRecoveryBase +
        intensity * tuning.activeClosureRecoveryIntensity,
      input.previous.lastResolvedRecoveryAction,
      'push-reassertion-pulse-fired',
      'Blue-side push reassertion pulse is partially recovering the contested window.'
    );
  }

  if (input.previous.recoveryActive && remainingSeconds <= 0) {
    return buildSnapshot(
      false,
      recoveryEligible,
      'none',
      cooldownRemaining,
      0,
      sourceSegment,
      sourceTier,
      0,
      0,
      input.previous.lastResolvedRecoveryAction,
      'effect-expired',
      'Blue-side push reassertion pulse expired and the recovery window closed.'
    );
  }

  if (cooldownRemaining > 0) {
    return buildSnapshot(
      false,
      recoveryEligible,
      'none',
      cooldownRemaining,
      0,
      sourceSegment,
      sourceTier,
      0,
      0,
      input.previous.lastResolvedRecoveryAction,
      recoveryEligible ? 'cooldown' : deriveWaitingReason(input),
      recoveryEligible
        ? 'Blue-side push reassertion is eligible but still recharging.'
        : buildWaitingSummary(input)
    );
  }

  if (recoveryEligible) {
    return buildSnapshot(
      true,
      true,
      'push-reassertion-pulse-fired',
      tuning.pulseCooldownSeconds,
      tuning.pulseDurationSeconds,
      sourceSegment,
      sourceTier,
      tuning.firedStructureRecovery,
      tuning.firedClosureRecovery,
      'push-reassertion-pulse-fired',
      'push-reassertion-pulse-fired',
      'Blue-side push reassertion pulse answered the defender contest.'
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
    input.previous.lastResolvedRecoveryAction,
    deriveWaitingReason(input),
    buildWaitingSummary(input)
  );
};

export const createDefaultSharedPushReassertionSnapshot =
  (): SharedPushReassertionSnapshot =>
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
      'Blue-side push reassertion is idle.'
    );

export const cloneSharedPushReassertionSnapshot = (
  snapshot: SharedPushReassertionSnapshot
): SharedPushReassertionSnapshot => ({
  responderId: snapshot.responderId,
  recoveryActive: snapshot.recoveryActive,
  recoveryEligible: snapshot.recoveryEligible,
  actionKind: snapshot.actionKind,
  recoveryCooldownRemaining: snapshot.recoveryCooldownRemaining,
  recoveryRemainingSeconds: snapshot.recoveryRemainingSeconds,
  sourceSegment: snapshot.sourceSegment,
  sourceTier: snapshot.sourceTier,
  structureSuppressionRecovery: snapshot.structureSuppressionRecovery,
  closureSuppressionRecovery: snapshot.closureSuppressionRecovery,
  lastResolvedRecoveryAction: snapshot.lastResolvedRecoveryAction,
  triggerReason: snapshot.triggerReason,
  summary: snapshot.summary
});

const buildSnapshot = (
  recoveryActive: boolean,
  recoveryEligible: boolean,
  actionKind: SharedPushReassertionAction,
  recoveryCooldownRemaining: number,
  recoveryRemainingSeconds: number,
  sourceSegment: LanePressureSegment,
  sourceTier: StructurePressureTier,
  structureSuppressionRecovery: number,
  closureSuppressionRecovery: number,
  lastResolvedRecoveryAction: SharedPushReassertionAction,
  triggerReason: SharedPushReassertionTriggerReason,
  summary: string
): SharedPushReassertionSnapshot => ({
  responderId,
  recoveryActive,
  recoveryEligible,
  actionKind,
  recoveryCooldownRemaining: Math.max(0, recoveryCooldownRemaining),
  recoveryRemainingSeconds: Math.max(0, recoveryRemainingSeconds),
  sourceSegment,
  sourceTier,
  structureSuppressionRecovery: clamp(
    structureSuppressionRecovery,
    gameplayTuningConfig.sharedPushReassertion
      .structureSuppressionRecoveryClamp.min,
    gameplayTuningConfig.sharedPushReassertion
      .structureSuppressionRecoveryClamp.max
  ),
  closureSuppressionRecovery: clamp(
    closureSuppressionRecovery,
    gameplayTuningConfig.sharedPushReassertion
      .closureSuppressionRecoveryClamp.min,
    gameplayTuningConfig.sharedPushReassertion
      .closureSuppressionRecoveryClamp.max
  ),
  lastResolvedRecoveryAction,
  triggerReason,
  summary
});

const deriveWaitingReason = (
  input: SharedPushReassertionInput
): SharedPushReassertionTriggerReason =>
  input.defenderResponse.responseActive ? 'waiting-for-support' : 'waiting-for-contest';

const buildWaitingSummary = (
  input: SharedPushReassertionInput
): string =>
  !input.defenderResponse.responseActive
    ? 'Blue-side push reassertion is waiting for a live defender contest pulse.'
    : 'Blue-side push reassertion is waiting for enough remaining push support to answer the contest.';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
