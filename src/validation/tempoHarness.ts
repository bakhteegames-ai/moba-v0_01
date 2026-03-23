import {
  layoutConfig,
  type MapLayoutConfig,
  type TempoBand,
  type ValidationBand
} from '../config/layout';

export interface TempoMetricResult {
  id: string;
  label: string;
  value: number;
  unit: 's' | 'ratio';
  status: ValidationBand;
  passMin: number;
  passMax: number;
  nearMin: number;
  nearMax: number;
  note: string;
}

export type TempoPresetId = 'current-default' | 'neutral' | 'defender-favored';

export type RobustnessVerdict =
  | 'robustly passes MMCP'
  | 'conditionally passes MMCP'
  | 'fails robustness check';

export interface TempoPresetResult {
  id: TempoPresetId;
  label: string;
  overall: ValidationBand;
  attackerWindowSeconds: number;
  defenderReclearSeconds: number;
  offLaneCycleSeconds: number;
  coefficients: TempoCoefficients;
  summary: {
    pass: number;
    nearMiss: number;
    fail: number;
  };
  results: TempoMetricResult[];
}

export interface TempoMetricSensitivity {
  id: string;
  label: string;
  sensitivity: 'stable' | 'moderate' | 'high';
  statuses: Array<{
    presetId: TempoPresetId;
    status: ValidationBand;
  }>;
}

type SweepCoefficientKey =
  | 'attackerPushPressureCoeff'
  | 'waveHoldDurationSeconds'
  | 'defenderReclearCoeff';

interface TempoSweepMetricFinding {
  statusAtBase: ValidationBand;
  valueAtBase: number;
  statusTrace: string;
  failThreshold?: number;
  marginFromCurrentDefault?: number;
}

export interface TempoSweepEntry {
  presetId: Extract<TempoPresetId, 'neutral' | 'defender-favored'>;
  presetLabel: string;
  coefficient: SweepCoefficientKey;
  coefficientLabel: string;
  outerInner: TempoSweepMetricFinding;
  twoWaveClosure: TempoSweepMetricFinding;
}

export interface TempoSweepSummary {
  entries: TempoSweepEntry[];
}

export interface TempoHarnessDebugState {
  overall: ValidationBand;
  robustnessVerdict: RobustnessVerdict;
  activePresetId: TempoPresetId;
  presets: TempoPresetResult[];
  metricSensitivity: TempoMetricSensitivity[];
  sweep: TempoSweepSummary;
  attackerWindowSeconds: number;
  defenderReclearSeconds: number;
  offLaneCycleSeconds: number;
  coefficients: TempoCoefficients;
  summary: {
    pass: number;
    nearMiss: number;
    fail: number;
  };
  results: TempoMetricResult[];
}

export interface TempoHarness {
  update(dt: number): void;
  getDebugState(): TempoHarnessDebugState;
  destroy(): void;
}

type TempoCoefficients = MapLayoutConfig['tempo']['coefficients'];

interface TempoPresetDef {
  id: TempoPresetId;
  label: string;
  coefficients: TempoCoefficients;
}

interface SweepAxisSpec {
  coefficient: SweepCoefficientKey;
  coefficientLabel: string;
  deltas: number[];
}

interface SweepSamplePoint {
  value: number;
  outerStatus: ValidationBand;
  outerValue: number;
  twoWaveStatus: ValidationBand;
  twoWaveValue: number;
}

const refreshIntervalSeconds = 0.25;
const activePresetId: TempoPresetId = 'current-default';
const roundPrecision = 3;
const sweepAxisSpecs: SweepAxisSpec[] = [
  {
    coefficient: 'attackerPushPressureCoeff',
    coefficientLabel: 'Atk Push Coeff',
    deltas: [0, -0.03, -0.06, -0.1, -0.14]
  },
  {
    coefficient: 'waveHoldDurationSeconds',
    coefficientLabel: 'Wave Hold (s)',
    deltas: [0, -0.25, -0.5, -0.75, -1]
  },
  {
    coefficient: 'defenderReclearCoeff',
    coefficientLabel: 'Def Re-clear Coeff',
    deltas: [0, -0.03, -0.06, -0.1, -0.14]
  }
];

export const createTempoHarness = (): TempoHarness => {
  let elapsedSinceRefresh = 0;
  let debugState = computeDebugState();

  return {
    update(dt) {
      elapsedSinceRefresh += dt;
      if (elapsedSinceRefresh < refreshIntervalSeconds) {
        return;
      }
      elapsedSinceRefresh = 0;
      debugState = computeDebugState();
    },
    getDebugState() {
      return debugState;
    },
    destroy() {
      // No runtime entities or listeners in this numeric-only harness.
    }
  };
};

