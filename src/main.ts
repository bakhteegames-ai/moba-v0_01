import * as pc from 'playcanvas';
import './styles.css';
import { layoutConfig } from './config/layout';
import { createDebugSystem } from './debug/debugBuilder';
import { createHeadlessCombatRuntime } from './gameplay/headlessCombatRuntime';
import { createPlayerTestController } from './player/playerTestController';
import { createAuthoritativePresentationShell } from './presentation/authoritativePresentationShell';
import { createControlsHintOverlay } from './presentation/controlsHintOverlay';
import { createPlayerFacingHud } from './presentation/playerFacingHud';
import {
  createBrowserApplication,
  wireBrowserRuntime
} from './runtime/browserBootstrap';
import { buildGrayboxScene } from './scene/buildGrayboxScene';
import { createRuntimeInteractionProbeHarness } from './validation/runtimeInteractionProbeHarness';
import { createLiveInteractionValidator } from './validation/liveInteractionValidator';
import { createTempoHarness } from './validation/tempoHarness';
import { createWavePressureValidator } from './validation/wavePressureValidator';

const app = createBrowserApplication('application-canvas');

const registry = buildGrayboxScene(app);
const headlessCombat = createHeadlessCombatRuntime();
const liveInteractionValidator = createLiveInteractionValidator();
const liveInteractionControls = liveInteractionValidator.getCalibrationOperatorControls();
const debugSystem = createDebugSystem(registry);
const runtimeProbeHarness = createRuntimeInteractionProbeHarness();
const playerController = createPlayerTestController(
  app,
  registry,
  debugSystem,
  headlessCombat
);
const presentationShell = createAuthoritativePresentationShell(registry);
createControlsHintOverlay();
const playerFacingHud = createPlayerFacingHud();
const tempoHarness = createTempoHarness();
const wavePressureValidator = createWavePressureValidator(registry);

const runFrame = (dt: number): void => {
  playerController.update(dt);
  const headlessCombatSnapshot = headlessCombat.getSnapshot();
  liveInteractionValidator.update(
    dt,
    headlessCombatSnapshot.sharedLaneConsequence,
    headlessCombatSnapshot.lastStructureInteractionRequest,
    headlessCombatSnapshot.runtimeLaneTelemetry
  );
  tempoHarness.update(dt);
  wavePressureValidator.update(dt);
  const liveInteractionSnapshot = liveInteractionValidator.getDebugState();
  runtimeProbeHarness.update(
    headlessCombat,
    headlessCombatSnapshot,
    liveInteractionSnapshot
  );
  presentationShell.update(dt, {
    combat: headlessCombatSnapshot,
    signals: liveInteractionSnapshot.signalProvider
  });
  playerFacingHud.update(dt, {
    combat: headlessCombatSnapshot,
    signals: liveInteractionSnapshot.signalProvider
  });
  debugSystem.update({
    playerPosition: playerController.getPlayerPosition(),
    camera: playerController.getActiveCamera(),
    cameraLabel: playerController.getCameraLabel(),
    tacticalModeLabel: playerController.getTacticalModeLabel(),
    activeProbeRouteId: playerController.getProbeRouteId(),
    probeElapsedSeconds: playerController.getProbeElapsedSeconds(),
    headlessCombat: headlessCombatSnapshot,
    liveInteraction: liveInteractionSnapshot,
    liveInteractionControls,
    tempo: tempoHarness.getDebugState(),
    wavePressure: wavePressureValidator.getDebugState()
  });
};

