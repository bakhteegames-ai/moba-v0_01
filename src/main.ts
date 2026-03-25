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
import { createLiveInteractionValidator } from './validation/liveInteractionValidator';
import { createTempoHarness } from './validation/tempoHarness';
import { createWavePressureValidator } from './validation/wavePressureValidator';

const app = createBrowserApplication('application-canvas');

const registry = buildGrayboxScene(app);
const headlessCombat = createHeadlessCombatRuntime();
const liveInteractionValidator = createLiveInteractionValidator();
const liveInteractionControls = liveInteractionValidator.getCalibrationOperatorControls();
const debugSystem = createDebugSystem(registry);
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
    headlessCombatSnapshot.lastStructureInteractionRequest
  );
  tempoHarness.update(dt);
  wavePressureValidator.update(dt);
  const liveInteractionSnapshot = liveInteractionValidator.getDebugState();
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
  renderGameToText() {
    const snapshot = headlessCombat.getSnapshot();
    const liveInteractionSnapshot = liveInteractionValidator.getDebugState();
    const presentationSnapshot = presentationShell.getDebugState();
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
