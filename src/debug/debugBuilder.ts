import * as pc from 'playcanvas';
import { layoutConfig, type RouteDef, type ValidationBand, type ZoneCategory } from '../config/layout';
import { type RouteProbeResult, colorFromHex, type SceneRegistry } from '../scene/grayboxFactory';
import { type HeadlessCombatRuntimeSnapshot } from '../gameplay/headlessCombatRuntime';
import {
  type LiveInteractionCalibrationOperatorControls,
  type LiveInteractionDebugState
} from '../validation/liveInteractionValidator';
import { type TempoHarnessDebugState } from '../validation/tempoHarness';
import { type WavePressureDebugState } from '../validation/wavePressureValidator';

export interface DebugUpdateState {
  playerPosition: pc.Vec3;
  camera: pc.Entity;
  cameraLabel: string;
  tacticalModeLabel: string;
  activeProbeRouteId: string | null;
  probeElapsedSeconds: number | null;
  headlessCombat?: HeadlessCombatRuntimeSnapshot;
  liveInteraction?: LiveInteractionDebugState;
  liveInteractionControls?: LiveInteractionCalibrationOperatorControls;
  tempo?: TempoHarnessDebugState;
  wavePressure?: WavePressureDebugState;
}

export interface DebugSystem {
  update(state: DebugUpdateState): void;
  toggleLabels(): void;
  toggleRoutes(): void;
  setSelectedRoute(routeId: string): void;
  setRouteResult(result: RouteProbeResult | null): void;
  destroy(): void;
}

interface LabelBinding {
  anchor: pc.Entity;
  element: HTMLDivElement;
}

