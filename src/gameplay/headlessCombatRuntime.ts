import { layoutConfig } from '../config/layout';
import {
  canOccupyCombatPosition,
  createHeadlessCombatSimulation,
  resolveNearestWalkableCombatPosition,
  type CombatAbilityId,
  type CombatCastFailureReason,
  type CombatCastResolutionSnapshot,
  type CombatVector2,
  type HeadlessCombatArenaGeometry,
  type HeadlessCombatBlocker,
  type HeadlessCombatSimulationSnapshot,
  type HeadlessHeroCombatState,
  type HeadlessCombatWalkArea
} from '../combat/headlessCombatCore';
import {
  createHeadlessCombatLaneBridgeModel,
  type HeadlessCombatLaneBridgeConfig,
  type HeadlessCombatLaneBridgeSnapshot
} from '../combat/headlessCombatLaneBridge';
import {
  adaptHeadlessCombatLaneBridgeToLaneConsequence,
  buildHeadlessBridgeLaneModifier,
  type HeadlessBridgeLaneConsequenceSnapshot
} from './headlessBridgeConsequenceAdapter';

export interface HeadlessCombatRuntimeEntitySnapshot {
  id: string;
  team: 'blue' | 'red';
  position: CombatVector2;
  facing: CombatVector2;
  moveSpeed: number;
  bodyRadius: number;
  currentHp: number;
  maxHp: number;
  alive: boolean;
  basicAbilityCooldownRemaining: number;
}

export interface HeadlessCombatRuntimeSnapshot {
  elapsedSeconds: number;
  fixedStepSeconds: number;
  abilityId: CombatAbilityId;
  player: HeadlessCombatRuntimeEntitySnapshot;
  target: HeadlessCombatRuntimeEntitySnapshot;
  lastResolvedCast: CombatCastResolutionSnapshot | null;
  lastLegalityFailureReason: CombatCastFailureReason | 'none';
  laneBridge: HeadlessCombatLaneBridgeSnapshot;
  sharedLaneConsequence: HeadlessBridgeLaneConsequenceSnapshot;
  laneDeterminismProof: HeadlessCombatLaneDeterminismProofSnapshot;
}

export interface HeadlessCombatRuntime {
  update(dt: number): void;
  submitPlayerMovementIntent(direction: CombatVector2): void;
  requestPlayerBasicCast(): void;
  teleportPlayer(position: CombatVector2): void;
  getPlayerPosition(): CombatVector2;
  getSnapshot(): HeadlessCombatRuntimeSnapshot;
}

export interface HeadlessCombatLaneDeterminismProofSnapshot {
  passed: boolean;
  signature: string;
  summary: string;
}

const playerHeroId = 'hero-blue-authority';
const laneBlockerId = 'lane-blocker-red';
const basicAbility = {
  id: 'hero-basic-shot' as const,
  cooldownSeconds: 1.5,
  castRange: 8.25,
  damage: 34
};
const fixedStepSeconds = 1 / 60;

