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

type RuntimeProbeSmokeResult = {
  status: 'idle' | 'completed' | 'failed' | 'timed-out';
  presetId: 'structure-to-closure' | 'defender-response-recovery';
  steps: number;
  elapsedSeconds: number;
  summary: string;
};

type RuntimeProbeSmokeStatus = RuntimeProbeSmokeResult['status'];
type RuntimeOperatorCommand = (typeof runtimeCommandIndexCommands)[number];
type RuntimeOperatorRecommendation = {
  nextCommand: RuntimeOperatorCommand;
  reason: string;
};
type RuntimeOperatorCoverageState =
  | 'none'
  | 'happy-path-only'
  | 'defender-only'
  | 'both';
type RuntimeOperatorStatus = {
  happyPathCovered: boolean;
  defenderRecoveryCovered: boolean;
  coverageState: RuntimeOperatorCoverageState;
  summary: string;
};
type RuntimeTerminalSummary = {
  source: 'runtimeSmoke' | 'runtimeProbe' | 'none';
  status: RuntimeProbeSmokeStatus | 'completed' | 'failed' | 'idle';
  presetId:
    | RuntimeProbeSmokeResult['presetId']
    | RuntimeOperatorCommand
    | null;
  summary: string;
};
type RuntimeOperatorChecklistState =
  | 'not-started'
  | 'happy-path-done'
  | 'full-smoke-coverage';
type RuntimeOperatorChecklist = {
  resetRecommendedCompleted: boolean;
  happyPathSmokeCompleted: boolean;
  defenderRecoverySmokeCompleted: boolean;
  checklistState: RuntimeOperatorChecklistState;
  summary: string;
};
type RuntimeValidationCycleResult = {
  status: 'idle' | 'completed' | 'failed';
  happyPathSmoke: RuntimeProbeSmokeResult | null;
  defenderRecoverySmoke: RuntimeProbeSmokeResult | null;
  summary: string;
};

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
const runtimeSmokeFixedStepSeconds = 1 / 60;
const runtimeStructureToClosureSmokeStepBudget = 600;
const runtimeDefenderResponseRecoverySmokeStepBudget = 900;
const runtimeSmokeHistoryCapacity = 2;
const runtimeCommandIndexCommands = [
  'reset_runtime_validation_state',
  'start_runtime_probe',
  'clear_runtime_probe',
  'run_clean_runtime_probe',
  'run_clean_runtime_defender_probe',
  'run_structure_to_closure_smoke',
  'run_defender_response_recovery_smoke',
  'run_full_runtime_validation_cycle'
] as const;
const runtimeQuickStartCommands = [
  'reset_runtime_validation_state',
  'run_clean_runtime_probe',
  'run_structure_to_closure_smoke',
  'run_clean_runtime_defender_probe',
  'run_defender_response_recovery_smoke'
] as const;
let lastRuntimeProbeSmoke: RuntimeProbeSmokeResult = {
  status: 'idle',
  presetId: 'structure-to-closure',
  steps: 0,
  elapsedSeconds: 0,
  summary: 'No runtime smoke has been run yet.'
};
let lastRuntimeValidationCycle: RuntimeValidationCycleResult = {
  status: 'idle',
  happyPathSmoke: null,
  defenderRecoverySmoke: null,
  summary: 'No full runtime validation cycle has been run yet.'
};
const runtimeSmokeHistory: RuntimeProbeSmokeResult[] = [];

const recordRuntimeProbeSmokeResult = (
  result: RuntimeProbeSmokeResult
): RuntimeProbeSmokeResult => {
  lastRuntimeProbeSmoke = result;
  runtimeSmokeHistory.push({ ...result });
  if (runtimeSmokeHistory.length > runtimeSmokeHistoryCapacity) {
    runtimeSmokeHistory.splice(
      0,
      runtimeSmokeHistory.length - runtimeSmokeHistoryCapacity
    );
  }
  return result;
};

const buildRuntimeProbeSmokeResult = (
  status: Exclude<RuntimeProbeSmokeStatus, 'idle'>,
  presetId: RuntimeProbeSmokeResult['presetId'],
  steps: number,
  summary: string
): RuntimeProbeSmokeResult => ({
  status,
  presetId,
  steps,
  elapsedSeconds: round(steps * runtimeSmokeFixedStepSeconds),
  summary
});

const buildRuntimeSmokeHistorySummary = (
  entries: RuntimeProbeSmokeResult[]
): string => {
  if (entries.length === 0) {
    return 'No runtime smoke history recorded yet.';
  }

  const latestEntry = entries[entries.length - 1];
  return `Recent runtime smoke keeps ${entries.length} bounded entry(s). Latest: ${latestEntry.summary}`;
};