export const createDebugSystem = (
  registry: SceneRegistry
): DebugSystem => {
  const overlayRoot = document.getElementById('debug-overlay-root');
  if (!(overlayRoot instanceof HTMLDivElement)) {
    throw new Error('Missing debug overlay root.');
  }

  let labelsVisible = true;
  let routesVisible = true;
  let selectedRouteId = layoutConfig.routes[0]?.id ?? '';
  let probeResult: RouteProbeResult | null = null;
  let liveInteractionControls: LiveInteractionCalibrationOperatorControls | null = null;

  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  overlayRoot.appendChild(panel);
  const operatorControlsSection = document.createElement('section');
  operatorControlsSection.className = 'debug-operator-section';
  panel.appendChild(operatorControlsSection);
  const panelContent = document.createElement('div');
  panel.appendChild(panelContent);
  const operatorControlsHeader = document.createElement('div');
  operatorControlsHeader.className = 'debug-muted';
  operatorControlsHeader.textContent = 'Calibration Operator';
  const operatorControlsStatus = document.createElement('div');
  operatorControlsStatus.className = 'debug-muted';
  const operatorControlsLastAction = document.createElement('div');
  operatorControlsLastAction.className = 'debug-muted';
  const operatorControlsWorkflow = document.createElement('div');
  operatorControlsWorkflow.className = 'debug-muted';
  const operatorControlsWorkflowReason = document.createElement('div');
  operatorControlsWorkflowReason.className = 'debug-muted';
  const operatorControlsClosure = document.createElement('div');
  operatorControlsClosure.className = 'debug-muted';
  const operatorControlsClosureReason = document.createElement('div');
  operatorControlsClosureReason.className = 'debug-muted';
  const operatorControlsFeedback = document.createElement('div');
  operatorControlsFeedback.className = 'debug-muted';
  const operatorControlsPrimaryRow = document.createElement('div');
  operatorControlsPrimaryRow.className = 'debug-action-row';
  const operatorControlsSecondaryRow = document.createElement('div');
  operatorControlsSecondaryRow.className = 'debug-action-row';
  const operatorControlsDecisionRow = document.createElement('div');
  operatorControlsDecisionRow.className = 'debug-action-row';
  operatorControlsSection.append(
    operatorControlsHeader,
    operatorControlsStatus,
    operatorControlsLastAction,
    operatorControlsWorkflow,
    operatorControlsWorkflowReason,
    operatorControlsClosure,
    operatorControlsClosureReason,
    operatorControlsFeedback,
    operatorControlsPrimaryRow,
    operatorControlsSecondaryRow,
    operatorControlsDecisionRow
  );

  const labelsHost = document.createElement('div');
  overlayRoot.appendChild(labelsHost);

  const labelBindings: LabelBinding[] = Object.entries(layoutConfig.nodes).map(([nodeId, node]) => {
    const element = document.createElement('div');
    element.className = 'debug-label';
    element.textContent = node.label;
    labelsHost.appendChild(element);
    return {
      anchor: registry.nodeAnchors[nodeId],
      element
    };
  });

  const categoryLegend = buildLegend([
    ['lane', 'Lane'],
    ['safe', 'Safe'],
    ['contested', 'Contested'],
    ['pressure', 'Pressure'],
    ['vision', 'Vision'],
    ['boss', 'Boss'],
    ['risk', 'Risk'],
    ['structure', 'Tower/Core']
  ]);

  const controls = [
    '`WASD` move the proxy',
    '`F` / `Space` queue the authoritative basic cast on the lane blocker',
    '`C` toggle tactical / follow camera',
    '`V` switch tactical angle / top-down',
    '`[` / `]` cycle route probes',
    '`P` teleport to selected route start and begin timing',
    '`Anti-Turtle` probes: select route label and press `P`',
    '`Live Interaction` runs continuously (validation-only)',
    '`Tempo Harness` updates automatically from numeric coefficients',
    '`I` cycle wave-pressure scenarios',
    '`O` start/pause wave-pressure simulation',
    '`K` reset current wave-pressure scenario to stage 1',
    '`L` toggle node labels',
    '`G` toggle route lines',
    '`1-0`, `B`, `R` teleport to major anchors'
  ];

  const createOperatorButton = (
    label: string,
    action:
      | 'reset-calibration-digest'
      | 'capture-current-calibration-baseline'
      | 'clear-calibration-baseline'
      | 'freeze-current-calibration-pass-review'
      | 'clear-frozen-calibration-pass-review'
      | 'acknowledge-keep-existing-baseline'
      | 'acknowledge-observe-longer'
      | 'acknowledge-run-targeted-retune'
      | 'acknowledge-rerun-for-signal'
      | 'clear-calibration-loop-closure-decision'
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-action-button';
    button.dataset.calibrationOperatorAction = action;
    button.textContent = label;
    return button;
  };

  const operatorButtons = {
    resetDigest: createOperatorButton(
      'Reset Digest',
      'reset-calibration-digest'
    ),
    captureBaseline: createOperatorButton(
      'Capture Baseline',
      'capture-current-calibration-baseline'
    ),
    clearBaseline: createOperatorButton(
      'Clear Baseline',
      'clear-calibration-baseline'
    ),
    freezeReview: createOperatorButton(
      'Freeze Review',
      'freeze-current-calibration-pass-review'
    ),
    clearReview: createOperatorButton(
      'Clear Review',
      'clear-frozen-calibration-pass-review'
    ),
    keepBaseline: createOperatorButton(
      'Keep Baseline',
      'acknowledge-keep-existing-baseline'
    ),
    observeLonger: createOperatorButton(
      'Observe Longer',
      'acknowledge-observe-longer'
    ),
    runRetune: createOperatorButton(
      'Ack Retune',
      'acknowledge-run-targeted-retune'
    ),
    rerunSignal: createOperatorButton(
      'Ack Rerun',
      'acknowledge-rerun-for-signal'
    ),
    clearDecision: createOperatorButton(
      'Clear Decision',
      'clear-calibration-loop-closure-decision'
    )
  };

  operatorControlsPrimaryRow.append(
    operatorButtons.resetDigest,
    operatorButtons.captureBaseline,
    operatorButtons.clearBaseline
  );
  operatorControlsSecondaryRow.append(
    operatorButtons.freezeReview,
    operatorButtons.clearReview
  );
  operatorControlsDecisionRow.append(
    operatorButtons.keepBaseline,
    operatorButtons.observeLonger,
    operatorButtons.runRetune,
    operatorButtons.rerunSignal,
    operatorButtons.clearDecision
  );

  const handleCalibrationOperatorAction = (
    action:
      | 'reset-calibration-digest'
      | 'capture-current-calibration-baseline'
      | 'clear-calibration-baseline'
      | 'freeze-current-calibration-pass-review'
      | 'clear-frozen-calibration-pass-review'
      | 'acknowledge-keep-existing-baseline'
      | 'acknowledge-observe-longer'
      | 'acknowledge-run-targeted-retune'
      | 'acknowledge-rerun-for-signal'
      | 'clear-calibration-loop-closure-decision'
  ): void => {
    if (!liveInteractionControls) {
      return;
    }

    if (action === 'reset-calibration-digest') {
      liveInteractionControls.resetCalibrationDigest();
      return;
    }

    if (action === 'capture-current-calibration-baseline') {
      liveInteractionControls.captureCurrentCalibrationBaseline();
      return;
    }

    if (action === 'clear-calibration-baseline') {
      liveInteractionControls.clearCalibrationBaseline();
      return;
    }

    if (action === 'freeze-current-calibration-pass-review') {
      liveInteractionControls.freezeCurrentCalibrationPassReview();
      return;
    }

    if (action === 'acknowledge-keep-existing-baseline') {
      liveInteractionControls.acknowledgeCalibrationLoopDisposition(
        'keep-existing-baseline'
      );
      return;
    }

    if (action === 'acknowledge-observe-longer') {
      liveInteractionControls.acknowledgeCalibrationLoopDisposition(
        'observe-longer'
      );
      return;
    }

    if (action === 'acknowledge-run-targeted-retune') {
      liveInteractionControls.acknowledgeCalibrationLoopDisposition(
        'run-targeted-retune'
      );
      return;
    }

    if (action === 'acknowledge-rerun-for-signal') {
      liveInteractionControls.acknowledgeCalibrationLoopDisposition(
        'rerun-for-signal'
      );
      return;
    }

    if (action === 'clear-calibration-loop-closure-decision') {
      liveInteractionControls.clearCalibrationLoopClosureDecision();
      return;
    }

    liveInteractionControls.clearFrozenCalibrationPassReview();
  };

  const onPanelClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>('[data-calibration-operator-action]');
    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.calibrationOperatorAction;
    if (
      action !== 'reset-calibration-digest' &&
      action !== 'capture-current-calibration-baseline' &&
      action !== 'clear-calibration-baseline' &&
      action !== 'freeze-current-calibration-pass-review' &&
      action !== 'clear-frozen-calibration-pass-review' &&
      action !== 'acknowledge-keep-existing-baseline' &&
      action !== 'acknowledge-observe-longer' &&
      action !== 'acknowledge-run-targeted-retune' &&
      action !== 'acknowledge-rerun-for-signal' &&
      action !== 'clear-calibration-loop-closure-decision'
    ) {
      return;
    }

    handleCalibrationOperatorAction(action);
  };

  panel.addEventListener('click', onPanelClick);

  const renderPanel = (state?: DebugUpdateState): void => {
    if (state?.liveInteractionControls) {
      liveInteractionControls = state.liveInteractionControls;
    }
    const selectedRoute = layoutConfig.routes.find((route) => route.id === selectedRouteId);
    const selectedRouteSummary = selectedRoute
      ? formatRouteSummary(selectedRoute)
      : 'No route selected.';
    const liveProbe = state?.activeProbeRouteId && state.probeElapsedSeconds !== null
      ? `<div class="debug-muted">Probe running: <span class="debug-strong">${state.activeProbeRouteId}</span> | ${state.probeElapsedSeconds.toFixed(2)}s</div>`
      : '<div class="debug-muted">Probe idle</div>';
    const resultMarkup = probeResult
      ? `<div class="debug-muted">Last result: <span class="debug-strong">${probeResult.label}</span> | ${probeResult.actualSeconds.toFixed(2)}s${probeResult.targetMin !== undefined ? ` vs ${probeResult.targetMin.toFixed(1)}-${probeResult.targetMax?.toFixed(1)}s` : ''}</div>${probeResult.note ? `<div class="debug-muted">${probeResult.note}</div>` : ''}`
      : '<div class="debug-muted">Last result: none</div>';
    const wavePressure = state?.wavePressure;
    const wavePressureMarkup = wavePressure
      ? `
        <div class="debug-muted">Scenario: <span class="debug-strong">${wavePressure.scenarioLabel}</span></div>
        <div class="debug-muted">Stage: <span class="debug-strong">${wavePressure.stageLabel}</span></div>
        <div class="debug-muted">State: <span class="debug-strong">${wavePressure.running ? 'Running' : 'Paused'}</span></div>
        <div class="debug-muted">Next stage in: <span class="debug-strong">${wavePressure.secondsToNextStage.toFixed(1)}s</span></div>
      `
      : '<div class="debug-muted">Wave-pressure simulation unavailable.</div>';
    const headlessCombat = state?.headlessCombat;
    const sharedLaneConsequence =
      state?.liveInteraction?.signalProvider.sharedLaneConsequence;
    const sharedSiegeWindow =
      state?.liveInteraction?.signalProvider.sharedSiegeWindow;
    const sharedStructureConversion =
      state?.liveInteraction?.signalProvider.sharedStructureConversion;
    const headlessCombatMarkup = headlessCombat
      ? `
        <div class="debug-muted">Hero: <span class="debug-strong">${formatCombatHitPoints(headlessCombat.player.currentHp, headlessCombat.player.maxHp)}</span> | alive <span class="debug-strong">${headlessCombat.player.alive ? 'Yes' : 'No'}</span> | cd <span class="debug-strong">${headlessCombat.player.basicAbilityCooldownRemaining.toFixed(2)}s</span></div>
        <div class="debug-muted">Lane blocker: <span class="debug-strong">${formatCombatHitPoints(headlessCombat.target.currentHp, headlessCombat.target.maxHp)}</span> | alive <span class="debug-strong">${headlessCombat.target.alive ? 'Yes' : 'No'}</span> | pos <span class="debug-strong">${headlessCombat.target.position.x.toFixed(1)}, ${headlessCombat.target.position.z.toFixed(1)}</span></div>
        <div class="debug-muted">Last cast: <span class="debug-strong">${formatHeadlessCombatCastResult(headlessCombat.lastResolvedCast)}</span></div>
        <div class="debug-muted">Failure reason: <span class="debug-strong">${formatHeadlessCombatFailureReason(headlessCombat.lastLegalityFailureReason)}</span></div>
        <div class="debug-muted">Lane bridge: hero <span class="debug-strong">${formatPressureSegment(headlessCombat.laneBridge.hero.lanePressureSegment)}</span>, blocker <span class="debug-strong">${formatPressureSegment(headlessCombat.laneBridge.blocker.lanePressureSegment)}</span> / <span class="debug-strong">${formatStructureTier(headlessCombat.laneBridge.blocker.structurePressureTier)}</span> | pressure <span class="debug-strong">${formatSignedDelta(headlessCombat.laneBridge.lanePressureDelta)}</span> | occupancy <span class="debug-strong">${headlessCombat.laneBridge.occupancyAdvantage.toFixed(2)}</span> | opportunity <span class="debug-strong">${headlessCombat.laneBridge.structurePressureOpportunityActive ? 'Open' : 'Closed'}</span> ${headlessCombat.laneBridge.opportunityWindowRemainingSeconds.toFixed(2)}s</div>
        <div class="debug-muted">Shared consumer: <span class="debug-strong">${sharedLaneConsequence ? `${formatPressureSegment(sharedLaneConsequence.affectedSegment)} / ${formatStructureTier(sharedLaneConsequence.affectedTier)}` : 'Unavailable'}</span> | pressure <span class="debug-strong">${sharedLaneConsequence ? formatSignedDelta(sharedLaneConsequence.pressureDelta) : 'n/a'}</span> | occupancy <span class="debug-strong">${sharedLaneConsequence ? sharedLaneConsequence.occupancyAdvantage.toFixed(2) : 'n/a'}</span> | ${sharedLaneConsequence?.opportunityActive ? 'active' : 'idle'} ${sharedLaneConsequence ? `${sharedLaneConsequence.opportunityRemainingSeconds.toFixed(2)}s` : ''}</div>
        <div class="debug-muted">Siege window: <span class="debug-strong">${sharedSiegeWindow?.siegeWindowActive ? 'Open' : 'Closed'}</span> ${sharedSiegeWindow ? `${sharedSiegeWindow.siegeWindowRemainingSeconds.toFixed(2)}s` : ''} | <span class="debug-strong">${sharedSiegeWindow ? `${formatPressureSegment(sharedSiegeWindow.sourceSegment)} / ${formatStructureTier(sharedSiegeWindow.sourceTier)}` : 'n/a'}</span> | support <span class="debug-strong">${sharedSiegeWindow ? `${sharedSiegeWindow.pressureSupportLevel.toFixed(2)} / ${sharedSiegeWindow.occupancySupportLevel.toFixed(2)}` : 'n/a'}</span></div>
        <div class="debug-muted">Structure step: <span class="debug-strong">${sharedStructureConversion?.conversionActive ? 'Active' : 'Idle'}</span> | prog <span class="debug-strong">${sharedStructureConversion ? `${sharedStructureConversion.conversionProgress.toFixed(2)} / ${sharedStructureConversion.conversionThreshold.toFixed(2)}` : 'n/a'}</span> | eligible <span class="debug-strong">${sharedStructureConversion?.conversionEligible ? 'Yes' : 'No'}</span> | last <span class="debug-strong">${sharedStructureConversion ? formatSharedStructureResolvedStep(sharedStructureConversion.lastResolvedStructureStep) : 'n/a'}</span></div>
        <div class="debug-muted">Bridge outcome: <span class="debug-strong">${headlessCombat.laneBridge.lastBridgeOutcome.summary}</span> | proof <span class="debug-strong">${headlessCombat.laneDeterminismProof.passed ? 'Deterministic' : 'Mismatch'}</span></div>
      `
      : '<div class="debug-muted">Headless combat slice unavailable.</div>';
    const liveInteraction = state?.liveInteraction;
    const operatorControlsEnabled = Boolean(liveInteractionControls && liveInteraction);
    Object.values(operatorButtons).forEach((button) => {
      button.disabled = !operatorControlsEnabled;
    });
    if (liveInteraction) {
      const operatorState = liveInteraction.signalProvider.calibrationOperatorControls;
      const workflowState = liveInteraction.signalProvider.calibrationOperatorWorkflow;
      const closureState =
        liveInteraction.signalProvider.calibrationOperatorLoopClosure;
      operatorControlsStatus.innerHTML =
        `Status: baseline <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigestComparison.baselineAvailable ? 'Present' : 'Absent'}</span>, frozen review <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.hasFrozenReview ? 'Present' : 'Absent'}</span>, loop <span class="debug-strong">${closureState.loopResolved ? 'Resolved' : 'Open'}</span>`;
      operatorControlsLastAction.innerHTML =
        `Last operator action: <span class="debug-strong">${operatorState.lastActionLabel || 'None'}</span> | runtime <span class="debug-strong">${formatOptionalTime(operatorState.lastActionRuntimeSeconds)}</span> | age <span class="debug-strong">${formatOperatorActionAge(liveInteraction.signalProvider.elapsedSeconds, operatorState.lastActionRuntimeSeconds)}</span> <span class="debug-feedback-chip debug-feedback-${operatorState.actionFeedbackSeverity}">${formatCalibrationOperatorFeedbackSeverity(operatorState.actionFeedbackSeverity)}</span>`;
      operatorControlsWorkflow.innerHTML =
        `Workflow: <span class="debug-strong">${formatCalibrationOperatorWorkflowPhase(workflowState.workflowPhase)}</span> | next <span class="debug-strong">${formatCalibrationOperatorWorkflowNextStep(workflowState.nextSuggestedStep)}</span> | domain <span class="debug-strong">${formatCalibrationRetuningDomain(workflowState.suggestedDomain)}</span> | confidence <span class="debug-strong">${workflowState.stepConfidence.toFixed(2)}</span> | signal <span class="debug-strong">${workflowState.workflowSignalSufficient ? 'Sufficient' : 'Weak'}</span>`;
      operatorControlsWorkflowReason.innerHTML =
        `${workflowState.workflowPrimaryReason}${workflowState.workflowSecondaryReason ? ` | ${workflowState.workflowSecondaryReason}` : ''}${workflowState.workflowBlockers.length > 0 ? ` | blockers ${formatCalibrationBlockingFactors(workflowState.workflowBlockers)}` : ''}`;
      operatorControlsClosure.innerHTML =
        `Loop closure: <span class="debug-strong">${formatCalibrationOperatorLoopClosureState(closureState.loopClosureState)}</span> | disposition <span class="debug-strong">${formatCalibrationOperatorDisposition(closureState.operatorDisposition)}</span> | domain <span class="debug-strong">${formatCalibrationRetuningDomain(closureState.dispositionDomain)}</span> | confidence <span class="debug-strong">${closureState.closureConfidence.toFixed(2)}</span> | signal <span class="debug-strong">${closureState.decisionSignalSufficient ? 'Sufficient' : 'Weak'}</span>`;
      operatorControlsClosureReason.innerHTML =
        `${closureState.closurePrimaryReason}${closureState.closureSecondaryReason ? ` | ${closureState.closureSecondaryReason}` : ''} | ${closureState.loopResolved ? 'resolved' : 'unresolved'}${closureState.closureBlockers.length > 0 ? ` | blockers ${formatCalibrationBlockingFactors(closureState.closureBlockers)}` : ''}`;
      operatorControlsFeedback.innerHTML =
        operatorState.actionFeedbackText || 'No manual calibration action yet.';
    } else {
      operatorControlsStatus.innerHTML = 'Status: live interaction unavailable.';
      operatorControlsLastAction.innerHTML = 'Last operator action: none.';
      operatorControlsWorkflow.innerHTML = 'Workflow: unavailable.';
      operatorControlsWorkflowReason.innerHTML = 'Workflow guidance is unavailable.';
      operatorControlsClosure.innerHTML = 'Loop closure: unavailable.';
      operatorControlsClosureReason.innerHTML = 'Loop-closure state is unavailable.';
      operatorControlsFeedback.innerHTML = 'Calibration operator controls are unavailable.';
    }
    const liveInteractionMarkup = liveInteraction
      ? `
        <div class="debug-muted">Overall: <span class="debug-strong">${formatValidationBand(liveInteraction.overall)}</span></div>
        <div class="debug-muted">Pass/Near/Fail: <span class="debug-strong">${liveInteraction.summary.pass}/${liveInteraction.summary.nearMiss}/${liveInteraction.summary.fail}</span></div>
        <div class="debug-muted">Coefficients: adv ${liveInteraction.coefficients.waveAdvanceRate.toFixed(2)}, hold ${liveInteraction.coefficients.towerHoldResistance.toFixed(2)}, reclear ${liveInteraction.coefficients.defenderReclearRate.toFixed(2)}</div>
        <div class="debug-muted">Decay ${liveInteraction.coefficients.pressureDecayRate.toFixed(2)}, delay ${liveInteraction.coefficients.defenderDelayScalar.toFixed(2)}, carryover ${liveInteraction.coefficients.twoWaveCarryover.toFixed(2)}</div>
        <div class="debug-muted">Prototype wave (O/I/C): <span class="debug-strong">${liveInteraction.prototypeSignals.wave.progressionBySegment['outer-front'].toFixed(2)}/${liveInteraction.prototypeSignals.wave.progressionBySegment['inner-siege'].toFixed(2)}/${liveInteraction.prototypeSignals.wave.progressionBySegment['core-approach'].toFixed(2)}</span> carry ${liveInteraction.prototypeSignals.wave.carryoverScalar.toFixed(2)}</div>
        <div class="debug-muted">Prototype tower hold (O/I/C): <span class="debug-strong">${liveInteraction.prototypeSignals.tower.holdByTier.outer.toFixed(2)}/${liveInteraction.prototypeSignals.tower.holdByTier.inner.toFixed(2)}/${liveInteraction.prototypeSignals.tower.holdByTier.core.toFixed(2)}</span> defender reclear (O/I/C): <span class="debug-strong">${liveInteraction.prototypeSignals.defender.reclearByTier.outer.toFixed(2)}/${liveInteraction.prototypeSignals.defender.reclearByTier.inner.toFixed(2)}/${liveInteraction.prototypeSignals.defender.reclearByTier.core.toFixed(2)}</span></div>
        <div class="debug-muted">Signal provider: t <span class="debug-strong">${liveInteraction.signalProvider.elapsedSeconds.toFixed(1)}s</span> phase ${liveInteraction.signalProvider.phase.toFixed(2)} front ${formatPressureSegment(liveInteraction.signalProvider.frontWaveSegment)} ${formatPercent(liveInteraction.signalProvider.frontWaveProgress)} carry-state ${liveInteraction.signalProvider.carryoverState.toFixed(3)} (rel ${liveInteraction.signalProvider.carryoverRelevance.toFixed(2)}) samples ${liveInteraction.signalProvider.scenarioSamples}</div>
        <div class="debug-muted">Waves: spawned <span class="debug-strong">${liveInteraction.signalProvider.spawnedWaveCount}</span>, active <span class="debug-strong">${liveInteraction.signalProvider.activeWaveCount}</span> | occupancy cnt (O/I/C): <span class="debug-strong">${liveInteraction.signalProvider.segmentOccupancyCount['outer-front'].toFixed(0)}/${liveInteraction.signalProvider.segmentOccupancyCount['inner-siege'].toFixed(0)}/${liveInteraction.signalProvider.segmentOccupancyCount['core-approach'].toFixed(0)}</span> pres (O/I/C): <span class="debug-strong">${liveInteraction.signalProvider.segmentOccupancyPresence['outer-front'].toFixed(2)}/${liveInteraction.signalProvider.segmentOccupancyPresence['inner-siege'].toFixed(2)}/${liveInteraction.signalProvider.segmentOccupancyPresence['core-approach'].toFixed(2)}</span></div>
        <div class="debug-muted">Seg time-in (O/I/C): <span class="debug-strong">${liveInteraction.signalProvider.segmentTimeInSegmentSeconds['outer-front'].toFixed(2)}s/${liveInteraction.signalProvider.segmentTimeInSegmentSeconds['inner-siege'].toFixed(2)}s/${liveInteraction.signalProvider.segmentTimeInSegmentSeconds['core-approach'].toFixed(2)}s</span> | contact O/I/C: <span class="debug-strong">${formatContactState(liveInteraction.signalProvider.structureContactByTier.outer)} / ${formatContactState(liveInteraction.signalProvider.structureContactByTier.inner)} / ${formatContactState(liveInteraction.signalProvider.structureContactByTier.core)}</span></div>
        <div class="debug-muted">Lane pressure (O/I/C): <span class="debug-strong">${liveInteraction.signalProvider.lanePressureBySegment['outer-front'].toFixed(2)}/${liveInteraction.signalProvider.lanePressureBySegment['inner-siege'].toFixed(2)}/${liveInteraction.signalProvider.lanePressureBySegment['core-approach'].toFixed(2)}</span> | structure pressure (O/I/C): <span class="debug-strong">${liveInteraction.signalProvider.structurePressureByTier.outer.toFixed(2)}/${liveInteraction.signalProvider.structurePressureByTier.inner.toFixed(2)}/${liveInteraction.signalProvider.structurePressureByTier.core.toFixed(2)}</span></div>
        <div class="debug-muted">Events O/I/C active: <span class="debug-strong">${formatTierEventActive(liveInteraction.signalProvider.structurePressureEventsByTier.outer)} / ${formatTierEventActive(liveInteraction.signalProvider.structurePressureEventsByTier.inner)} / ${formatTierEventActive(liveInteraction.signalProvider.structurePressureEventsByTier.core)}</span></div>
        <div class="debug-muted">Last O/I/C result: <span class="debug-strong">${formatTierEventLast(liveInteraction.signalProvider.structurePressureEventsByTier.outer)} / ${formatTierEventLast(liveInteraction.signalProvider.structurePressureEventsByTier.inner)} / ${formatTierEventLast(liveInteraction.signalProvider.structurePressureEventsByTier.core)}</span></div>
        <div class="debug-muted">Calibration O/I/C: <span class="debug-strong">${formatTierCalibration(liveInteraction.signalProvider.structurePressureEventsByTier.outer)} / ${formatTierCalibration(liveInteraction.signalProvider.structurePressureEventsByTier.inner)} / ${formatTierCalibration(liveInteraction.signalProvider.structurePressureEventsByTier.core)}</span></div>
        <div class="debug-muted">Resolution stage O/I/C: <span class="debug-strong">${formatTierResolutionStage(liveInteraction.signalProvider.structureResolutionByTier.outer)} / ${formatTierResolutionStage(liveInteraction.signalProvider.structureResolutionByTier.inner)} / ${formatTierResolutionStage(liveInteraction.signalProvider.structureResolutionByTier.core)}</span></div>
        <div class="debug-muted">Resolution memory O/I/C: <span class="debug-strong">${formatTierResolutionMemory(liveInteraction.signalProvider.structureResolutionByTier.outer)} / ${formatTierResolutionMemory(liveInteraction.signalProvider.structureResolutionByTier.inner)} / ${formatTierResolutionMemory(liveInteraction.signalProvider.structureResolutionByTier.core)}</span></div>
        <div class="debug-muted">Meaningful siege age O/I/C: <span class="debug-strong">${formatTierMeaningfulAge(liveInteraction.signalProvider.structureResolutionByTier.outer)} / ${formatTierMeaningfulAge(liveInteraction.signalProvider.structureResolutionByTier.inner)} / ${formatTierMeaningfulAge(liveInteraction.signalProvider.structureResolutionByTier.core)}</span></div>
        <div class="debug-muted">Lane closure posture: <span class="debug-strong">${formatLaneClosurePosture(liveInteraction.signalProvider.laneClosure.posture)}</span> age ${liveInteraction.signalProvider.laneClosure.postureAgeSeconds.toFixed(1)}s</div>
        <div class="debug-muted">Lane closure scalars: threat <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.closureThreatScalar.toFixed(3)}</span>, stability <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.laneStabilityScalar.toFixed(3)}</span>, recovery <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.defenderRecoveryScalar.toFixed(3)}</span>, anti-stall <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.antiStallAccelerationScalar.toFixed(3)}</span>, carryover <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.structuralCarryoverScalar.toFixed(3)}</span></div>
        <div class="debug-muted">Lane closure levels: threat <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.closureThreatLevel.toFixed(2)}</span>, stability <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.laneStabilityLevel.toFixed(2)}</span>, recovery <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.defenderRecoveryLevel.toFixed(2)}</span>, anti-stall <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.antiStallAccelerationLevel.toFixed(2)}</span>, carryover <span class="debug-strong">${liveInteraction.signalProvider.laneClosure.structuralCarryoverLevel.toFixed(2)}</span></div>
        <div class="debug-muted">Closure pacing state: <span class="debug-strong">${formatClosurePacingState(liveInteraction.signalProvider.closurePacing.state)}</span> age ${liveInteraction.signalProvider.closurePacing.stateAgeSeconds.toFixed(1)}s</div>
        <div class="debug-muted">Closure pacing scalars: readiness <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.closureReadinessScalar.toFixed(3)}</span>, anti-stall <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.antiStallReadinessScalar.toFixed(3)}</span>, defender reset <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.defenderResetScalar.toFixed(3)}</span>, closure window <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.closureWindowScalar.toFixed(3)}</span>, pacing pressure <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.pacingPressureScalar.toFixed(3)}</span></div>
        <div class="debug-muted">Closure pacing levels: readiness <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.closureReadinessLevel.toFixed(2)}</span>, anti-stall <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.antiStallReadinessLevel.toFixed(2)}</span>, defender reset <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.defenderResetLevel.toFixed(2)}</span>, closure window <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.closureWindowLevel.toFixed(2)}</span>, pacing pressure <span class="debug-strong">${liveInteraction.signalProvider.closurePacing.pacingPressureLevel.toFixed(2)}</span></div>
        <div class="debug-muted">Pacing watch health: <span class="debug-strong">${formatClosurePacingHealthState(liveInteraction.signalProvider.closurePacingWatch.healthState)}</span> age ${liveInteraction.signalProvider.closurePacingWatch.healthStateAgeSeconds.toFixed(1)}s | dwell ${liveInteraction.signalProvider.closurePacingWatch.currentStateDwellSeconds.toFixed(1)}s</div>
        <div class="debug-muted">Pacing watch scalars: health <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.pacingHealthScalar.toFixed(3)}</span>, timing <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.escalationTimingScalar.toFixed(3)}</span>, stickiness <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.closureStickinessScalar.toFixed(3)}</span>, reset <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.defenderResetQualityScalar.toFixed(3)}</span>, order <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.progressionOrderScalar.toFixed(3)}</span></div>
        <div class="debug-muted">Pacing watch first-entry: rise <span class="debug-strong">${formatOptionalTime(liveInteraction.signalProvider.closurePacingWatch.firstEntrySecondsByState['rising-anti-stall'])}</span>, ready <span class="debug-strong">${formatOptionalTime(liveInteraction.signalProvider.closurePacingWatch.firstEntrySecondsByState['closure-readiness'])}</span>, accel <span class="debug-strong">${formatOptionalTime(liveInteraction.signalProvider.closurePacingWatch.firstEntrySecondsByState['accelerated-closure-window'])}</span>, reset <span class="debug-strong">${formatOptionalTime(liveInteraction.signalProvider.closurePacingWatch.firstEntrySecondsByState['defender-reset-window'])}</span></div>
        <div class="debug-muted">Pacing watch dwell/events: rise <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.cumulativeDwellSecondsByState['rising-anti-stall'].toFixed(1)}s</span>, ready <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.cumulativeDwellSecondsByState['closure-readiness'].toFixed(1)}s</span>, accel <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.cumulativeDwellSecondsByState['accelerated-closure-window'].toFixed(1)}s</span>, reset <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.cumulativeDwellSecondsByState['defender-reset-window'].toFixed(1)}s</span> | sticky A/C <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.stickyAntiStallEvents}/${liveInteraction.signalProvider.closurePacingWatch.stickyClosureWindowEvents}</span> | prolonged <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.prolongedReadinessEvents}</span> | premature reset <span class="debug-strong">${liveInteraction.signalProvider.closurePacingWatch.prematureResetEvents}</span></div>
        <div class="debug-muted">Doctrine fit verdict: <span class="debug-strong">${formatClosureDoctrineFitVerdict(liveInteraction.signalProvider.closureDoctrineFit.verdict)}</span> age ${liveInteraction.signalProvider.closureDoctrineFit.verdictAgeSeconds.toFixed(1)}s</div>
        <div class="debug-muted">Doctrine fit scalars: fit <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.doctrineFitScalar.toFixed(3)}</span>, early <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.earlySiegeBiasScalar.toFixed(3)}</span>, late <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.lateClosureDragScalar.toFixed(3)}</span>, reset <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.resetCadenceRiskScalar.toFixed(3)}</span>, overhang <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.antiStallOverhangScalar.toFixed(3)}</span>, urgency <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.retuningUrgencyScalar.toFixed(3)}</span></div>
        <div class="debug-muted">Doctrine fit levels: fit <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.doctrineFitLevel.toFixed(2)}</span>, early <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.earlySiegeBiasLevel.toFixed(2)}</span>, late <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.lateClosureDragLevel.toFixed(2)}</span>, reset <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.resetCadenceRiskLevel.toFixed(2)}</span>, overhang <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.antiStallOverhangLevel.toFixed(2)}</span>, urgency <span class="debug-strong">${liveInteraction.signalProvider.closureDoctrineFit.retuningUrgencyLevel.toFixed(2)}</span></div>
        <div class="debug-muted">Doctrine hint: drift <span class="debug-strong">${formatClosureDoctrineDriftCause(liveInteraction.signalProvider.closureDoctrineFit.hint.dominantDriftCause)}</span>, retune <span class="debug-strong">${formatClosureDoctrineRetuningDirection(liveInteraction.signalProvider.closureDoctrineFit.hint.likelyRetuningDirection)}</span>, confidence <span class="debug-strong">${formatClosureDoctrineConfidence(liveInteraction.signalProvider.closureDoctrineFit.hint.confidence)}</span></div>
        <div class="debug-muted">Retuning aggregate: domain <span class="debug-strong">${formatCalibrationRetuningDomain(liveInteraction.signalProvider.calibrationRetuning.dominantCalibrationDomain)}</span>, pressure <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.overallRetuningPressure.toFixed(2)}</span>, confidence blend <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.suggestionConfidenceBlend.toFixed(2)}</span>, count <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.recommendationCount}</span></div>
        <div class="debug-muted">Retuning early escalation: <span class="debug-strong">${formatCalibrationRetuningDirection(liveInteraction.signalProvider.calibrationRetuning.suggestions.earlyEscalation.direction)}</span></div>
        <div class="debug-muted">  strength <span class="debug-strong">${formatCalibrationRetuningStrength(liveInteraction.signalProvider.calibrationRetuning.suggestions.earlyEscalation.strength)}</span>, urgency <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.suggestions.earlyEscalation.urgency.toFixed(2)}</span>, confidence <span class="debug-strong">${formatClosureDoctrineConfidence(liveInteraction.signalProvider.calibrationRetuning.suggestions.earlyEscalation.confidence)}</span></div>
        <div class="debug-muted">Retuning closure timing: <span class="debug-strong">${formatCalibrationRetuningDirection(liveInteraction.signalProvider.calibrationRetuning.suggestions.closureTiming.direction)}</span></div>
        <div class="debug-muted">  strength <span class="debug-strong">${formatCalibrationRetuningStrength(liveInteraction.signalProvider.calibrationRetuning.suggestions.closureTiming.strength)}</span>, urgency <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.suggestions.closureTiming.urgency.toFixed(2)}</span>, confidence <span class="debug-strong">${formatClosureDoctrineConfidence(liveInteraction.signalProvider.calibrationRetuning.suggestions.closureTiming.confidence)}</span></div>
        <div class="debug-muted">Retuning reset cadence: <span class="debug-strong">${formatCalibrationRetuningDirection(liveInteraction.signalProvider.calibrationRetuning.suggestions.resetCadence.direction)}</span></div>
        <div class="debug-muted">  strength <span class="debug-strong">${formatCalibrationRetuningStrength(liveInteraction.signalProvider.calibrationRetuning.suggestions.resetCadence.strength)}</span>, urgency <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.suggestions.resetCadence.urgency.toFixed(2)}</span>, confidence <span class="debug-strong">${formatClosureDoctrineConfidence(liveInteraction.signalProvider.calibrationRetuning.suggestions.resetCadence.confidence)}</span></div>
        <div class="debug-muted">Retuning anti-stall dwell: <span class="debug-strong">${formatCalibrationRetuningDirection(liveInteraction.signalProvider.calibrationRetuning.suggestions.antiStallDwell.direction)}</span></div>
        <div class="debug-muted">  strength <span class="debug-strong">${formatCalibrationRetuningStrength(liveInteraction.signalProvider.calibrationRetuning.suggestions.antiStallDwell.strength)}</span>, urgency <span class="debug-strong">${liveInteraction.signalProvider.calibrationRetuning.suggestions.antiStallDwell.urgency.toFixed(2)}</span>, confidence <span class="debug-strong">${formatClosureDoctrineConfidence(liveInteraction.signalProvider.calibrationRetuning.suggestions.antiStallDwell.confidence)}</span></div>
        <div class="debug-muted">Digest summary: drift <span class="debug-strong">${formatClosureDoctrineFitVerdict(liveInteraction.signalProvider.calibrationDigest.dominantDriftOverRun)}</span>, domain <span class="debug-strong">${formatCalibrationRetuningDomain(liveInteraction.signalProvider.calibrationDigest.dominantCalibrationDomainConsensus)}</span>, priority <span class="debug-strong">${formatCalibrationDigestPriority(liveInteraction.signalProvider.calibrationDigest.overallTuningPriority)}</span>, window <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.windowDurationSeconds.toFixed(1)}s</span>, samples <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.sampleCount}</span></div>
        <div class="debug-muted">Digest behavior: timing <span class="debug-strong">${formatCalibrationDigestTimingSummary(liveInteraction.signalProvider.calibrationDigest.escalationTimingSummary)}</span>, reset <span class="debug-strong">${formatCalibrationDigestResetSummary(liveInteraction.signalProvider.calibrationDigest.resetQualitySummary)}</span>, stickiness <span class="debug-strong">${formatCalibrationDigestStickinessSummary(liveInteraction.signalProvider.calibrationDigest.closureStickinessSummary)}</span></div>
        <div class="debug-muted">Digest consensus: stability <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.recommendationStabilityScalar.toFixed(2)}</span>, confidence <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.confidenceBlend.toFixed(2)}</span>, drift <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.driftConsensusLevel.toFixed(2)}</span>, domain <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.domainConsensusLevel.toFixed(2)}</span>, avg pressure <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigest.averageRetuningPressure.toFixed(2)}</span></div>
        <div class="debug-muted">Pass compare: <span class="debug-strong">${formatCalibrationDigestComparisonVerdict(liveInteraction.signalProvider.calibrationDigestComparison.verdict)}</span> | baseline <span class="debug-strong">${liveInteraction.signalProvider.calibrationDigestComparison.baselineAvailable ? 'Set' : 'None'}</span> | base ${liveInteraction.signalProvider.calibrationDigestComparison.baselineWindowDurationSeconds.toFixed(1)}s -> curr ${liveInteraction.signalProvider.calibrationDigestComparison.currentWindowDurationSeconds.toFixed(1)}s | score <span class="debug-strong">${formatSignedDelta(liveInteraction.signalProvider.calibrationDigestComparison.comparisonScore)}</span></div>
        <div class="debug-muted">Pass compare categories: drift <span class="debug-strong">${formatClosureDoctrineFitVerdictOrNone(liveInteraction.signalProvider.calibrationDigestComparison.dominantDriftChange.baseline)} -> ${formatClosureDoctrineFitVerdict(liveInteraction.signalProvider.calibrationDigestComparison.dominantDriftChange.current)}</span>, domain <span class="debug-strong">${formatCalibrationRetuningDomainOrNone(liveInteraction.signalProvider.calibrationDigestComparison.dominantCalibrationDomainChange.baseline)} -> ${formatCalibrationRetuningDomain(liveInteraction.signalProvider.calibrationDigestComparison.dominantCalibrationDomainChange.current)}</span>, priority <span class="debug-strong">${formatCalibrationDigestPriorityOrNone(liveInteraction.signalProvider.calibrationDigestComparison.overallTuningPriorityChange.baseline)} -> ${formatCalibrationDigestPriority(liveInteraction.signalProvider.calibrationDigestComparison.overallTuningPriorityChange.current)}</span> (${formatSignedDelta(liveInteraction.signalProvider.calibrationDigestComparison.overallTuningPriorityChange.rankDelta, 0)})</div>
        <div class="debug-muted">Pass compare deltas: timing <span class="debug-strong">${formatCalibrationDigestTimingSummaryOrNone(liveInteraction.signalProvider.calibrationDigestComparison.escalationTimingSummaryChange.baseline)} -> ${formatCalibrationDigestTimingSummary(liveInteraction.signalProvider.calibrationDigestComparison.escalationTimingSummaryChange.current)}</span>, reset <span class="debug-strong">${formatCalibrationDigestResetSummaryOrNone(liveInteraction.signalProvider.calibrationDigestComparison.resetQualitySummaryChange.baseline)} -> ${formatCalibrationDigestResetSummary(liveInteraction.signalProvider.calibrationDigestComparison.resetQualitySummaryChange.current)}</span>, stickiness <span class="debug-strong">${formatCalibrationDigestStickinessSummaryOrNone(liveInteraction.signalProvider.calibrationDigestComparison.closureStickinessSummaryChange.baseline)} -> ${formatCalibrationDigestStickinessSummary(liveInteraction.signalProvider.calibrationDigestComparison.closureStickinessSummaryChange.current)}</span>, stability <span class="debug-strong">${formatSignedDelta(liveInteraction.signalProvider.calibrationDigestComparison.recommendationStabilityDelta)}</span>, confidence <span class="debug-strong">${formatSignedDelta(liveInteraction.signalProvider.calibrationDigestComparison.confidenceBlendDelta)}</span>, pressure <span class="debug-strong">${formatSignedDelta(liveInteraction.signalProvider.calibrationDigestComparison.averageRetuningPressureDelta)}</span></div>
        <div class="debug-muted">Compare explain: <span class="debug-strong">${liveInteraction.signalProvider.calibrationEvidence.primaryExplanation}</span>${liveInteraction.signalProvider.calibrationEvidence.secondaryExplanation ? ` | ${liveInteraction.signalProvider.calibrationEvidence.secondaryExplanation}` : ''}</div>
        <div class="debug-muted">Evidence: pressure <span class="debug-strong">${liveInteraction.signalProvider.calibrationEvidence.evidencePressureScore.toFixed(2)}</span>, confidence <span class="debug-strong">${liveInteraction.signalProvider.calibrationEvidence.explanationConfidence.toFixed(2)}</span>, signal <span class="debug-strong">${liveInteraction.signalProvider.calibrationEvidence.evidenceSignalSufficient ? 'Sufficient' : 'Weak'}</span></div>
        <div class="debug-muted">Top drivers: <span class="debug-strong">${formatCalibrationEvidenceDrivers(liveInteraction.signalProvider.calibrationEvidence.topEvidenceDrivers)}</span></div>
        <div class="debug-muted">Pass readiness: <span class="debug-strong">${formatCalibrationPassReadinessVerdict(liveInteraction.signalProvider.calibrationPassAction.readinessVerdict)}</span> | action <span class="debug-strong">${formatCalibrationPassRecommendedAction(liveInteraction.signalProvider.calibrationPassAction.recommendedAction)}</span> | domain <span class="debug-strong">${formatCalibrationRetuningDomain(liveInteraction.signalProvider.calibrationPassAction.recommendedDomain)}</span> | promote <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassAction.baselinePromotionAllowed ? 'Allowed' : 'Blocked'}</span></div>
        <div class="debug-muted">Action reasons: <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassAction.primaryActionReason}</span>${liveInteraction.signalProvider.calibrationPassAction.secondaryActionReason ? ` | ${liveInteraction.signalProvider.calibrationPassAction.secondaryActionReason}` : ''}</div>
        <div class="debug-muted">Action confidence: <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassAction.actionConfidence.toFixed(2)}</span>, signal <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassAction.actionSignalSufficient ? 'Sufficient' : 'Weak'}</span>, blocking <span class="debug-strong">${formatCalibrationBlockingFactors(liveInteraction.signalProvider.calibrationPassAction.blockingFactors)}</span></div>
        <div class="debug-muted">Frozen review: <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.hasFrozenReview ? 'Stored' : 'Empty'}</span> | trigger <span class="debug-strong">${formatCalibrationPassReviewTriggerSource(liveInteraction.signalProvider.calibrationPassReview.sourceActionTrigger)}</span> | frozen ${formatOptionalTime(liveInteraction.signalProvider.calibrationPassReview.frozenAtRuntimeSeconds)}</div>
        <div class="debug-muted">Frozen outcome: verdict <span class="debug-strong">${formatCalibrationPassReadinessVerdictOrNone(liveInteraction.signalProvider.calibrationPassReview.finalReadinessVerdict)}</span>, action <span class="debug-strong">${formatCalibrationPassRecommendedActionOrNone(liveInteraction.signalProvider.calibrationPassReview.finalRecommendedAction)}</span>, domain <span class="debug-strong">${formatCalibrationRetuningDomain(liveInteraction.signalProvider.calibrationPassReview.finalRecommendedDomain)}</span>, compare <span class="debug-strong">${formatCalibrationDigestComparisonVerdictOrNone(liveInteraction.signalProvider.calibrationPassReview.finalComparisonVerdict)}</span>, promote <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalBaselinePromotionAllowed ? 'Allowed' : 'Blocked'}</span></div>
        <div class="debug-muted">Frozen reason: <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalPrimaryReason || 'None'}</span>${liveInteraction.signalProvider.calibrationPassReview.finalSecondaryReason ? ` | ${liveInteraction.signalProvider.calibrationPassReview.finalSecondaryReason}` : liveInteraction.signalProvider.calibrationPassReview.finalPrimaryExplanation ? ` | ${liveInteraction.signalProvider.calibrationPassReview.finalPrimaryExplanation}` : ''}</div>
        <div class="debug-muted">Frozen quality: signal <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalSignalSufficient ? 'Sufficient' : 'Weak'}</span>, confidence <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalActionConfidence.toFixed(2)}</span>, evidence <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalEvidencePressureScore.toFixed(2)}</span>, doctrine <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalDoctrineFitLevel.toFixed(2)}</span>, pressure <span class="debug-strong">${liveInteraction.signalProvider.calibrationPassReview.finalRetuningPressure.toFixed(2)}</span>, blocking <span class="debug-strong">${formatCalibrationBlockingFactors(liveInteraction.signalProvider.calibrationPassReview.finalBlockingFactors)}</span></div>
        ${liveInteraction.scenarios.map((scenario) =>
          `<div class="debug-muted">${scenario.label}: <span class="debug-strong">${formatValidationBand(scenario.status)}</span> | ${formatLiveResolution(scenario.resolution)} | progress ${formatPercent(scenario.completionRatio)} | window ${scenario.remainingWindowSeconds.toFixed(2)}s | lane ${formatPressureSegment(scenario.lanePressureSegment)} | structure ${formatStructureTier(scenario.structureTier)} | defender ${formatDefenderState(scenario.defenderState)} | sig w${scenario.prototypeSignals.waveProgressionScalar.toFixed(2)} t${scenario.prototypeSignals.towerHoldScalar.toFixed(2)} d${scenario.prototypeSignals.defenderReclearScalar.toFixed(2)}</div>`
        ).join('')}
      `
      : '<div class="debug-muted">Live interaction validator unavailable.</div>';
    const tempo = state?.tempo;
    const tempoMarkup = tempo
      ? `
        <div class="debug-muted">Active preset: <span class="debug-strong">${formatPresetId(tempo.activePresetId)}</span></div>
        <div class="debug-muted">Active overall: <span class="debug-strong">${formatValidationBand(tempo.overall)}</span></div>
        <div class="debug-muted">Robustness: <span class="debug-strong">${tempo.robustnessVerdict}</span></div>
        <div class="debug-muted">Pass/Near/Fail: <span class="debug-strong">${tempo.summary.pass}/${tempo.summary.nearMiss}/${tempo.summary.fail}</span></div>
        <div class="debug-muted">Coefficients: atk ${tempo.coefficients.attackerPushPressureCoeff.toFixed(2)}, def ${tempo.coefficients.defenderReclearCoeff.toFixed(2)}, hold ${tempo.coefficients.waveHoldDurationSeconds.toFixed(1)}s</div>
        <div class="debug-muted">Decay window ${tempo.coefficients.lanePressureDecayWindowSeconds.toFixed(1)}s, punish window ${tempo.coefficients.offLanePunishWindowSeconds.toFixed(1)}s</div>
        <div class="debug-muted">Preset outcomes:</div>
        ${tempo.presets.map((preset) =>
          `<div class="debug-muted">${preset.label}: <span class="debug-strong">${formatValidationBand(preset.overall)}</span> (${preset.summary.pass}/${preset.summary.nearMiss}/${preset.summary.fail})</div>`
        ).join('')}
        <div class="debug-muted">Metric sensitivity (CD/N/DF):</div>
        ${tempo.metricSensitivity.map((metric) =>
          `<div class="debug-muted">${metric.label}: <span class="debug-strong">${metric.statuses.map((status) => formatValidationBandCode(status.status)).join('/')}</span> (${formatSensitivity(metric.sensitivity)})</div>`
        ).join('')}
        <div class="debug-muted">Tiny sweep thresholds (N/DF):</div>
        ${tempo.sweep.entries.map((entry) =>
          `<div class="debug-muted">${entry.presetLabel} | ${entry.coefficientLabel}: OI ${entry.outerInner.statusTrace} fail<=${formatOptionalNumber(entry.outerInner.failThreshold)} margin=${formatOptionalSigned(entry.outerInner.marginFromCurrentDefault)} | TW ${entry.twoWaveClosure.statusTrace} fail<=${formatOptionalNumber(entry.twoWaveClosure.failThreshold)} margin=${formatOptionalSigned(entry.twoWaveClosure.marginFromCurrentDefault)}</div>`
        ).join('')}
      `
      : '<div class="debug-muted">Tempo harness unavailable.</div>';

    panelContent.innerHTML = `
      <h1>Graybox Validation</h1>
      <section>
        <div class="debug-muted">Camera: <span class="debug-strong">${state?.cameraLabel ?? 'Tactical'}</span></div>
        <div class="debug-muted">Tactical mode: <span class="debug-strong">${state?.tacticalModeLabel ?? 'Angled'}</span></div>
        <div class="debug-muted">Labels: <span class="debug-strong">${labelsVisible ? 'On' : 'Off'}</span> | Routes: <span class="debug-strong">${routesVisible ? 'On' : 'Off'}</span></div>
        <div class="debug-muted">Player: <span class="debug-strong">${state ? `${state.playerPosition.x.toFixed(1)}, ${state.playerPosition.z.toFixed(1)}` : '0, 0'}</span></div>
      </section>
      <section>
        <div class="debug-muted">Selected route</div>
        <div class="debug-strong">${selectedRoute?.label ?? 'None'}</div>
        <div class="debug-muted">${selectedRouteSummary}</div>
        ${liveProbe}
        ${resultMarkup}
      </section>
      <section>
        <div class="debug-muted">Headless Combat Slice</div>
        ${headlessCombatMarkup}
      </section>
      <section>
        <div class="debug-muted">Wave Pressure Sim</div>
        ${wavePressureMarkup}
      </section>
      <section>
        <div class="debug-muted">Live Interaction Slice</div>
        ${liveInteractionMarkup}
      </section>
      <section>
        <div class="debug-muted">Tempo Harness</div>
        ${tempoMarkup}
      </section>
      <section>
        <div class="debug-muted">Legend</div>
        <div>${categoryLegend}</div>
      </section>
      <section>
        <div class="debug-muted">Controls</div>
        <ul>${controls.map((control) => `<li>${control}</li>`).join('')}</ul>
      </section>
    `;
  };

  const toggleLabels = (): void => {
    labelsVisible = !labelsVisible;
    renderPanel();
  };

  const toggleRoutes = (): void => {
    routesVisible = !routesVisible;
    registry.routeEntities.forEach((entity) => {
      entity.enabled = routesVisible;
    });
    renderPanel();
  };

  renderPanel();

  return {
    update(state) {
      renderPanel(state);

      for (const label of labelBindings) {
        if (!labelsVisible || !label.anchor) {
          label.element.style.display = 'none';
          continue;
        }

        const cameraComponent = state.camera.camera;
        if (!cameraComponent) {
          label.element.style.display = 'none';
          continue;
        }
        const worldPosition = label.anchor.getPosition();
        const projected = cameraComponent.worldToScreen(worldPosition, new pc.Vec3());
        if (
          projected.z < 0 ||
          projected.x < -64 ||
          projected.y < -64 ||
          projected.x > window.innerWidth + 64 ||
          projected.y > window.innerHeight + 64
        ) {
          label.element.style.display = 'none';
          continue;
        }

        label.element.style.display = 'block';
        label.element.style.left = `${projected.x}px`;
        label.element.style.top = `${projected.y}px`;
      }
    },
    toggleLabels,
    toggleRoutes,
    setSelectedRoute(routeId) {
      selectedRouteId = routeId;
      renderPanel();
    },
    setRouteResult(result) {
      probeResult = result;
      renderPanel();
    },
    destroy() {
      panel.removeEventListener('click', onPanelClick);
      panel.remove();
      labelsHost.remove();
    }
  };
};

