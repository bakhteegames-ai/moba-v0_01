import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import {
  type LaneClosurePostureSnapshot
} from './laneClosurePosture';
import {
  type SharedStructureConversionSnapshot
} from './sharedStructureConversionStep';
import { gameplayTuningConfig } from './gameplayTuningConfig';

export type SharedClosureAdvancementTriggerReason =
  | 'none'
  | 'progressing'
  | 'support-too-low'
  | 'signal-expired'
  | 'anti-stall-readiness-raised';

export type SharedClosureResolvedStep =
  | 'none'
  | 'anti-stall-readiness-raised';

export interface SharedClosureAdvancementSnapshot {
  closureAdvancementActive: boolean;
  closureAdvancementValue: number;
  readinessLevel: number;
  readinessEligible: boolean;
  sourceSegment: LanePressureSegment;
  sourceTier: StructurePressureTier;
  triggerReason: SharedClosureAdvancementTriggerReason;
  summary: string;
  lastResolvedClosureStep: SharedClosureResolvedStep;
}

export interface SharedClosureAdvancementHookInput {
  dt: number;
  previous: SharedClosureAdvancementSnapshot;
  structureConversion: SharedStructureConversionSnapshot;
  laneClosure: LaneClosurePostureSnapshot;
  readinessSuppression?: number;
}

export const advanceSharedClosureAdvancementSnapshot = (
  input: SharedClosureAdvancementHookInput
): SharedClosureAdvancementSnapshot => {
  const tuning = gameplayTuningConfig.sharedClosureAdvancement;
  const dt = Math.max(0, input.dt);
  const sourceSegment = input.structureConversion.sourceSegment;
  const sourceTier = input.structureConversion.sourceTier;
  const readinessSuppression = clamp(
    input.readinessSuppression ?? 0,
    tuning.readinessSuppressionClamp.min,
    tuning.readinessSuppressionClamp.max
  );
  const structuralSignal = clamp(
    input.structureConversion.conversionThreshold > 0
      ? input.structureConversion.conversionProgress /
          input.structureConversion.conversionThreshold
      : 0,
    0,
    1
  );
  const readinessLevel = clamp(
    structuralSignal * tuning.readinessWeights.structuralSignal +
      input.laneClosure.antiStallAccelerationLevel *
        tuning.readinessWeights.antiStallAcceleration +
      input.laneClosure.closureThreatLevel *
        tuning.readinessWeights.closureThreat +
      input.laneClosure.structuralCarryoverLevel *
        tuning.readinessWeights.structuralCarryover -
      readinessSuppression,
    0,
    1
  );
  const readinessEligible =
    (input.structureConversion.lastResolvedStructureStep !== 'none' ||
      structuralSignal >= tuning.minimumStructuralSignal) &&
    readinessLevel >= tuning.minimumReadinessLevel;

  if (
    input.previous.sourceTier === sourceTier &&
    input.previous.closureAdvancementValue >= tuning.valueThreshold &&
    input.previous.lastResolvedClosureStep !== 'none'
  ) {
    if (
      input.structureConversion.lastResolvedStructureStep !== 'none' &&
      input.structureConversion.triggerReason !== 'window-expired'
    ) {
      return buildSnapshot(
        false,
        tuning.valueThreshold,
        readinessLevel,
        readinessEligible,
        sourceSegment,
        sourceTier,
        'anti-stall-readiness-raised',
        'Combat-earned structure progress has raised shared anti-stall readiness.',
        input.previous.lastResolvedClosureStep
      );
    }

    const decayedValue = decayValue(input.previous.closureAdvancementValue, dt);
    return buildSnapshot(
      false,
      decayedValue,
      readinessLevel,
      false,
      sourceSegment,
      sourceTier,
      decayedValue > 0 ? 'signal-expired' : 'none',
      decayedValue > 0
        ? 'Combat-earned closure readiness is decaying after the structure-conversion window closed.'
        : 'Combat-earned anti-stall readiness has expired back to neutral.',
      input.previous.lastResolvedClosureStep
    );
  }

  if (readinessEligible) {
    const gainRate = clamp(
      tuning.gainRateBase +
        readinessLevel * tuning.gainRateReadinessMultiplier +
        structuralSignal * tuning.gainRateStructuralSignalMultiplier +
        (input.structureConversion.lastResolvedStructureStep !== 'none'
          ? tuning.gainRateResolvedStructureBonus
          : 0),
      tuning.gainRateClamp.min,
      tuning.gainRateClamp.max
    );
    const advancedValue = clamp(
      input.previous.closureAdvancementValue + dt * gainRate,
      0,
      tuning.valueThreshold
    );

    if (
      input.previous.closureAdvancementValue < tuning.valueThreshold &&
      advancedValue >= tuning.valueThreshold
    ) {
      return buildSnapshot(
        false,
        tuning.valueThreshold,
        readinessLevel,
        true,
        sourceSegment,
        sourceTier,
        'anti-stall-readiness-raised',
        'Combat-earned structure progress has raised shared anti-stall readiness.',
        'anti-stall-readiness-raised'
      );
    }

    return buildSnapshot(
      true,
      advancedValue,
      readinessLevel,
      true,
      sourceSegment,
      sourceTier,
      'progressing',
      'Combat-earned structure progress is advancing a bounded shared closure-readiness signal.',
      input.previous.lastResolvedClosureStep
    );
  }

  const decayedValue = decayValue(input.previous.closureAdvancementValue, dt);
  const terminalReason: SharedClosureAdvancementTriggerReason =
    decayedValue > 0 || input.previous.lastResolvedClosureStep !== 'none'
      ? 'signal-expired'
      : 'support-too-low';
  return buildSnapshot(
    false,
    decayedValue,
    readinessLevel,
    false,
    sourceSegment,
    sourceTier,
    terminalReason,
    decayedValue > 0
      ? 'Bounded combat-earned closure readiness is decaying.'
      : input.previous.lastResolvedClosureStep !== 'none'
        ? 'Combat-earned anti-stall readiness remains the last resolved closure step.'
        : 'Shared structure progress is not yet strong enough to raise anti-stall readiness.',
    input.previous.lastResolvedClosureStep
  );
};

