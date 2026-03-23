import * as pc from 'playcanvas';
import { type DebugSystem } from '../debug/debugBuilder';
import { layoutConfig, routeSelectionOrder } from '../config/layout';
import {
  colorFromHex,
  logicalToWorld,
  surfaceHeightAt,
  type RouteProbeResult,
  type RuntimeBlocker,
  type RuntimeWalkArea,
  type SceneRegistry
} from '../scene/grayboxFactory';

export interface PlayerTestController {
  update(dt: number): void;
  getPlayerPosition(): pc.Vec3;
  getActiveCamera(): pc.Entity;
  getCameraLabel(): string;
  getTacticalModeLabel(): string;
  getProbeRouteId(): string | null;
  getProbeElapsedSeconds(): number | null;
  destroy(): void;
}

export const createPlayerTestController = (
  app: pc.Application,
  registry: SceneRegistry,
  debugSystem: DebugSystem
): PlayerTestController => {
  const keysDown = new Set<string>();
  const pressedKeys = new Set<string>();

  const playerMaterial = new pc.StandardMaterial();
  const playerColor = colorFromHex('#f7f4df');
  playerMaterial.diffuse = playerColor.clone();
  playerMaterial.emissive = playerColor.clone().mulScalar(0.1);
  playerMaterial.gloss = 18;
  playerMaterial.update();

  const player = new pc.Entity('TestPawn');
  player.addComponent('render', {
    type: 'capsule',
    material: playerMaterial
  });
  player.setLocalScale(
    layoutConfig.player.radius * 2,
    layoutConfig.player.height,
    layoutConfig.player.radius * 2
  );
  registry.root.addChild(player);

  let logicalPosition = new pc.Vec2(0, 0);
  let currentYaw = 0;

  const tacticalCamera = new pc.Entity('TacticalCamera');
  tacticalCamera.addComponent('camera', {
    clearColor: new pc.Color(0.11, 0.13, 0.16)
  });
  registry.root.addChild(tacticalCamera);

  const followCamera = new pc.Entity('FollowCamera');
  followCamera.addComponent('camera', {
    clearColor: new pc.Color(0.11, 0.13, 0.16)
  });
  registry.root.addChild(followCamera);

  const tacticalCameraComponent = tacticalCamera.camera!;
  const followCameraComponent = followCamera.camera!;

  let useFollowCamera = false;
  let topDownTactical = false;

  const routeIndexById = new Map(routeSelectionOrder.map((routeId, index) => [routeId, index]));
  let selectedRouteIndex = 0;
  let activeProbe: {
    routeId: string;
    startTimeSeconds: number;
  } | null = null;

  const keydown = (event: KeyboardEvent): void => {
    const key = normalizeKey(event.key);
    if (!keysDown.has(key)) {
      pressedKeys.add(key);
    }
    keysDown.add(key);

    if (['[', ']', 'p', 'g', 'l', 'c', 'v'].includes(key)) {
      event.preventDefault();
    }
  };

  const keyup = (event: KeyboardEvent): void => {
    keysDown.delete(normalizeKey(event.key));
  };

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);

  teleportTo('midline');
  debugSystem.setSelectedRoute(routeSelectionOrder[selectedRouteIndex]);

  return {
    update(dt) {
      processHotkeys();
      updateMovement(dt);
      updatePlayerTransform();
      updateCameras(dt);
      updateProbe();
    },
    getPlayerPosition() {
      return player.getPosition().clone();
    },
    getActiveCamera() {
      return useFollowCamera ? followCamera : tacticalCamera;
    },
    getCameraLabel() {
      return useFollowCamera ? 'Follow' : 'Tactical';
    },
    getTacticalModeLabel() {
      return topDownTactical ? 'Top-down' : 'Angled';
    },
    getProbeRouteId() {
      return activeProbe?.routeId ?? null;
    },
    getProbeElapsedSeconds() {
      return activeProbe ? performance.now() * 0.001 - activeProbe.startTimeSeconds : null;
    },
    destroy() {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      tacticalCamera.destroy();
      followCamera.destroy();
      player.destroy();
    }
  };

  function processHotkeys(): void {
    if (consumePressed('c')) {
      useFollowCamera = !useFollowCamera;
      tacticalCameraComponent.enabled = !useFollowCamera;
      followCameraComponent.enabled = useFollowCamera;
    }

    if (consumePressed('v')) {
      topDownTactical = !topDownTactical;
    }

    if (consumePressed('l')) {
      debugSystem.toggleLabels();
    }

    if (consumePressed('g')) {
      debugSystem.toggleRoutes();
    }

    if (consumePressed('[')) {
      selectedRouteIndex =
        (selectedRouteIndex + routeSelectionOrder.length - 1) % routeSelectionOrder.length;
      debugSystem.setSelectedRoute(routeSelectionOrder[selectedRouteIndex]);
    }

    if (consumePressed(']')) {
      selectedRouteIndex = (selectedRouteIndex + 1) % routeSelectionOrder.length;
      debugSystem.setSelectedRoute(routeSelectionOrder[selectedRouteIndex]);
    }

    if (consumePressed('p')) {
      startSelectedProbe();
    }

    for (const teleport of layoutConfig.teleports) {
      if (consumePressed(teleport.key.toLowerCase())) {
        teleportTo(teleport.id);
      }
    }
  }

  function updateMovement(dt: number): void {
    let moveX = 0;
    let moveZ = 0;

    if (keysDown.has('w') || keysDown.has('arrowup')) {
      moveZ -= 1;
    }
    if (keysDown.has('s') || keysDown.has('arrowdown')) {
      moveZ += 1;
    }
    if (keysDown.has('a') || keysDown.has('arrowleft')) {
      moveX -= 1;
    }
    if (keysDown.has('d') || keysDown.has('arrowright')) {
      moveX += 1;
    }

    if (moveX === 0 && moveZ === 0) {
      return;
    }

    const direction = new pc.Vec2(moveX, moveZ);
    direction.normalize();

    const frameDistance = layoutConfig.player.moveSpeed * dt;
    const candidateX = logicalPosition.x + direction.x * frameDistance;
    const candidateZ = logicalPosition.y + direction.y * frameDistance;

    if (canOccupy(candidateX, logicalPosition.y)) {
      logicalPosition.x = candidateX;
    }
    if (canOccupy(logicalPosition.x, candidateZ)) {
      logicalPosition.y = candidateZ;
    }

    const desiredYaw = pc.math.RAD_TO_DEG * Math.atan2(direction.x, direction.y) + 180;
    currentYaw = lerpAngle(currentYaw, desiredYaw, layoutConfig.player.turnLerp * (1 / 60));
  }

  function updatePlayerTransform(): void {
    const surfaceHeight = surfaceHeightAt(registry.walkAreas, logicalPosition.x, logicalPosition.y)
      ?? layoutConfig.elevations.lowerTop;
    player.setPosition(
      logicalPosition.x,
      surfaceHeight + layoutConfig.player.height * 0.5,
      logicalPosition.y
    );
    player.setEulerAngles(0, currentYaw, 0);
  }

  function updateCameras(dt: number): void {
    const focusPoint = player.getPosition().clone().add(new pc.Vec3(0, 1.4, 0));

    if (topDownTactical) {
      tacticalCamera.setPosition(0, 138, -20);
    } else {
      tacticalCamera.setPosition(0, 96, 44);
    }
    tacticalCamera.lookAt(focusPoint.x, 0, -20);

    const followOffset = new pc.Vec3(0, 18, 18);
    const followTarget = player.getPosition().clone().add(followOffset);
    const currentPosition = followCamera.getPosition();
    const lerped = currentPosition.lerp(currentPosition, followTarget, Math.min(1, dt * 4));
    followCamera.setPosition(lerped);
    followCamera.lookAt(focusPoint);

    tacticalCameraComponent.enabled = !useFollowCamera;
    followCameraComponent.enabled = useFollowCamera;
  }

  function updateProbe(): void {
    if (!activeProbe) {
      return;
    }

    const route = layoutConfig.routes[routeIndexById.get(activeProbe.routeId) ?? 0];
    const end = route.waypoints[route.waypoints.length - 1];
    const distanceToEnd = Math.hypot(end.x - logicalPosition.x, end.y - logicalPosition.y);
    if (distanceToEnd > 2.25) {
      return;
    }

    const elapsed = performance.now() * 0.001 - activeProbe.startTimeSeconds;
    const result: RouteProbeResult = {
      routeId: route.id,
      label: route.label,
      actualSeconds: elapsed,
      targetMin: route.target?.minSeconds,
      targetMax: route.target?.maxSeconds,
      severity: route.target?.severity,
      note: route.target?.note
    };
    activeProbe = null;
    debugSystem.setRouteResult(result);
  }

  function startSelectedProbe(): void {
    const route = layoutConfig.routes[selectedRouteIndex];
    const start = route.waypoints[0];
    const startHeight = surfaceHeightAt(registry.walkAreas, start.x, start.y) ?? layoutConfig.elevations.lowerTop;
    logicalPosition = new pc.Vec2(start.x, start.y);
    player.setPosition(logicalToWorld(start, startHeight + layoutConfig.player.height * 0.5));
    activeProbe = {
      routeId: route.id,
      startTimeSeconds: performance.now() * 0.001
    };
    debugSystem.setRouteResult(null);
  }

  function teleportTo(id: string): void {
    const anchor = registry.teleportAnchors[id];
    if (!anchor) {
      return;
    }
    logicalPosition = new pc.Vec2(anchor.x, anchor.z);
    player.setPosition(anchor.x, anchor.y + layoutConfig.player.height * 0.5, anchor.z);
    activeProbe = null;
  }

  function consumePressed(key: string): boolean {
    if (!pressedKeys.has(key)) {
      return false;
    }
    pressedKeys.delete(key);
    return true;
  }

  function canOccupy(x: number, z: number): boolean {
    if (!isOnWalkableSurface(registry.walkAreas, x, z)) {
      return false;
    }

    return !collidesWithBlocker(registry.blockers, x, z);
  }
};

const isOnWalkableSurface = (walkAreas: RuntimeWalkArea[], x: number, z: number): boolean =>
  walkAreas.some((area) => {
    const edge = layoutConfig.player.edgeBuffer;
    return (
      x >= area.xMin + edge &&
      x <= area.xMax - edge &&
      z >= area.zMin + edge &&
      z <= area.zMax - edge
    );
  });

const collidesWithBlocker = (
  blockers: RuntimeBlocker[],
  x: number,
  z: number
): boolean =>
  blockers.some((blocker) => {
    const nearestX = pc.math.clamp(x, blocker.xMin, blocker.xMax);
    const nearestZ = pc.math.clamp(z, blocker.zMin, blocker.zMax);
    const distanceSquared = (x - nearestX) ** 2 + (z - nearestZ) ** 2;
    return distanceSquared < layoutConfig.player.radius ** 2;
  });

const normalizeKey = (key: string): string =>
  key.length === 1 ? key.toLowerCase() : key.toLowerCase();

const lerpAngle = (current: number, target: number, t: number): number => {
  let delta = (target - current) % 360;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  return current + delta * Math.min(1, t);
};