export const createHeadlessCombatRuntime = (): HeadlessCombatRuntime => {
  const arena = createArenaFromLayout();
  const laneBridgeConfig = createLaneBridgeConfig();
  const playerStart = resolveNearestWalkableCombatPosition(
    arena,
    {
      x: layoutConfig.nodes.midline.position.x,
      z: layoutConfig.nodes.midline.position.y
    },
    layoutConfig.player.radius
  );
  const targetStart = resolveNearestWalkableCombatPosition(
    arena,
    {
      x: layoutConfig.nodes.pressureReturnLane.position.x,
      z: layoutConfig.nodes.pressureReturnLane.position.y
    },
    layoutConfig.player.radius
  );
  const simulation = createHeadlessCombatSimulation({
    fixedStepSeconds,
    ability: basicAbility,
    arena,
    entities: [
      {
        id: playerHeroId,
        team: 'blue',
        position: playerStart,
        facing: { x: 1, z: 0 },
        moveSpeed: layoutConfig.player.moveSpeed,
        bodyRadius: layoutConfig.player.radius,
        maxHp: 120
      },
      {
        id: laneBlockerId,
        team: 'red',
        position: targetStart,
        facing: { x: -1, z: 0 },
        moveSpeed: 0,
        bodyRadius: layoutConfig.player.radius,
        maxHp: 102
      }
    ]
  });
  const laneBridge = createHeadlessCombatLaneBridgeModel(laneBridgeConfig);
  const laneDeterminismProof = runLaneDeterminismProof(
    arena,
    laneBridgeConfig
  );
  let accumulatorSeconds = 0;

  laneBridge.update(0, simulation.getSnapshot());

  return {
    update(dt) {
      if (dt <= 0) {
        return;
      }

      accumulatorSeconds += dt;
      while (accumulatorSeconds >= fixedStepSeconds) {
        simulation.update(fixedStepSeconds);
        laneBridge.update(fixedStepSeconds, simulation.getSnapshot());
        accumulatorSeconds -= fixedStepSeconds;
      }
    },
    submitPlayerMovementIntent(direction) {
      simulation.submitMovementIntent(playerHeroId, {
        kind: 'movement',
        direction
      });
    },
    requestPlayerBasicCast() {
      simulation.submitCastIntent(playerHeroId, {
        kind: 'cast-ability',
        abilityId: basicAbility.id,
        targetEntityId: laneBlockerId
      });
    },
    teleportPlayer(position) {
      const safePosition = canOccupyCombatPosition(
        arena,
        position,
        layoutConfig.player.radius
      )
        ? position
        : resolveNearestWalkableCombatPosition(
            arena,
            position,
            layoutConfig.player.radius
          );

      simulation.forceSetEntityPosition(playerHeroId, safePosition);
      simulation.submitMovementIntent(playerHeroId, {
        kind: 'movement',
        direction: { x: 0, z: 0 }
      });
      laneBridge.update(0, simulation.getSnapshot());
    },
    getPlayerPosition() {
      return cloneVector(getSnapshotEntity(simulation.getSnapshot(), playerHeroId).position);
    },
    getSnapshot() {
      const simulationSnapshot = simulation.getSnapshot();
      const laneBridgeSnapshot = laneBridge.getSnapshot();
      return {
        elapsedSeconds: simulationSnapshot.elapsedSeconds,
        fixedStepSeconds: simulationSnapshot.fixedStepSeconds,
        abilityId: basicAbility.id,
        player: toRuntimeEntitySnapshot(
          getSnapshotEntity(simulationSnapshot, playerHeroId)
        ),
        target: toRuntimeEntitySnapshot(
          getSnapshotEntity(simulationSnapshot, laneBlockerId)
        ),
        lastResolvedCast: simulationSnapshot.lastResolvedCast
          ? { ...simulationSnapshot.lastResolvedCast }
          : null,
        lastLegalityFailureReason:
          simulationSnapshot.lastLegalityFailureReason,
        laneBridge: laneBridgeSnapshot,
        sharedLaneConsequence:
          adaptHeadlessCombatLaneBridgeToLaneConsequence(laneBridgeSnapshot),
        laneDeterminismProof: { ...laneDeterminismProof }
      };
    }
  };
};

const createArenaFromLayout = (): HeadlessCombatArenaGeometry => ({
  walkAreas: layoutConfig.walkAreas.map<HeadlessCombatWalkArea>((area) => {
    const halfWidth = area.size.width * 0.5;
    const halfDepth = area.size.depth * 0.5;
    return {
      xMin: area.center.x - halfWidth,
      xMax: area.center.x + halfWidth,
      zMin: area.center.y - halfDepth,
      zMax: area.center.y + halfDepth
    };
  }),
  blockers: layoutConfig.blockers.map<HeadlessCombatBlocker>((blocker) => {
    const halfWidth = blocker.size.width * 0.5;
    const halfDepth = blocker.size.depth * 0.5;
    return {
      xMin: blocker.center.x - halfWidth,
      xMax: blocker.center.x + halfWidth,
      zMin: blocker.center.y - halfDepth,
      zMax: blocker.center.y + halfDepth
    };
  }),
  edgeBuffer: layoutConfig.player.edgeBuffer
});

const createLaneBridgeConfig = (): HeadlessCombatLaneBridgeConfig => ({
  heroEntityId: playerHeroId,
  blockerEntityId: laneBlockerId,
  outerToInnerAdvance:
    average(
      layoutConfig.nodes.redOuterTower.position.x,
      layoutConfig.nodes.redInnerTower.position.x
    ),
  innerToCoreAdvance:
    average(
      layoutConfig.nodes.redInnerTower.position.x,
      layoutConfig.nodes.redCore.position.x
    ),
  opportunityDurationSeconds: clamp(
    layoutConfig.tempo.coefficients.waveHoldDurationSeconds * 0.52,
    3.8,
    5.4
  ),
  pressureDeltaOnClear: clamp(
    layoutConfig.tempo.coefficients.attackerPushPressureCoeff * 0.36,
    0.28,
    0.46
  ),
  occupancyAdvantageOnClear: clamp(
    0.42 + layoutConfig.tempo.coefficients.objectiveCommitSeconds * 0.18,
    0.45,
    0.72
  )
});

const runLaneDeterminismProof = (
  arena: HeadlessCombatArenaGeometry,
  laneBridgeConfig: HeadlessCombatLaneBridgeConfig
): HeadlessCombatLaneDeterminismProofSnapshot => {
  const firstSignature = runDeterministicBridgeScenario(arena, laneBridgeConfig);
  const secondSignature = runDeterministicBridgeScenario(
    arena,
    laneBridgeConfig
  );
  const passed = firstSignature === secondSignature;

  return {
    passed,
    signature: firstSignature,
    summary: passed
      ? 'Repeated fixed-step blocker-clear script produced the same shared lane consequence injection.'
      : 'Fixed-step blocker-clear script diverged between identical runs.'
  };
};

