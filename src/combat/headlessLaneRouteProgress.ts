import { type CombatVector2 } from './headlessCombatCore';

export interface HeadlessLaneRouteProgressModel {
  sampleNormalizedProgress(position: CombatVector2): number;
}

interface RouteSegment {
  start: CombatVector2;
  delta: CombatVector2;
  length: number;
  lengthSquared: number;
  cumulativeStartLength: number;
}

export const createHeadlessLaneRouteProgressModel = (
  routePoints: CombatVector2[]
): HeadlessLaneRouteProgressModel => {
  if (routePoints.length < 2) {
    throw new Error('Lane route progress requires at least two route points.');
  }

  const segments: RouteSegment[] = [];
  let totalLength = 0;

  for (let pointIndex = 1; pointIndex < routePoints.length; pointIndex += 1) {
    const start = routePoints[pointIndex - 1];
    const end = routePoints[pointIndex];
    const delta = {
      x: end.x - start.x,
      z: end.z - start.z
    };
    const lengthSquared = delta.x ** 2 + delta.z ** 2;
    const length = Math.sqrt(lengthSquared);

    if (length <= Number.EPSILON) {
      continue;
    }

    segments.push({
      start,
      delta,
      length,
      lengthSquared,
      cumulativeStartLength: totalLength
    });
    totalLength += length;
  }

  if (totalLength <= Number.EPSILON || segments.length === 0) {
    throw new Error('Lane route progress requires a non-zero route length.');
  }

  return {
    sampleNormalizedProgress(position) {
      let bestDistanceSquared = Number.POSITIVE_INFINITY;
      let bestProjectedLength = 0;

      for (const segment of segments) {
        const local = {
          x: position.x - segment.start.x,
          z: position.z - segment.start.z
        };
        const projectionScalar = clamp(
          (local.x * segment.delta.x + local.z * segment.delta.z) /
            segment.lengthSquared,
          0,
          1
        );
        const projected = {
          x: segment.start.x + segment.delta.x * projectionScalar,
          z: segment.start.z + segment.delta.z * projectionScalar
        };
        const distanceSquared =
          (position.x - projected.x) ** 2 + (position.z - projected.z) ** 2;

        if (distanceSquared < bestDistanceSquared) {
          bestDistanceSquared = distanceSquared;
          bestProjectedLength =
            segment.cumulativeStartLength + segment.length * projectionScalar;
        }
      }

      return clamp(bestProjectedLength / totalLength, 0, 1);
    }
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
