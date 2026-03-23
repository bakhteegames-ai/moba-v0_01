export interface CombatVector2 {
  x: number;
  z: number;
}

export type CombatTeam = 'blue' | 'red';

export type CombatAbilityId = 'hero-basic-shot';

export type CombatCastFailureReason =
  | 'on-cooldown'
  | 'out-of-range'
  | 'dead-actor'
  | 'invalid-target';

export interface CombatMovementIntent {
  kind: 'movement';
  direction: CombatVector2;
}

export interface CombatCastAbilityIntent {
  kind: 'cast-ability';
  abilityId: CombatAbilityId;
  targetEntityId: string;
}

export interface CombatAbilityDefinition {
  id: CombatAbilityId;
  cooldownSeconds: number;
  castRange: number;
  damage: number;
}

export interface HeadlessHeroCombatState {
  id: string;
  team: CombatTeam;
  position: CombatVector2;
  facing: CombatVector2;
  moveSpeed: number;
  bodyRadius: number;
  currentHp: number;
  maxHp: number;
  alive: boolean;
  basicAbilityCooldownRemaining: number;
}

export interface HeadlessCombatEntityConfig {
  id: string;
  team: CombatTeam;
  position: CombatVector2;
  facing?: CombatVector2;
  moveSpeed: number;
  bodyRadius: number;
  maxHp: number;
  currentHp?: number;
}

