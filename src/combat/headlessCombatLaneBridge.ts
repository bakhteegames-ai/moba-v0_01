import {
  type CombatCastFailureReason,
  type CombatTeam,
  type CombatVector2,
  type HeadlessCombatSimulationSnapshot,
  type HeadlessHeroCombatState
} from './headlessCombatCore';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from '../gameplay/pressureCalibrationScaffold';

export type HeadlessCombatLaneEventKind =
  | 'none'
  | 'lane-blocker-damaged'
  | 'lane-blocker-cleared'
  | 'cast-rejected';

export interface HeadlessCombatLaneParticipantSnapshot {
  entityId: string;
  team: CombatTeam;
  position: CombatVector2;
  laneAdvance: number;
  lanePressureSegment: LanePressureSegment;
  structurePressureTier: StructurePressureTier;
  currentHp: number;
  maxHp: number;
  alive: boolean;
}

export interface HeadlessCombatLaneBridgeOutcomeSnapshot {
  kind: HeadlessCombatLaneEventKind;
  actorId: string;
  targetId: string;
  lanePressureSegment: LanePressureSegment;
  structurePressureTier: StructurePressureTier;
  pressureDelta: number;
  occupancyAdvantage: number;
  summary: string;
  failureReason: CombatCastFailureReason | 'none';
}

export interface HeadlessCombatLaneBridgeSnapshot {
  hero: HeadlessCombatLaneParticipantSnapshot;
  blocker: HeadlessCombatLaneParticipantSnapshot;
  lanePressureDelta: number;
  occupancyAdvantage: number;
  structurePressureOpportunityActive: boolean;
  opportunityWindowRemainingSeconds: number;
  lastCombatEventSummary: string;
  lastBridgeOutcome: HeadlessCombatLaneBridgeOutcomeSnapshot;
}

export interface HeadlessCombatLaneBridgeConfig {
  heroEntityId: string;
  blockerEntityId: string;
  outerToInnerAdvance: number;
  innerToCoreAdvance: number;
  opportunityDurationSeconds: number;
  pressureDeltaOnClear: number;
  occupancyAdvantageOnClear: number;
}

export interface HeadlessCombatLaneBridgeModel {
  update(dt: number, snapshot: HeadlessCombatSimulationSnapshot): void;
  getSnapshot(): HeadlessCombatLaneBridgeSnapshot;
}

interface RuntimeState {
  lastProcessedCastSequence: number;
  opportunityWindowRemainingSeconds: number;
  hero: HeadlessCombatLaneParticipantSnapshot;
  blocker: HeadlessCombatLaneParticipantSnapshot;
  lastCombatEventSummary: string;
  lastBridgeOutcome: HeadlessCombatLaneBridgeOutcomeSnapshot;
}

