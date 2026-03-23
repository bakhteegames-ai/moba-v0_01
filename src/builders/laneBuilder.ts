import { type BuildContext, addBox, addCapsule, addCylinder, addDangerDisc, addWalkArea } from '../scene/grayboxFactory';

const laneWalkAreaIds = new Set([
  'blue-core-area',
  'blue-core-approach',
  'blue-inner-siege',
  'blue-outer-lane',
  'mid-lane',
  'red-outer-lane',
  'red-inner-siege',
  'red-core-approach',
  'red-core-area'
]);

export const buildLane = (ctx: BuildContext): void => {
  for (const walkArea of ctx.config.walkAreas) {
    if (laneWalkAreaIds.has(walkArea.id)) {
      addWalkArea(ctx, walkArea);
    }
  }

  const laneRoot = ctx.registry.laneRoot;
  const laneTop = ctx.config.elevations.laneTop;
  const markerLift = ctx.config.elevations.markerLift;

  const towerAnchors = [
    { name: 'BlueOuterTower', x: -44, radius: 2, dangerRadius: 9.5 },
    { name: 'BlueInnerTower', x: -74, radius: 2.2, dangerRadius: 10.5 },
    { name: 'RedOuterTower', x: 44, radius: 2, dangerRadius: 9.5 },
    { name: 'RedInnerTower', x: 74, radius: 2.2, dangerRadius: 10.5 }
  ];

  for (const tower of towerAnchors) {
    addCylinder(ctx, {
      name: `${tower.name}Pad`,
      center: { x: tower.x, y: 0 },
      radius: 4.1,
      height: 0.12,
      y: laneTop + markerLift,
      material: ctx.palette.zone.structure,
      parent: laneRoot
    });

    addCylinder(ctx, {
      name: tower.name,
      center: { x: tower.x, y: 0 },
      radius: tower.radius,
      height: 6,
      y: laneTop + 3,
      material: ctx.palette.neutral,
      parent: laneRoot
    });

    addDangerDisc(ctx, { x: tower.x, y: 0 }, tower.dangerRadius, laneTop);
  }

  const cores = [
    { name: 'BlueCore', x: -110 },
    { name: 'RedCore', x: 110 }
  ];

  for (const core of cores) {
    addBox(ctx, {
      name: `${core.name}Pad`,
      center: { x: core.x, y: 0 },
      size: { width: 12, depth: 12 },
      height: 0.12,
      y: laneTop + markerLift,
      material: ctx.palette.zone.structure,
      parent: laneRoot
    });

    addCapsule(ctx, {
      name: core.name,
      center: { x: core.x, y: 0 },
      radius: 3,
      height: 7,
      y: laneTop + 3.5,
      material: ctx.palette.neutral,
      parent: laneRoot
    });

    addDangerDisc(ctx, { x: core.x, y: 0 }, 13.5, laneTop);
  }

  for (let x = -96; x <= 96; x += 12) {
    addCylinder(ctx, {
      name: `WaveMarker${x}`,
      center: { x, y: 0 },
      radius: 0.65,
      height: 0.08,
      y: laneTop + markerLift,
      material: ctx.palette.routeSecondary,
      parent: laneRoot
    });
  }

  const siegeWindowMarkers = [
    { name: 'BlueSiegeWindowOne', x: -92 },
    { name: 'BlueSiegeWindowTwo', x: -98 },
    { name: 'RedSiegeWindowOne', x: 92 },
    { name: 'RedSiegeWindowTwo', x: 98 }
  ];

  for (const marker of siegeWindowMarkers) {
    addBox(ctx, {
      name: marker.name,
      center: { x: marker.x, y: 0 },
      size: { width: 2.4, depth: 9.6 },
      height: 0.1,
      y: laneTop + markerLift,
      material: ctx.palette.zone.pressure,
      parent: laneRoot
    });
  }

  const defenderExposureMarkers = [
    { name: 'BlueDefenderExposure', x: -98 },
    { name: 'RedDefenderExposure', x: 98 }
  ];

  for (const marker of defenderExposureMarkers) {
    addBox(ctx, {
      name: marker.name,
      center: { x: marker.x, y: 0 },
      size: { width: 1.2, depth: 12.2 },
      height: 0.1,
      y: laneTop + markerLift + 0.02,
      material: ctx.palette.zone.risk,
      parent: laneRoot
    });
  }

  const chokeWalls = [
    { name: 'BlueInnerNorthWall', center: { x: -59, y: 7.5 }, size: { width: 26, depth: 2 } },
    { name: 'BlueInnerSouthWall', center: { x: -59, y: -7.5 }, size: { width: 26, depth: 2 } },
    { name: 'RedInnerNorthWall', center: { x: 59, y: 7.5 }, size: { width: 26, depth: 2 } },
    { name: 'RedInnerSouthWall', center: { x: 59, y: -7.5 }, size: { width: 26, depth: 2 } }
  ];

  for (const wall of chokeWalls) {
    addBox(ctx, {
      name: wall.name,
      center: wall.center,
      size: wall.size,
      height: 2.2,
      y: laneTop + 1.1,
      material: ctx.palette.zone.structure,
      parent: laneRoot
    });
  }
};
