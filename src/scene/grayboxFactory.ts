import * as pc from 'playcanvas';
import {
  type CollisionBlockerDef,
  type LogicalPoint,
  type MapLayoutConfig,
  type WalkAreaDef,
  layoutConfig
} from '../config/layout';

export interface RuntimeWalkArea extends WalkAreaDef {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface RuntimeBlocker extends CollisionBlockerDef {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface RouteProbeResult {
  routeId: string;
  label: string;
  actualSeconds: number;
  targetMin?: number;
  targetMax?: number;
  severity?: 'hard' | 'soft';
  note?: string;
}

export interface MaterialPalette {
  zone: Record<string, pc.StandardMaterial>;
  danger: pc.StandardMaterial;
  route: pc.StandardMaterial;
  routeSecondary: pc.StandardMaterial;
  neutral: pc.StandardMaterial;
  objective: pc.StandardMaterial;
}

export interface SceneRegistry {
  root: pc.Entity;
  laneRoot: pc.Entity;
  lowerRoot: pc.Entity;
  debugRoot: pc.Entity;
  walkAreas: RuntimeWalkArea[];
  blockers: RuntimeBlocker[];
  nodeAnchors: Record<string, pc.Entity>;
  routeEntities: pc.Entity[];
  dangerEntities: pc.Entity[];
  objectiveEntities: pc.Entity[];
  teleportAnchors: Record<string, pc.Vec3>;
  lights: pc.Entity[];
}

export interface BuildContext {
  app: pc.Application;
  config: MapLayoutConfig;
  registry: SceneRegistry;
  palette: MaterialPalette;
}

const floorThickness = layoutConfig.elevations.floorThickness;

export const logicalToWorld = (point: LogicalPoint, elevation: number): pc.Vec3 =>
  new pc.Vec3(point.x, elevation, point.y);

export const colorFromHex = (hex: string): pc.Color => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  return new pc.Color(red, green, blue, 1);
};

const createMaterial = (
  color: string,
  options?: {
    opacity?: number;
    emissive?: number;
    depthWrite?: boolean;
    cull?: number;
  }
): pc.StandardMaterial => {
  const material = new pc.StandardMaterial();
  const colorValue = colorFromHex(color);
  material.diffuse = colorValue.clone();
  material.emissive = colorValue.clone().mulScalar(options?.emissive ?? 0.08);
  material.gloss = 16;
  material.useMetalness = false;

  if (typeof options?.opacity === 'number' && options.opacity < 1) {
    material.opacity = options.opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = options.depthWrite ?? false;
  }

  if (typeof options?.cull === 'number') {
    material.cull = options.cull;
  }

  material.update();
  return material;
};

export const createPalette = (config: MapLayoutConfig): MaterialPalette => ({
  zone: {
    lane: createMaterial(config.colors.lane),
    safe: createMaterial(config.colors.safe),
    contested: createMaterial(config.colors.contested),
    pressure: createMaterial(config.colors.pressure),
    vision: createMaterial(config.colors.vision),
    boss: createMaterial(config.colors.boss),
    risk: createMaterial(config.colors.risk),
    structure: createMaterial(config.colors.structure)
  },
  danger: createMaterial(config.colors.danger, {
    opacity: 0.22,
    emissive: 0.14,
    depthWrite: false,
    cull: pc.CULLFACE_NONE
  }),
  route: createMaterial(config.colors.route, {
    opacity: 0.78,
    emissive: 0.16,
    depthWrite: false
  }),
  routeSecondary: createMaterial(config.colors.routeSecondary, {
    opacity: 0.5,
    emissive: 0.12,
    depthWrite: false
  }),
  neutral: createMaterial('#c6ccd6'),
  objective: createMaterial('#f7f7f7')
});

export const createSceneRegistry = (): SceneRegistry => ({
  root: new pc.Entity('GrayboxRoot'),
  laneRoot: new pc.Entity('LaneRoot'),
  lowerRoot: new pc.Entity('LowerRoot'),
  debugRoot: new pc.Entity('DebugRoot'),
  walkAreas: [],
  blockers: [],
  nodeAnchors: {},
  routeEntities: [],
  dangerEntities: [],
  objectiveEntities: [],
  teleportAnchors: {},
  lights: []
});

export const addLightRig = (ctx: BuildContext): void => {
  ctx.app.scene.ambientLight = new pc.Color(0.34, 0.37, 0.42);

  const sun = new pc.Entity('SunLight');
  sun.addComponent('light', {
    type: 'directional',
    intensity: 1.35,
    castShadows: false
  });
  sun.setEulerAngles(50, 35, 0);
  ctx.registry.root.addChild(sun);
  ctx.registry.lights.push(sun);
};

export const addWorldBase = (ctx: BuildContext): void => {
  const floor = new pc.Entity('WorldBase');
  floor.addComponent('render', {
    type: 'box',
    material: createMaterial(ctx.config.colors.void)
  });
  floor.setLocalScale(280, 0.3, 160);
  floor.setPosition(0, -0.4, -20);
  ctx.registry.root.addChild(floor);
};

export const addNodeAnchor = (
  ctx: BuildContext,
  id: string,
  point: LogicalPoint,
  elevation: number,
  lift = ctx.config.elevations.labelLift
): void => {
  const anchor = new pc.Entity(`Anchor:${id}`);
  anchor.setPosition(logicalToWorld(point, elevation + lift));
  ctx.registry.root.addChild(anchor);
  ctx.registry.nodeAnchors[id] = anchor;
};

export const addTeleportAnchor = (
  ctx: BuildContext,
  id: string,
  point: LogicalPoint
): void => {
  const surfaceHeight = surfaceHeightAt(ctx.registry.walkAreas, point.x, point.y) ?? ctx.config.elevations.lowerTop;
  ctx.registry.teleportAnchors[id] = logicalToWorld(point, surfaceHeight);
};

export const addWalkArea = (ctx: BuildContext, walkArea: WalkAreaDef): void => {
  const baseEntity = walkArea.kind === 'flat'
    ? createFlatWalkArea(ctx, walkArea)
    : createRampWalkArea(ctx, walkArea);

  const parent = walkArea.category === 'lane' || walkArea.category === 'structure'
    ? ctx.registry.laneRoot
    : ctx.registry.lowerRoot;

  parent.addChild(baseEntity);

  const halfWidth = walkArea.size.width * 0.5;
  const halfDepth = walkArea.size.depth * 0.5;
  ctx.registry.walkAreas.push({
    ...walkArea,
    xMin: walkArea.center.x - halfWidth,
    xMax: walkArea.center.x + halfWidth,
    zMin: walkArea.center.y - halfDepth,
    zMax: walkArea.center.y + halfDepth
  });
};

export const addBlocker = (ctx: BuildContext, blocker: CollisionBlockerDef): void => {
  const halfWidth = blocker.size.width * 0.5;
  const halfDepth = blocker.size.depth * 0.5;
  ctx.registry.blockers.push({
    ...blocker,
    xMin: blocker.center.x - halfWidth,
    xMax: blocker.center.x + halfWidth,
    zMin: blocker.center.y - halfDepth,
    zMax: blocker.center.y + halfDepth
  });
};

export const addBox = (
  ctx: BuildContext,
  options: {
    name: string;
    center: LogicalPoint;
    size: FootprintLike;
    height: number;
    y: number;
    material: pc.StandardMaterial;
    parent?: pc.Entity;
  }
): pc.Entity => {
  const entity = new pc.Entity(options.name);
  entity.addComponent('render', {
    type: 'box',
    material: options.material
  });
  entity.setLocalScale(options.size.width, options.height, options.size.depth);
  entity.setPosition(options.center.x, options.y, options.center.y);
  (options.parent ?? ctx.registry.root).addChild(entity);
  return entity;
};

export const addCylinder = (
  ctx: BuildContext,
  options: {
    name: string;
    center: LogicalPoint;
    radius: number;
    height: number;
    y: number;
    material: pc.StandardMaterial;
    parent?: pc.Entity;
  }
): pc.Entity => {
  const entity = new pc.Entity(options.name);
  entity.addComponent('render', {
    type: 'cylinder',
    material: options.material
  });
  entity.setLocalScale(options.radius * 2, options.height, options.radius * 2);
  entity.setPosition(options.center.x, options.y, options.center.y);
  (options.parent ?? ctx.registry.root).addChild(entity);
  return entity;
};

export const addCapsule = (
  ctx: BuildContext,
  options: {
    name: string;
    center: LogicalPoint;
    radius: number;
    height: number;
    y: number;
    material: pc.StandardMaterial;
    parent?: pc.Entity;
  }
): pc.Entity => {
  const entity = new pc.Entity(options.name);
  entity.addComponent('render', {
    type: 'capsule',
    material: options.material
  });
  entity.setLocalScale(options.radius * 2, options.height, options.radius * 2);
  entity.setPosition(options.center.x, options.y, options.center.y);
  (options.parent ?? ctx.registry.root).addChild(entity);
  return entity;
};

export const addRouteStrip = (
  ctx: BuildContext,
  from: LogicalPoint,
  to: LogicalPoint,
  primary: boolean
): pc.Entity => {
  const deltaX = to.x - from.x;
  const deltaZ = to.y - from.y;
  const length = Math.hypot(deltaX, deltaZ);
  const midX = (from.x + to.x) * 0.5;
  const midZ = (from.y + to.y) * 0.5;
  const surfaceHeight = surfaceHeightAt(ctx.registry.walkAreas, midX, midZ) ?? 0;
  const strip = new pc.Entity(`RouteStrip:${from.x},${from.y}`);
  strip.addComponent('render', {
    type: 'box',
    material: primary ? ctx.palette.route : ctx.palette.routeSecondary
  });
  strip.setLocalScale(length, 0.08, primary ? 0.55 : 0.42);
  strip.setPosition(midX, surfaceHeight + ctx.config.elevations.markerLift, midZ);
  strip.setEulerAngles(0, -pc.math.RAD_TO_DEG * Math.atan2(deltaZ, deltaX), 0);
  ctx.registry.debugRoot.addChild(strip);
  ctx.registry.routeEntities.push(strip);
  return strip;
};

export const addDangerDisc = (
  ctx: BuildContext,
  center: LogicalPoint,
  radius: number,
  elevation: number
): pc.Entity => {
  const entity = new pc.Entity(`Danger:${center.x},${center.y}`);
  entity.addComponent('render', {
    type: 'cylinder',
    material: ctx.palette.danger
  });
  entity.setLocalScale(radius * 2, 0.08, radius * 2);
  entity.setPosition(center.x, elevation + 0.04, center.y);
  ctx.registry.debugRoot.addChild(entity);
  ctx.registry.dangerEntities.push(entity);
  return entity;
};

export const surfaceHeightAt = (
  walkAreas: RuntimeWalkArea[],
  x: number,
  z: number
): number | null => {
  let height: number | null = null;

  for (const area of walkAreas) {
    if (x < area.xMin || x > area.xMax || z < area.zMin || z > area.zMax) {
      continue;
    }

    const currentHeight =
      area.kind === 'flat'
        ? area.topHeight
        : interpolateRampHeight(area, z);

    if (height === null || currentHeight > height) {
      height = currentHeight;
    }
  }

  return height;
};

const interpolateRampHeight = (area: RuntimeWalkArea, z: number): number => {
  const startHeight = area.startHeight ?? area.topHeight;
  const endHeight = area.endHeight ?? area.topHeight;
  const normalized = pc.math.clamp((z - area.zMin) / Math.max(area.zMax - area.zMin, 0.001), 0, 1);
  return pc.math.lerp(startHeight, endHeight, normalized);
};

const createFlatWalkArea = (ctx: BuildContext, walkArea: WalkAreaDef): pc.Entity => {
  const entity = new pc.Entity(walkArea.label);
  entity.addComponent('render', {
    type: 'box',
    material: ctx.palette.zone[walkArea.category]
  });
  entity.setLocalScale(walkArea.size.width, floorThickness, walkArea.size.depth);
  entity.setPosition(
    walkArea.center.x,
    walkArea.topHeight - floorThickness * 0.5,
    walkArea.center.y
  );
  return entity;
};

const createRampWalkArea = (ctx: BuildContext, walkArea: WalkAreaDef): pc.Entity => {
  const entity = new pc.Entity(walkArea.label);
  entity.addComponent('render', {
    type: 'box',
    material: ctx.palette.zone[walkArea.category]
  });

  const startHeight = walkArea.startHeight ?? walkArea.topHeight;
  const endHeight = walkArea.endHeight ?? walkArea.topHeight;
  const rise = endHeight - startHeight;
  const angle = Math.atan2(rise, walkArea.size.depth);
  const centerHeight = (startHeight + endHeight) * 0.5;

  entity.setLocalScale(
    walkArea.size.width,
    floorThickness,
    Math.sqrt(walkArea.size.depth ** 2 + rise ** 2)
  );
  entity.setPosition(
    walkArea.center.x,
    centerHeight - floorThickness * 0.5,
    walkArea.center.y
  );
  entity.setEulerAngles(pc.math.RAD_TO_DEG * angle, 0, 0);
  return entity;
};

interface FootprintLike {
  width: number;
  depth: number;
}