const buildLegend = (entries: Array<[ZoneCategory, string]>): string =>
  entries
    .map(([category, label]) => {
      const dotColor = colorFromHex(layoutConfig.colors[category]);
      const rgb = `rgb(${Math.round(dotColor.r * 255)}, ${Math.round(dotColor.g * 255)}, ${Math.round(dotColor.b * 255)})`;
      return `<span class="debug-chip"><span class="debug-dot" style="background:${rgb}"></span>${label}</span>`;
    })
    .join('');

const formatRouteSummary = (route: RouteDef): string => {
  const distance = route.waypoints.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    const previous = route.waypoints[index - 1];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  const seconds = distance / layoutConfig.player.moveSpeed;
  const target = route.target
    ? `target ${route.target.minSeconds.toFixed(1)}-${route.target.maxSeconds.toFixed(1)}s`
    : 'no fixed target';
  return `${route.routeClass} | est ${seconds.toFixed(2)}s | ${target}`;
};

const formatValidationBand = (band: ValidationBand): string =>
  band === 'near miss'
    ? 'Near Miss'
    : band === 'pass'
      ? 'Pass'
      : 'Fail';

const formatValidationBandCode = (band: ValidationBand): string =>
  band === 'near miss'
    ? 'N'
    : band === 'pass'
      ? 'P'
      : 'F';

