import {
  type HeadlessCombatLaneBridgeSnapshot,
  type HeadlessCombatLaneEventKind
} from '../combat/headlessCombatLaneBridge';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';

type SegmentValues = Record<LanePressureSegment, number>;
type TierValues = Record<StructurePressureTier, number>;

export interface HeadlessBridgeLaneConsequenceSnapshot {
  pressureDelta: number;
  occupancyAdvantage: number;
  opportunityActive: boolean;
  opportunityRemainingSeconds: number;
  affectedSegment: LanePressureSegment;
  affectedTier: StructurePressureTier;
  lastBridgeOutcomeKind: HeadlessCombatLaneEventKind;
  lastBridgeOutcomeSummary: string;
}

export interface HeadlessBridgeLaneModifierSnapshot {
  lanePressureBySegment: SegmentValues;
  occupancyBySegment: SegmentValues;
  structurePressureByTier: TierValues;
}

export const adaptHeadlessCombatLaneBridgeToLaneConsequence = (
  bridge: HeadlessCombatLaneBridgeSnapshot
): HeadlessBridgeLaneConsequenceSnapshot => ({
  pressureDelta: clamp(bridge.lanePressureDelta, 0, 1),
  occupancyAdvantage: clamp(bridge.occupancyAdvantage, 0, 1),
  opportunityActive: bridge.structurePressureOpportunityActive,
  opportunityRemainingSeconds: Math.max(
    0,
    bridge.opportunityWindowRemainingSeconds
  ),
  affectedSegment:
    bridge.lastBridgeOutcome.kind !== 'none'
      ? bridge.lastBridgeOutcome.lanePressureSegment
      : bridge.blocker.lanePressureSegment,
  affectedTier:
    bridge.lastBridgeOutcome.kind !== 'none'
      ? bridge.lastBridgeOutcome.structurePressureTier
      : bridge.blocker.structurePressureTier,
  lastBridgeOutcomeKind: bridge.lastBridgeOutcome.kind,
  lastBridgeOutcomeSummary: bridge.lastBridgeOutcome.summary
});

export const buildHeadlessBridgeLaneModifier = (
  consequence: HeadlessBridgeLaneConsequenceSnapshot
): HeadlessBridgeLaneModifierSnapshot => {
  const lanePressureBySegment = createZeroSegmentValues();
  const occupancyBySegment = createZeroSegmentValues();
  const structurePressureByTier = createZeroTierValues();

  if (
    consequence.pressureDelta <= 0 &&
    consequence.occupancyAdvantage <= 0 &&
    !consequence.opportunityActive
  ) {
    return {
      lanePressureBySegment,
      occupancyBySegment,
      structurePressureByTier
    };
  }

  lanePressureBySegment[consequence.affectedSegment] = clamp(
    consequence.pressureDelta * 0.58 +
      consequence.occupancyAdvantage * 0.14 +
      (consequence.opportunityActive ? 0.04 : 0),
    0,
    0.32
  );
  occupancyBySegment[consequence.affectedSegment] = clamp(
    consequence.occupancyAdvantage * 0.24,
    0,
    0.18
  );
  structurePressureByTier[consequence.affectedTier] = clamp(
    consequence.pressureDelta * 0.74 +
      consequence.occupancyAdvantage * 0.1 +
      (consequence.opportunityActive ? 0.05 : 0),
    0,
    0.4
  );

  return {
    lanePressureBySegment,
    occupancyBySegment,
    structurePressureByTier
  };
};

export const createDefaultHeadlessBridgeLaneConsequenceSnapshot =
  (): HeadlessBridgeLaneConsequenceSnapshot => ({
    pressureDelta: 0,
    occupancyAdvantage: 0,
    opportunityActive: false,
    opportunityRemainingSeconds: 0,
    affectedSegment: 'outer-front',
    affectedTier: 'outer',
    lastBridgeOutcomeKind: 'none',
    lastBridgeOutcomeSummary: 'No shared lane consequence yet.'
  });

export const cloneHeadlessBridgeLaneConsequenceSnapshot = (
  snapshot: HeadlessBridgeLaneConsequenceSnapshot
): HeadlessBridgeLaneConsequenceSnapshot => ({
  pressureDelta: snapshot.pressureDelta,
  occupancyAdvantage: snapshot.occupancyAdvantage,
  opportunityActive: snapshot.opportunityActive,
  opportunityRemainingSeconds: snapshot.opportunityRemainingSeconds,
  affectedSegment: snapshot.affectedSegment,
  affectedTier: snapshot.affectedTier,
  lastBridgeOutcomeKind: snapshot.lastBridgeOutcomeKind,
  lastBridgeOutcomeSummary: snapshot.lastBridgeOutcomeSummary
});

const createZeroSegmentValues = (): SegmentValues => ({
  'outer-front': 0,
  'inner-siege': 0,
  'core-approach': 0
});

const createZeroTierValues = (): TierValues => ({
  outer: 0,
  inner: 0,
  core: 0
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
