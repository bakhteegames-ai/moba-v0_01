export const presentationTuning = {
  castPulse: {
    durationSeconds: 0.18,
    diameter: 0.55,
    cooldownResetThreshold: 0.25,
    playerHeightFactor: 0.58,
    targetHeightFactor: 0.46,
    scaleRange: {
      min: 0.34,
      max: 0.78
    },
    emissiveRange: {
      min: 0.2,
      max: 0.74
    }
  },
  impactPulse: {
    durationSeconds: 0.16,
    diameter: 0.65,
    scaleRange: {
      min: 0.48,
      max: 1.4
    },
    emissiveRange: {
      min: 0.18,
      max: 1.1
    },
    opacityRange: {
      min: 0.12,
      max: 0.9
    }
  },
  contestCue: {
    diameter: 5.4,
    heightOffsets: {
      defender: 0.92,
      push: 0.52
    },
    radiusClamp: {
      min: 3.6,
      max: 6.8
    },
    radiusBase: 3.8,
    strengthRadiusMultiplier: 8.5,
    remainingSecondsRadiusMultiplier: 0.9,
    emissiveClamp: {
      min: 0.18,
      max: 0.7
    },
    emissiveBase: 0.18,
    emissiveStrengthMultiplier: 1.4,
    opacityClamp: {
      min: 0.18,
      max: 0.72
    },
    opacityBase: 0.18,
    opacityRemainingSecondsMultiplier: 0.32,
    thickness: 0.08
  },
  indicatorBar: {
    width: 0.55,
    baseHeight: 0.3,
    localOffsetX: {
      siege: -1.05,
      structure: 0,
      closure: 1.05
    },
    levelHeightRange: {
      min: 0.22,
      max: 2.65
    },
    emissiveRange: {
      min: 0.08,
      max: 0.62
    },
    opacityRange: {
      min: 0.2,
      max: 0.92
    },
    tierOffsets: {
      outer: { x: 4.25, y: 0, z: -4.75 },
      inner: { x: 3.5, y: 0, z: -4.25 },
      core: { x: 2.75, y: 0, z: -3.75 }
    }
  },
  closureLevelNormalizationThreshold: 0.24,
  materials: {
    cast: { hex: '#f4f0d8', emissive: 0.48, opacity: 0.86 },
    impact: { hex: '#ffd27a', emissive: 0.72, opacity: 0.86 },
    defender: { hex: '#d66059', emissive: 0.42, opacity: 0.86 },
    push: { hex: '#6fa7f1', emissive: 0.36, opacity: 0.86 },
    siege: { hex: '#e2b355', emissive: 0.26, opacity: 0.86 },
    structure: { hex: '#f3e5a2', emissive: 0.34, opacity: 0.86 },
    closure: { hex: '#81d2f3', emissive: 0.32, opacity: 0.86 }
  }
} as const;