const formatSensitivity = (sensitivity: 'stable' | 'moderate' | 'high'): string =>
  sensitivity === 'stable'
    ? 'Stable'
    : sensitivity === 'moderate'
      ? 'Moderate'
      : 'High';

const formatPresetId = (id: 'current-default' | 'neutral' | 'defender-favored'): string =>
  id === 'current-default'
    ? 'Current Default'
    : id === 'defender-favored'
      ? 'Defender Favored'
      : 'Neutral';

const formatOptionalNumber = (value?: number): string =>
  typeof value === 'number'
    ? value.toFixed(3)
    : 'n/a';

const formatOptionalSigned = (value?: number): string =>
  typeof value === 'number'
    ? `${value >= 0 ? '+' : ''}${value.toFixed(3)}`
    : 'n/a';

const formatLiveResolution = (
  resolution: 'attacker-window' | 'defender-hold' | 'stalled'
): string =>
  resolution === 'attacker-window'
    ? 'Attacker Window'
    : resolution === 'defender-hold'
      ? 'Defender Hold'
      : 'Stalled';

const formatPercent = (value: number): string =>
  `${(value * 100).toFixed(0)}%`;

const formatPressureSegment = (
  segment: 'outer-front' | 'inner-siege' | 'core-approach'
): string =>
  segment === 'outer-front'
    ? 'Outer'
    : segment === 'inner-siege'
      ? 'Inner'
      : 'Core';