const runRuntimeSmoke = (
  presetId: RuntimeProbeSmokeResult['presetId'],
  stepBudget: number,
  options: {
    resetRuntimeValidationState?: boolean;
  } = {}
): RuntimeProbeSmokeResult => {
  if (options.resetRuntimeValidationState ?? true) {
    liveInteractionValidator.resetRuntimeDebugState();
  }
  runtimeProbeHarness.clear();
  runtimeProbeHarness.start(presetId);

  for (let stepIndex = 0; stepIndex < stepBudget; stepIndex += 1) {
    runFrame(runtimeSmokeFixedStepSeconds);
    const runtimeProbeSnapshot = runtimeProbeHarness.getSnapshot();
    if (runtimeProbeSnapshot.completed) {
      return recordRuntimeProbeSmokeResult(
        buildRuntimeProbeSmokeResult(
          'completed',
          presetId,
          stepIndex + 1,
          runtimeProbeSnapshot.summary
        )
      );
    }

    if (runtimeProbeSnapshot.failed) {
      return recordRuntimeProbeSmokeResult(
        buildRuntimeProbeSmokeResult(
          'failed',
          presetId,
          stepIndex + 1,
          runtimeProbeSnapshot.summary
        )
      );
    }
  }

  return recordRuntimeProbeSmokeResult(
    buildRuntimeProbeSmokeResult(
      'timed-out',
      presetId,
      stepBudget,
      presetId === 'structure-to-closure'
        ? 'Runtime smoke timed out before the structure-to-closure probe reached a terminal state.'
        : 'Runtime smoke timed out before the defender-response-recovery probe reached a terminal state.'
    )
  );
};

const buildRuntimeValidationCycleResult = (
  happyPathSmoke: RuntimeProbeSmokeResult,
  defenderRecoverySmoke: RuntimeProbeSmokeResult
): RuntimeValidationCycleResult => {
  const status =
    happyPathSmoke.status === 'completed' &&
    defenderRecoverySmoke.status === 'completed'
      ? 'completed'
      : 'failed';

  return {
    status,
    happyPathSmoke: { ...happyPathSmoke },
    defenderRecoverySmoke: { ...defenderRecoverySmoke },
    summary:
      status === 'completed'
        ? 'Full runtime validation cycle completed with both smoke runs successful.'
        : `Full runtime validation cycle finished with happy-path=${happyPathSmoke.status} and defender/recovery=${defenderRecoverySmoke.status}.`
  };
};

const buildRuntimeCommandIndexSummary = (): string =>
  `Runtime validation exposes ${runtimeCommandIndexCommands.length} browser debug command(s).`;

const buildRuntimeQuickStartSummary = (): string =>
  'Runtime quick-start walks the happy-path smoke first, then the defender/recovery smoke.';

const buildRuntimeOperatorRecommendation = (
  entries: RuntimeProbeSmokeResult[]
): RuntimeOperatorRecommendation => {
  const hasStructureSmoke = entries.some(
    (entry) => entry.presetId === 'structure-to-closure'
  );
  const hasDefenderSmoke = entries.some(
    (entry) => entry.presetId === 'defender-response-recovery'
  );

  if (!hasStructureSmoke) {
    return {
      nextCommand: 'run_structure_to_closure_smoke',
      reason: 'No recent happy-path smoke is recorded yet.'
    };
  }

  if (!hasDefenderSmoke) {
    return {
      nextCommand: 'run_defender_response_recovery_smoke',
      reason: 'The recent smoke history still needs defender/recovery coverage.'
    };
  }

  return {
    nextCommand: 'reset_runtime_validation_state',
    reason: 'Both smoke presets are present in recent history, so the next clean step is a reset.'
  };
};

const buildRuntimeOperatorStatus = (
  entries: RuntimeProbeSmokeResult[]
): RuntimeOperatorStatus => {
  const happyPathCovered = entries.some(
    (entry) => entry.presetId === 'structure-to-closure'
  );
  const defenderRecoveryCovered = entries.some(
    (entry) => entry.presetId === 'defender-response-recovery'
  );
  const coverageState: RuntimeOperatorCoverageState =
    happyPathCovered && defenderRecoveryCovered
      ? 'both'
      : happyPathCovered
        ? 'happy-path-only'
        : defenderRecoveryCovered
          ? 'defender-only'
          : 'none';

  return {
    happyPathCovered,
    defenderRecoveryCovered,
    coverageState,
    summary:
      coverageState === 'both'
        ? 'Recent smoke history covers both happy-path and defender/recovery runs.'
        : coverageState === 'happy-path-only'
          ? 'Recent smoke history covers only the happy-path run.'
          : coverageState === 'defender-only'
            ? 'Recent smoke history covers only the defender/recovery run.'
            : 'Recent smoke history does not cover either smoke preset yet.'
  };
};