const runDeterministicBridgeScenario = (
  arena: HeadlessCombatArenaGeometry,
  laneBridgeConfig: HeadlessCombatLaneBridgeConfig
): string => {
  const proofSimulation = createHeadlessCombatSimulation({
    fixedStepSeconds,
    ability: basicAbility,
    arena,
    entities: [
      {
        id: playerHeroId,
        team: 'blue',
        position: resolveNearestWalkableCombatPosition(
          arena,
          {
            x: layoutConfig.nodes.pressureReturnLane.position.x - 8,
            z: 0
          },
          layoutConfig.player.radius
        ),
        facing: { x: 1, z: 0 },
        moveSpeed: layoutConfig.player.moveSpeed,
        bodyRadius: layoutConfig.player.radius,
        maxHp: 120
      },
      {
        id: laneBlockerId,
        team: 'red',
        position: resolveNearestWalkableCombatPosition(
          arena,
          {
            x: layoutConfig.nodes.pressureReturnLane.position.x,
            z: 0
          },
          layoutConfig.player.radius
        ),
        facing: { x: -1, z: 0 },
        moveSpeed: 0,
        bodyRadius: layoutConfig.player.radius,
        maxHp: 102
      }
    ]
  });
  const proofBridge = createHeadlessCombatLaneBridgeModel(laneBridgeConfig);

  proofBridge.update(0, proofSimulation.getSnapshot());

  for (let hitIndex = 0; hitIndex < 3; hitIndex += 1) {
    proofSimulation.submitCastIntent(playerHeroId, {
      kind: 'cast-ability',
      abilityId: basicAbility.id,
      targetEntityId: laneBlockerId
    });
    advanceDeterministicScenario(proofSimulation, proofBridge, 1);
    if (hitIndex < 2) {
      advanceDeterministicScenario(
        proofSimulation,
        proofBridge,
        Math.round(basicAbility.cooldownSeconds / fixedStepSeconds)
      );
    }
  }

  advanceDeterministicScenario(
    proofSimulation,
    proofBridge,
    Math.round(0.75 / fixedStepSeconds)
  );

  const simulationSnapshot = proofSimulation.getSnapshot();
  const bridgeSnapshot = proofBridge.getSnapshot();
  const sharedLaneConsequence =
    adaptHeadlessCombatLaneBridgeToLaneConsequence(bridgeSnapshot);
  const sharedLaneModifier =
    buildHeadlessBridgeLaneModifier(sharedLaneConsequence);
  const blocker = getSnapshotEntity(simulationSnapshot, laneBlockerId);

  return [
    blocker.alive ? 'alive' : 'dead',
    blocker.currentHp,
    sharedLaneConsequence.affectedSegment,
    sharedLaneConsequence.affectedTier,
    round(sharedLaneConsequence.pressureDelta),
    round(sharedLaneConsequence.occupancyAdvantage),
    sharedLaneConsequence.opportunityActive ? 'active' : 'idle',
    round(sharedLaneConsequence.opportunityRemainingSeconds),
    round(
      sharedLaneModifier.lanePressureBySegment[
        sharedLaneConsequence.affectedSegment
      ]
    ),
    round(
      sharedLaneModifier.structurePressureByTier[
        sharedLaneConsequence.affectedTier
      ]
    ),
    sharedLaneConsequence.lastBridgeOutcomeKind
  ].join('|');
};

const advanceDeterministicScenario = (
  simulation: {
    update(dt: number): void;
    getSnapshot(): HeadlessCombatSimulationSnapshot;
  },
  laneBridge: {
    update(dt: number, snapshot: HeadlessCombatSimulationSnapshot): void;
  },
  steps: number
): void => {
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    simulation.update(fixedStepSeconds);
    laneBridge.update(fixedStepSeconds, simulation.getSnapshot());
  }
};

const getSnapshotEntity = (
  snapshot: {
    entities: Record<string, HeadlessHeroCombatState>;
  },
  entityId: string
): HeadlessHeroCombatState => {
  const entity = snapshot.entities[entityId];
  if (!entity) {
    throw new Error(`Missing headless combat entity "${entityId}".`);
  }

  return entity;
};

const toRuntimeEntitySnapshot = (
  entity: HeadlessHeroCombatState
): HeadlessCombatRuntimeEntitySnapshot => ({
  id: entity.id,
  team: entity.team,
  position: cloneVector(entity.position),
  facing: cloneVector(entity.facing),
  moveSpeed: entity.moveSpeed,
  bodyRadius: entity.bodyRadius,
  currentHp: entity.currentHp,
  maxHp: entity.maxHp,
  alive: entity.alive,
  basicAbilityCooldownRemaining: entity.basicAbilityCooldownRemaining
});

const cloneVector = (vector: CombatVector2): CombatVector2 => ({
  x: vector.x,
  z: vector.z
});

const average = (a: number, b: number): number => (a + b) * 0.5;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number): number => Math.round(value * 1000) / 1000;