const formatStructureTier = (tier: 'outer' | 'inner' | 'core'): string =>
  tier === 'outer'
    ? 'Outer'
    : tier === 'inner'
      ? 'Inner'
      : 'Core';

const formatDefenderState = (state: 'delay' | 'hold' | 'reclear'): string =>
  state === 'delay'
    ? 'Delay'
    : state === 'hold'
      ? 'Hold'
      : 'Re-clear';

const formatContactState = (contact: {
  active: boolean;
  windowSeconds: number;
  pressure: number;
}): string =>
  `${contact.active ? 'on' : 'off'}:${contact.pressure.toFixed(2)}@${contact.windowSeconds.toFixed(1)}s`;

const formatTierEventActive = (event: {
  active: {
    ageSeconds: number;
    peakPressure: number;
    currentPressure: number;
    qualifiedSiegeAttempt: boolean;
    boundedClosureState: 'none' | 'forming' | 'bounded' | 'overextended';
  } | null;
}): string => {
  if (!event.active) {
    return 'none';
  }
  return `${event.active.qualifiedSiegeAttempt ? 'Q' : 'q'} ${event.active.currentPressure.toFixed(2)}->${event.active.peakPressure.toFixed(2)} ${event.active.ageSeconds.toFixed(1)}s ${formatBoundedClosureState(event.active.boundedClosureState)}`;
};

