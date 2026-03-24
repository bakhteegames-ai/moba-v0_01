import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import {
  type StructurePressureTierEventState
} from './structurePressureEventTracker';
import {
  type StructureResolutionTierState
} from './structureResolutionMemory';
import {
  type SharedSiegeWindowSnapshot
} from './sharedSiegeWindowConversion';
import { gameplayTuningConfig } from './gameplayTuningConfig';

type TierValues = Record<StructurePressureTier, number>;
type TierEvents = Record<StructurePressureTier, StructurePressureTierEventState>;
type TierResolutionStates = Record<StructurePressureTier, StructureResolutionTierState>;

export type SharedStructureConversionTriggerReason =
  | 'none'
  | 'progressing'
  | 'support-too-low'
  | 'window-expired'
  | 'structure-step-earned';

export type SharedStructureResolvedStep =
  | 'none'
  | 'outer-pressure-step-confirmed'
  | 'inner-pressure-step-confirmed'
  | 'core-pressure-step-confirmed';

export interface SharedStructureConversionSnapshot {
  conversionActive: boolean;
  conversionProgress: number;
  conversionThreshold: number;
  conversionEligible: boolean;
  sourceSegment: LanePressureSegment;
  sourceTier: StructurePressureTier;
  triggerReason: SharedStructureConversionTriggerReason;
  summary: string;
  lastResolvedStructureStep: SharedStructureResolvedStep;
}

export interface SharedStructureConversionStepInput {
  dt: number;
  previous: SharedStructureConversionSnapshot;
  sharedSiegeWindow: SharedSiegeWindowSnapshot;
  structurePressureByTier: TierValues;
  eventByTier: TierEvents;
  resolutionByTier: TierResolutionStates;
  progressSuppression?: number;
}

export const advanceSharedStructureConversionSnapshot = (
  input: SharedStructureConversionStepInput
): SharedStructureConversionSnapshot => {
  const tuning = gameplayTuningConfig.sharedStructureConversion;
  const dt = Math.max(0, input.dt);
  const sourceSegment = input.sharedSiegeWindow.sourceSegment;
  const sourceTier = input.sharedSiegeWindow.sourceTier;
  const tierEvent = input.eventByTier[sourceTier];
  const tierResolution = input.resolutionByTier[sourceTier];
  const structurePressure = clamp(input.structurePressureByTier[sourceTier], 0, 1);
  const supportSufficient =
    input.sharedSiegeWindow.pressureSupportLevel >=
      tuning.minimumPressureSupport &&
    input.sharedSiegeWindow.occupancySupportLevel >=
      tuning.minimumOccupancySupport;
  const threatStageEligible =
    tierResolution.threatStage === 'pressured' ||
    tierResolution.threatStage === 'softened' ||
    tierResolution.threatStage === 'escalating';
  const eventEligible =
    tierEvent.active?.qualifiedSiegeAttempt === true ||
    tierEvent.active?.boundedClosureState === 'bounded' ||
    tierEvent.active?.boundedClosureState === 'forming';
  const progressSuppression = clamp(
    input.progressSuppression ?? 0,
    tuning.progressSuppressionClamp.min,
    tuning.progressSuppressionClamp.max
  );
  const conversionEligible =
    input.sharedSiegeWindow.siegeWindowActive &&
    supportSufficient &&
    (structurePressure >= tuning.minimumStructurePressure ||
      eventEligible ||
      threatStageEligible);

  if (
    input.previous.sourceTier === sourceTier &&
    input.previous.conversionProgress >= tuning.progressThreshold &&
    input.previous.lastResolvedStructureStep !== 'none'
  ) {
    if (input.sharedSiegeWindow.siegeWindowActive) {
      return buildSnapshot(
        false,
        tuning.progressThreshold,
        conversionEligible,
        sourceSegment,
        sourceTier,
        'structure-step-earned',
        `${formatTier(sourceTier)} pressure step confirmed from the combat-earned siege window.`,
        input.previous.lastResolvedStructureStep
      );
    }

    const decayedResolvedProgress = decayProgress(
      input.previous.conversionProgress,
      dt
    );
    return buildSnapshot(
      false,
      decayedResolvedProgress,
      false,
      sourceSegment,
      sourceTier,
      input.sharedSiegeWindow.siegeWindowActive
        ? 'support-too-low'
        : 'window-expired',
      decayedResolvedProgress > 0
        ? `${formatTier(sourceTier)} structure-step momentum is decaying after the siege window closed.`
        : `${formatTier(sourceTier)} pressure step remains the last resolved structure conversion.`,
      input.previous.lastResolvedStructureStep
    );
  }

  if (conversionEligible) {
    const gainRate = clamp(
      tuning.gainRateBase +
        input.sharedSiegeWindow.pressureSupportLevel *
          tuning.gainRatePressureSupportMultiplier +
        input.sharedSiegeWindow.occupancySupportLevel *
          tuning.gainRateOccupancySupportMultiplier +
        structurePressure * tuning.gainRateStructurePressureMultiplier +
        (eventEligible ? tuning.gainRateEventEligibleBonus : 0) -
        progressSuppression,
      tuning.gainRateClamp.min,
      tuning.gainRateClamp.max
    );
    const progressedValue = clamp(
      input.previous.conversionProgress + dt * gainRate,
      0,
      tuning.progressThreshold
    );

    if (
      input.previous.conversionProgress < tuning.progressThreshold &&
      progressedValue >= tuning.progressThreshold
    ) {
      return buildSnapshot(
        false,
        tuning.progressThreshold,
        true,
        sourceSegment,
        sourceTier,
        'structure-step-earned',
        `${formatTier(sourceTier)} pressure step confirmed from the combat-earned siege window.`,
        resolveStepByTier(sourceTier)
      );
    }

    return buildSnapshot(
      true,
      progressedValue,
      true,
      sourceSegment,
      sourceTier,
      'progressing',
      `Combat-earned siege pressure is converting into a bounded ${formatTier(sourceTier)} structure step.`,
      input.previous.lastResolvedStructureStep
    );
  }

  const decayedProgress = decayProgress(input.previous.conversionProgress, dt);
  const triggerReason: SharedStructureConversionTriggerReason =
    input.sharedSiegeWindow.siegeWindowActive ? 'support-too-low' : 'window-expired';

  return buildSnapshot(
      false,
      decayedProgress,
      false,
    sourceSegment,
    sourceTier,
    decayedProgress > 0 || input.previous.lastResolvedStructureStep !== 'none'
      ? triggerReason
      : 'none',
    decayedProgress > 0
      ? `Bounded ${formatTier(sourceTier)} structure conversion progress is decaying.`
      : input.sharedSiegeWindow.siegeWindowActive
        ? `${formatTier(sourceTier)} siege support is still too weak for bounded structure conversion.`
        : input.previous.lastResolvedStructureStep !== 'none'
          ? `${formatTier(sourceTier)} pressure step remains the last resolved structure conversion.`
          : 'No bounded structure conversion step is active.',
    input.previous.lastResolvedStructureStep
  );
};

