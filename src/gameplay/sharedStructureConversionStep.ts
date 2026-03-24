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

const conversionThreshold = 0.26;
const minimumPressureSupport = 0.5;
const minimumOccupancySupport = 0.24;
const minimumStructurePressure = 0.46;

export const advanceSharedStructureConversionSnapshot = (
  input: SharedStructureConversionStepInput
): SharedStructureConversionSnapshot => {
  const dt = Math.max(0, input.dt);
  const sourceSegment = input.sharedSiegeWindow.sourceSegment;
  const sourceTier = input.sharedSiegeWindow.sourceTier;
  const tierEvent = input.eventByTier[sourceTier];
  const tierResolution = input.resolutionByTier[sourceTier];
  const structurePressure = clamp(input.structurePressureByTier[sourceTier], 0, 1);
  const supportSufficient =
    input.sharedSiegeWindow.pressureSupportLevel >= minimumPressureSupport &&
    input.sharedSiegeWindow.occupancySupportLevel >= minimumOccupancySupport;
  const threatStageEligible =
    tierResolution.threatStage === 'pressured' ||
    tierResolution.threatStage === 'softened' ||
    tierResolution.threatStage === 'escalating';
  const eventEligible =
    tierEvent.active?.qualifiedSiegeAttempt === true ||
    tierEvent.active?.boundedClosureState === 'bounded' ||
    tierEvent.active?.boundedClosureState === 'forming';
  const progressSuppression = clamp(input.progressSuppression ?? 0, 0, 0.2);
  const conversionEligible =
    input.sharedSiegeWindow.siegeWindowActive &&
    supportSufficient &&
    (structurePressure >= minimumStructurePressure ||
      eventEligible ||
      threatStageEligible);

  if (
    input.previous.sourceTier === sourceTier &&
    input.previous.conversionProgress >= conversionThreshold &&
    input.previous.lastResolvedStructureStep !== 'none'
  ) {
    if (input.sharedSiegeWindow.siegeWindowActive) {
      return buildSnapshot(
        false,
        conversionThreshold,
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
      0.14 +
        input.sharedSiegeWindow.pressureSupportLevel * 0.11 +
        input.sharedSiegeWindow.occupancySupportLevel * 0.08 +
        structurePressure * 0.06 +
        (eventEligible ? 0.05 : 0) -
        progressSuppression,
      0.04,
      0.38
    );
    const progressedValue = clamp(
      input.previous.conversionProgress + dt * gainRate,
      0,
      conversionThreshold
    );

    if (
      input.previous.conversionProgress < conversionThreshold &&
      progressedValue >= conversionThreshold
    ) {
      return buildSnapshot(
        false,
        conversionThreshold,
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
): SharedStructureConversionSnapshot => ({
  conversionActive,
  conversionProgress: clamp(conversionProgress, 0, conversionThreshold),
  conversionThreshold,
  conversionEligible,
  sourceSegment,
  sourceTier,
  triggerReason,
  summary,
  lastResolvedStructureStep
});

const resolveStepByTier = (
  tier: StructurePressureTier
): SharedStructureResolvedStep =>
  tier === 'outer'
    ? 'outer-pressure-step-confirmed'
    : tier === 'inner'
      ? 'inner-pressure-step-confirmed'
      : 'core-pressure-step-confirmed';

const decayProgress = (progress: number, dt: number): number =>
  clamp(progress - dt * (0.38 + progress * 0.18), 0, conversionThreshold);

const formatTier = (tier: StructurePressureTier): string =>
  tier === 'outer'
    ? 'Outer'
    : tier === 'inner'
      ? 'Inner'
      : 'Core';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