const formatTierEventLast = (event: {
  lastCompleted: {
    result: 'stall' | 'repel' | 'partial-convert' | 'attacker-window';
    calibrationMeaning: 'none' | 'stalled-pressure-window' | 'defended-reset' | 'partial-structural-progress' | 'meaningful-attacker-window';
    durationSeconds: number;
    qualifiedSiegeAttempt: boolean;
    boundedClosureState: 'none' | 'forming' | 'bounded' | 'overextended';
  } | null;
}): string => {
  if (!event.lastCompleted) {
    return 'none';
  }
  return `${formatEventResult(event.lastCompleted.result)} ${event.lastCompleted.durationSeconds.toFixed(1)}s ${event.lastCompleted.qualifiedSiegeAttempt ? 'Q' : 'q'} ${formatCalibrationMeaning(event.lastCompleted.calibrationMeaning)} ${formatBoundedClosureState(event.lastCompleted.boundedClosureState)}`;
};

const formatTierCalibration = (event: {
  calibration: {
    meaning: 'none' | 'stalled-pressure-window' | 'defended-reset' | 'partial-structural-progress' | 'meaningful-attacker-window';
    boundedClosureState: 'none' | 'forming' | 'bounded' | 'overextended';
    progressionScalar: number;
    towerHoldScalar: number;
    defenderReclearScalar: number;
  };
}): string =>
  `${formatCalibrationMeaning(event.calibration.meaning)} ${formatBoundedClosureState(event.calibration.boundedClosureState)} p${event.calibration.progressionScalar.toFixed(3)} t${event.calibration.towerHoldScalar.toFixed(3)} r${event.calibration.defenderReclearScalar.toFixed(3)}`;

const formatEventResult = (
  result: 'stall' | 'repel' | 'partial-convert' | 'attacker-window'
): string =>
  result === 'attacker-window'
    ? 'AtkWin'
    : result === 'partial-convert'
      ? 'Partial'
      : result === 'stall'
        ? 'Stall'
        : 'Repel';

const formatCalibrationMeaning = (
  meaning: 'none' | 'stalled-pressure-window' | 'defended-reset' | 'partial-structural-progress' | 'meaningful-attacker-window'
): string =>
  meaning === 'meaningful-attacker-window'
    ? 'AtkWindow'
    : meaning === 'partial-structural-progress'
      ? 'PartialProg'
      : meaning === 'stalled-pressure-window'
        ? 'Stalled'
        : meaning === 'defended-reset'
          ? 'DefReset'
          : 'Neutral';

const formatBoundedClosureState = (
  state: 'none' | 'forming' | 'bounded' | 'overextended'
): string =>
  state === 'bounded'
    ? 'Bounded'
    : state === 'forming'
      ? 'Forming'
      : state === 'overextended'
        ? 'Over'
        : 'None';

const formatTierResolutionStage = (state: {
  threatStage: 'stable' | 'threatened' | 'pressured' | 'softened' | 'temporarily-relieved' | 'escalating';
}): string =>
  formatThreatStage(state.threatStage);

