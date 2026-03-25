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
  createHeadlessLaneRouteProgressModel
} from '../combat/headlessLaneRouteProgress';
import {
  adaptHeadlessCombatLaneBridgeToLaneConsequence,
  buildHeadlessBridgeLaneModifier,
  type HeadlessBridgeLaneConsequenceSnapshot
} from './headlessBridgeConsequenceAdapter';
import {
  createPrototypeLaneStateLoop,
  type StructureConversionInteractionRequest
} from './prototypeLaneStateLoop';
import { gameplayTuningConfig } from './gameplayTuningConfig';
import {
  cloneRuntimeLaneTelemetrySnapshot,
  createRuntimeLaneTelemetrySnapshot,
  type RuntimeStructureInteractionPulse,
  type RuntimeLaneTelemetrySnapshot
} from './runtimeLaneTelemetryProducer';

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
  castRange: number;
  player: HeadlessCombatRuntimeEntitySnapshot;
  target: HeadlessCombatRuntimeEntitySnapshot;
  lastResolvedCast: CombatCastResolutionSnapshot | null;
  lastLegalityFailureReason: CombatCastFailureReason | 'none';
  laneBridge: HeadlessCombatLaneBridgeSnapshot;
  sharedLaneConsequence: HeadlessBridgeLaneConsequenceSnapshot;
  lastStructureInteractionRequest: StructureConversionInteractionRequest | null;
  runtimeLaneTelemetry: RuntimeLaneTelemetrySnapshot | null;
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
const runtimeStructureInteractionPulseDurationSeconds =
  layoutConfig.tempo.coefficients.objectiveCommitSeconds;
