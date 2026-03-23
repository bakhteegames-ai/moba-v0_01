import { layoutConfig } from '../config/layout';
import {
  type LanePressureSegment,
  type StructurePressureTier
} from './pressureCalibrationScaffold';

type SegmentValues = Record<LanePressureSegment, number>;
type TierValues = Record<StructurePressureTier, number>;

interface PrototypeWaveInstance {
  id: number;
  ageSeconds: number;
  segmentIndex: number;
  segmentTimeSeconds: number;
}

export interface PrototypeStructureContactState {
  active: boolean;
  windowSeconds: number;
  pressure: number;
}

export interface PrototypeDefenderTimingTag {
  delayTagSeconds: number;
  reclearTagSeconds: number;
}

export interface PrototypeLaneOccupancySnapshot {
  elapsedSeconds: number;
  cycleSeconds: number;
  spawnIntervalSeconds: number;
  spawnedWaveCount: number;
  activeWaveCount: number;
  frontWaveSegment: LanePressureSegment;
  frontWaveProgress: number;
  segmentOccupancyCount: SegmentValues;
  segmentOccupancyPresence: SegmentValues;
  segmentTimeInSegmentSeconds: SegmentValues;
  consecutiveWaveCarryoverRelevance: number;
  structureContactByTier: Record<StructurePressureTier, PrototypeStructureContactState>;
  defenderTimingTagsByTier: Record<StructurePressureTier, PrototypeDefenderTimingTag>;
}

export interface PrototypeLaneOccupancyProducer {
  update(dt: number): void;
  getSnapshot(): PrototypeLaneOccupancySnapshot;
}

interface ProducerState {
  elapsedSeconds: number;
  spawnAccumulator: number;
  nextWaveId: number;
  spawnedWaveCount: number;
  waves: PrototypeWaveInstance[];
  contactWindowsByTier: TierValues;
}

const segmentOrder: LanePressureSegment[] = [
  'outer-front',
  'inner-siege',
  'core-approach'
];

const tierOrder: StructurePressureTier[] = ['outer', 'inner', 'core'];

const segmentLengths: SegmentValues = {
  'outer-front': 30,
  'inner-siege': 26,
  'core-approach': 10
};

const contactThresholdByTier: TierValues = {
  outer: 0.55,
  inner: 0.44,
  core: 0.36
};

const contactWindowPeakSeconds: TierValues = {
  outer: 4.2,
  inner: 4.8,
  core: 5.2
};

const baseDelaySecondsByTier: TierValues = {
  outer: 1.55,
  inner: 1.2,
  core: 0.95
};

const baseReclearSecondsByTier: TierValues = {
  outer: 1.95,
  inner: 1.72,
  core: 1.5
};

const occupancySaturationCount = 2;
const contactWindowDecayPerSecond = 0.85;
const contactActiveMinPressure = 0.02;
const carryoverGapReference = 1.2;

const segmentDurations = buildSegmentDurations();
const cycleSeconds = segmentOrder.reduce(
  (total, segment) => total + segmentDurations[segment],
  0
);
const spawnIntervalSeconds = Math.max(
  3.5,
  layoutConfig.tempo.coefficients.waveHoldDurationSeconds
);

export const createPrototypeLaneOccupancyProducer =
  (): PrototypeLaneOccupancyProducer => {
    const state: ProducerState = {
      elapsedSeconds: 0,
      spawnAccumulator: spawnIntervalSeconds * 0.65,
      nextWaveId: 1,
      spawnedWaveCount: 0,
      waves: [],
      contactWindowsByTier: {
        outer: 0,
        inner: 0,
        core: 0
      }
    };

    spawnWave(state);

    return {
      update(dt) {
        if (dt <= 0) {
          return;
        }

        state.elapsedSeconds += dt;
        state.spawnAccumulator += dt;

        while (state.spawnAccumulator >= spawnIntervalSeconds) {
          state.spawnAccumulator -= spawnIntervalSeconds;
          spawnWave(state);
        }

        advanceWaves(state, dt);
        updateContactWindows(state, dt);
      },
      getSnapshot() {
        return buildSnapshot(state);
      }
    };
  };

function buildSegmentDurations(): SegmentValues {
  const speed = Math.max(0.5, layoutConfig.player.moveSpeed);
  return {
    'outer-front': segmentLengths['outer-front'] / speed,
    'inner-siege': segmentLengths['inner-siege'] / speed,
    'core-approach': segmentLengths['core-approach'] / speed
  };
}

const spawnWave = (state: ProducerState): void => {
  state.waves.push({
    id: state.nextWaveId,
    ageSeconds: 0,
    segmentIndex: 0,
    segmentTimeSeconds: 0
  });
  state.nextWaveId += 1;
  state.spawnedWaveCount += 1;
};

