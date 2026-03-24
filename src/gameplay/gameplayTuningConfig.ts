export const gameplayTuningConfig = {
  headlessCombatLaneBridge: {
    opportunityDurationWaveHoldMultiplier: 0.52,
    opportunityDurationSecondsClamp: {
      min: 3.8,
      max: 5.4
    },
    pressureDeltaOnClearAttackerPushMultiplier: 0.36,
    pressureDeltaOnClearClamp: {
      min: 0.28,
      max: 0.46
    },
    occupancyAdvantageBase: 0.42,
    occupancyAdvantageObjectiveCommitMultiplier: 0.18,
    occupancyAdvantageClamp: {
      min: 0.45,
      max: 0.72
    }
  },
  headlessBridgeLaneModifier: {
    lanePressureWeights: {
      pressureDelta: 0.58,
      occupancyAdvantage: 0.14,
      opportunityActiveBonus: 0.04
    },
    lanePressureClamp: {
      min: 0,
      max: 0.32
    },
    occupancyWeight: 0.24,
    occupancyClamp: {
      min: 0,
      max: 0.18
    },
    structurePressureWeights: {
      pressureDelta: 0.74,
      occupancyAdvantage: 0.1,
      opportunityActiveBonus: 0.05
    },
    structurePressureClamp: {
      min: 0,
      max: 0.4
    }
  },
  sharedSiegeWindow: {
    minimumPressureSupport: 0.44,
    minimumOccupancySupport: 0.18,
    pressureSupportWeights: {
      pressureDelta: 0.6,
      lanePressure: 0.28,
      structurePressure: 0.12
    },
    occupancySupportWeights: {
      occupancyAdvantage: 0.58,
      segmentOccupancyPresence: 0.42
    },
    durationBaseSeconds: 1.65,
    durationPressureSupportMultiplier: 1.55,
    durationOccupancySupportMultiplier: 0.95,
    durationSecondsClamp: {
      min: 1.8,
      max: 4.25
    }
  },
  sharedStructureConversion: {
    progressThreshold: 0.26,
    minimumPressureSupport: 0.5,
    minimumOccupancySupport: 0.24,
    minimumStructurePressure: 0.46,
    progressSuppressionClamp: {
      min: 0,
      max: 0.2
    },
    gainRateBase: 0.14,
    gainRatePressureSupportMultiplier: 0.11,
    gainRateOccupancySupportMultiplier: 0.08,
    gainRateStructurePressureMultiplier: 0.06,
    gainRateEventEligibleBonus: 0.05,
    gainRateClamp: {
      min: 0.04,
      max: 0.38
    },
    decayBasePerSecond: 0.38,
    decayProgressMultiplier: 0.18
  },
  sharedClosureAdvancement: {
    valueThreshold: 0.24,
    minimumReadinessLevel: 0.42,
    minimumStructuralSignal: 0.22,
    readinessSuppressionClamp: {
      min: 0,
      max: 0.35
    },
    readinessWeights: {
      structuralSignal: 0.34,
      antiStallAcceleration: 0.28,
      closureThreat: 0.2,
      structuralCarryover: 0.18
    },
    gainRateBase: 0.16,
    gainRateReadinessMultiplier: 0.14,
    gainRateStructuralSignalMultiplier: 0.12,
    gainRateResolvedStructureBonus: 0.06,
    gainRateClamp: {
      min: 0.18,
      max: 0.42
    },
    decayBasePerSecond: 0.34,
    decayValueMultiplier: 0.2
  },
  sharedDefenderResponse: {
    contestPulseDurationSeconds: 1.35,
    contestPulseCooldownSeconds: 3.6,
    minimumClosureThreat: 0.44,
    minimumAntiStallAcceleration: 0.32,
    minimumConversionPressure: 0.08,
    structureConversionSuppressionClamp: {
      min: 0,
      max: 0.2
    },
    closureAdvancementSuppressionClamp: {
      min: 0,
      max: 0.3
    },
    activeStructureSuppressionBase: 0.07,
    activeStructureSuppressionIntensity: 0.05,
    activeClosureSuppressionBase: 0.16,
    activeClosureSuppressionIntensity: 0.08,
    firedStructureSuppression: 0.12,
    firedClosureSuppression: 0.24
  },
  sharedPushReassertion: {
    pulseDurationSeconds: 0.95,
    pulseCooldownSeconds: 2.7,
    minimumPressureSupport: 0.48,
    minimumOccupancySupport: 0.4,
    minimumStructuralCarryover: 0.28,
    minimumContestableProgress: 0.03,
    structureSuppressionRecoveryClamp: {
      min: 0,
      max: 0.12
    },
    closureSuppressionRecoveryClamp: {
      min: 0,
      max: 0.18
    },
    activeStructureRecoveryBase: 0.04,
    activeStructureRecoveryIntensity: 0.04,
    activeClosureRecoveryBase: 0.08,
    activeClosureRecoveryIntensity: 0.05,
    firedStructureRecovery: 0.08,
    firedClosureRecovery: 0.13
  },
  prototypeLaneStateLoop: {
    carryoverPressureStateClamp: {
      min: 0.95,
      max: 1.08
    },
    outcomeBiasClamp: {
      min: -0.05,
      max: 0.06
    },
    closureCarryoverPressureBonusFromAdvancement: 0.03,
    closureCarryoverPressurePenaltyFromSuppression: 0.02,
    closureCarryoverRelevanceBonusFromReadiness: 0.08,
    closureCarryoverRelevanceBonusFromResolvedClosure: 0.04,
    closureCarryoverRelevancePenaltyFromSuppression: 0.08,
    carryoverPressureApproachRate: 0.35,
    outcomeBiasDecayRate: 0.09
  }
} as const;