const computeDebugState = (): TempoHarnessDebugState => {
  const presets = evaluatePresets();
  const active = presets.find((preset) => preset.id === activePresetId) ?? presets[0];

  if (!active) {
    throw new Error('Tempo harness failed to compute any preset result.');
  }

  return {
    overall: active.overall,
    robustnessVerdict: evaluateRobustnessVerdict(presets),
    activePresetId,
    presets,
    metricSensitivity: buildMetricSensitivity(presets),
    sweep: buildTinySweepSummary(presets),
    attackerWindowSeconds: active.attackerWindowSeconds,
    defenderReclearSeconds: active.defenderReclearSeconds,
    offLaneCycleSeconds: active.offLaneCycleSeconds,
    coefficients: active.coefficients,
    summary: active.summary,
    results: active.results
  };
};

const evaluatePresets = (): TempoPresetResult[] =>
  createPresetDefinitions().map((preset) => evaluatePreset(preset));

const createPresetDefinitions = (): TempoPresetDef[] => {
  const base = layoutConfig.tempo.coefficients;

  return [
    {
      id: 'current-default',
      label: 'Current Default',
      coefficients: cloneCoefficients(base)
    },
    {
      id: 'neutral',
      label: 'Neutral',
      coefficients: {
        ...cloneCoefficients(base),
        attackerPushPressureCoeff: 1.0,
        defenderReclearCoeff: 1.0,
        waveHoldDurationSeconds: 8.0
      }
    },
    {
      id: 'defender-favored',
      label: 'Defender Favored',
      coefficients: {
        ...cloneCoefficients(base),
        attackerPushPressureCoeff: 0.98,
        defenderReclearCoeff: 1.08,
        waveHoldDurationSeconds: 8.0,
        lanePressureDecayWindowSeconds: 7.0,
        offLanePunishWindowSeconds: 11.2
      }
    }
  ];
};

const evaluatePreset = (preset: TempoPresetDef): TempoPresetResult => {
  const { moveSpeed } = layoutConfig.player;
  const { bands } = layoutConfig.tempo;
  const { coefficients } = preset;

  const attackerWindowSeconds =
    coefficients.waveHoldDurationSeconds * coefficients.attackerPushPressureCoeff;
  const defenderReclearSeconds =
    routeSeconds('anti-defender-reclear-blue') / Math.max(0.2, coefficients.defenderReclearCoeff);
  const pressureReturnSeconds = routeSeconds('pressure-return');
  const offLaneCycleSeconds =
    routeSeconds('outer-entry-to-pressure') +
    coefficients.objectiveCommitSeconds +
    pressureReturnSeconds;

  const outerToInnerSeconds =
    Math.abs(
      layoutConfig.nodes.redInnerTower.position.x -
        layoutConfig.nodes.redOuterTower.position.x
    ) / moveSpeed;
  const continuationDecayPenalty = Math.max(
    0,
    outerToInnerSeconds - coefficients.lanePressureDecayWindowSeconds
  ) * 0.5;
  const continuationHeadroom =
    attackerWindowSeconds - outerToInnerSeconds - continuationDecayPenalty;

  const innerCoreSeconds = routeSeconds('anti-inner-core-push-blue');
  const innerDecayPenalty = Math.max(
    0,
    innerCoreSeconds - coefficients.lanePressureDecayWindowSeconds
  ) * 0.55;
  const innerCoreHeadroom = attackerWindowSeconds - innerCoreSeconds - innerDecayPenalty;

  const twoWaveClosureMargin =
    coefficients.waveHoldDurationSeconds * 2 * coefficients.attackerPushPressureCoeff -
    (routeSeconds('anti-two-wave-closure-blue') + defenderReclearSeconds);

  const defenderDelayRatio =
    defenderReclearSeconds / Math.max(0.25, coefficients.waveHoldDurationSeconds);
  const pressureDecayUseRatio =
    pressureReturnSeconds / Math.max(0.25, coefficients.lanePressureDecayWindowSeconds);
  const offLanePunishMargin = offLaneCycleSeconds - coefficients.offLanePunishWindowSeconds;

  const results: TempoMetricResult[] = [
    metric(
      'pressure-decay-rate',
      'Pressure Decay Use Ratio',
      pressureDecayUseRatio,
      'ratio',
      bands.pressureDecayUseRatio,
      'Checks if lane pressure decays quickly enough to avoid lingering stale advantage.'
    ),
    metric(
      'outer-inner-continuation',
      'Outer -> Inner Continuation Headroom',
      continuationHeadroom,
      's',
      bands.continuationHeadroom,
      'Positive headroom means the first push window can continue before decay closes it.'
    ),
    metric(
      'inner-core-pressure',
      'Inner -> Core Push Headroom',
      innerCoreHeadroom,
      's',
      bands.innerCoreHeadroom,
      'Measures whether late-lane pressure can still translate into a bounded Core-front window.'
    ),
    metric(
      'two-wave-closure',
      'Two-Wave Closure Margin',
      twoWaveClosureMargin,
      's',
      bands.twoWaveClosureMargin,
      'Measures closure viability after defender delay/re-clear tax is applied.'
    ),
    metric(
      'defender-hold-reclear',
      'Defender Hold/Re-clear Ratio',
      defenderDelayRatio,
      'ratio',
      bands.defenderDelayRatio,
      'Higher ratio means defenders can delay; too high implies risk of endless trivial clears.'
    ),
    metric(
      'offlane-punishability',
      'Off-Lane Punish Margin',
      offLanePunishMargin,
      's',
      bands.offLanePunishMargin,
      'Positive margin indicates rotating off lane without priority should be punishable.'
    )
  ];

  const summary = results.reduce(
    (acc, result) => {
      if (result.status === 'pass') {
        acc.pass += 1;
      } else if (result.status === 'near miss') {
        acc.nearMiss += 1;
      } else {
        acc.fail += 1;
      }
      return acc;
    },
    { pass: 0, nearMiss: 0, fail: 0 }
  );

  const overall: ValidationBand = summary.fail > 0
    ? 'fail'
    : summary.nearMiss > 0
      ? 'near miss'
      : 'pass';

  return {
    id: preset.id,
    label: preset.label,
    overall,
    attackerWindowSeconds,
    defenderReclearSeconds,
    offLaneCycleSeconds,
    coefficients: cloneCoefficients(coefficients),
    summary,
    results
  };
};