const formatTierResolutionMemory = (state: {
  recentOutcomeMemory: 'none' | 'stall' | 'repel' | 'partial-convert' | 'attacker-window';
  recentOutcomeWeight: number;
  accumulatedPartialProgress: number;
  defendedReliefStrength: number;
  repeatedPressureEscalation: number;
}): string =>
  `${formatResolutionOutcome(state.recentOutcomeMemory)}@${state.recentOutcomeWeight.toFixed(2)} p${state.accumulatedPartialProgress.toFixed(2)} r${state.defendedReliefStrength.toFixed(2)} e${state.repeatedPressureEscalation.toFixed(2)}`;

const formatTierMeaningfulAge = (state: {
  timeSinceLastMeaningfulSiegeSeconds: number;
  lastMeaningfulSiegeResult: 'none' | 'stall' | 'repel' | 'partial-convert' | 'attacker-window';
  meaningfulAttemptCount: number;
}): string =>
  `${state.timeSinceLastMeaningfulSiegeSeconds.toFixed(1)}s ${formatResolutionOutcome(state.lastMeaningfulSiegeResult)} #${state.meaningfulAttemptCount}`;

const formatThreatStage = (
  stage: 'stable' | 'threatened' | 'pressured' | 'softened' | 'temporarily-relieved' | 'escalating'
): string =>
  stage === 'temporarily-relieved'
    ? 'Relieved'
    : stage === 'threatened'
      ? 'Threatened'
      : stage === 'pressured'
        ? 'Pressured'
        : stage === 'softened'
          ? 'Softened'
          : stage === 'escalating'
            ? 'Escalating'
            : 'Stable';

const formatResolutionOutcome = (
  result: 'none' | 'stall' | 'repel' | 'partial-convert' | 'attacker-window'
): string =>
  result === 'attacker-window'
    ? 'AtkWin'
    : result === 'partial-convert'
      ? 'Partial'
      : result === 'stall'
        ? 'Stall'
      : result === 'repel'
          ? 'Repel'
          : 'None';

const formatLaneClosurePosture = (
  posture:
    | 'stable'
    | 'rising-pressure'
    | 'pressured-lane'
    | 'softened-shell'
    | 'accelerated-closure'
    | 'defender-recovery'
): string =>
  posture === 'rising-pressure'
    ? 'Rising Pressure'
    : posture === 'pressured-lane'
      ? 'Pressured Lane'
      : posture === 'softened-shell'
        ? 'Softened Shell'
        : posture === 'accelerated-closure'
          ? 'Accelerated Closure'
        : posture === 'defender-recovery'
            ? 'Defender Recovery'
            : 'Stable';

const formatClosurePacingState = (
  state:
    | 'normal-pressure'
    | 'rising-anti-stall'
    | 'closure-readiness'
    | 'accelerated-closure-window'
    | 'defender-reset-window'
): string =>
  state === 'rising-anti-stall'
    ? 'Rising Anti-Stall'
    : state === 'closure-readiness'
      ? 'Closure Readiness'
      : state === 'accelerated-closure-window'
        ? 'Accelerated Closure Window'
        : state === 'defender-reset-window'
          ? 'Defender Reset Window'
          : 'Normal Pressure';

const formatClosurePacingHealthState = (
  state:
    | 'healthy-progression'
    | 'early-escalation'
    | 'late-escalation'
    | 'sticky-anti-stall'
    | 'sticky-closure-window'
    | 'premature-reset'
    | 'prolonged-readiness'
): string =>
  state === 'healthy-progression'
    ? 'Healthy Progression'
    : state === 'early-escalation'
      ? 'Early Escalation'
      : state === 'late-escalation'
        ? 'Late Escalation'
        : state === 'sticky-anti-stall'
          ? 'Sticky Anti-Stall'
          : state === 'sticky-closure-window'
            ? 'Sticky Closure Window'
            : state === 'premature-reset'
              ? 'Premature Reset'
              : 'Prolonged Readiness';

const formatClosureDoctrineFitVerdict = (
  verdict:
    | 'doctrine-fit'
    | 'early-siege-bias'
    | 'late-closure-drag'
    | 'unstable-reset-cadence'
    | 'anti-stall-overhang'
): string =>
  verdict === 'doctrine-fit'
    ? 'Doctrine Fit'
    : verdict === 'early-siege-bias'
      ? 'Early Siege Bias'
      : verdict === 'late-closure-drag'
        ? 'Late Closure Drag'
        : verdict === 'unstable-reset-cadence'
          ? 'Unstable Reset Cadence'
          : 'Anti-Stall Overhang';

const formatClosureDoctrineDriftCause = (
  cause:
    | 'none'
    | 'early-siege-bias'
    | 'late-closure-drag'
    | 'unstable-reset-cadence'
    | 'anti-stall-overhang'
): string =>
  cause === 'none'
    ? 'None'
    : formatClosureDoctrineFitVerdict(cause);

const formatClosureDoctrineRetuningDirection = (
  direction:
    | 'hold-course'
    | 'tone-down-early-escalation'
    | 'pull-closure-forward'
    | 'stabilize-reset-cadence'
    | 'shorten-anti-stall-dwell'
): string =>
  direction === 'hold-course'
    ? 'Hold Course'
    : direction === 'tone-down-early-escalation'
      ? 'Tone Down Early Escalation'
      : direction === 'pull-closure-forward'
        ? 'Pull Closure Forward'
        : direction === 'stabilize-reset-cadence'
          ? 'Stabilize Reset Cadence'
          : 'Shorten Anti-Stall Dwell';

const formatClosureDoctrineConfidence = (
  confidence: 'low' | 'medium' | 'high'
): string =>
  confidence === 'high'
    ? 'High'
    : confidence === 'medium'
      ? 'Medium'
      : 'Low';

const formatCalibrationRetuningDomain = (
  domain:
    | 'none'
    | 'early-escalation'
    | 'closure-timing'
    | 'reset-cadence'
    | 'anti-stall-dwell'
): string =>
  domain === 'none'
    ? 'None'
    : domain === 'early-escalation'
      ? 'Early Escalation'
      : domain === 'closure-timing'
        ? 'Closure Timing'
        : domain === 'reset-cadence'
          ? 'Reset Cadence'
          : 'Anti-Stall Dwell';

const formatCalibrationRetuningDirection = (
  direction:
    | 'hold'
    | 'increase'
    | 'decrease'
    | 'shorten'
    | 'lengthen'
    | 'stabilize'
): string =>
  direction === 'hold'
    ? 'Hold'
    : direction === 'increase'
      ? 'Increase'
      : direction === 'decrease'
        ? 'Decrease'
        : direction === 'shorten'
          ? 'Shorten'
          : direction === 'lengthen'
            ? 'Lengthen'
            : 'Stabilize';

const formatCalibrationRetuningStrength = (
  strength: 'none' | 'low' | 'medium' | 'high'
): string =>
  strength === 'none'
    ? 'None'
    : strength === 'high'
      ? 'High'
      : strength === 'medium'
        ? 'Medium'
        : 'Low';

const formatCalibrationDigestTimingSummary = (
  summary: 'limited-signal' | 'healthy' | 'early-drift' | 'late-drift' | 'mixed'
): string =>
  summary === 'limited-signal'
    ? 'Limited Signal'
    : summary === 'healthy'
      ? 'Healthy'
      : summary === 'early-drift'
        ? 'Early Drift'
        : summary === 'late-drift'
          ? 'Late Drift'
          : 'Mixed';

const formatCalibrationDigestResetSummary = (
  summary: 'limited-signal' | 'healthy' | 'unstable' | 'mixed'
): string =>
  summary === 'limited-signal'
    ? 'Limited Signal'
    : summary === 'healthy'
      ? 'Healthy'
      : summary === 'unstable'
        ? 'Unstable'
        : 'Mixed';

const formatCalibrationDigestStickinessSummary = (
  summary: 'limited-signal' | 'healthy' | 'watch' | 'problematic'
): string =>
  summary === 'limited-signal'
    ? 'Limited Signal'
    : summary === 'healthy'
      ? 'Healthy'
      : summary === 'watch'
        ? 'Watch'
        : 'Problematic';

const formatCalibrationDigestPriority = (
  priority: 'low' | 'medium' | 'high' | 'urgent'
): string =>
  priority === 'urgent'
    ? 'Urgent'
    : priority === 'high'
      ? 'High'
      : priority === 'medium'
        ? 'Medium'
        : 'Low';

const formatCalibrationDigestComparisonVerdict = (
  verdict: 'improved' | 'mixed' | 'unchanged' | 'regressed' | 'insufficient-signal'
): string =>
  verdict === 'improved'
    ? 'Improved'
    : verdict === 'mixed'
      ? 'Mixed'
      : verdict === 'unchanged'
        ? 'Unchanged'
        : verdict === 'regressed'
          ? 'Regressed'
          : 'Insufficient Signal';

const formatClosureDoctrineFitVerdictOrNone = (
  verdict: 'doctrine-fit' | 'early-siege-bias' | 'late-closure-drag' | 'unstable-reset-cadence' | 'anti-stall-overhang' | 'none'
): string =>
  verdict === 'none'
    ? 'None'
    : formatClosureDoctrineFitVerdict(verdict);

const formatCalibrationRetuningDomainOrNone = (
  domain: 'none' | 'early-escalation' | 'closure-timing' | 'reset-cadence' | 'anti-stall-dwell'
): string =>
  formatCalibrationRetuningDomain(domain);

const formatCalibrationDigestPriorityOrNone = (
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'none'
): string =>
  priority === 'none'
    ? 'None'
    : formatCalibrationDigestPriority(priority);

const formatCalibrationDigestTimingSummaryOrNone = (
  summary: 'limited-signal' | 'healthy' | 'early-drift' | 'late-drift' | 'mixed' | 'none'
): string =>
  summary === 'none'
    ? 'None'
    : formatCalibrationDigestTimingSummary(summary);

const formatCalibrationDigestResetSummaryOrNone = (
  summary: 'limited-signal' | 'healthy' | 'unstable' | 'mixed' | 'none'
): string =>
  summary === 'none'
    ? 'None'
    : formatCalibrationDigestResetSummary(summary);

const formatCalibrationDigestStickinessSummaryOrNone = (
  summary: 'limited-signal' | 'healthy' | 'watch' | 'problematic' | 'none'
): string =>
  summary === 'none'
    ? 'None'
    : formatCalibrationDigestStickinessSummary(summary);

const formatSignedDelta = (value: number, digits = 2): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

