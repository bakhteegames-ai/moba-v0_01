import * as pc from 'playcanvas';
import { buildLane } from '../builders/laneBuilder';
import { buildLowerZone } from '../builders/lowerZoneBuilder';
import { layoutConfig } from '../config/layout';
import {
  addBlocker,
  addLightRig,
  addNodeAnchor,
  addRouteStrip,
  addTeleportAnchor,
  addWorldBase,
  createPalette,
  createSceneRegistry,
  type SceneRegistry
} from './grayboxFactory';

export const buildGrayboxScene = (app: pc.Application): SceneRegistry => {
  const registry = createSceneRegistry();
  const palette = createPalette(layoutConfig);
  const ctx = {
    app,
    config: layoutConfig,
    registry,
    palette
  };

  registry.root.addChild(registry.laneRoot);
  registry.root.addChild(registry.lowerRoot);
  registry.root.addChild(registry.debugRoot);
  app.root.addChild(registry.root);

  addWorldBase(ctx);
  addLightRig(ctx);
  buildLane(ctx);
  buildLowerZone(ctx);

  for (const blocker of layoutConfig.blockers) {
    addBlocker(ctx, blocker);
  }

  for (const [nodeId, node] of Object.entries(layoutConfig.nodes)) {
    addNodeAnchor(ctx, nodeId, node.position, node.elevation);
  }

  for (const teleport of layoutConfig.teleports) {
    addTeleportAnchor(ctx, teleport.id, teleport.position);
  }

  for (const route of layoutConfig.routes) {
    route.waypoints.forEach((point, index) => {
      if (index === 0) {
        return;
      }

      addRouteStrip(ctx, route.waypoints[index - 1], point, route.routeClass !== 'deep-invade');
    });
  }

  return registry;
};
