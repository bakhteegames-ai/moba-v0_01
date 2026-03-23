import * as pc from 'playcanvas';
import './styles.css';
import { layoutConfig } from './config/layout';
import { createDebugSystem } from './debug/debugBuilder';
import { createHeadlessCombatRuntime } from './gameplay/headlessCombatRuntime';
import { createPlayerTestController } from './player/playerTestController';
import { buildGrayboxScene } from './scene/buildGrayboxScene';
import { createLiveInteractionValidator } from './validation/liveInteractionValidator';
import { createTempoHarness } from './validation/tempoHarness';
import { createWavePressureValidator } from './validation/wavePressureValidator';

const canvas = document.getElementById('application-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing application canvas.');
}

const app = new pc.Application(canvas);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

window.addEventListener('resize', () => app.resizeCanvas());

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
const tempoHarness = createTempoHarness();
const wavePressureValidator = createWavePressureValidator(registry);

const runFrame = (dt: number): void => {
  playerController.update(dt);
  liveInteractionValidator.update(dt);
  tempoHarness.update(dt);
  wavePressureValidator.update(dt);
  const headlessCombatSnapshot = headlessCombat.getSnapshot();
  debugSystem.update({
    playerPosition: playerController.getPlayerPosition(),
    camera: playerController.getActiveCamera(),
    cameraLabel: playerController.getCameraLabel(),
    tacticalModeLabel: playerController.getTacticalModeLabel(),
    activeProbeRouteId: playerController.getProbeRouteId(),
    probeElapsedSeconds: playerController.getProbeElapsedSeconds(),
    headlessCombat: headlessCombatSnapshot,
    liveInteraction: liveInteractionValidator.getDebugState(),
    liveInteractionControls,
    tempo: tempoHarness.getDebugState(),
    wavePressure: wavePressureValidator.getDebugState()
  });
};

app.on('update', runFrame);

const debugWindow = window as Window & {
  advanceTime?: (ms: number) => void;
  render_game_to_text?: () => string;
};

debugWindow.advanceTime = (ms: number): void => {
  const fixedStepSeconds = 1 / 60;
  const steps = Math.max(1, Math.round(ms / (fixedStepSeconds * 1000)));
  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    runFrame(fixedStepSeconds);
  }
};

debugWindow.render_game_to_text = (): string => {
  const snapshot = headlessCombat.getSnapshot();
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
      determinismProof: {
        passed: snapshot.laneDeterminismProof.passed,
        signature: snapshot.laneDeterminismProof.signature,
        summary: snapshot.laneDeterminismProof.summary
      }
    }
  });
};

app.start();

const round = (value: number): number => Math.round(value * 100) / 100;
