import { layoutConfig } from '../config/layout';
import { clamp, createZeroSegmentValues } from './calibrationUtils';
import { type HeadlessBridgeLaneConsequenceSnapshot } from './headlessBridgeConsequenceAdapter';
import {
  type PrototypeDefenderTimingTag,
  type PrototypeStructureContactState
} from './prototypeLaneOccupancyProducer';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';
import { type SegmentValues } from './sharedPressureTypes';
import { type StructureConversionInteractionRequest } from './prototypeLaneStateLoop';

export interface RuntimeStructureInteractionPulse {
  request: StructureConversionInteractionRequest;
  remainingSeconds: number;
}

export interface RuntimeLaneTelemetrySnapshot {
  elapsedSeconds: number;
  activeSegment: LanePressureSegment;
  frontLaneSegment: LanePressureSegment;
  frontLaneProgress: number;
  segmentOccupancyCount: SegmentValues;
  segmentOccupancyPresence: SegmentValues;
  segmentTimeInSegmentSeconds: SegmentValues;
  structureContactByTier: Record<
    StructurePressureTier,
    PrototypeStructureContactState
  >;
  defenderTimingTagsByTier: Record<
    StructurePressureTier,
    PrototypeDefenderTimingTag
  >;
  consecutiveWaveCarryoverRelevance: number;
  interactionPulse: {
    active: boolean;
    remainingSeconds: number;
    supportScalar: number;
    supportTier: StructurePressureTier | 'none';
  };
}

export interface RuntimeLaneTelemetryInput {
  elapsedSeconds: number;
  playerPosition: {
    x: number;
    z: number;
  };
  blockerAlive: boolean;
  sharedLaneConsequence: HeadlessBridgeLaneConsequenceSnapshot;
  structureInteractionPulse: RuntimeStructureInteractionPulse | null;
}

const segmentReferenceSeconds: SegmentValues = {
  'outer-front': 30 / Math.max(0.5, layoutConfig.player.moveSpeed),
  'inner-siege': 26 / Math.max(0.5, layoutConfig.player.moveSpeed),
  'core-approach': 10 / Math.max(0.5, layoutConfig.player.moveSpeed)
};

const contactWindowPeakSeconds: Record<StructurePressureTier, number> = {
  outer: 4.2,
  inner: 4.8,
  core: 5.2
};

const baseDelaySecondsByTier: Record<StructurePressureTier, number> = {
  outer: 1.55,
  inner: 1.2,
  core: 0.95
};

const baseReclearSecondsByTier: Record<StructurePressureTier, number> = {
  outer: 1.95,
  inner: 1.72,
  core: 1.5
};

const interactionPulseDurationSeconds =
  layoutConfig.tempo.coefficients.objectiveCommitSeconds;
const contactRangeByTier = buildContactRangeByTier();
const segmentBounds = buildSegmentBounds();

export const createRuntimeLaneTelemetrySnapshot = (
  input: RuntimeLaneTelemetryInput
): RuntimeLaneTelemetrySnapshot => {
  const activeSegment = resolveLaneSegment(input.playerPosition.x);
  const lanePresenceScalar = resolveLanePresenceScalar(input.playerPosition.z);
  const frontLaneProgress = resolveSegmentProgress(
    activeSegment,
    input.playerPosition.x
  );

  const segmentOccupancyCount = createZeroSegmentValues();
  const segmentOccupancyPresence = createZeroSegmentValues();
  const segmentTimeInSegmentSeconds = createZeroSegmentValues();

  segmentOccupancyCount[activeSegment] = lanePresenceScalar > 0.05 ? 1 : 0;
  segmentOccupancyPresence[activeSegment] = lanePresenceScalar;
  segmentTimeInSegmentSeconds[activeSegment] =
    segmentReferenceSeconds[activeSegment] *
    frontLaneProgress *
    lanePresenceScalar;

  const structureContactByTier = buildStructureContactByTier(
    input,
    lanePresenceScalar
  );
  const defenderTimingTagsByTier = buildDefenderTimingTagsByTier(
    segmentOccupancyPresence,
    structureContactByTier
  );
  const interactionPulse = buildInteractionPulseDebug(
    input.structureInteractionPulse
  );

  return {
    elapsedSeconds: input.elapsedSeconds,
    activeSegment,
    frontLaneSegment: activeSegment,
    frontLaneProgress,
    segmentOccupancyCount,
    segmentOccupancyPresence,
    segmentTimeInSegmentSeconds,
    structureContactByTier,
    defenderTimingTagsByTier,
    consecutiveWaveCarryoverRelevance: clamp(
      segmentOccupancyPresence['inner-siege'] * 0.45 +
        segmentOccupancyPresence['core-approach'] * 0.4 +
        structureContactByTier.inner.pressure * 0.08 +
        structureContactByTier.core.pressure * 0.2 +
        input.sharedLaneConsequence.occupancyAdvantage * 0.08,
      0,
      1
    ),
    interactionPulse
  };
};

