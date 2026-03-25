import { layoutConfig } from '../config/layout';
import {
  type HeadlessCombatRuntime,
  type HeadlessCombatRuntimeSnapshot
} from '../gameplay/headlessCombatRuntime';
import {
  type LiveInteractionDebugState
} from './liveInteractionValidator';

export type RuntimeInteractionProbePresetId = 'structure-to-closure';

export type RuntimeInteractionProbePhase =
  | 'inactive'
  | 'teleport-to-structure'
  | 'clear-blocker'
  | 'wait-siege-window'
  | 'request-structure-commit'
  | 'wait-structure-resolve'
  | 'request-closure-commit'
  | 'wait-ledger-evidence'
  | 'completed'
  | 'failed';

export interface RuntimeInteractionProbeSnapshot {
  active: boolean;
  presetId: RuntimeInteractionProbePresetId | null;
  phase: RuntimeInteractionProbePhase;
  completed: boolean;
  failed: boolean;
  summary: string;
}

export interface RuntimeInteractionProbeHarness {
  start(presetId?: RuntimeInteractionProbePresetId): void;
  clear(): void;
  update(
    runtime: HeadlessCombatRuntime,
    combatSnapshot: HeadlessCombatRuntimeSnapshot,
    liveInteractionSnapshot: LiveInteractionDebugState
  ): void;
  getSnapshot(): RuntimeInteractionProbeSnapshot;
}

interface ProbeState {
  active: boolean;
  presetId: RuntimeInteractionProbePresetId | null;
  phase: RuntimeInteractionProbePhase;
  phaseStartedAtSeconds: number | null;
  startedAtSeconds: number | null;
  baselineEvidenceCount: number;
  requestedStart: RuntimeInteractionProbePresetId | null;
  completed: boolean;
  failed: boolean;
  summary: string;
}

const structureProbeAnchor: CombatVector2 = {
  x: layoutConfig.nodes.redOuterTower.position.x,
  z: layoutConfig.nodes.redOuterTower.position.y
};
const probeTimeoutSeconds = 18;

type CombatVector2 = {
  x: number;
  z: number;
};