const deterministicApproachLeadSeconds = 7;
const deterministicCastConfirmSeconds = 0.1;
const deterministicContestSampleSeconds = 0.25;

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
  let lastStructureInteractionRequest: StructureConversionInteractionRequest | null =
    null;
  let runtimeStructureInteractionPulseRequest: StructureConversionInteractionRequest | null =
    null;
  let runtimeStructureInteractionPulseExpiresAtSeconds: number | null = null;
  let nextStructureInteractionSequence = 1;

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
      const simulationSnapshot = simulation.getSnapshot();
      const player = getSnapshotEntity(simulationSnapshot, playerHeroId);
      const target = getSnapshotEntity(simulationSnapshot, laneBlockerId);

      if (target.alive) {
        simulation.submitCastIntent(playerHeroId, {
          kind: 'cast-ability',
          abilityId: basicAbility.id,
          targetEntityId: laneBlockerId
        });
        return;
      }

      if (!player.alive) {
        return;
      }

      const structureInteractionRequest: StructureConversionInteractionRequest = {
        sequence: nextStructureInteractionSequence,
        playerAlive: true,
        playerPosition: cloneVector(player.position)
      };
      lastStructureInteractionRequest = structureInteractionRequest;
      runtimeStructureInteractionPulseRequest =
        cloneStructureInteractionRequest(structureInteractionRequest);
      runtimeStructureInteractionPulseExpiresAtSeconds =
        simulationSnapshot.elapsedSeconds +
        runtimeStructureInteractionPulseDurationSeconds;
      nextStructureInteractionSequence += 1;
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
      const sharedLaneConsequence =
        adaptHeadlessCombatLaneBridgeToLaneConsequence(laneBridgeSnapshot);
      const runtimeStructureInteractionPulse =
        resolveRuntimeStructureInteractionPulse(
          simulationSnapshot.elapsedSeconds,
          runtimeStructureInteractionPulseRequest,
          runtimeStructureInteractionPulseExpiresAtSeconds
        );
      const runtimeLaneTelemetry = createRuntimeLaneTelemetrySnapshot({
        elapsedSeconds: simulationSnapshot.elapsedSeconds,
        playerPosition: getSnapshotEntity(simulationSnapshot, playerHeroId)
          .position,
        blockerAlive: getSnapshotEntity(simulationSnapshot, laneBlockerId)
          .alive,
        sharedLaneConsequence,
        structureInteractionPulse: runtimeStructureInteractionPulse
      });
      return {
        elapsedSeconds: simulationSnapshot.elapsedSeconds,
        fixedStepSeconds: simulationSnapshot.fixedStepSeconds,
        abilityId: basicAbility.id,
        castRange: basicAbility.castRange,
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
        sharedLaneConsequence,
        lastStructureInteractionRequest: lastStructureInteractionRequest
          ? cloneStructureInteractionRequest(lastStructureInteractionRequest)
          : null,
        runtimeLaneTelemetry: cloneRuntimeLaneTelemetrySnapshot(
          runtimeLaneTelemetry
        ),
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

const createLaneBridgeConfig = (): HeadlessCombatLaneBridgeConfig => {
  const tuning = gameplayTuningConfig.headlessCombatLaneBridge;
  const laneRouteProgressModel = createHeadlessLaneRouteProgressModel(
    createCanonicalLaneRoutePoints()
  );
  const redOuterTowerProgress = laneRouteProgressModel.sampleNormalizedProgress(
    toCombatVector(layoutConfig.nodes.redOuterTower.position)
  );
  const redInnerTowerProgress = laneRouteProgressModel.sampleNormalizedProgress(
    toCombatVector(layoutConfig.nodes.redInnerTower.position)
  );
  const redCoreProgress = laneRouteProgressModel.sampleNormalizedProgress(
    toCombatVector(layoutConfig.nodes.redCore.position)
  );

  return {
    heroEntityId: playerHeroId,
    blockerEntityId: laneBlockerId,
    laneRouteProgressModel,
    outerToInnerProgressThreshold: average(
      redOuterTowerProgress,
      redInnerTowerProgress
    ),
    innerToCoreProgressThreshold: average(
      redInnerTowerProgress,
      redCoreProgress
    ),
    opportunityDurationSeconds: clamp(
      layoutConfig.tempo.coefficients.waveHoldDurationSeconds *
        tuning.opportunityDurationWaveHoldMultiplier,
      tuning.opportunityDurationSecondsClamp.min,
      tuning.opportunityDurationSecondsClamp.max
    ),
    pressureDeltaOnClear: clamp(
      layoutConfig.tempo.coefficients.attackerPushPressureCoeff *
        tuning.pressureDeltaOnClearAttackerPushMultiplier,
      tuning.pressureDeltaOnClearClamp.min,
      tuning.pressureDeltaOnClearClamp.max
    ),
    occupancyAdvantageOnClear: clamp(
      tuning.occupancyAdvantageBase +
        layoutConfig.tempo.coefficients.objectiveCommitSeconds *
          tuning.occupancyAdvantageObjectiveCommitMultiplier,
      tuning.occupancyAdvantageClamp.min,
      tuning.occupancyAdvantageClamp.max
    )
  };
};

const createCanonicalLaneRoutePoints = (): CombatVector2[] => [
  toCombatVector(layoutConfig.nodes.blueCore.position),
  toCombatVector(layoutConfig.nodes.blueInnerTower.position),
  toCombatVector(layoutConfig.nodes.blueOuterTower.position),
  toCombatVector(layoutConfig.nodes.midline.position),
  toCombatVector(layoutConfig.nodes.redOuterTower.position),
  toCombatVector(layoutConfig.nodes.redInnerTower.position),
  toCombatVector(layoutConfig.nodes.redCore.position)
];

const toCombatVector = (point: { x: number; y: number }): CombatVector2 => ({
  x: point.x,
  z: point.y
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
      ? 'Repeated fixed-step blocker-clear script produced the same bounded mirrored contest and recovery exchange.'
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
  const proofLaneStateLoop = createPrototypeLaneStateLoop();

  proofBridge.update(0, proofSimulation.getSnapshot());
  proofLaneStateLoop.setSharedLaneConsequence(
    adaptHeadlessCombatLaneBridgeToLaneConsequence(proofBridge.getSnapshot())
  );
  advanceDeterministicScenario(
    proofSimulation,
    proofBridge,
    proofLaneStateLoop,
    Math.round(deterministicApproachLeadSeconds / fixedStepSeconds)
  );

  for (let hitIndex = 0; hitIndex < 3; hitIndex += 1) {
    proofSimulation.submitCastIntent(playerHeroId, {
      kind: 'cast-ability',
      abilityId: basicAbility.id,
      targetEntityId: laneBlockerId
    });
    advanceDeterministicScenario(
      proofSimulation,
      proofBridge,
      proofLaneStateLoop,
      Math.round(deterministicCastConfirmSeconds / fixedStepSeconds)
    );
    if (hitIndex < 2) {
      advanceDeterministicScenario(
        proofSimulation,
        proofBridge,
        proofLaneStateLoop,
        Math.round(basicAbility.cooldownSeconds / fixedStepSeconds)
      );
    }
  }

  advanceDeterministicScenario(
    proofSimulation,
    proofBridge,
    proofLaneStateLoop,
    Math.round(deterministicContestSampleSeconds / fixedStepSeconds)
  );

  const simulationSnapshot = proofSimulation.getSnapshot();
  const bridgeSnapshot = proofBridge.getSnapshot();
  const sharedLaneConsequence =
    adaptHeadlessCombatLaneBridgeToLaneConsequence(bridgeSnapshot);
  const sharedLaneModifier =
    buildHeadlessBridgeLaneModifier(sharedLaneConsequence);
  const sharedLaneSnapshot = proofLaneStateLoop.getSnapshot();
  const resolvedDefenderResponse =
    sharedLaneSnapshot.sharedDefenderResponse;
  const resolvedPushReassertion =
    sharedLaneSnapshot.sharedPushReassertion;
  const resolvedStructureConversion =
    sharedLaneSnapshot.sharedStructureConversion;
  const resolvedClosureAdvancement =
    sharedLaneSnapshot.sharedClosureAdvancement;
  advanceDeterministicScenario(
    proofSimulation,
    proofBridge,
    proofLaneStateLoop,
    Math.round(5 / fixedStepSeconds)
  );
  const expiredLaneSnapshot = proofLaneStateLoop.getSnapshot();
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
    sharedLaneConsequence.lastBridgeOutcomeKind,
    sharedLaneSnapshot.sharedSiegeWindow.siegeWindowActive ? 'open' : 'closed',
    round(sharedLaneSnapshot.sharedSiegeWindow.siegeWindowRemainingSeconds),
    sharedLaneSnapshot.sharedSiegeWindow.sourceSegment,
    sharedLaneSnapshot.sharedSiegeWindow.sourceTier,
    sharedLaneSnapshot.sharedSiegeWindow.triggerReason,
    round(sharedLaneSnapshot.sharedSiegeWindow.pressureSupportLevel),
    round(sharedLaneSnapshot.sharedSiegeWindow.occupancySupportLevel),
    resolvedDefenderResponse.responseActive ? 'active' : 'idle',
    resolvedDefenderResponse.responseEligible ? 'eligible' : 'ineligible',
    round(resolvedDefenderResponse.structureConversionSuppression),
    round(resolvedDefenderResponse.closureAdvancementSuppression),
    resolvedDefenderResponse.triggerReason,
    resolvedDefenderResponse.lastResolvedResponseAction,
    resolvedPushReassertion.recoveryActive ? 'active' : 'idle',
    resolvedPushReassertion.recoveryEligible ? 'eligible' : 'ineligible',
    round(resolvedPushReassertion.structureSuppressionRecovery),
    round(resolvedPushReassertion.closureSuppressionRecovery),
    resolvedPushReassertion.triggerReason,
    resolvedPushReassertion.lastResolvedRecoveryAction,
    resolvedStructureConversion.conversionActive ? 'active' : 'idle',
    round(resolvedStructureConversion.conversionProgress),
    round(resolvedStructureConversion.conversionThreshold),
    resolvedStructureConversion.conversionEligible ? 'eligible' : 'ineligible',
    resolvedStructureConversion.triggerReason,
    resolvedStructureConversion.lastResolvedStructureStep,
    resolvedClosureAdvancement.closureAdvancementActive ? 'active' : 'idle',
    round(resolvedClosureAdvancement.closureAdvancementValue),
    round(resolvedClosureAdvancement.readinessLevel),
    resolvedClosureAdvancement.readinessEligible ? 'eligible' : 'ineligible',
    resolvedClosureAdvancement.triggerReason,
    resolvedClosureAdvancement.lastResolvedClosureStep,
    expiredLaneSnapshot.sharedStructureConversion.conversionActive
      ? 'active'
      : 'idle',
    round(expiredLaneSnapshot.sharedStructureConversion.conversionProgress),
    expiredLaneSnapshot.sharedStructureConversion.triggerReason,
    expiredLaneSnapshot.sharedStructureConversion.lastResolvedStructureStep,
    expiredLaneSnapshot.sharedDefenderResponse.responseActive
      ? 'active'
      : 'idle',
    expiredLaneSnapshot.sharedDefenderResponse.responseEligible
      ? 'eligible'
      : 'ineligible',
    round(
      expiredLaneSnapshot.sharedDefenderResponse.structureConversionSuppression
    ),
    round(
      expiredLaneSnapshot.sharedDefenderResponse.closureAdvancementSuppression
    ),
    expiredLaneSnapshot.sharedDefenderResponse.triggerReason,
    expiredLaneSnapshot.sharedDefenderResponse.lastResolvedResponseAction,
    expiredLaneSnapshot.sharedPushReassertion.recoveryActive
      ? 'active'
      : 'idle',
    expiredLaneSnapshot.sharedPushReassertion.recoveryEligible
      ? 'eligible'
      : 'ineligible',
    round(
      expiredLaneSnapshot.sharedPushReassertion.structureSuppressionRecovery
    ),
    round(
      expiredLaneSnapshot.sharedPushReassertion.closureSuppressionRecovery
    ),
    expiredLaneSnapshot.sharedPushReassertion.triggerReason,
    expiredLaneSnapshot.sharedPushReassertion.lastResolvedRecoveryAction,
    expiredLaneSnapshot.sharedClosureAdvancement.closureAdvancementActive
      ? 'active'
      : 'idle',
    round(expiredLaneSnapshot.sharedClosureAdvancement.closureAdvancementValue),
    expiredLaneSnapshot.sharedClosureAdvancement.triggerReason,
    expiredLaneSnapshot.sharedClosureAdvancement.lastResolvedClosureStep
  ].join('|');
};

const advanceDeterministicScenario = (
  simulation: {
    update(dt: number): void;
    getSnapshot(): HeadlessCombatSimulationSnapshot;
  },
  laneBridge: {
    update(dt: number, snapshot: HeadlessCombatSimulationSnapshot): void;
    getSnapshot(): HeadlessCombatLaneBridgeSnapshot;
  },
  laneStateLoop: {
    setSharedLaneConsequence(
      consequence: HeadlessBridgeLaneConsequenceSnapshot
    ): void;
    update(dt: number): void;
  },
  steps: number
): void => {
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    simulation.update(fixedStepSeconds);
    laneBridge.update(fixedStepSeconds, simulation.getSnapshot());
    laneStateLoop.setSharedLaneConsequence(
      adaptHeadlessCombatLaneBridgeToLaneConsequence(laneBridge.getSnapshot())
    );
    laneStateLoop.update(fixedStepSeconds);
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

const cloneStructureInteractionRequest = (
  request: StructureConversionInteractionRequest
): StructureConversionInteractionRequest => ({
  sequence: request.sequence,
  playerAlive: request.playerAlive,
  playerPosition: cloneVector(request.playerPosition)
});

const resolveRuntimeStructureInteractionPulse = (
  elapsedSeconds: number,
  request: StructureConversionInteractionRequest | null,
  expiresAtSeconds: number | null
): RuntimeStructureInteractionPulse | null => {
  if (
    !request ||
    expiresAtSeconds === null ||
    expiresAtSeconds <= elapsedSeconds
  ) {
    return null;
  }

  return {
    request: cloneStructureInteractionRequest(request),
    remainingSeconds: expiresAtSeconds - elapsedSeconds
  };
};

const average = (a: number, b: number): number => (a + b) * 0.5;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number): number => Math.round(value * 1000) / 1000;
