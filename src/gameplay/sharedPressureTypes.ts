import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';

export type TierValues = Record<StructurePressureTier, number>;
export type SegmentValues = Record<LanePressureSegment, number>;
