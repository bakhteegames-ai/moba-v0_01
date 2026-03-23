import { type BuildContext, addBox, addCylinder, addWalkArea } from '../scene/grayboxFactory';

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

export const buildLowerZone = (ctx: BuildContext): void => {
  for (const walkArea of ctx.config.walkAreas) {
    if (!laneWalkAreaIds.has(walkArea.id)) {
      addWalkArea(ctx, walkArea);
    }
  }

  const lowerRoot = ctx.registry.lowerRoot;
  const lift = ctx.config.elevations.markerLift;
  const lowerTop = ctx.config.elevations.lowerTop;

  const objectives = [
    {
      name: 'VisionObjective',
      center: { x: -18, y: -31 },
      padRadius: 3.2,
      pillarRadius: 1,
      pillarHeight: 3.4,
      material: ctx.palette.zone.vision
    },
    {
      name: 'PressureObjective',
      center: { x: 18, y: -22 },
      padRadius: 3.2,
      pillarRadius: 1,
      pillarHeight: 3.4,
      material: ctx.palette.zone.pressure
    },
    {
      name: 'BossObjective',
      center: { x: 0, y: -46 },
      padRadius: 6,
      pillarRadius: 1.8,
      pillarHeight: 4.6,
      material: ctx.palette.zone.boss
    }
  ];

  for (const objective of objectives) {
    addCylinder(ctx, {
      name: `${objective.name}Pad`,
      center: objective.center,
      radius: objective.padRadius,
      height: 0.12,
      y: lowerTop + lift,
      material: objective.material,
      parent: lowerRoot
    });

    addCylinder(ctx, {
      name: objective.name,
      center: objective.center,
      radius: objective.pillarRadius,
      height: objective.pillarHeight,
      y: lowerTop + objective.pillarHeight * 0.5,
      material: ctx.palette.objective,
      parent: lowerRoot
    });
  }

  const sideEntryMarkers = [
    { name: 'BlueSafeRampMarker', center: { x: -54, y: -8 }, size: { width: 8, depth: 3 }, material: ctx.palette.zone.safe },
    { name: 'RedSafeRampMarker', center: { x: 54, y: -8 }, size: { width: 8, depth: 3 }, material: ctx.palette.zone.safe },
    { name: 'MidConnectorMarker', center: { x: 0, y: -8 }, size: { width: 10, depth: 3 }, material: ctx.palette.zone.contested },
    { name: 'PressureReturnMarker', center: { x: 36, y: 0 }, size: { width: 10, depth: 3 }, material: ctx.palette.zone.pressure },
    { name: 'BossWestMouth', center: { x: -14, y: -40 }, size: { width: 10, depth: 3 }, material: ctx.palette.zone.boss },
    { name: 'BossEastMouth', center: { x: 14, y: -40 }, size: { width: 10, depth: 3 }, material: ctx.palette.zone.boss },
    { name: 'BossFrontMouth', center: { x: 0, y: -39 }, size: { width: 10, depth: 3 }, material: ctx.palette.zone.boss }
  ];

  for (const marker of sideEntryMarkers) {
    addBox(ctx, {
      name: marker.name,
      center: marker.center,
      size: marker.size,
      height: 0.1,
      y: lowerTop + lift,
      material: marker.material,
      parent: lowerRoot
    });
  }

  const riskExposureMarkers = [
    { name: 'BlueRiskExposureNearPocket', center: { x: -55, y: -34.8 }, size: { width: 1.4, depth: 7.2 } },
    { name: 'BlueRiskExposureMid', center: { x: -43, y: -36 }, size: { width: 1.2, depth: 6.2 } },
    { name: 'BlueRiskExposureNearConnector', center: { x: -29, y: -35.2 }, size: { width: 1.2, depth: 6.8 } },
    { name: 'RedRiskExposureNearPocket', center: { x: 55, y: -34.8 }, size: { width: 1.4, depth: 7.2 } },
    { name: 'RedRiskExposureMid', center: { x: 43, y: -36 }, size: { width: 1.2, depth: 6.2 } },
    { name: 'RedRiskExposureNearConnector', center: { x: 29, y: -35.2 }, size: { width: 1.2, depth: 6.8 } }
  ];

  for (const marker of riskExposureMarkers) {
    addBox(ctx, {
      name: marker.name,
      center: marker.center,
      size: marker.size,
      height: 0.1,
      y: lowerTop + lift + 0.02,
      material: ctx.palette.zone.risk,
      parent: lowerRoot
    });
  }

  const bossPocketWalls = [
    { name: 'BossNorthWestWall', center: { x: -9.5, y: -37 }, size: { width: 3, depth: 2.5 } },
    { name: 'BossNorthEastWall', center: { x: 9.5, y: -37 }, size: { width: 3, depth: 2.5 } },
    { name: 'BossWestOuterWall', center: { x: -23.5, y: -44 }, size: { width: 2, depth: 12 } },
    { name: 'BossEastOuterWall', center: { x: 23.5, y: -44 }, size: { width: 2, depth: 12 } },
    { name: 'BossSouthWall', center: { x: 0, y: -55 }, size: { width: 18, depth: 2 } }
  ];

  for (const wall of bossPocketWalls) {
    addBox(ctx, {
      name: wall.name,
      center: wall.center,
      size: wall.size,
      height: 2.4,
      y: 1.2,
      material: ctx.palette.zone.structure,
      parent: lowerRoot
    });
  }
};