export const cloneRuntimeLaneTelemetrySnapshot = (
  snapshot: RuntimeLaneTelemetrySnapshot
): RuntimeLaneTelemetrySnapshot => ({
  elapsedSeconds: snapshot.elapsedSeconds,
  activeSegment: snapshot.activeSegment,
  frontLaneSegment: snapshot.frontLaneSegment,
  frontLaneProgress: snapshot.frontLaneProgress,
  segmentOccupancyCount: { ...snapshot.segmentOccupancyCount },
  segmentOccupancyPresence: { ...snapshot.segmentOccupancyPresence },
  segmentTimeInSegmentSeconds: { ...snapshot.segmentTimeInSegmentSeconds },
  structureContactByTier: {
    outer: { ...snapshot.structureContactByTier.outer },
    inner: { ...snapshot.structureContactByTier.inner },
    core: { ...snapshot.structureContactByTier.core }
  },
  defenderTimingTagsByTier: {
    outer: { ...snapshot.defenderTimingTagsByTier.outer },
    inner: { ...snapshot.defenderTimingTagsByTier.inner },
    core: { ...snapshot.defenderTimingTagsByTier.core }
  },
  consecutiveWaveCarryoverRelevance: snapshot.consecutiveWaveCarryoverRelevance,
  interactionPulse: {
    active: snapshot.interactionPulse.active,
    remainingSeconds: snapshot.interactionPulse.remainingSeconds,
    supportScalar: snapshot.interactionPulse.supportScalar,
    supportTier: snapshot.interactionPulse.supportTier
  }
});

const buildStructureContactByTier = (
  input: RuntimeLaneTelemetryInput,
  lanePresenceScalar: number
): Record<StructurePressureTier, PrototypeStructureContactState> => ({
  outer: buildTierContactState('outer', input, lanePresenceScalar),
  inner: buildTierContactState('inner', input, lanePresenceScalar),
  core: buildTierContactState('core', input, lanePresenceScalar)
});

const buildTierContactState = (
  tier: StructurePressureTier,
  input: RuntimeLaneTelemetryInput,
  lanePresenceScalar: number
): PrototypeStructureContactState => {
  if (input.blockerAlive) {
    return {
      active: false,
      windowSeconds: 0,
      pressure: 0
    };
  }

  const anchor = contactRangeByTier[tier];
  const distanceToAnchor = Math.hypot(
    input.playerPosition.x - anchor.x,
    input.playerPosition.z - anchor.z
  );
  const proximityPressure = clamp(1 - distanceToAnchor / anchor.range, 0, 1);
  const requestPressure =
    input.structureInteractionPulse &&
    isRequestWithinTierRange(input.structureInteractionPulse.request, tier)
      ? 0.55 * normalizeInteractionPulse(input.structureInteractionPulse)
      : 0;
  const laneConsequenceSupport =
    input.sharedLaneConsequence.affectedTier === tier
      ? clamp(
          input.sharedLaneConsequence.pressureDelta * 0.35 +
            input.sharedLaneConsequence.occupancyAdvantage * 0.4 +
            (input.sharedLaneConsequence.opportunityActive ? 0.15 : 0),
          0,
          0.45
        )
      : 0;
  const pressure = clamp(
    Math.max(proximityPressure, requestPressure) +
      laneConsequenceSupport +
      lanePresenceScalar * 0.08,
    0,
    1
  );
  const windowSeconds = pressure > 0
    ? clamp(
        layoutConfig.tempo.coefficients.objectiveCommitSeconds *
          (0.45 + pressure * 0.9),
        0,
        contactWindowPeakSeconds[tier]
      )
    : 0;

  return {
    active: pressure > 0.02,
    windowSeconds,
    pressure
  };
};

const buildInteractionPulseDebug = (
  interactionPulse: RuntimeStructureInteractionPulse | null
): RuntimeLaneTelemetrySnapshot['interactionPulse'] => ({
  active: interactionPulse !== null,
  remainingSeconds: interactionPulse ? interactionPulse.remainingSeconds : 0,
  supportScalar: interactionPulse
    ? normalizeInteractionPulse(interactionPulse)
    : 0,
  supportTier: interactionPulse
    ? resolvePulseSupportTier(interactionPulse.request)
    : 'none'
});

const buildDefenderTimingTagsByTier = (
  segmentOccupancyPresence: SegmentValues,
  structureContactByTier: Record<
    StructurePressureTier,
    PrototypeStructureContactState
  >
): Record<StructurePressureTier, PrototypeDefenderTimingTag> => ({
  outer: buildTierDefenderTag(
    'outer',
    segmentOccupancyPresence['outer-front'],
    structureContactByTier.outer
  ),
  inner: buildTierDefenderTag(
    'inner',
    segmentOccupancyPresence['inner-siege'],
    structureContactByTier.inner
  ),
  core: buildTierDefenderTag(
    'core',
    segmentOccupancyPresence['core-approach'],
    structureContactByTier.core
  )
});

