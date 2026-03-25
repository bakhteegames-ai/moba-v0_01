import * as pc from 'playcanvas';
import { type DebugSystem } from '../debug/debugBuilder';
import { layoutConfig, routeSelectionOrder } from '../config/layout';
import { type HeadlessCombatRuntime } from '../gameplay/headlessCombatRuntime';
import {
  consumeActionPressed,
  consumeBindingPressed,
  isActionDown,
  normalizeKeyboardActionKey,
  shouldPreventDefault
} from './playerInputActions';
import {
  bindWindowEvent,
  getBrowserNowSeconds
} from '../runtime/browserRuntime';
import {
  colorFromHex,
  surfaceHeightAt,
  type RouteProbeResult,
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
  debugSystem: DebugSystem,
  headlessCombat: HeadlessCombatRuntime
): PlayerTestController => {
  const keysDown = new Set<string>();
  const pressedKeys = new Set<string>();

  const playerMaterial = new pc.StandardMaterial();
  const playerColor = colorFromHex('#f7f4df');
  playerMaterial.diffuse = playerColor.clone();
  playerMaterial.emissive = playerColor.clone().mulScalar(0.1);
  playerMaterial.gloss = 18;
  playerMaterial.update();

  const laneBlockerMaterial = new pc.StandardMaterial();
  const laneBlockerColor = colorFromHex('#d36b62');
  laneBlockerMaterial.diffuse = laneBlockerColor.clone();
  laneBlockerMaterial.emissive = laneBlockerColor.clone().mulScalar(0.12);
  laneBlockerMaterial.gloss = 12;
  laneBlockerMaterial.update();

  const player = new pc.Entity('AuthoritativeHeroProxy');
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

  const laneBlocker = new pc.Entity('LaneBlockerProxy');
  laneBlocker.addComponent('render', {
    type: 'cylinder',
    material: laneBlockerMaterial
  });
  laneBlocker.setLocalScale(
    layoutConfig.player.radius * 2,
    layoutConfig.player.height * 0.8,
    layoutConfig.player.radius * 2
  );
  registry.root.addChild(laneBlocker);

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

  const routeIndexById = new Map(
    routeSelectionOrder.map((routeId, index) => [routeId, index])
  );
  let selectedRouteIndex = 0;
  let activeProbe: {
    routeId: string;
    startTimeSeconds: number;
  } | null = null;

  const keydown = (event: KeyboardEvent): void => {
    const key = normalizeKeyboardActionKey(event.key);
    if (!keysDown.has(key)) {
      pressedKeys.add(key);
    }
    keysDown.add(key);

    if (shouldPreventDefault(key)) {
      event.preventDefault();
    }
  };

  const keyup = (event: KeyboardEvent): void => {
    keysDown.delete(normalizeKeyboardActionKey(event.key));
  };

  const removeKeydownListener = bindWindowEvent('keydown', keydown);
  const removeKeyupListener = bindWindowEvent('keyup', keyup);

  teleportTo('midline');
  syncCombatPresentation();
  debugSystem.setSelectedRoute(routeSelectionOrder[selectedRouteIndex]);

  return {
    update(dt) {
      processHotkeys();
      updateMovementIntent();
      headlessCombat.update(dt);
      syncCombatPresentation();
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
      return activeProbe
        ? getBrowserNowSeconds() - activeProbe.startTimeSeconds
        : null;
    },
    destroy() {
      removeKeydownListener();
      removeKeyupListener();
      tacticalCamera.destroy();
      followCamera.destroy();
      laneBlocker.destroy();
      player.destroy();
    }
  };

  function processHotkeys(): void {
    if (consumeActionPressed(pressedKeys, 'toggle-camera')) {
      useFollowCamera = !useFollowCamera;
      tacticalCameraComponent.enabled = !useFollowCamera;
      followCameraComponent.enabled = useFollowCamera;
    }

    if (consumeActionPressed(pressedKeys, 'toggle-tactical-mode')) {
      topDownTactical = !topDownTactical;
    }

    if (consumeActionPressed(pressedKeys, 'toggle-labels')) {
      debugSystem.toggleLabels();
    }

    if (consumeActionPressed(pressedKeys, 'toggle-routes')) {
      debugSystem.toggleRoutes();
    }

    if (consumeActionPressed(pressedKeys, 'primary-action')) {
      headlessCombat.requestPlayerBasicCast();
    }

    if (consumeActionPressed(pressedKeys, 'previous-route')) {
      selectedRouteIndex =
        (selectedRouteIndex + routeSelectionOrder.length - 1) %
        routeSelectionOrder.length;
      debugSystem.setSelectedRoute(routeSelectionOrder[selectedRouteIndex]);
    }

    if (consumeActionPressed(pressedKeys, 'next-route')) {
      selectedRouteIndex =
        (selectedRouteIndex + 1) % routeSelectionOrder.length;
      debugSystem.setSelectedRoute(routeSelectionOrder[selectedRouteIndex]);
    }

    if (consumeActionPressed(pressedKeys, 'start-probe')) {
      startSelectedProbe();
    }

    for (const teleport of layoutConfig.teleports) {
      if (consumeBindingPressed(pressedKeys, [teleport.key.toLowerCase()])) {
        teleportTo(teleport.id);
      }
    }
  }

  function updateMovementIntent(): void {
    let moveX = 0;
    let moveZ = 0;

    if (isActionDown(keysDown, 'move-up')) {
      moveZ -= 1;
    }
    if (isActionDown(keysDown, 'move-down')) {
      moveZ += 1;
    }
    if (isActionDown(keysDown, 'move-left')) {
      moveX -= 1;
    }
    if (isActionDown(keysDown, 'move-right')) {
      moveX += 1;
    }

    headlessCombat.submitPlayerMovementIntent({
      x: moveX,
      z: moveZ
    });
  }

  function syncCombatPresentation(): void {
    const snapshot = headlessCombat.getSnapshot();
    const playerSurfaceHeight =
      surfaceHeightAt(
        registry.walkAreas,
        snapshot.player.position.x,
        snapshot.player.position.z
      ) ?? layoutConfig.elevations.lowerTop;
    player.setPosition(
      snapshot.player.position.x,
      playerSurfaceHeight + layoutConfig.player.height * 0.5,
      snapshot.player.position.z
    );
    player.setEulerAngles(
      0,
      pc.math.RAD_TO_DEG *
        Math.atan2(snapshot.player.facing.x, snapshot.player.facing.z) +
        180,
      0
    );

    if (snapshot.target.alive) {
      const targetSurfaceHeight =
        surfaceHeightAt(
          registry.walkAreas,
          snapshot.target.position.x,
          snapshot.target.position.z
        ) ?? layoutConfig.elevations.lowerTop;
      laneBlocker.enabled = true;
      laneBlocker.setPosition(
        snapshot.target.position.x,
        targetSurfaceHeight + layoutConfig.player.height * 0.4,
        snapshot.target.position.z
      );
    } else {
      laneBlocker.enabled = false;
    }
  }

  function updateCameras(dt: number): void {
    const focusPoint = player
      .getPosition()
      .clone()
      .add(new pc.Vec3(0, 1.4, 0));

    if (topDownTactical) {
      tacticalCamera.setPosition(0, 138, -20);
    } else {
      tacticalCamera.setPosition(0, 96, 44);
    }
    tacticalCamera.lookAt(focusPoint.x, 0, -20);

    const followOffset = new pc.Vec3(0, 18, 18);
    const followTarget = player.getPosition().clone().add(followOffset);
    const currentPosition = followCamera.getPosition();
    const lerped = currentPosition.lerp(
      currentPosition,
      followTarget,
      Math.min(1, dt * 4)
    );
    followCamera.setPosition(lerped);
    followCamera.lookAt(focusPoint);

    tacticalCameraComponent.enabled = !useFollowCamera;
    followCameraComponent.enabled = useFollowCamera;
  }

  function updateProbe(): void {
    if (!activeProbe) {
      return;
    }

    const route =
      layoutConfig.routes[routeIndexById.get(activeProbe.routeId) ?? 0];
    const end = route.waypoints[route.waypoints.length - 1];
    const playerPosition = headlessCombat.getPlayerPosition();
    const distanceToEnd = Math.hypot(
      end.x - playerPosition.x,
      end.y - playerPosition.z
    );
    if (distanceToEnd > 2.25) {
      return;
    }

    const elapsed =
      getBrowserNowSeconds() - activeProbe.startTimeSeconds;
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
    headlessCombat.teleportPlayer({
      x: start.x,
      z: start.y
    });
    syncCombatPresentation();
    activeProbe = {
      routeId: route.id,
      startTimeSeconds: getBrowserNowSeconds()
    };
    debugSystem.setRouteResult(null);
  }

  function teleportTo(id: string): void {
    const anchor = registry.teleportAnchors[id];
    if (!anchor) {
      return;
    }

    headlessCombat.teleportPlayer({
      x: anchor.x,
      z: anchor.z
    });
    syncCombatPresentation();
    activeProbe = null;
  }
};
