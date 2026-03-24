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

const closureAdvancementThreshold = 0.24;
const minimumReadinessLevel = 0.42;
const minimumStructuralSignal = 0.22;

export const advanceSharedClosureAdvancementSnapshot = (
  input: SharedClosureAdvancementHookInput
): SharedClosureAdvancementSnapshot => {
  const dt = Math.max(0, input.dt);
  const sourceSegment = input.structureConversion.sourceSegment;
  const sourceTier = input.structureConversion.sourceTier;
  const readinessSuppression = clamp(input.readinessSuppression ?? 0, 0, 0.35);
  const structuralSignal = clamp(
    input.structureConversion.conversionThreshold > 0
      ? input.structureConversion.conversionProgress /
          input.structureConversion.conversionThreshold
      : 0,
    0,
    1
  );
  const readinessLevel = clamp(
    structuralSignal * 0.34 +
      input.laneClosure.antiStallAccelerationLevel * 0.28 +
      input.laneClosure.closureThreatLevel * 0.2 +
      input.laneClosure.structuralCarryoverLevel * 0.18 -
      readinessSuppression,
    0,
    1
  );
  const readinessEligible =
    (input.structureConversion.lastResolvedStructureStep !== 'none' ||
      structuralSignal >= minimumStructuralSignal) &&
    readinessLevel >= minimumReadinessLevel;

  if (
    input.previous.sourceTier === sourceTier &&
    input.previous.closureAdvancementValue >= closureAdvancementThreshold &&
    input.previous.lastResolvedClosureStep !== 'none'
  ) {
    if (
      input.structureConversion.lastResolvedStructureStep !== 'none' &&
      input.structureConversion.triggerReason !== 'window-expired'
    ) {
      return buildSnapshot(
        false,
        closureAdvancementThreshold,
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
      0.16 +
        readinessLevel * 0.14 +
        structuralSignal * 0.12 +
        (input.structureConversion.lastResolvedStructureStep !== 'none' ? 0.06 : 0),
      0.18,
      0.42
    );
    const advancedValue = clamp(
      input.previous.closureAdvancementValue + dt * gainRate,
      0,
      closureAdvancementThreshold
    );

    if (
      input.previous.closureAdvancementValue < closureAdvancementThreshold &&
      advancedValue >= closureAdvancementThreshold
    ) {
      return buildSnapshot(
        false,
        closureAdvancementThreshold,
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
): SharedClosureAdvancementSnapshot => ({
  closureAdvancementActive,
  closureAdvancementValue: clamp(
    closureAdvancementValue,
    0,
    closureAdvancementThreshold
  ),
  readinessLevel: clamp(readinessLevel, 0, 1),
  readinessEligible,
  sourceSegment,
  sourceTier,
  triggerReason,
  summary,
  lastResolvedClosureStep
});

const decayValue = (value: number, dt: number): number =>
  clamp(value - dt * (0.34 + value * 0.2), 0, closureAdvancementThreshold);

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