export interface HeadlessCombatWalkArea {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface HeadlessCombatBlocker {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface HeadlessCombatArenaGeometry {
  walkAreas: HeadlessCombatWalkArea[];
  blockers: HeadlessCombatBlocker[];
  edgeBuffer: number;
}

export interface CombatCastResolutionSnapshot {
  sequence: number;
  actorId: string;
  abilityId: CombatAbilityId;
  targetEntityId: string;
  success: boolean;
  failureReason: CombatCastFailureReason | null;
  damageApplied: number;
  targetHpAfter: number | null;
  targetAliveAfter: boolean | null;
  cooldownRemaining: number;
}

export interface HeadlessCombatSimulationSnapshot {
  elapsedSeconds: number;
  fixedStepSeconds: number;
  entities: Record<string, HeadlessHeroCombatState>;
  lastResolvedCast: CombatCastResolutionSnapshot | null;
  lastLegalityFailureReason: CombatCastFailureReason | 'none';
}

export interface HeadlessCombatSimulationConfig {
  fixedStepSeconds?: number;
  ability: CombatAbilityDefinition;
  arena: HeadlessCombatArenaGeometry;
  entities: HeadlessCombatEntityConfig[];
}

export interface HeadlessCombatSimulation {
  submitMovementIntent(actorId: string, intent: CombatMovementIntent): void;
  submitCastIntent(actorId: string, intent: CombatCastAbilityIntent): void;
  forceSetEntityPosition(actorId: string, position: CombatVector2): void;
  update(dt: number): void;
  getSnapshot(): HeadlessCombatSimulationSnapshot;
}

interface RuntimeState {
  elapsedSeconds: number;
  accumulatorSeconds: number;
  fixedStepSeconds: number;
  ability: CombatAbilityDefinition;
  arena: HeadlessCombatArenaGeometry;
  entities: Record<string, HeadlessHeroCombatState>;
  movementIntentsByActorId: Record<string, CombatMovementIntent>;
  castQueue: Array<{
    sequence: number;
    actorId: string;
    intent: CombatCastAbilityIntent;
  }>;
  nextCastSequence: number;
  lastResolvedCast: CombatCastResolutionSnapshot | null;
}

const defaultFixedStepSeconds = 1 / 60;

export const createHeadlessCombatSimulation = (
  config: HeadlessCombatSimulationConfig
): HeadlessCombatSimulation => {
  const state: RuntimeState = {
    elapsedSeconds: 0,
    accumulatorSeconds: 0,
    fixedStepSeconds: config.fixedStepSeconds ?? defaultFixedStepSeconds,
    ability: {
      id: config.ability.id,
      cooldownSeconds: config.ability.cooldownSeconds,
      castRange: config.ability.castRange,
      damage: config.ability.damage
    },
    arena: cloneArena(config.arena),
    entities: Object.fromEntries(
      config.entities.map((entity) => [
        entity.id,
        createEntityState(entity)
      ])
    ),
    movementIntentsByActorId: Object.fromEntries(
      config.entities.map((entity) => [
        entity.id,
        {
          kind: 'movement' as const,
          direction: { x: 0, z: 0 }
        }
      ])
    ),
    castQueue: [],
    nextCastSequence: 1,
    lastResolvedCast: null
  };

  return {
    submitMovementIntent(actorId, intent) {
      if (!state.entities[actorId]) {
        return;
      }

      state.movementIntentsByActorId[actorId] = {
        kind: 'movement',
        direction: normalizeVector(intent.direction)
      };
    },
    submitCastIntent(actorId, intent) {
      if (!state.entities[actorId]) {
        return;
      }

      state.castQueue.push({
        sequence: state.nextCastSequence,
        actorId,
        intent: {
          kind: 'cast-ability',
          abilityId: intent.abilityId,
          targetEntityId: intent.targetEntityId
        }
      });
      state.nextCastSequence += 1;
    },
    forceSetEntityPosition(actorId, position) {
      const entity = state.entities[actorId];
      if (!entity) {
        return;
      }

      entity.position = cloneVector(position);
    },
    update(dt) {
      if (dt <= 0) {
        return;
      }

      state.accumulatorSeconds += dt;
      while (state.accumulatorSeconds >= state.fixedStepSeconds) {
        stepFixedState(state, state.fixedStepSeconds);
        state.accumulatorSeconds -= state.fixedStepSeconds;
      }
    },
    getSnapshot() {
      return cloneSnapshot(state);
    }
  };
};

export const canOccupyCombatPosition = (
  arena: HeadlessCombatArenaGeometry,
  position: CombatVector2,
  bodyRadius: number
): boolean => {
  const clearance = bodyRadius + arena.edgeBuffer;
  const onWalkableSurface = arena.walkAreas.some((area) =>
    position.x >= area.xMin + clearance &&
    position.x <= area.xMax - clearance &&
    position.z >= area.zMin + clearance &&
    position.z <= area.zMax - clearance
  );

  if (!onWalkableSurface) {
    return false;
  }

  return !arena.blockers.some((blocker) => {
    const nearestX = clamp(position.x, blocker.xMin, blocker.xMax);
    const nearestZ = clamp(position.z, blocker.zMin, blocker.zMax);
    const distanceSquared =
      (position.x - nearestX) ** 2 + (position.z - nearestZ) ** 2;
    return distanceSquared < bodyRadius ** 2;
  });
};

export const resolveNearestWalkableCombatPosition = (
  arena: HeadlessCombatArenaGeometry,
  preferredPosition: CombatVector2,
  bodyRadius: number
): CombatVector2 => {
  if (canOccupyCombatPosition(arena, preferredPosition, bodyRadius)) {
    return cloneVector(preferredPosition);
  }

  const searchStep = Math.max(0.4, bodyRadius * 0.5);
  const directions: CombatVector2[] = [
    { x: -1, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 1 },
    { x: -1, z: -1 },
    { x: -1, z: 1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 }
  ];

  for (let ring = 1; ring <= 16; ring += 1) {
    const offsetDistance = ring * searchStep;
    for (const direction of directions) {
      const normalizedDirection = normalizeVector(direction);
      const candidate = {
        x: preferredPosition.x + normalizedDirection.x * offsetDistance,
        z: preferredPosition.z + normalizedDirection.z * offsetDistance
      };

      if (canOccupyCombatPosition(arena, candidate, bodyRadius)) {
        return candidate;
      }
    }
  }

  return cloneVector(preferredPosition);
};

const stepFixedState = (state: RuntimeState, dt: number): void => {
  state.elapsedSeconds += dt;

  const sortedEntityIds = Object.keys(state.entities).sort();
  for (const entityId of sortedEntityIds) {
    const entity = state.entities[entityId];
    if (!entity.alive) {
      entity.basicAbilityCooldownRemaining = 0;
      continue;
    }

    entity.basicAbilityCooldownRemaining = Math.max(
      0,
      entity.basicAbilityCooldownRemaining - dt
    );
  }

  for (const entityId of sortedEntityIds) {
    const entity = state.entities[entityId];
    const movementIntent = state.movementIntentsByActorId[entityId];
    if (!movementIntent) {
      continue;
    }

    applyMovementIntent(state.arena, entity, movementIntent, dt);
  }

  if (state.castQueue.length === 0) {
    return;
  }

  const queuedCasts = [...state.castQueue].sort(
    (left, right) => left.sequence - right.sequence
  );
  state.castQueue = [];

  for (const queuedCast of queuedCasts) {
    state.lastResolvedCast = resolveCastIntent(
      state,
      queuedCast.sequence,
      queuedCast.actorId,
      queuedCast.intent
    );
  }
};

const applyMovementIntent = (
  arena: HeadlessCombatArenaGeometry,
  entity: HeadlessHeroCombatState,
  intent: CombatMovementIntent,
  dt: number
): void => {
  if (!entity.alive) {
    return;
  }

  const direction = normalizeVector(intent.direction);
  if (direction.x === 0 && direction.z === 0) {
    return;
  }

  const frameDistance = entity.moveSpeed * dt;
  const candidateX = {
    x: entity.position.x + direction.x * frameDistance,
    z: entity.position.z
  };
  const candidateZ = {
    x: entity.position.x,
    z: entity.position.z + direction.z * frameDistance
  };

  if (canOccupyCombatPosition(arena, candidateX, entity.bodyRadius)) {
    entity.position.x = candidateX.x;
  }

  if (canOccupyCombatPosition(arena, candidateZ, entity.bodyRadius)) {
    entity.position.z = candidateZ.z;
  }

  entity.facing = direction;
};

const resolveCastIntent = (
  state: RuntimeState,
  sequence: number,
  actorId: string,
  intent: CombatCastAbilityIntent
): CombatCastResolutionSnapshot => {
  const actor = state.entities[actorId];
  if (!actor || !actor.alive) {
    return createFailedCastResolution(
      sequence,
      actorId,
      intent,
      'dead-actor',
      actor?.basicAbilityCooldownRemaining ?? 0
    );
  }

  const target = state.entities[intent.targetEntityId];
  if (!target || !target.alive || target.team === actor.team) {
    return createFailedCastResolution(
      sequence,
      actorId,
      intent,
      'invalid-target',
      actor.basicAbilityCooldownRemaining
    );
  }

  if (intent.abilityId !== state.ability.id) {
    return createFailedCastResolution(
      sequence,
      actorId,
      intent,
      'invalid-target',
      actor.basicAbilityCooldownRemaining
    );
  }

  if (actor.basicAbilityCooldownRemaining > 0) {
    return createFailedCastResolution(
      sequence,
      actorId,
      intent,
      'on-cooldown',
      actor.basicAbilityCooldownRemaining
    );
  }

  const targetDistance = Math.hypot(
    target.position.x - actor.position.x,
    target.position.z - actor.position.z
  );
  const maxAllowedDistance =
    state.ability.castRange + actor.bodyRadius + target.bodyRadius;

  if (targetDistance > maxAllowedDistance) {
    return createFailedCastResolution(
      sequence,
      actorId,
      intent,
      'out-of-range',
      actor.basicAbilityCooldownRemaining
    );
  }

  actor.basicAbilityCooldownRemaining = state.ability.cooldownSeconds;
  actor.facing = normalizeVector({
    x: target.position.x - actor.position.x,
    z: target.position.z - actor.position.z
  });

  target.currentHp = Math.max(0, target.currentHp - state.ability.damage);
  target.alive = target.currentHp > 0;

  return {
    sequence,
    actorId,
    abilityId: intent.abilityId,
    targetEntityId: intent.targetEntityId,
    success: true,
    failureReason: null,
    damageApplied: state.ability.damage,
    targetHpAfter: target.currentHp,
    targetAliveAfter: target.alive,
    cooldownRemaining: actor.basicAbilityCooldownRemaining
  };
};

const createEntityState = (
  entity: HeadlessCombatEntityConfig
): HeadlessHeroCombatState => {
  const currentHp = clamp(
    entity.currentHp ?? entity.maxHp,
    0,
    entity.maxHp
  );

  return {
    id: entity.id,
    team: entity.team,
    position: cloneVector(entity.position),
    facing: normalizeVector(entity.facing ?? { x: 0, z: 1 }),
    moveSpeed: entity.moveSpeed,
    bodyRadius: entity.bodyRadius,
    currentHp,
    maxHp: entity.maxHp,
    alive: currentHp > 0,
    basicAbilityCooldownRemaining: 0
  };
};

const createFailedCastResolution = (
  sequence: number,
  actorId: string,
  intent: CombatCastAbilityIntent,
  failureReason: CombatCastFailureReason,
  cooldownRemaining: number
): CombatCastResolutionSnapshot => ({
  sequence,
  actorId,
  abilityId: intent.abilityId,
  targetEntityId: intent.targetEntityId,
  success: false,
  failureReason,
  damageApplied: 0,
  targetHpAfter: null,
  targetAliveAfter: null,
  cooldownRemaining
});

const cloneSnapshot = (
  state: RuntimeState
): HeadlessCombatSimulationSnapshot => ({
  elapsedSeconds: state.elapsedSeconds,
  fixedStepSeconds: state.fixedStepSeconds,
  entities: Object.fromEntries(
    Object.entries(state.entities).map(([entityId, entity]) => [
      entityId,
      cloneEntityState(entity)
    ])
  ),
  lastResolvedCast: state.lastResolvedCast
    ? {
        sequence: state.lastResolvedCast.sequence,
        actorId: state.lastResolvedCast.actorId,
        abilityId: state.lastResolvedCast.abilityId,
        targetEntityId: state.lastResolvedCast.targetEntityId,
        success: state.lastResolvedCast.success,
        failureReason: state.lastResolvedCast.failureReason,
        damageApplied: state.lastResolvedCast.damageApplied,
        targetHpAfter: state.lastResolvedCast.targetHpAfter,
        targetAliveAfter: state.lastResolvedCast.targetAliveAfter,
        cooldownRemaining: state.lastResolvedCast.cooldownRemaining
      }
    : null,
  lastLegalityFailureReason:
    state.lastResolvedCast && !state.lastResolvedCast.success
      ? state.lastResolvedCast.failureReason ?? 'none'
      : 'none'
});

const cloneEntityState = (
  entity: HeadlessHeroCombatState
): HeadlessHeroCombatState => ({
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

const cloneArena = (
  arena: HeadlessCombatArenaGeometry
): HeadlessCombatArenaGeometry => ({
  walkAreas: arena.walkAreas.map((area) => ({ ...area })),
  blockers: arena.blockers.map((blocker) => ({ ...blocker })),
  edgeBuffer: arena.edgeBuffer
});

const cloneVector = (vector: CombatVector2): CombatVector2 => ({
  x: vector.x,
  z: vector.z
});

const normalizeVector = (vector: CombatVector2): CombatVector2 => {
  const length = Math.hypot(vector.x, vector.z);
  if (length <= 0.0001) {
    return { x: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    z: vector.z / length
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
