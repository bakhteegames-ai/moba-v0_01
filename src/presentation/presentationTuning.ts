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
  targetabilityCue: {
    heightOffset: 0.18,
    envelopeHeightOffset: 0.04,
    focusMarkerHeightBodyMultiplier: 2.2,
    healthStripHeightBodyMultiplier: 2.65,
    radiusBodyMultiplier: 3.2,
    radiusClamp: {
      min: 1.7,
      max: 2.9
    },
    thickness: 0.05,
    envelopeThickness: 0.025,
    envelopeEmissiveScale: 0.72,
    envelopeOpacityScale: 0.58,
    focusMarkerArmLength: 0.52,
    focusMarkerArmThickness: 0.08,
    focusMarkerArmDepth: 0.08,
    focusMarkerArmOffsetX: 0.2,
    focusMarkerArmAngleDegrees: 36,
    focusMarkerEmissiveScale: 0.94,
    focusMarkerOpacityScale: 0.92,
    healthStripWidth: 1.2,
    healthStripHeight: 0.09,
    healthStripDepth: 0.08,
    healthStripFillInset: 0.03,
    healthStripBackplate: {
      hex: '#12161d',
      emissive: 0.08,
      opacity: 0.82
    },
    healthStripFill: {
      hex: '#f3e5a2',
      emissive: 0.28,
      opacity: 0.94
    },
    states: {
      inRange: {
        hex: '#7cc8a2',
        emissive: 0.42,
        opacity: 0.54
      },
      cooldown: {
        hex: '#d8b36a',
        emissive: 0.38,
        opacity: 0.48
      },
      outOfRange: {
        hex: '#d66059',
        emissive: 0.46,
        opacity: 0.6
      },
      blockedBoost: {
        emissiveBonus: 0.16,
        opacityBonus: 0.14
      }
    }
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
  hud: {
    secondsFractionDigits: 1,
    readinessPercentScale: 100,
    resolvedFraction: 1,
    text: {
      ready: 'Ready',
      legal: 'Legal',
      inRange: 'In Range',
      cooling: 'Cooling',
      active: 'Active',
      waiting: 'Waiting',
      closed: 'Closed',
      open: 'Open',
      cleared: 'Cleared',
      idle: 'Idle',
      readySuffix: 'ready'
    },
    nextStep: {
      moveIntoRange: 'Move Into Range',
      castNow: 'Cast Now',
      cooldownRecovering: 'Cooldown Recovering',
      targetCleared: 'Target Cleared'
    },
    lastCast: {
      none: 'No Cast Yet',
      blockedPrefix: 'Blocked:',
      castCommitted: 'Cast Committed',
      cooldownRecovering: 'Cooldown Recovering',
      targetCleared: 'Target Cleared'
    },
    castFailureReasons: {
      onCooldown: 'On Cooldown',
      outOfRange: 'Out of Range',
      deadActor: 'Actor Down',
      invalidTarget: 'Invalid Target'
    }
  },
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
