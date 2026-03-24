import {
  type HeadlessBridgeLaneConsequenceSnapshot
} from './headlessBridgeConsequenceAdapter';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';

type SegmentValues = Record<LanePressureSegment, number>;
type TierValues = Record<StructurePressureTier, number>;

export type SharedSiegeWindowTriggerReason =
  | 'none'
  | 'combat-earned-window'
  | 'support-too-low'
  | 'opportunity-expired';

export interface SharedSiegeWindowSnapshot {
  siegeWindowActive: boolean;
  siegeWindowRemainingSeconds: number;
  sourceSegment: LanePressureSegment;
  sourceTier: StructurePressureTier;
  triggerReason: SharedSiegeWindowTriggerReason;
  pressureSupportLevel: number;
  occupancySupportLevel: number;
  summary: string;
}

export interface SharedSiegeWindowConversionInput {
  sharedLaneConsequence: HeadlessBridgeLaneConsequenceSnapshot;
  lanePressureBySegment: SegmentValues;
  structurePressureByTier: TierValues;
  segmentOccupancyPresence: SegmentValues;
}

const minimumPressureSupport = 0.44;
const minimumOccupancySupport = 0.18;

export const deriveSharedSiegeWindowSnapshot = (
  input: SharedSiegeWindowConversionInput
): SharedSiegeWindowSnapshot => {
  const sourceSegment = input.sharedLaneConsequence.affectedSegment;
  const sourceTier = input.sharedLaneConsequence.affectedTier;
  const pressureSupportLevel = clamp(
    input.sharedLaneConsequence.pressureDelta * 0.6 +
      input.lanePressureBySegment[sourceSegment] * 0.28 +
      input.structurePressureByTier[sourceTier] * 0.12,
    0,
    1
  );
  const occupancySupportLevel = clamp(
    input.sharedLaneConsequence.occupancyAdvantage * 0.58 +
      input.segmentOccupancyPresence[sourceSegment] * 0.42,
    0,
    1
  );
  const supportSufficient =
    pressureSupportLevel >= minimumPressureSupport &&
    occupancySupportLevel >= minimumOccupancySupport;

  if (
    input.sharedLaneConsequence.opportunityActive &&
    supportSufficient
  ) {
    return {
      siegeWindowActive: true,
      siegeWindowRemainingSeconds: Math.min(
        input.sharedLaneConsequence.opportunityRemainingSeconds,
        clamp(
          1.65 +
            pressureSupportLevel * 1.55 +
            occupancySupportLevel * 0.95,
          1.8,
          4.25
        )
      ),
      sourceSegment,
      sourceTier,
      triggerReason: 'combat-earned-window',
      pressureSupportLevel,
      occupancySupportLevel,
      summary: `Combat-earned siege window open at ${formatSegment(
        sourceSegment
      )} / ${formatTier(sourceTier)}.`
    };
  }

  const triggerReason: SharedSiegeWindowTriggerReason =
    input.sharedLaneConsequence.opportunityActive
      ? 'support-too-low'
      : input.sharedLaneConsequence.lastBridgeOutcomeKind ===
          'lane-blocker-cleared' ||
        input.sharedLaneConsequence.lastBridgeOutcomeKind === 'cast-rejected' ||
        input.sharedLaneConsequence.lastBridgeOutcomeKind ===
          'lane-blocker-damaged'
        ? 'opportunity-expired'
        : 'none';

  return {
    siegeWindowActive: false,
    siegeWindowRemainingSeconds: 0,
    sourceSegment,
    sourceTier,
    triggerReason,
    pressureSupportLevel,
    occupancySupportLevel,
    summary:
      triggerReason === 'support-too-low'
        ? `Combat advantage present, but ${formatSegment(
            sourceSegment
          )} support is still too weak for an explicit siege window.`
        : triggerReason === 'opportunity-expired'
          ? `Combat-earned siege window at ${formatSegment(
              sourceSegment
            )} / ${formatTier(sourceTier)} has expired.`
          : 'No combat-earned siege window yet.'
  };
};

export const createDefaultSharedSiegeWindowSnapshot =
  (): SharedSiegeWindowSnapshot => ({
    siegeWindowActive: false,
    siegeWindowRemainingSeconds: 0,
    sourceSegment: 'outer-front',
    sourceTier: 'outer',
    triggerReason: 'none',
    pressureSupportLevel: 0,
    occupancySupportLevel: 0,
    summary: 'No combat-earned siege window yet.'
  });

export const cloneSharedSiegeWindowSnapshot = (
  snapshot: SharedSiegeWindowSnapshot
): SharedSiegeWindowSnapshot => ({
  siegeWindowActive: snapshot.siegeWindowActive,
  siegeWindowRemainingSeconds: snapshot.siegeWindowRemainingSeconds,
  sourceSegment: snapshot.sourceSegment,
  sourceTier: snapshot.sourceTier,
  triggerReason: snapshot.triggerReason,
  pressureSupportLevel: snapshot.pressureSupportLevel,
  occupancySupportLevel: snapshot.occupancySupportLevel,
  summary: snapshot.summary
});

const formatSegment = (segment: LanePressureSegment): string =>
  segment === 'outer-front'
    ? 'outer-front'
    : segment === 'inner-siege'
      ? 'inner-siege'
      : 'core-approach';

const formatTier = (tier: StructurePressureTier): string =>
  tier === 'outer'
    ? 'outer'
    : tier === 'inner'
      ? 'inner'
      : 'core';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