export const createHeadlessCombatLaneBridgeModel = (
  config: HeadlessCombatLaneBridgeConfig
): HeadlessCombatLaneBridgeModel => {
  const state: RuntimeState = {
    lastProcessedCastSequence: 0,
    opportunityWindowRemainingSeconds: 0,
    hero: createDefaultParticipantSnapshot(config.heroEntityId, 'blue'),
    blocker: createDefaultParticipantSnapshot(config.blockerEntityId, 'red'),
    lastCombatEventSummary: 'No combat lane event yet.',
    lastBridgeOutcome: createDefaultBridgeOutcome()
  };

  return {
    update(dt, snapshot) {
      state.hero = deriveParticipantSnapshot(
        getEntitySnapshot(snapshot, config.heroEntityId),
        config
      );
      state.blocker = deriveParticipantSnapshot(
        getEntitySnapshot(snapshot, config.blockerEntityId),
        config
      );
      state.opportunityWindowRemainingSeconds = Math.max(
        0,
        state.opportunityWindowRemainingSeconds - Math.max(0, dt)
      );

      const lastResolvedCast = snapshot.lastResolvedCast;
      if (
        !lastResolvedCast ||
        lastResolvedCast.sequence <= state.lastProcessedCastSequence
      ) {
        return;
      }

      state.lastProcessedCastSequence = lastResolvedCast.sequence;
      state.lastCombatEventSummary = buildCombatEventSummary(lastResolvedCast);

      if (lastResolvedCast.targetEntityId !== config.blockerEntityId) {
        state.lastBridgeOutcome = createDefaultBridgeOutcome();
        return;
      }

      if (!lastResolvedCast.success) {
        state.lastBridgeOutcome = {
          kind: 'cast-rejected',
          actorId: lastResolvedCast.actorId,
          targetId: lastResolvedCast.targetEntityId,
          lanePressureSegment: state.blocker.lanePressureSegment,
          structurePressureTier: state.blocker.structurePressureTier,
          pressureDelta: 0,
          occupancyAdvantage: 0,
          summary: `Cast rejected: ${formatFailureReason(
            lastResolvedCast.failureReason ?? 'invalid-target'
          )}.`,
          failureReason: lastResolvedCast.failureReason ?? 'invalid-target'
        };
        return;
      }

      if (!state.blocker.alive) {
        state.opportunityWindowRemainingSeconds = config.opportunityDurationSeconds;
        state.lastBridgeOutcome = {
          kind: 'lane-blocker-cleared',
          actorId: lastResolvedCast.actorId,
          targetId: lastResolvedCast.targetEntityId,
          lanePressureSegment: state.blocker.lanePressureSegment,
          structurePressureTier: state.blocker.structurePressureTier,
          pressureDelta: config.pressureDeltaOnClear,
          occupancyAdvantage: config.occupancyAdvantageOnClear,
          summary: `Lane blocker cleared in ${formatLanePressureSegment(
            state.blocker.lanePressureSegment
          )}; bounded pressure window opened.`,
          failureReason: 'none'
        };
        return;
      }

      state.lastBridgeOutcome = {
        kind: 'lane-blocker-damaged',
        actorId: lastResolvedCast.actorId,
        targetId: lastResolvedCast.targetEntityId,
        lanePressureSegment: state.blocker.lanePressureSegment,
        structurePressureTier: state.blocker.structurePressureTier,
        pressureDelta: 0,
        occupancyAdvantage: 0,
        summary: `Lane blocker damaged in ${formatLanePressureSegment(
          state.blocker.lanePressureSegment
        )}; no macro swing yet.`,
        failureReason: 'none'
      };
    },
    getSnapshot() {
      const opportunityBlend =
        config.opportunityDurationSeconds > 0
          ? clamp(
              state.opportunityWindowRemainingSeconds /
                config.opportunityDurationSeconds,
              0,
              1
            )
          : 0;

      return {
        hero: cloneParticipantSnapshot(state.hero),
        blocker: cloneParticipantSnapshot(state.blocker),
        lanePressureDelta: config.pressureDeltaOnClear * opportunityBlend,
        occupancyAdvantage:
          config.occupancyAdvantageOnClear * opportunityBlend,
        structurePressureOpportunityActive:
          state.opportunityWindowRemainingSeconds > 0,
        opportunityWindowRemainingSeconds:
          state.opportunityWindowRemainingSeconds,
        lastCombatEventSummary: state.lastCombatEventSummary,
        lastBridgeOutcome: cloneBridgeOutcome(state.lastBridgeOutcome)
      };
    }
  };
};

const getEntitySnapshot = (
  snapshot: HeadlessCombatSimulationSnapshot,
  entityId: string
): HeadlessHeroCombatState => {
  const entity = snapshot.entities[entityId];
  if (!entity) {
    throw new Error(`Missing combat lane entity "${entityId}".`);
  }

  return entity;
};