const evaluateRobustnessVerdict = (
  presets: TempoPresetResult[]
): RobustnessVerdict => {
  const current = presets.find((preset) => preset.id === 'current-default');
  if (!current || current.overall !== 'pass') {
    return 'fails robustness check';
  }

  const hasFail = presets.some((preset) => preset.overall === 'fail');
  if (hasFail) {
    return 'fails robustness check';
  }

  const hasNearMiss = presets.some((preset) => preset.overall === 'near miss');
  if (hasNearMiss) {
    return 'conditionally passes MMCP';
  }

  return 'robustly passes MMCP';
};

const buildMetricSensitivity = (
  presets: TempoPresetResult[]
): TempoMetricSensitivity[] => {
  const metricIds = presets[0]?.results.map((result) => result.id) ?? [];

  return metricIds.map((metricId) => {
    const label = presets[0]?.results.find((result) => result.id === metricId)?.label ?? metricId;
    const statuses = presets
      .map((preset) => {
        const metric = preset.results.find((result) => result.id === metricId);
        if (!metric) {
          return null;
        }
        return {
          presetId: preset.id,
          status: metric.status
        };
      })
      .filter((entry): entry is { presetId: TempoPresetId; status: ValidationBand } => entry !== null);

    const hasFail = statuses.some((status) => status.status === 'fail');
    const hasNearMiss = statuses.some((status) => status.status === 'near miss');
    const sensitivity = hasFail
      ? 'high'
      : hasNearMiss
        ? 'moderate'
        : 'stable';

    return {
      id: metricId,
      label,
      sensitivity,
      statuses
    };
  });
};