const formatCalibrationEvidenceDrivers = (
  drivers: Array<{
    direction: 'positive' | 'negative' | 'neutral';
    shortLabel: string;
    shortReason: string;
    weight: number;
  }>
): string =>
  drivers.length > 0
    ? drivers
        .map(
          (driver) =>
            `${formatCalibrationEvidenceDirection(driver.direction)} ${driver.shortLabel} (${driver.shortReason.replace(/\.$/, '')}; ${driver.weight.toFixed(2)})`
        )
        .join(' | ')
    : 'No strong drivers yet';

const formatCalibrationEvidenceDirection = (
  direction: 'positive' | 'negative' | 'neutral'
): string =>
  direction === 'positive'
    ? '+'
    : direction === 'negative'
      ? '-'
      : '~';

const formatCalibrationPassReadinessVerdict = (
  verdict:
    | 'ready-to-promote'
    | 'promising-but-observe'
    | 'targeted-retune-needed'
    | 'regressed-do-not-promote'
    | 'insufficient-signal'
): string =>
  verdict === 'ready-to-promote'
    ? 'Ready To Promote'
    : verdict === 'promising-but-observe'
      ? 'Promising But Observe'
      : verdict === 'targeted-retune-needed'
        ? 'Targeted Retune Needed'
        : verdict === 'regressed-do-not-promote'
          ? 'Regressed Do Not Promote'
          : 'Insufficient Signal';

const formatCalibrationPassRecommendedAction = (
  action:
    | 'promote-current-as-baseline'
    | 'keep-current-baseline'
    | 'observe-longer'
    | 'retune-early-escalation'
    | 'retune-closure-timing'
    | 'retune-reset-cadence'
    | 'retune-anti-stall-dwell'
    | 'recapture-baseline'
    | 'rerun-for-signal'
): string =>
  action === 'promote-current-as-baseline'
    ? 'Promote Current As Baseline'
    : action === 'keep-current-baseline'
      ? 'Keep Current Baseline'
      : action === 'observe-longer'
        ? 'Observe Longer'
        : action === 'retune-early-escalation'
          ? 'Retune Early Escalation'
          : action === 'retune-closure-timing'
            ? 'Retune Closure Timing'
            : action === 'retune-reset-cadence'
              ? 'Retune Reset Cadence'
              : action === 'retune-anti-stall-dwell'
                ? 'Retune Anti-Stall Dwell'
                : action === 'recapture-baseline'
                  ? 'Recapture Baseline'
                  : 'Rerun For Signal';

const formatCalibrationPassReadinessVerdictOrNone = (
  verdict:
    | 'ready-to-promote'
    | 'promising-but-observe'
    | 'targeted-retune-needed'
    | 'regressed-do-not-promote'
    | 'insufficient-signal'
    | 'none'
): string =>
  verdict === 'none'
    ? 'None'
    : formatCalibrationPassReadinessVerdict(verdict);

const formatCalibrationPassRecommendedActionOrNone = (
  action:
    | 'promote-current-as-baseline'
    | 'keep-current-baseline'
    | 'observe-longer'
    | 'retune-early-escalation'
    | 'retune-closure-timing'
    | 'retune-reset-cadence'
    | 'retune-anti-stall-dwell'
    | 'recapture-baseline'
    | 'rerun-for-signal'
    | 'none'
): string =>
  action === 'none'
    ? 'None'
    : formatCalibrationPassRecommendedAction(action);

const formatCalibrationPassReviewTriggerSource = (
  source:
    | 'operator-handoff'
    | 'reset-calibration-digest'
    | 'capture-current-calibration-baseline'
    | 'clear-calibration-baseline'
    | 'none'
): string =>
  source === 'none'
    ? 'None'
    : source === 'operator-handoff'
      ? 'Operator Handoff'
      : source === 'reset-calibration-digest'
        ? 'Reset Calibration Digest'
        : source === 'capture-current-calibration-baseline'
          ? 'Capture Current Calibration Baseline'
          : 'Clear Calibration Baseline';

const formatCalibrationDigestComparisonVerdictOrNone = (
  verdict: 'improved' | 'mixed' | 'unchanged' | 'regressed' | 'insufficient-signal' | 'none'
): string =>
  verdict === 'none'
    ? 'None'
    : formatCalibrationDigestComparisonVerdict(verdict);

const formatCalibrationOperatorFeedbackSeverity = (
  severity: 'neutral' | 'info' | 'success' | 'warning'
): string =>
  severity === 'success'
    ? 'Success'
    : severity === 'warning'
      ? 'Warning'
      : severity === 'info'
        ? 'Info'
        : 'Idle';

const formatOperatorActionAge = (
  elapsedSeconds: number,
  lastActionRuntimeSeconds: number | null
): string =>
  typeof lastActionRuntimeSeconds === 'number'
    ? `${Math.max(0, elapsedSeconds - lastActionRuntimeSeconds).toFixed(1)}s`
    : 'n/a';

const formatCalibrationOperatorWorkflowPhase = (
  phase:
    | 'collecting-signal'
    | 'ready-for-review'
    | 'review-frozen-awaiting-decision'
    | 'baseline-candidate'
    | 'observe-before-promotion'
    | 'targeted-retune-pending'
    | 'rerun-for-signal'
    | 'post-action-reset-state'
): string =>
  phase === 'collecting-signal'
    ? 'Collecting Signal'
    : phase === 'ready-for-review'
      ? 'Ready For Review'
      : phase === 'review-frozen-awaiting-decision'
        ? 'Review Frozen Awaiting Decision'
        : phase === 'baseline-candidate'
          ? 'Baseline Candidate'
          : phase === 'observe-before-promotion'
            ? 'Observe Before Promotion'
            : phase === 'targeted-retune-pending'
              ? 'Targeted Retune Pending'
              : phase === 'rerun-for-signal'
                ? 'Rerun For Signal'
                : 'Post-Action Reset State';

const formatCalibrationOperatorWorkflowNextStep = (
  step:
    | 'keep-running'
    | 'freeze-current-review'
    | 'capture-current-as-baseline'
    | 'keep-existing-baseline'
    | 'observe-longer'
    | 'run-targeted-retune'
    | 'clear-and-rerun'
    | 'clear-frozen-review'
): string =>
  step === 'keep-running'
    ? 'Keep Running'
    : step === 'freeze-current-review'
      ? 'Freeze Current Review'
      : step === 'capture-current-as-baseline'
        ? 'Capture Current As Baseline'
        : step === 'keep-existing-baseline'
          ? 'Keep Existing Baseline'
          : step === 'observe-longer'
            ? 'Observe Longer'
            : step === 'run-targeted-retune'
              ? 'Run Targeted Retune'
              : step === 'clear-and-rerun'
                ? 'Clear And Rerun'
                : 'Clear Frozen Review';

const formatCalibrationOperatorLoopClosureState = (
  state:
    | 'open-awaiting-review-freeze'
    | 'open-awaiting-baseline-decision'
    | 'open-awaiting-observation'
    | 'open-awaiting-targeted-retune'
    | 'open-awaiting-rerun'
    | 'resolved-promoted-baseline'
    | 'resolved-kept-baseline'
    | 'resolved-observe-longer'
    | 'resolved-targeted-retune'
    | 'resolved-rerun-for-signal'
    | 'resolved-cleared-review'
): string =>
  state === 'open-awaiting-review-freeze'
    ? 'Open Awaiting Review Freeze'
    : state === 'open-awaiting-baseline-decision'
      ? 'Open Awaiting Baseline Decision'
      : state === 'open-awaiting-observation'
        ? 'Open Awaiting Observation'
        : state === 'open-awaiting-targeted-retune'
          ? 'Open Awaiting Targeted Retune'
          : state === 'open-awaiting-rerun'
            ? 'Open Awaiting Rerun'
            : state === 'resolved-promoted-baseline'
              ? 'Resolved Promoted Baseline'
              : state === 'resolved-kept-baseline'
                ? 'Resolved Kept Baseline'
                : state === 'resolved-observe-longer'
                  ? 'Resolved Observe Longer'
                  : state === 'resolved-targeted-retune'
                    ? 'Resolved Targeted Retune'
                    : state === 'resolved-rerun-for-signal'
                      ? 'Resolved Rerun For Signal'
                      : 'Resolved Cleared Review';

const formatCalibrationOperatorDisposition = (
  disposition:
    | 'none'
    | 'promote-current-as-baseline'
    | 'keep-existing-baseline'
    | 'observe-longer'
    | 'run-targeted-retune'
    | 'rerun-for-signal'
    | 'clear-frozen-review'
): string =>
  disposition === 'none'
    ? 'None'
    : disposition === 'promote-current-as-baseline'
      ? 'Promote Current As Baseline'
      : disposition === 'keep-existing-baseline'
        ? 'Keep Existing Baseline'
        : disposition === 'observe-longer'
          ? 'Observe Longer'
          : disposition === 'run-targeted-retune'
            ? 'Run Targeted Retune'
            : disposition === 'rerun-for-signal'
              ? 'Rerun For Signal'
              : 'Clear Frozen Review';

const formatCombatHitPoints = (currentHp: number, maxHp: number): string =>
  `${currentHp}/${maxHp}`;

const formatHeadlessCombatCastResult = (
  result: HeadlessCombatRuntimeSnapshot['lastResolvedCast']
): string => {
  if (!result) {
    return 'No cast yet';
  }

  if (result.success) {
    return `Hit ${result.targetEntityId} for ${result.damageApplied} (${result.targetHpAfter ?? 0} HP left)`;
  }

  return `Rejected ${formatHeadlessCombatFailureReason(result.failureReason ?? 'none')}`;
};

const formatHeadlessCombatFailureReason = (
  reason: HeadlessCombatRuntimeSnapshot['lastLegalityFailureReason']
): string =>
  reason === 'on-cooldown'
    ? 'On Cooldown'
    : reason === 'out-of-range'
      ? 'Out Of Range'
      : reason === 'dead-actor'
        ? 'Dead Actor'
        : reason === 'invalid-target'
          ? 'Invalid Target'
          : 'None';

const formatSharedStructureResolvedStep = (
  step:
    | 'none'
    | 'outer-pressure-step-confirmed'
    | 'inner-pressure-step-confirmed'
    | 'core-pressure-step-confirmed'
): string =>
  step === 'outer-pressure-step-confirmed'
    ? 'Outer Pressure Step'
    : step === 'inner-pressure-step-confirmed'
      ? 'Inner Pressure Step'
      : step === 'core-pressure-step-confirmed'
        ? 'Core Pressure Step'
        : 'None';

const formatCalibrationBlockingFactors = (factors: string[]): string =>
  factors.length > 0 ? factors.join(', ') : 'None';

const formatOptionalTime = (seconds: number | null): string =>
  typeof seconds === 'number'
    ? `${seconds.toFixed(1)}s`
    : 'n/a';
