import { type SegmentValues, type TierValues } from './sharedPressureTypes';

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const approach = (
  value: number,
  target: number,
  amount: number
): number => {
  if (value < target) {
    return Math.min(target, value + amount);
  }

  return Math.max(target, value - amount);
};

export const createZeroSegmentValues = (): SegmentValues => ({
  'outer-front': 0,
  'inner-siege': 0,
  'core-approach': 0
});

export const createZeroTierValues = (): TierValues => ({
  outer: 0,
  inner: 0,
  core: 0
});

export const cloneSnapshot = <T extends object>(snapshot: T): T => ({
  ...snapshot
});