const buildTinySweepSummary = (
  presets: TempoPresetResult[]
): TempoSweepSummary => {
  const currentCoefficients = layoutConfig.tempo.coefficients;
  const basePresetIds: Array<Extract<TempoPresetId, 'neutral' | 'defender-favored'>> = [
    'neutral',
    'defender-favored'
  ];
  const entries: TempoSweepEntry[] = [];

  for (const presetId of basePresetIds) {
    const basePreset = presets.find((preset) => preset.id === presetId);
    if (!basePreset) {
      continue;
    }

    for (const axis of sweepAxisSpecs) {
      const samples = axis.deltas.map((delta) => {
        const sampledValue = roundTo(
          Math.max(0.2, basePreset.coefficients[axis.coefficient] + delta),
          roundPrecision
        );
        const sampledCoefficients: TempoCoefficients = {
          ...cloneCoefficients(basePreset.coefficients),
          [axis.coefficient]: sampledValue
        };
        const sampledResult = evaluatePreset({
          id: basePreset.id,
          label: basePreset.label,
          coefficients: sampledCoefficients
        });
        const outerMetric = getMetric(sampledResult, 'outer-inner-continuation');
        const twoWaveMetric = getMetric(sampledResult, 'two-wave-closure');

        return {
          value: sampledValue,
          outerStatus: outerMetric.status,
          outerValue: outerMetric.value,
          twoWaveStatus: twoWaveMetric.status,
          twoWaveValue: twoWaveMetric.value
        };
      });

      const outerBase = samples[0] ?? {
        value: basePreset.coefficients[axis.coefficient],
        outerStatus: getMetric(basePreset, 'outer-inner-continuation').status,
        outerValue: getMetric(basePreset, 'outer-inner-continuation').value,
        twoWaveStatus: getMetric(basePreset, 'two-wave-closure').status,
        twoWaveValue: getMetric(basePreset, 'two-wave-closure').value
      };

      const outerFailThreshold = estimateFailThreshold(samples, (sample) => sample.outerStatus);
      const twoWaveFailThreshold = estimateFailThreshold(samples, (sample) => sample.twoWaveStatus);
      const currentValue = currentCoefficients[axis.coefficient];

      entries.push({
        presetId,
        presetLabel: basePreset.label,
        coefficient: axis.coefficient,
        coefficientLabel: axis.coefficientLabel,
        outerInner: {
          statusAtBase: outerBase.outerStatus,
          valueAtBase: outerBase.outerValue,
          statusTrace: buildStatusTrace(samples, (sample) => sample.outerStatus),
          failThreshold: outerFailThreshold,
          marginFromCurrentDefault: typeof outerFailThreshold === 'number'
            ? roundTo(currentValue - outerFailThreshold, roundPrecision)
            : undefined
        },
        twoWaveClosure: {
          statusAtBase: outerBase.twoWaveStatus,
          valueAtBase: outerBase.twoWaveValue,
          statusTrace: buildStatusTrace(samples, (sample) => sample.twoWaveStatus),
          failThreshold: twoWaveFailThreshold,
          marginFromCurrentDefault: typeof twoWaveFailThreshold === 'number'
            ? roundTo(currentValue - twoWaveFailThreshold, roundPrecision)
            : undefined
        }
      });
    }
  }

  return { entries };
};

const buildStatusTrace = (
  samples: SweepSamplePoint[],
  statusAccessor: (sample: SweepSamplePoint) => ValidationBand
): string =>
  samples
    .map((sample) => bandCode(statusAccessor(sample)))
    .join('/');

const estimateFailThreshold = (
  samples: SweepSamplePoint[],
  statusAccessor: (sample: SweepSamplePoint) => ValidationBand
): number | undefined => {
  const sorted = [...samples].sort((a, b) => b.value - a.value);
  if (sorted.length === 0) {
    return undefined;
  }

  if (statusAccessor(sorted[0]) === 'fail') {
    return roundTo(sorted[0].value, roundPrecision);
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const higher = sorted[index];
    const lower = sorted[index + 1];
    if (statusAccessor(higher) !== 'fail' && statusAccessor(lower) === 'fail') {
      return roundTo((higher.value + lower.value) * 0.5, roundPrecision);
    }
  }

  return undefined;
};

const getMetric = (
  preset: TempoPresetResult,
  metricId: 'outer-inner-continuation' | 'two-wave-closure'
): TempoMetricResult => {
  const metricResult = preset.results.find((result) => result.id === metricId);
  if (!metricResult) {
    throw new Error(`Missing "${metricId}" metric for preset "${preset.id}".`);
  }
  return metricResult;
};

const roundTo = (value: number, precision: number): number => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const bandCode = (band: ValidationBand): string =>
  band === 'pass'
    ? 'P'
    : band === 'near miss'
      ? 'N'
      : 'F';

const cloneCoefficients = (source: TempoCoefficients): TempoCoefficients => ({
  attackerPushPressureCoeff: source.attackerPushPressureCoeff,
  defenderReclearCoeff: source.defenderReclearCoeff,
  waveHoldDurationSeconds: source.waveHoldDurationSeconds,
  lanePressureDecayWindowSeconds: source.lanePressureDecayWindowSeconds,
  offLanePunishWindowSeconds: source.offLanePunishWindowSeconds,
  objectiveCommitSeconds: source.objectiveCommitSeconds
});

const metric = (
  id: string,
  label: string,
  value: number,
  unit: 's' | 'ratio',
  band: TempoBand,
  note: string
): TempoMetricResult => ({
  id,
  label,
  value,
  unit,
  status: classify(value, band),
  passMin: band.passMin,
  passMax: band.passMax,
  nearMin: band.nearMin,
  nearMax: band.nearMax,
  note
});

const classify = (value: number, band: TempoBand): ValidationBand => {
  if (value >= band.passMin && value <= band.passMax) {
    return 'pass';
  }

  if (value >= band.nearMin && value <= band.nearMax) {
    return 'near miss';
  }

  return 'fail';
};

const routeSeconds = (routeId: string): number => {
  const route = layoutConfig.routes.find((entry) => entry.id === routeId);
  if (!route) {
    throw new Error(`Missing route "${routeId}" for tempo harness.`);
  }

  const distance = route.waypoints.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }
    const previous = route.waypoints[index - 1];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);

  return distance / layoutConfig.player.moveSpeed;
};