wireBrowserRuntime(app, {
  runFrame,
  startRuntimeProbe() {
    runtimeProbeHarness.start('structure-to-closure');
  },
  clearRuntimeProbe() {
    runtimeProbeHarness.clear();
  },
  renderGameToText() {
    const snapshot = headlessCombat.getSnapshot();
    const liveInteractionSnapshot = liveInteractionValidator.getDebugState();
    const presentationSnapshot = presentationShell.getDebugState();
    const runtimeProbeSnapshot = runtimeProbeHarness.getSnapshot();
    return JSON.stringify({
      coordinateSystem: {
        origin: layoutConfig.coordinateModel.origin,
        xAxis: layoutConfig.coordinateModel.xAxis,
        zAxis: layoutConfig.coordinateModel.yAxis
      },
      combat: {
        elapsedSeconds: round(snapshot.elapsedSeconds),
        player: {
          x: round(snapshot.player.position.x),
          z: round(snapshot.player.position.z),
          hp: snapshot.player.currentHp,
          maxHp: snapshot.player.maxHp,
          alive: snapshot.player.alive,
          cooldownRemaining: round(
            snapshot.player.basicAbilityCooldownRemaining
          )
        },
        target: {
          x: round(snapshot.target.position.x),
          z: round(snapshot.target.position.z),
          hp: snapshot.target.currentHp,
          maxHp: snapshot.target.maxHp,
          alive: snapshot.target.alive
        },
        lastCast: snapshot.lastResolvedCast
          ? {
              success: snapshot.lastResolvedCast.success,
              targetEntityId: snapshot.lastResolvedCast.targetEntityId,
              damageApplied: snapshot.lastResolvedCast.damageApplied,
              failureReason: snapshot.lastResolvedCast.failureReason,
              cooldownRemaining: round(
                snapshot.lastResolvedCast.cooldownRemaining
              )
            }
          : null,
        lastLegalityFailureReason: snapshot.lastLegalityFailureReason,
        laneBridge: {
          heroSegment: snapshot.laneBridge.hero.lanePressureSegment,
          blockerSegment: snapshot.laneBridge.blocker.lanePressureSegment,
          blockerTier: snapshot.laneBridge.blocker.structurePressureTier,
          blockerAlive: snapshot.laneBridge.blocker.alive,
          pressureDelta: round(snapshot.laneBridge.lanePressureDelta),
          occupancyAdvantage: round(snapshot.laneBridge.occupancyAdvantage),
          structurePressureOpportunityActive:
            snapshot.laneBridge.structurePressureOpportunityActive,
          opportunityWindowRemaining: round(
            snapshot.laneBridge.opportunityWindowRemainingSeconds
          ),
          lastCombatEventSummary: snapshot.laneBridge.lastCombatEventSummary,
          lastBridgeOutcome: {
            kind: snapshot.laneBridge.lastBridgeOutcome.kind,
            summary: snapshot.laneBridge.lastBridgeOutcome.summary,
            pressureDelta: round(
              snapshot.laneBridge.lastBridgeOutcome.pressureDelta
            ),
            occupancyAdvantage: round(
              snapshot.laneBridge.lastBridgeOutcome.occupancyAdvantage
            )
          }
        },
        sharedLaneConsequence: {
          local: {
            affectedSegment: snapshot.sharedLaneConsequence.affectedSegment,
            affectedTier: snapshot.sharedLaneConsequence.affectedTier,
            pressureDelta: round(snapshot.sharedLaneConsequence.pressureDelta),
            occupancyAdvantage: round(
              snapshot.sharedLaneConsequence.occupancyAdvantage
            ),
            opportunityActive: snapshot.sharedLaneConsequence.opportunityActive,
            opportunityRemaining: round(
              snapshot.sharedLaneConsequence.opportunityRemainingSeconds
            ),
            lastBridgeOutcomeKind:
              snapshot.sharedLaneConsequence.lastBridgeOutcomeKind,
            lastBridgeOutcomeSummary:
              snapshot.sharedLaneConsequence.lastBridgeOutcomeSummary
          },
          sharedConsumer: {
            affectedSegment:
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .affectedSegment,
            affectedTier:
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .affectedTier,
            pressureDelta: round(
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .pressureDelta
            ),
            occupancyAdvantage: round(
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .occupancyAdvantage
            ),
            opportunityActive:
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .opportunityActive,
            opportunityRemaining: round(
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .opportunityRemainingSeconds
            ),
            lastBridgeOutcomeKind:
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .lastBridgeOutcomeKind,
            lastBridgeOutcomeSummary:
              liveInteractionSnapshot.signalProvider.sharedLaneConsequence
                .lastBridgeOutcomeSummary
          }
        },
        laneTelemetry: {
          source: liveInteractionSnapshot.signalProvider.laneTelemetrySource,
          activeSegment:
            liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
              ?.activeSegment ?? null,
          frontLaneSegment:
            liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
              ?.frontLaneSegment ?? null,
          carryoverRelevance:
            liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
              ? round(
                  liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                    .consecutiveWaveCarryoverRelevance
                )
              : null,
          segmentOccupancyPresence:
            liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
              ? {
                  'outer-front': round(
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .segmentOccupancyPresence['outer-front']
                  ),
                  'inner-siege': round(
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .segmentOccupancyPresence['inner-siege']
                  ),
                  'core-approach': round(
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .segmentOccupancyPresence['core-approach']
                  )
                }
              : null,
          structureContactByTier:
            liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
              ? {
                  outer: {
                    active:
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.outer.active,
                    windowSeconds: round(
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.outer.windowSeconds
                    ),
                    pressure: round(
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.outer.pressure
                    )
                  },
                  inner: {
                    active:
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.inner.active,
                    windowSeconds: round(
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.inner.windowSeconds
                    ),
                    pressure: round(
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.inner.pressure
                    )
                  },
                  core: {
                    active:
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.core.active,
                    windowSeconds: round(
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.core.windowSeconds
                    ),
                    pressure: round(
                      liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                        .structureContactByTier.core.pressure
                    )
                  }
                }
              : null,
          interactionPulse:
            liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
              ? {
                  active:
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .interactionPulse.active,
                  remainingSeconds: round(
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .interactionPulse.remainingSeconds
                  ),
                  supportScalar: round(
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .interactionPulse.supportScalar
                  ),
                  supportTier:
                    liveInteractionSnapshot.signalProvider.runtimeLaneTelemetry
                      .interactionPulse.supportTier
                }
              : null
        },
        runtimeObservation: {
          phase: liveInteractionSnapshot.runtimeObservation.currentPhase,
          phaseAgeSeconds: round(
            liveInteractionSnapshot.runtimeObservation.currentPhaseAgeSeconds
          ),
          orderingState:
            liveInteractionSnapshot.runtimeObservation.orderingState,
          windowPlausibility:
            liveInteractionSnapshot.runtimeObservation.windowPlausibility,
          progressionState:
            liveInteractionSnapshot.runtimeObservation.progressionState,
          lastObserved: {
            contactStartSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .contactStartSeconds
            ),
            pulseStartSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .pulseStartSeconds
            ),
            pulseExpireSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .pulseExpireSeconds
            ),
            siegeWindowOpenSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .siegeWindowOpenSeconds
            ),
            structureAdvanceSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .structureAdvanceSeconds
            ),
            structureResolveSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .structureResolveSeconds
            ),
            closureAdvanceSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .closureAdvanceSeconds
            ),
            closureResolveSeconds: roundNullable(
              liveInteractionSnapshot.runtimeObservation.lastObserved
                .closureResolveSeconds
            )
          },
          summary: liveInteractionSnapshot.runtimeObservation.summary
        },
        runtimeSequenceAssessment: {
          overallVerdict:
            liveInteractionSnapshot.runtimeSequenceAssessment.overallVerdict,
          observedSequenceCount:
            liveInteractionSnapshot.runtimeSequenceAssessment
              .observedSequenceCount,
          completedSequenceCount:
            liveInteractionSnapshot.runtimeSequenceAssessment
              .completedSequenceCount,
          incidentCounts: {
            outOfOrder:
              liveInteractionSnapshot.runtimeSequenceAssessment.incidentCounts
                .outOfOrder,
            lingeringWindow:
              liveInteractionSnapshot.runtimeSequenceAssessment.incidentCounts
                .lingeringWindow,
            stalls:
              liveInteractionSnapshot.runtimeSequenceAssessment.incidentCounts
                .stalls
          },
          currentLiveSequenceHealth:
            liveInteractionSnapshot.runtimeSequenceAssessment
              .currentLiveSequenceHealth,
          lastCompletedSequenceSummary:
            liveInteractionSnapshot.runtimeSequenceAssessment
              .lastCompletedSequenceSummary,
          summary: liveInteractionSnapshot.runtimeSequenceAssessment.summary
        },
        runtimeEvidenceLedger: {
          capacity: liveInteractionSnapshot.runtimeEvidenceLedger.capacity,
          summary: liveInteractionSnapshot.runtimeEvidenceLedger.summary,
          entries: liveInteractionSnapshot.runtimeEvidenceLedger.entries.map(
            (entry) => ({
              kind: entry.kind,
              verdict: entry.verdict,
              observedAtSeconds: round(entry.observedAtSeconds),
              triggerPhase: entry.triggerPhase,
              durationSeconds: roundNullable(entry.durationSeconds),
              incidentTag: entry.incidentTag,
              summary: entry.summary
            })
          )
        },
        runtimeProbe: {
          active: runtimeProbeSnapshot.active,
          presetId: runtimeProbeSnapshot.presetId,
          phase: runtimeProbeSnapshot.phase,
          completed: runtimeProbeSnapshot.completed,
          failed: runtimeProbeSnapshot.failed,
          summary: runtimeProbeSnapshot.summary
        },
        sharedSiegeWindow: {
          active: liveInteractionSnapshot.signalProvider.sharedSiegeWindow
            .siegeWindowActive,
          remaining: round(
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow
              .siegeWindowRemainingSeconds
          ),
          sourceSegment:
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow
              .sourceSegment,
          sourceTier:
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow.sourceTier,
          triggerReason:
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow
              .triggerReason,
          pressureSupport: round(
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow
              .pressureSupportLevel
          ),
          occupancySupport: round(
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow
              .occupancySupportLevel
          ),
          summary:
            liveInteractionSnapshot.signalProvider.sharedSiegeWindow.summary
        },
        sharedStructureConversion: {
          active:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .conversionActive,
          progress: round(
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .conversionProgress
          ),
          threshold: round(
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .conversionThreshold
          ),
          eligible:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .conversionEligible,
          sourceSegment:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .sourceSegment,
          sourceTier:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .sourceTier,
          triggerReason:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .triggerReason,
          lastResolvedStructureStep:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .lastResolvedStructureStep,
          summary:
            liveInteractionSnapshot.signalProvider.sharedStructureConversion
              .summary
        },
        sharedClosureAdvancement: {
          active:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .closureAdvancementActive,
          value: round(
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .closureAdvancementValue
          ),
          readinessLevel: round(
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .readinessLevel
          ),
          eligible:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .readinessEligible,
          sourceSegment:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .sourceSegment,
          sourceTier:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .sourceTier,
          triggerReason:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .triggerReason,
          lastResolvedClosureStep:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .lastResolvedClosureStep,
          summary:
            liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
              .summary
        },
        sharedDefenderResponse: {
          active:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .responseActive,
          eligible:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .responseEligible,
          cooldownRemaining: round(
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .responseCooldownRemaining
          ),
          remaining: round(
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .responseRemainingSeconds
          ),
          sourceSegment:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .sourceSegment,
          sourceTier:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .sourceTier,
          structureSuppression: round(
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .structureConversionSuppression
          ),
          closureSuppression: round(
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .closureAdvancementSuppression
          ),
          triggerReason:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .triggerReason,
          lastResolvedResponseAction:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse
              .lastResolvedResponseAction,
          summary:
            liveInteractionSnapshot.signalProvider.sharedDefenderResponse.summary
        },
        sharedPushReassertion: {
          active:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .recoveryActive,
          eligible:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .recoveryEligible,
          cooldownRemaining: round(
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .recoveryCooldownRemaining
          ),
          remaining: round(
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .recoveryRemainingSeconds
          ),
          sourceSegment:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .sourceSegment,
          sourceTier:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .sourceTier,
          structureRecovery: round(
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .structureSuppressionRecovery
          ),
          closureRecovery: round(
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .closureSuppressionRecovery
          ),
          triggerReason:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .triggerReason,
          lastResolvedRecoveryAction:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion
              .lastResolvedRecoveryAction,
          summary:
            liveInteractionSnapshot.signalProvider.sharedPushReassertion.summary
        },
        determinismProof: {
          passed: snapshot.laneDeterminismProof.passed,
          signature: snapshot.laneDeterminismProof.signature,
          summary: snapshot.laneDeterminismProof.summary
        },
        presentation: {
          castPulseActive: presentationSnapshot.castPulseActive,
          impactPulseActive: presentationSnapshot.impactPulseActive,
          targetCueActive: presentationSnapshot.targetCueActive,
          targetCueState: presentationSnapshot.targetCueState,
          defenderCueActive: presentationSnapshot.defenderCueActive,
          pushCueActive: presentationSnapshot.pushCueActive,
          sourceTier: presentationSnapshot.sourceTier,
          sourceSegment: presentationSnapshot.sourceSegment,
          siegeLevel: round(presentationSnapshot.siegeLevel),
          structureLevel: round(presentationSnapshot.structureLevel),
          closureLevel: round(presentationSnapshot.closureLevel)
        }
      }
    });
  }
});

app.start();

const round = (value: number): number => Math.round(value * 100) / 100;

const roundNullable = (value: number | null): number | null =>
  value === null ? null : round(value);