export const createRuntimeInteractionProbeHarness =
  (): RuntimeInteractionProbeHarness => {
    const state: ProbeState = {
      active: false,
      presetId: null,
      phase: 'inactive',
      phaseStartedAtSeconds: null,
      startedAtSeconds: null,
      baselineEvidenceCount: 0,
      requestedStart: null,
      completed: false,
      failed: false,
      summary: 'Runtime probe is idle.'
    };

    return {
      start(presetId = 'structure-to-closure') {
        state.requestedStart = presetId;
      },
      clear() {
        resetProbeState(state, 'Runtime probe was cleared.');
      },
      update(runtime, combatSnapshot, liveInteractionSnapshot) {
        if (state.requestedStart) {
          state.active = true;
          state.presetId = state.requestedStart;
          state.phase = 'teleport-to-structure';
          state.phaseStartedAtSeconds = combatSnapshot.elapsedSeconds;
          state.startedAtSeconds = combatSnapshot.elapsedSeconds;
          state.baselineEvidenceCount =
            liveInteractionSnapshot.runtimeEvidenceLedger.entries.length;
          state.requestedStart = null;
          state.completed = false;
          state.failed = false;
          state.summary =
            'Runtime probe is moving to the active structure anchor.';
        }

        if (!state.active) {
          return;
        }

        if (
          state.startedAtSeconds !== null &&
          combatSnapshot.elapsedSeconds - state.startedAtSeconds >
            probeTimeoutSeconds
        ) {
          failProbe(
            state,
            'Runtime probe timed out before producing closure evidence.'
          );
          return;
        }

        if (liveInteractionSnapshot.runtimeObservation.orderingState === 'out-of-order') {
          failProbe(state, 'Runtime probe observed an out-of-order live sequence.');
          return;
        }

        switch (state.phase) {
          case 'teleport-to-structure':
            runtime.teleportPlayer(structureProbeAnchor);
            advancePhase(
              state,
              combatSnapshot.elapsedSeconds,
              'clear-blocker',
              'Runtime probe is clearing the blocker.'
            );
            return;
          case 'clear-blocker':
            runtime.teleportPlayer(structureProbeAnchor);
            if (!combatSnapshot.target.alive) {
              advancePhase(
                state,
                combatSnapshot.elapsedSeconds,
                'wait-siege-window',
                'Runtime probe is waiting for the siege window to open.'
              );
              return;
            }
            if (combatSnapshot.player.basicAbilityCooldownRemaining <= 0.001) {
              runtime.requestPlayerBasicCast();
              state.summary = 'Runtime probe issued a blocker-clear cast.';
            }
            return;
          case 'wait-siege-window':
            runtime.teleportPlayer(structureProbeAnchor);
            if (
              liveInteractionSnapshot.signalProvider.sharedSiegeWindow
                .siegeWindowActive
            ) {
              advancePhase(
                state,
                combatSnapshot.elapsedSeconds,
                'request-structure-commit',
                'Runtime probe is requesting the bounded structure commit.'
              );
            }
            return;
          case 'request-structure-commit':
            runtime.teleportPlayer(structureProbeAnchor);
            runtime.requestPlayerBasicCast();
            advancePhase(
              state,
              combatSnapshot.elapsedSeconds,
              'wait-structure-resolve',
              'Runtime probe is waiting for structure conversion to resolve.'
            );
            return;
          case 'wait-structure-resolve':
            runtime.teleportPlayer(structureProbeAnchor);
            if (
              liveInteractionSnapshot.signalProvider.sharedStructureConversion
                .lastResolvedStructureStep !== 'none'
            ) {
              advancePhase(
                state,
                combatSnapshot.elapsedSeconds,
                'request-closure-commit',
                'Runtime probe is requesting the bounded closure commit.'
              );
            }
            return;
          case 'request-closure-commit':
            runtime.teleportPlayer(structureProbeAnchor);
            runtime.requestPlayerBasicCast();
            advancePhase(
              state,
              combatSnapshot.elapsedSeconds,
              'wait-ledger-evidence',
              'Runtime probe is waiting for recent runtime evidence.'
            );
            return;
          case 'wait-ledger-evidence': {
            const newEntries =
              liveInteractionSnapshot.runtimeEvidenceLedger.entries.slice(
                state.baselineEvidenceCount
              );
            const completedEntry = newEntries.find(
              (entry) => entry.kind === 'completed-sequence'
            );
            if (completedEntry) {
              state.active = false;
              state.phase = 'completed';
              state.phaseStartedAtSeconds = combatSnapshot.elapsedSeconds;
              state.completed = true;
              state.failed = false;
              state.summary = `Runtime probe completed: ${completedEntry.summary}`;
              return;
            }

            if (
              liveInteractionSnapshot.signalProvider.sharedClosureAdvancement
                .lastResolvedClosureStep !== 'none' &&
              newEntries.length > 0
            ) {
              state.summary =
                'Runtime probe reached closure resolution and is waiting for the ledger entry.';
            }
            return;
          }
          case 'completed':
          case 'failed':
          case 'inactive':
            return;
        }
      },
      getSnapshot() {
        return {
          active: state.active,
          presetId: state.presetId,
          phase: state.phase,
          completed: state.completed,
          failed: state.failed,
          summary: state.summary
        };
      }
    };
  };

const advancePhase = (
  state: ProbeState,
  elapsedSeconds: number,
  nextPhase: RuntimeInteractionProbePhase,
  summary: string
): void => {
  state.phase = nextPhase;
  state.phaseStartedAtSeconds = elapsedSeconds;
  state.summary = summary;
};

const failProbe = (state: ProbeState, summary: string): void => {
  state.active = false;
  state.phase = 'failed';
  state.completed = false;
  state.failed = true;
  state.summary = summary;
};

const resetProbeState = (state: ProbeState, summary: string): void => {
  state.active = false;
  state.presetId = null;
  state.phase = 'inactive';
  state.phaseStartedAtSeconds = null;
  state.startedAtSeconds = null;
  state.baselineEvidenceCount = 0;
  state.requestedStart = null;
  state.completed = false;
  state.failed = false;
  state.summary = summary;
};