const deriveParticipantSnapshot = (
  entity: HeadlessHeroCombatState,
  config: HeadlessCombatLaneBridgeConfig
): HeadlessCombatLaneParticipantSnapshot => {
  // This bridge is intentionally scoped to the current blue-to-red lane slice.
  const laneAdvance = Math.max(0, entity.position.x);
  const structurePressureTier = deriveStructureTier(laneAdvance, config);
  const lanePressureSegment = deriveLanePressureSegment(
    structurePressureTier
  );

  return {
    entityId: entity.id,
    team: entity.team,
    position: cloneVector(entity.position),
    laneAdvance,
    lanePressureSegment,
    structurePressureTier,
    currentHp: entity.currentHp,
    maxHp: entity.maxHp,
    alive: entity.alive
  };
};

const deriveStructureTier = (
  laneAdvance: number,
  config: HeadlessCombatLaneBridgeConfig
): StructurePressureTier =>
  laneAdvance < config.outerToInnerAdvance
    ? 'outer'
    : laneAdvance < config.innerToCoreAdvance
      ? 'inner'
      : 'core';

const deriveLanePressureSegment = (
  tier: StructurePressureTier
): LanePressureSegment =>
  tier === 'outer'
    ? 'outer-front'
    : tier === 'inner'
      ? 'inner-siege'
      : 'core-approach';

const buildCombatEventSummary = (
  cast: HeadlessCombatSimulationSnapshot['lastResolvedCast']
): string => {
  if (!cast) {
    return 'No combat lane event yet.';
  }

  if (!cast.success) {
    return `Cast rejected: ${formatFailureReason(
      cast.failureReason ?? 'invalid-target'
    )}.`;
  }

  return `Combat hit resolved for ${cast.damageApplied} damage.`;
};

const createDefaultParticipantSnapshot = (
  entityId: string,
  team: CombatTeam
): HeadlessCombatLaneParticipantSnapshot => ({
  entityId,
  team,
  position: { x: 0, z: 0 },
  laneAdvance: 0,
  lanePressureSegment: 'outer-front',
  structurePressureTier: 'outer',
  currentHp: 0,
  maxHp: 0,
  alive: false
});

const createDefaultBridgeOutcome = (): HeadlessCombatLaneBridgeOutcomeSnapshot => ({
  kind: 'none',
  actorId: '',
  targetId: '',
  lanePressureSegment: 'outer-front',
  structurePressureTier: 'outer',
  pressureDelta: 0,
  occupancyAdvantage: 0,
  summary: 'No bridge outcome yet.',
  failureReason: 'none'
});

const cloneParticipantSnapshot = (
  snapshot: HeadlessCombatLaneParticipantSnapshot
): HeadlessCombatLaneParticipantSnapshot => ({
  entityId: snapshot.entityId,
  team: snapshot.team,
  position: cloneVector(snapshot.position),
  laneAdvance: snapshot.laneAdvance,
  lanePressureSegment: snapshot.lanePressureSegment,
  structurePressureTier: snapshot.structurePressureTier,
  currentHp: snapshot.currentHp,
  maxHp: snapshot.maxHp,
  alive: snapshot.alive
});

const cloneBridgeOutcome = (
  snapshot: HeadlessCombatLaneBridgeOutcomeSnapshot
): HeadlessCombatLaneBridgeOutcomeSnapshot => ({
  kind: snapshot.kind,
  actorId: snapshot.actorId,
  targetId: snapshot.targetId,
  lanePressureSegment: snapshot.lanePressureSegment,
  structurePressureTier: snapshot.structurePressureTier,
  pressureDelta: snapshot.pressureDelta,
  occupancyAdvantage: snapshot.occupancyAdvantage,
  summary: snapshot.summary,
  failureReason: snapshot.failureReason
});

const cloneVector = (vector: CombatVector2): CombatVector2 => ({
  x: vector.x,
  z: vector.z
});

const formatLanePressureSegment = (segment: LanePressureSegment): string =>
  segment === 'outer-front'
    ? 'outer-front'
    : segment === 'inner-siege'
      ? 'inner-siege'
      : 'core-approach';

const formatFailureReason = (reason: CombatCastFailureReason): string =>
  reason === 'on-cooldown'
    ? 'on cooldown'
    : reason === 'out-of-range'
      ? 'out of range'
      : reason === 'dead-actor'
        ? 'dead actor'
        : 'invalid target';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
