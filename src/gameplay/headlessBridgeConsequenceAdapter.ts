import {
  type HeadlessCombatLaneBridgeSnapshot,
  type HeadlessCombatLaneEventKind
} from '../combat/headlessCombatLaneBridge';
import {
  clamp,
  cloneSnapshot,
  createZeroSegmentValues,
  createZeroTierValues
} from './calibrationUtils';
import { gameplayTuningConfig } from './gameplayTuningConfig';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import { type SegmentValues, type TierValues } from './sharedPressureTypes';

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
  const tuning = gameplayTuningConfig.headlessBridgeLaneModifier;
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
    consequence.pressureDelta * tuning.lanePressureWeights.pressureDelta +
      consequence.occupancyAdvantage *
        tuning.lanePressureWeights.occupancyAdvantage +
      (consequence.opportunityActive
        ? tuning.lanePressureWeights.opportunityActiveBonus
        : 0),
    tuning.lanePressureClamp.min,
    tuning.lanePressureClamp.max
  );
  occupancyBySegment[consequence.affectedSegment] = clamp(
    consequence.occupancyAdvantage * tuning.occupancyWeight,
    tuning.occupancyClamp.min,
    tuning.occupancyClamp.max
  );
  structurePressureByTier[consequence.affectedTier] = clamp(
    consequence.pressureDelta *
      tuning.structurePressureWeights.pressureDelta +
      consequence.occupancyAdvantage *
        tuning.structurePressureWeights.occupancyAdvantage +
      (consequence.opportunityActive
        ? tuning.structurePressureWeights.opportunityActiveBonus
        : 0),
    tuning.structurePressureClamp.min,
    tuning.structurePressureClamp.max
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
): HeadlessBridgeLaneConsequenceSnapshot => cloneSnapshot(snapshot);