export const createDefaultSharedStructureConversionSnapshot =
  (): SharedStructureConversionSnapshot =>
    buildSnapshot(
      false,
      0,
      false,
      'outer-front',
      'outer',
      'none',
      'No bounded structure conversion step is active.',
      'none'
    );

export const cloneSharedStructureConversionSnapshot = (
  snapshot: SharedStructureConversionSnapshot
): SharedStructureConversionSnapshot => ({
  conversionActive: snapshot.conversionActive,
  conversionProgress: snapshot.conversionProgress,
  conversionThreshold: snapshot.conversionThreshold,
  conversionEligible: snapshot.conversionEligible,
  sourceSegment: snapshot.sourceSegment,
  sourceTier: snapshot.sourceTier,
  triggerReason: snapshot.triggerReason,
  summary: snapshot.summary,
  lastResolvedStructureStep: snapshot.lastResolvedStructureStep
});

const buildSnapshot = (
  conversionActive: boolean,
  conversionProgress: number,
  conversionEligible: boolean,
  sourceSegment: LanePressureSegment,
  sourceTier: StructurePressureTier,
  triggerReason: SharedStructureConversionTriggerReason,
  summary: string,
  lastResolvedStructureStep: SharedStructureResolvedStep
): SharedStructureConversionSnapshot => {
  const tuning = gameplayTuningConfig.sharedStructureConversion;

  return {
    conversionActive,
    conversionProgress: clamp(conversionProgress, 0, tuning.progressThreshold),
    conversionThreshold: tuning.progressThreshold,
    conversionEligible,
    sourceSegment,
    sourceTier,
    triggerReason,
    summary,
    lastResolvedStructureStep
  };
};

const resolveStepByTier = (
  tier: StructurePressureTier
): SharedStructureResolvedStep =>
  tier === 'outer'
    ? 'outer-pressure-step-confirmed'
    : tier === 'inner'
      ? 'inner-pressure-step-confirmed'
      : 'core-pressure-step-confirmed';

const decayProgress = (progress: number, dt: number): number =>
  clamp(
    progress -
      dt *
        (gameplayTuningConfig.sharedStructureConversion.decayBasePerSecond +
          progress *
            gameplayTuningConfig.sharedStructureConversion
              .decayProgressMultiplier),
    0,
    gameplayTuningConfig.sharedStructureConversion.progressThreshold
  );

const formatTier = (tier: StructurePressureTier): string =>
  tier === 'outer'
    ? 'Outer'
    : tier === 'inner'
      ? 'Inner'
      : 'Core';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