const buildRuntimeTerminalSummary = (
  smokeHistory: RuntimeProbeSmokeResult[],
  runtimeProbeSnapshot: ReturnType<typeof runtimeProbeHarness.getSnapshot>
): RuntimeTerminalSummary => {
  if (smokeHistory.length > 0) {
    const latestSmoke = smokeHistory[smokeHistory.length - 1];
    return {
      source: 'runtimeSmoke',
      status: latestSmoke.status,
      presetId: latestSmoke.presetId,
      summary: latestSmoke.summary
    };
  }

  if (runtimeProbeSnapshot.completed || runtimeProbeSnapshot.failed) {
    return {
      source: 'runtimeProbe',
      status: runtimeProbeSnapshot.completed ? 'completed' : 'failed',
      presetId: runtimeProbeSnapshot.presetId,
      summary: runtimeProbeSnapshot.summary
    };
  }

  return {
    source: 'none',
    status: 'idle',
    presetId: null,
    summary: 'No terminal runtime validation outcome is available yet.'
  };
};

const buildRuntimeOperatorChecklist = (
  runtimeOperatorStatus: RuntimeOperatorStatus,
  runtimeOperatorRecommendation: RuntimeOperatorRecommendation
): RuntimeOperatorChecklist => {
  const resetRecommendedCompleted =
    runtimeOperatorRecommendation.nextCommand !==
    'reset_runtime_validation_state';
  const happyPathSmokeCompleted = runtimeOperatorStatus.happyPathCovered;
  const defenderRecoverySmokeCompleted =
    runtimeOperatorStatus.defenderRecoveryCovered;
  const checklistState: RuntimeOperatorChecklistState =
    happyPathSmokeCompleted && defenderRecoverySmokeCompleted
      ? 'full-smoke-coverage'
      : happyPathSmokeCompleted
        ? 'happy-path-done'
        : 'not-started';

  return {
    resetRecommendedCompleted,
    happyPathSmokeCompleted,
    defenderRecoverySmokeCompleted,
    checklistState,
    summary:
      checklistState === 'full-smoke-coverage'
        ? resetRecommendedCompleted
          ? 'Operator workflow checklist is complete for the current runtime smoke cycle.'
          : 'Operator workflow checklist has full smoke coverage and now recommends a clean reset.'
        : checklistState === 'happy-path-done'
          ? 'Operator workflow checklist has happy-path coverage and still needs defender/recovery coverage.'
          : defenderRecoverySmokeCompleted
            ? 'Operator workflow checklist has defender/recovery coverage but still needs the happy-path smoke.'
            : 'Operator workflow checklist has not started yet.'
  };
};

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
  runStructureToClosureSmoke() {
    runRuntimeSmoke(
      'structure-to-closure',
      runtimeStructureToClosureSmokeStepBudget
    );
  },
  runDefenderResponseRecoverySmoke() {
    runRuntimeSmoke(
      'defender-response-recovery',
      runtimeDefenderResponseRecoverySmokeStepBudget
    );
  },
  runFullRuntimeValidationCycle() {
    const happyPathSmoke = runRuntimeSmoke(
      'structure-to-closure',
      runtimeStructureToClosureSmokeStepBudget
    );
    const defenderRecoverySmoke = runRuntimeSmoke(
      'defender-response-recovery',
      runtimeDefenderResponseRecoverySmokeStepBudget,
      {
        resetRuntimeValidationState: false
      }
    );
    lastRuntimeValidationCycle = buildRuntimeValidationCycleResult(
      happyPathSmoke,
      defenderRecoverySmoke
    );
  },
  runCleanRuntimeDefenderProbe() {
    liveInteractionValidator.resetRuntimeDebugState();
    runtimeProbeHarness.clear();
    runtimeProbeHarness.start('defender-response-recovery');
  },
  runCleanRuntimeProbe() {
    liveInteractionValidator.resetRuntimeDebugState();
    runtimeProbeHarness.clear();
    runtimeProbeHarness.start('structure-to-closure');
  },
  clearRuntimeProbe() {
    runtimeProbeHarness.clear();
  },
  resetRuntimeValidationState() {
    liveInteractionValidator.resetRuntimeDebugState();
    runtimeProbeHarness.clear();
  },
  renderGameToText() {
    const snapshot = headlessCombat.getSnapshot();
    const liveInteractionSnapshot = liveInteractionValidator.getDebugState();
    const presentationSnapshot = presentationShell.getDebugState();
    const runtimeProbeSnapshot = runtimeProbeHarness.getSnapshot();
    const runtimeOperatorRecommendation =
      buildRuntimeOperatorRecommendation(runtimeSmokeHistory);
    const runtimeOperatorStatus =
      buildRuntimeOperatorStatus(runtimeSmokeHistory);
    const runtimeTerminalSummary = buildRuntimeTerminalSummary(
      runtimeSmokeHistory,
      runtimeProbeSnapshot
    );
    const runtimeOperatorChecklist = buildRuntimeOperatorChecklist(
      runtimeOperatorStatus,
      runtimeOperatorRecommendation
    );
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
        runtimeSmoke: {
          status: lastRuntimeProbeSmoke.status,
          presetId: lastRuntimeProbeSmoke.presetId,
          steps: lastRuntimeProbeSmoke.steps,
          elapsedSeconds: lastRuntimeProbeSmoke.elapsedSeconds,
          summary: lastRuntimeProbeSmoke.summary
        },
        runtimeSmokeHistory: {
          capacity: runtimeSmokeHistoryCapacity,
          entries: runtimeSmokeHistory.map((entry) => ({
            status: entry.status,
            presetId: entry.presetId,
            steps: entry.steps,
            elapsedSeconds: entry.elapsedSeconds,
            summary: entry.summary
          })),
          summary: buildRuntimeSmokeHistorySummary(runtimeSmokeHistory)
        },
        runtimeCommandIndex: {
          commands: [...runtimeCommandIndexCommands],
          summary: buildRuntimeCommandIndexSummary()
        },
        runtimeQuickStart: {
          commands: [...runtimeQuickStartCommands],
          summary: buildRuntimeQuickStartSummary()
        },
        runtimeOperatorRecommendation: {
          nextCommand: runtimeOperatorRecommendation.nextCommand,
          reason: runtimeOperatorRecommendation.reason
        },
        runtimeOperatorStatus: {
          happyPathCovered: runtimeOperatorStatus.happyPathCovered,
          defenderRecoveryCovered: runtimeOperatorStatus.defenderRecoveryCovered,
          coverageState: runtimeOperatorStatus.coverageState,
          summary: runtimeOperatorStatus.summary
        },
        runtimeTerminalSummary: {
          source: runtimeTerminalSummary.source,
          status: runtimeTerminalSummary.status,
          presetId: runtimeTerminalSummary.presetId,
          summary: runtimeTerminalSummary.summary
        },
        runtimeOperatorChecklist: {
          resetRecommendedCompleted:
            runtimeOperatorChecklist.resetRecommendedCompleted,
          happyPathSmokeCompleted:
            runtimeOperatorChecklist.happyPathSmokeCompleted,
          defenderRecoverySmokeCompleted:
            runtimeOperatorChecklist.defenderRecoverySmokeCompleted,
          checklistState: runtimeOperatorChecklist.checklistState,
          summary: runtimeOperatorChecklist.summary
        },
        runtimeValidationCycle: {
          status: lastRuntimeValidationCycle.status,
          happyPathSmoke: lastRuntimeValidationCycle.happyPathSmoke
            ? {
                status: lastRuntimeValidationCycle.happyPathSmoke.status,
                presetId: lastRuntimeValidationCycle.happyPathSmoke.presetId,
                steps: lastRuntimeValidationCycle.happyPathSmoke.steps,
                elapsedSeconds:
                  lastRuntimeValidationCycle.happyPathSmoke.elapsedSeconds,
                summary: lastRuntimeValidationCycle.happyPathSmoke.summary
              }
            : null,
          defenderRecoverySmoke: lastRuntimeValidationCycle
            .defenderRecoverySmoke
            ? {
                status:
                  lastRuntimeValidationCycle.defenderRecoverySmoke.status,
                presetId:
                  lastRuntimeValidationCycle.defenderRecoverySmoke.presetId,
                steps: lastRuntimeValidationCycle.defenderRecoverySmoke.steps,
                elapsedSeconds:
                  lastRuntimeValidationCycle.defenderRecoverySmoke
                    .elapsedSeconds,
                summary:
                  lastRuntimeValidationCycle.defenderRecoverySmoke.summary
              }
            : null,
          summary: lastRuntimeValidationCycle.summary
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
