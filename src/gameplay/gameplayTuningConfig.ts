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
  calibrationScalars: {
    scalarMin: 0.95,
    scalarMax: 1.08
  },
  closureDoctrineFitEvaluator: {
    minimumCycleSeconds: 6,
    scalarClamp: {
      min: 0.95,
      max: 1.08
    },
    initialLevels: {
      doctrineFit: 0.72,
      earlySiegeBias: 0.16,
      lateClosureDrag: 0.18,
      resetCadenceRisk: 0.16,
      antiStallOverhang: 0.17,
      retuningUrgency: 0.18
    },
    initialCalibrationScalars: {
      doctrineFitScalar: 1.03,
      earlySiegeBiasScalar: 0.995,
      lateClosureDragScalar: 0.995,
      resetCadenceRiskScalar: 0.995,
      antiStallOverhangScalar: 0.995,
      retuningUrgencyScalar: 0.992
    },
    blendRatePerSecond: 0.9,
    blendClamp: {
      min: 0.08,
      max: 1
    },
    earlySiegeBias: {
      weights: {
        healthBias: 0.34,
        risingAntiStallTimingRisk: 0.17,
        closureReadinessTimingRisk: 0.23,
        acceleratedClosureWindowTimingRisk: 0.12,
        currentStateBias: 0.1,
        progressionOrderPenalty: 0.12,
        escalationTimingPenalty: 0.08
      },
      timingThresholdCycleFractions: {
        risingAntiStall: 0.22,
        closureReadiness: 0.48,
        acceleratedClosureWindow: 0.8
      },
      stateBiases: {
        closureReadiness: {
          latestCycleFraction: 0.55,
          bias: 0.72
        },
        acceleratedClosureWindow: {
          latestCycleFraction: 0.9,
          bias: 0.88
        },
        risingAntiStall: {
          latestCycleFraction: 0.25,
          bias: 0.52
        }
      }
    },
    lateClosureDrag: {
      weights: {
        healthBias: 0.29,
        risingAntiStallTimingRisk: 0.12,
        closureReadinessTimingRisk: 0.25,
        acceleratedClosureWindowTimingRisk: 0.11,
        currentStateBias: 0.08,
        prolongedReadinessRisk: 0.1,
        escalationTimingPenalty: 0.05
      },
      timingThresholdCycleMultipliers: {
        risingAntiStall: {
          max: 2.2,
          overdue: 2.6
        },
        closureReadiness: {
          max: 3.1,
          overdue: 3.6
        },
        acceleratedClosureWindow: {
          max: 4.2,
          overdue: 4.8
        }
      },
      stateBiases: {
        normalPressure: {
          earliestCycleMultiplier: 2.45,
          bias: 0.74
        },
        risingAntiStall: {
          earliestCycleMultiplier: 3.1,
          bias: 0.68
        },
        closureReadiness: {
          earliestCycleMultiplier: 4.45,
          bias: 0.44
        }
      }
    },
    resetCadenceRisk: {
      weights: {
        healthBias: 0.32,
        prematureResetRisk: 0.3,
        resetWindowInstabilityRisk: 0.18,
        defenderResetQualityPenalty: 0.2
      },
      resetWindowInstability: {
        excessResetWeight: 0.78,
        activeBiasWeight: 0.22,
        activeBiasCycleMultiplier: 0.8
      },
      prematureReset: {
        eventWeight: 0.48,
        legitimateWindowReliefWeight: 0.08
      }
    },
    antiStallOverhang: {
      weights: {
        healthBias: 0.34,
        stickyAntiStallRisk: 0.16,
        stickyClosureWindowRisk: 0.18,
        prolongedReadinessRisk: 0.14,
        currentOverhangRisk: 0.08,
        stickinessPenalty: 0.1
      },
      stickyEventMaxCount: 2,
      currentOverhangThresholds: {
        risingAntiStall: {
          dwellOffsetCycleMultiplier: 1.1,
          dwellWindowCycleMultiplier: 0.8
        },
        closureReadiness: {
          dwellOffsetCycleMultiplier: 1.35,
          dwellWindowCycleMultiplier: 1
        },
        acceleratedClosureWindow: {
          dwellOffsetCycleMultiplier: 0.9,
          dwellWindowCycleMultiplier: 0.7
        }
      },
      prolongedReadiness: {
        cumulativeDwellCycleMultiplier: 2.3,
        eventWeight: 0.42,
        activeBiasThresholdCycleMultiplier: 1.3,
        activeBiasWindowCycleMultiplier: 1,
        activeBiasWeight: 0.28,
        cumulativeWeight: 0.34,
        eventContributionWeight: 0.46
      }
    },
    doctrineFit: {
      weights: {
        pacingHealthQuality: 0.26,
        escalationTimingQuality: 0.21,
        progressionOrderQuality: 0.18,
        defenderResetQuality: 0.12,
        earlySiegeBiasRelief: 0.08,
        lateClosureDragRelief: 0.07,
        resetCadenceRiskRelief: 0.04,
        antiStallOverhangRelief: 0.04
      }
    },
    retuningUrgency: {
      dominantRiskWeight: 0.72,
      doctrineFitGapWeight: 0.28
    },
    verdictThresholds: {
      doctrineFitMinimum: 0.64,
      dominantRiskMaximum: 0.46
    },
    confidenceThresholds: {
      high: {
        elapsedCycleMultiplier: 3.25,
        seenStates: 3,
        eventEvidence: 2
      },
      medium: {
        elapsedCycleMultiplier: 1.75,
        seenStates: 2,
        eventEvidence: 1
      }
    },
    healthBiases: {
      earlySiege: {
        earlyEscalation: 0.88,
        prematureReset: 0.18
      },
      lateClosure: {
        lateEscalation: 0.88,
        prolongedReadiness: 0.46,
        stickyAntiStall: 0.24
      },
      resetCadence: {
        prematureReset: 0.92
      },
      antiStallOverhang: {
        stickyClosureWindow: 0.94,
        stickyAntiStall: 0.78,
        prolongedReadiness: 0.58
      }
    },
    riskScalarWeight: 0.04
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