const buildTierDefenderTag = (
  tier: StructurePressureTier,
  occupancyPresence: number,
  contact: PrototypeStructureContactState
): PrototypeDefenderTimingTag => {
  const windowNormalized = clamp(
    contact.windowSeconds / contactWindowPeakSeconds[tier],
    0,
    1
  );

  const delayTagSeconds = contact.active
    ? Math.max(
        0.3,
        baseDelaySecondsByTier[tier] -
          occupancyPresence * 0.26 -
          contact.pressure * 0.35 -
          windowNormalized * 0.18
      )
    : baseDelaySecondsByTier[tier] + 0.25;

  const reclearTagSeconds = contact.active
    ? Math.max(
        0.45,
        baseReclearSecondsByTier[tier] +
          occupancyPresence * 0.36 +
          contact.pressure * 0.4 +
          windowNormalized * 0.25
      )
    : Math.max(0.45, baseReclearSecondsByTier[tier] * 0.78);

  return {
    delayTagSeconds,
    reclearTagSeconds
  };
};

const resolveLaneSegment = (x: number): LanePressureSegment =>
  x < segmentBounds.inner.start
    ? 'outer-front'
    : x < segmentBounds.core.start
      ? 'inner-siege'
      : 'core-approach';

const resolveSegmentProgress = (
  segment: LanePressureSegment,
  x: number
): number => {
  const bounds = segmentBounds[
    segment === 'outer-front'
      ? 'outer'
      : segment === 'inner-siege'
        ? 'inner'
        : 'core'
  ];
  return clamp(
    (x - bounds.start) / Math.max(0.001, bounds.end - bounds.start),
    0,
    1
  );
};

const resolveLanePresenceScalar = (z: number): number =>
  clamp(
    1 -
      Math.abs(z) / Math.max(0.001, layoutConfig.dimensions.laneWidthMid),
    0,
    1
  );

const isRequestWithinTierRange = (
  request: StructureConversionInteractionRequest,
  tier: StructurePressureTier
): boolean => {
  if (!request.playerAlive) {
    return false;
  }

  const anchor = contactRangeByTier[tier];
  return (
    Math.hypot(
      request.playerPosition.x - anchor.x,
      request.playerPosition.z - anchor.z
    ) <= anchor.range
  );
};

const normalizeInteractionPulse = (
  interactionPulse: RuntimeStructureInteractionPulse
): number =>
  clamp(
    interactionPulse.remainingSeconds /
      Math.max(0.001, interactionPulseDurationSeconds),
    0,
    1
  );

const resolvePulseSupportTier = (
  request: StructureConversionInteractionRequest
): StructurePressureTier | 'none' =>
  isRequestWithinTierRange(request, 'outer')
    ? 'outer'
    : isRequestWithinTierRange(request, 'inner')
      ? 'inner'
      : isRequestWithinTierRange(request, 'core')
        ? 'core'
        : 'none';

function buildSegmentBounds(): Record<
  'outer' | 'inner' | 'core',
  { start: number; end: number }
> {
  const midline = layoutConfig.nodes.midline.position.x;
  const redOuter = layoutConfig.nodes.redOuterTower.position.x;
  const redInner = layoutConfig.nodes.redInnerTower.position.x;
  const redCore = layoutConfig.nodes.redCore.position.x;

  return {
    outer: {
      start: midline,
      end: (redOuter + redInner) * 0.5
    },
    inner: {
      start: (redOuter + redInner) * 0.5,
      end: (redInner + redCore) * 0.5
    },
    core: {
      start: (redInner + redCore) * 0.5,
      end: redCore
    }
  };
}

function buildContactRangeByTier(): Record<
  StructurePressureTier,
  { x: number; z: number; range: number }
> {
  return {
    outer: buildTierAnchor('red-outer-tower-blocker'),
    inner: buildTierAnchor('red-inner-tower-blocker'),
    core: buildTierAnchor('red-core-blocker')
  };
}

function buildTierAnchor(blockerId: string): {
  x: number;
  z: number;
  range: number;
} {
  const blocker = layoutConfig.blockers.find((entry) => entry.id === blockerId);
  if (!blocker) {
    throw new Error(
      `Missing runtime lane telemetry blocker "${blockerId}" in layout config.`
    );
  }

  return {
    x: blocker.center.x,
    z: blocker.center.y,
    range:
      Math.max(blocker.size.width, blocker.size.depth) * 0.5 +
      layoutConfig.player.radius +
      Math.max(0.4, layoutConfig.player.radius * 0.5)
  };
}