const advanceWaves = (state: ProducerState, dt: number): void => {
  for (const wave of state.waves) {
    wave.ageSeconds += dt;
    wave.segmentTimeSeconds += dt;

    while (wave.segmentIndex < segmentOrder.length) {
      const segment = segmentOrder[wave.segmentIndex];
      const duration = segmentDurations[segment];
      if (wave.segmentTimeSeconds < duration) {
        break;
      }

      wave.segmentTimeSeconds -= duration;
      wave.segmentIndex += 1;
    }
  }

  state.waves = state.waves.filter((wave) => wave.segmentIndex < segmentOrder.length);
};

const updateContactWindows = (state: ProducerState, dt: number): void => {
  const rawContact = computeRawContactByTier(state.waves);

  for (const tier of tierOrder) {
    if (rawContact[tier] > contactActiveMinPressure) {
      state.contactWindowsByTier[tier] = Math.min(
        contactWindowPeakSeconds[tier],
        state.contactWindowsByTier[tier] + dt
      );
    } else {
      state.contactWindowsByTier[tier] = Math.max(
        0,
        state.contactWindowsByTier[tier] - dt * contactWindowDecayPerSecond
      );
    }
  }
};

const buildSnapshot = (state: ProducerState): PrototypeLaneOccupancySnapshot => {
  const segmentOccupancyCount = makeSegmentValues(0);
  const segmentTimeTotals = makeSegmentValues(0);
  let frontWave: PrototypeWaveInstance | null = null;

  for (const wave of state.waves) {
    const segment = segmentOrder[wave.segmentIndex];
    segmentOccupancyCount[segment] += 1;
    segmentTimeTotals[segment] += wave.segmentTimeSeconds;

    if (!frontWave || waveProgressDistance(wave) > waveProgressDistance(frontWave)) {
      frontWave = wave;
    }
  }

  const segmentOccupancyPresence: SegmentValues = {
    'outer-front': clamp(segmentOccupancyCount['outer-front'] / occupancySaturationCount, 0, 1),
    'inner-siege': clamp(segmentOccupancyCount['inner-siege'] / occupancySaturationCount, 0, 1),
    'core-approach': clamp(
      segmentOccupancyCount['core-approach'] / occupancySaturationCount,
      0,
      1
    )
  };

  const segmentTimeInSegmentSeconds: SegmentValues = {
    'outer-front': segmentOccupancyCount['outer-front'] > 0
      ? segmentTimeTotals['outer-front'] / segmentOccupancyCount['outer-front']
      : 0,
    'inner-siege': segmentOccupancyCount['inner-siege'] > 0
      ? segmentTimeTotals['inner-siege'] / segmentOccupancyCount['inner-siege']
      : 0,
    'core-approach': segmentOccupancyCount['core-approach'] > 0
      ? segmentTimeTotals['core-approach'] / segmentOccupancyCount['core-approach']
      : 0
  };

  const frontWaveSegment = frontWave
    ? segmentOrder[frontWave.segmentIndex]
    : 'outer-front';
  const frontWaveProgress = frontWave
    ? waveSegmentProgress(frontWave)
    : 0;

  const rawContactByTier = computeRawContactByTier(state.waves);
  const structureContactByTier = buildStructureContactByTier(
    rawContactByTier,
    state.contactWindowsByTier
  );
  const defenderTimingTagsByTier = buildDefenderTimingTagsByTier(
    segmentOccupancyPresence,
    structureContactByTier
  );

  return {
    elapsedSeconds: state.elapsedSeconds,
    cycleSeconds,
    spawnIntervalSeconds,
    spawnedWaveCount: state.spawnedWaveCount,
    activeWaveCount: state.waves.length,
    frontWaveSegment,
    frontWaveProgress,
    segmentOccupancyCount,
    segmentOccupancyPresence,
    segmentTimeInSegmentSeconds,
    consecutiveWaveCarryoverRelevance: computeConsecutiveCarryoverRelevance(
      state.waves,
      segmentOccupancyPresence,
      structureContactByTier
    ),
    structureContactByTier,
    defenderTimingTagsByTier
  };
};

const buildStructureContactByTier = (
  rawContactByTier: TierValues,
  windowsByTier: TierValues
): Record<StructurePressureTier, PrototypeStructureContactState> => ({
  outer: buildTierContactState('outer', rawContactByTier.outer, windowsByTier.outer),
  inner: buildTierContactState('inner', rawContactByTier.inner, windowsByTier.inner),
  core: buildTierContactState('core', rawContactByTier.core, windowsByTier.core)
});

const buildTierContactState = (
  tier: StructurePressureTier,
  rawContact: number,
  windowSeconds: number
): PrototypeStructureContactState => {
  const windowNormalized = clamp(
    windowSeconds / contactWindowPeakSeconds[tier],
    0,
    1
  );

  return {
    active: rawContact > contactActiveMinPressure || windowSeconds > 0.15,
    windowSeconds,
    pressure: clamp(rawContact * 0.72 + windowNormalized * 0.28, 0, 1)
  };
};