export const createDefaultSharedClosureAdvancementSnapshot =
  (): SharedClosureAdvancementSnapshot =>
    buildSnapshot(
      false,
      0,
      0,
      false,
      'outer-front',
      'outer',
      'none',
      'No combat-earned closure advancement is active.',
      'none'
    );

export const cloneSharedClosureAdvancementSnapshot = (
  snapshot: SharedClosureAdvancementSnapshot
): SharedClosureAdvancementSnapshot => ({
  closureAdvancementActive: snapshot.closureAdvancementActive,
  closureAdvancementValue: snapshot.closureAdvancementValue,
  readinessLevel: snapshot.readinessLevel,
  readinessEligible: snapshot.readinessEligible,
  sourceSegment: snapshot.sourceSegment,
  sourceTier: snapshot.sourceTier,
  triggerReason: snapshot.triggerReason,
  summary: snapshot.summary,
  lastResolvedClosureStep: snapshot.lastResolvedClosureStep
});

const buildSnapshot = (
  closureAdvancementActive: boolean,
  closureAdvancementValue: number,
  readinessLevel: number,
  readinessEligible: boolean,
  sourceSegment: LanePressureSegment,
  sourceTier: StructurePressureTier,
  triggerReason: SharedClosureAdvancementTriggerReason,
  summary: string,
  lastResolvedClosureStep: SharedClosureResolvedStep
): SharedClosureAdvancementSnapshot => {
  const tuning = gameplayTuningConfig.sharedClosureAdvancement;

  return {
    closureAdvancementActive,
    closureAdvancementValue: clamp(
      closureAdvancementValue,
      0,
      tuning.valueThreshold
    ),
    readinessLevel: clamp(readinessLevel, 0, 1),
    readinessEligible,
    sourceSegment,
    sourceTier,
    triggerReason,
    summary,
    lastResolvedClosureStep
  };
};

const decayValue = (value: number, dt: number): number =>
  clamp(
    value -
      dt *
        (gameplayTuningConfig.sharedClosureAdvancement.decayBasePerSecond +
          value *
            gameplayTuningConfig.sharedClosureAdvancement
              .decayValueMultiplier),
    0,
    gameplayTuningConfig.sharedClosureAdvancement.valueThreshold
  );

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