const buildDefenderTimingTagsByTier = (
  segmentOccupancyPresence: SegmentValues,
  structureContactByTier: Record<StructurePressureTier, PrototypeStructureContactState>
): Record<StructurePressureTier, PrototypeDefenderTimingTag> => ({
  outer: buildTierDefenderTag(
    'outer',
    segmentOccupancyPresence['outer-front'],
    structureContactByTier.outer
  ),
  inner: buildTierDefenderTag(
    'inner',
    segmentOccupancyPresence['inner-siege'],
    structureContactByTier.inner
  ),
  core: buildTierDefenderTag(
    'core',
    segmentOccupancyPresence['core-approach'],
    structureContactByTier.core
  )
});

const buildTierDefenderTag = (
  tier: StructurePressureTier,
  occupancyPresence: number,
  contact: PrototypeStructureContactState
): PrototypeDefenderTimingTag => {
  const windowNormalized = clamp(
    contact.windowSeconds / contactWindowPeakSeconds[tier],
    0,
    1
  );

  const delayTagSeconds = contact.active
    ? Math.max(
        0.3,
        baseDelaySecondsByTier[tier] -
          occupancyPresence * 0.26 -
          contact.pressure * 0.35 -
          windowNormalized * 0.18
      )
    : baseDelaySecondsByTier[tier] + 0.25;

  const reclearTagSeconds = contact.active
    ? Math.max(
        0.45,
        baseReclearSecondsByTier[tier] +
          occupancyPresence * 0.36 +
          contact.pressure * 0.4 +
          windowNormalized * 0.25
      )
    : Math.max(0.45, baseReclearSecondsByTier[tier] * 0.78);

  return {
    delayTagSeconds,
    reclearTagSeconds
  };
};

const computeRawContactByTier = (waves: PrototypeWaveInstance[]): TierValues => {
  const byTier: TierValues = {
    outer: 0,
    inner: 0,
    core: 0
  };

  for (const wave of waves) {
    const segment = segmentOrder[wave.segmentIndex];
    const progress = waveSegmentProgress(wave);

    if (segment === 'outer-front' && progress >= contactThresholdByTier.outer) {
      byTier.outer += (progress - contactThresholdByTier.outer) / (1 - contactThresholdByTier.outer);
    } else if (segment === 'inner-siege' && progress >= contactThresholdByTier.inner) {
      byTier.inner += (progress - contactThresholdByTier.inner) / (1 - contactThresholdByTier.inner);
    } else if (segment === 'core-approach' && progress >= contactThresholdByTier.core) {
      byTier.core += (progress - contactThresholdByTier.core) / (1 - contactThresholdByTier.core);
    }
  }

  return {
    outer: clamp(byTier.outer / 1.2, 0, 1),
    inner: clamp(byTier.inner / 1.1, 0, 1),
    core: clamp(byTier.core / 1.05, 0, 1)
  };
};

const computeConsecutiveCarryoverRelevance = (
  waves: PrototypeWaveInstance[],
  segmentPresence: SegmentValues,
  structureContactByTier: Record<StructurePressureTier, PrototypeStructureContactState>
): number => {
  if (waves.length <= 1) {
    return clamp(
      segmentPresence['inner-siege'] * 0.45 +
        segmentPresence['core-approach'] * 0.4 +
        structureContactByTier.core.pressure * 0.2,
      0,
      1
    );
  }

  const ordered = [...waves].sort(
    (a, b) => waveProgressDistance(b) - waveProgressDistance(a)
  );
  const front = ordered[0];
  const second = ordered[1];
  const gap = front && second
    ? Math.max(0, waveProgressDistance(front) - waveProgressDistance(second))
    : carryoverGapReference;
  const gapTightness = 1 - clamp(gap / carryoverGapReference, 0, 1);
  const stackedBonus = ordered.length >= 3 ? 0.1 : 0;

  return clamp(
    gapTightness * 0.4 +
      segmentPresence['inner-siege'] * 0.28 +
      segmentPresence['core-approach'] * 0.22 +
      structureContactByTier.inner.pressure * 0.1 +
      stackedBonus,
    0,
    1
  );
};

const waveProgressDistance = (wave: PrototypeWaveInstance): number =>
  wave.segmentIndex + waveSegmentProgress(wave);

const waveSegmentProgress = (wave: PrototypeWaveInstance): number => {
  const segment = segmentOrder[wave.segmentIndex];
  if (!segment) {
    return 1;
  }
  const duration = Math.max(0.001, segmentDurations[segment]);
  return clamp(wave.segmentTimeSeconds / duration, 0, 1);
};

const makeSegmentValues = (value: number): SegmentValues => ({
  'outer-front': value,
  'inner-siege': value,
  'core-approach': value
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
