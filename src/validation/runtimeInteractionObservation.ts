import { layoutConfig } from '../config/layout';
import { type LivePrototypeSignalProviderDebugState } from '../gameplay/livePrototypeSignalProvider';

export type RuntimeInteractionObservationPhase =
  | 'idle'
  | 'runtime-contact'
  | 'siege-window'
  | 'defender-response'
  | 'push-reassertion'
  | 'structure-conversion'
  | 'closure-advancement';

export type RuntimeInteractionOrderingState =
  | 'correct'
  | 'awaiting-next-step'
  | 'out-of-order';

export type RuntimeInteractionWindowPlausibility =
  | 'idle'
  | 'plausible'
  | 'lingering';

export type RuntimeInteractionProgressionState =
  | 'idle'
  | 'progressing'
  | 'stalling';

export interface RuntimeInteractionObservationSnapshot {
  elapsedSeconds: number;
  currentPhase: RuntimeInteractionObservationPhase;
  currentPhaseAgeSeconds: number;
  orderingState: RuntimeInteractionOrderingState;
  windowPlausibility: RuntimeInteractionWindowPlausibility;
  progressionState: RuntimeInteractionProgressionState;
  lastObserved: {
    contactStartSeconds: number | null;
    pulseStartSeconds: number | null;
    pulseExpireSeconds: number | null;
    siegeWindowOpenSeconds: number | null;
    structureAdvanceSeconds: number | null;
    structureResolveSeconds: number | null;
    closureAdvanceSeconds: number | null;
    closureResolveSeconds: number | null;
  };
  summary: string;
}

export interface RuntimeInteractionObservation {
  update(snapshot: LivePrototypeSignalProviderDebugState): void;
  reset(snapshot?: LivePrototypeSignalProviderDebugState): void;
  getSnapshot(): RuntimeInteractionObservationSnapshot;
}

interface ObservationEventTimes {
  contactStartSeconds: number | null;
  pulseStartSeconds: number | null;
  pulseExpireSeconds: number | null;
  siegeWindowOpenSeconds: number | null;
  structureAdvanceSeconds: number | null;
  structureResolveSeconds: number | null;
  closureAdvanceSeconds: number | null;
  closureResolveSeconds: number | null;
}

interface PreviousObservationFlags {
  contactActive: boolean;
  pulseActive: boolean;
  siegeWindowActive: boolean;
  structureProgress: number;
  structureResolved: boolean;
  closureValue: number;
  closureResolved: boolean;
}

interface ObservationState {
  elapsedSeconds: number;
  currentPhase: RuntimeInteractionObservationPhase;
  phaseStartedAtSeconds: number;
  lastObserved: ObservationEventTimes;
  previous: PreviousObservationFlags;
}

const pulseWindowReferenceSeconds =
  layoutConfig.tempo.coefficients.objectiveCommitSeconds;
const maxStructureContactWindowSeconds = 5.2;

export const createRuntimeInteractionObservation =
  (): RuntimeInteractionObservation => {
    const state: ObservationState = createDefaultObservationState();

    return {
      update(snapshot) {
        const elapsedSeconds = snapshot.elapsedSeconds;
        const contactActive = hasRuntimeContact(snapshot);
        const pulseActive =
          snapshot.runtimeLaneTelemetry?.interactionPulse.active === true;
        const siegeWindowActive = snapshot.sharedSiegeWindow.siegeWindowActive;
        const structureProgress =
          snapshot.sharedStructureConversion.conversionProgress;
        const structureResolved =
          snapshot.sharedStructureConversion.lastResolvedStructureStep !== 'none';
        const closureValue =
          snapshot.sharedClosureAdvancement.closureAdvancementValue;
        const closureResolved =
          snapshot.sharedClosureAdvancement.lastResolvedClosureStep !== 'none';

        if (contactActive && !state.previous.contactActive) {
          state.lastObserved.contactStartSeconds = elapsedSeconds;
        }
        if (pulseActive && !state.previous.pulseActive) {
          state.lastObserved.pulseStartSeconds = elapsedSeconds;
        }
        if (!pulseActive && state.previous.pulseActive) {
          state.lastObserved.pulseExpireSeconds = elapsedSeconds;
        }
        if (siegeWindowActive && !state.previous.siegeWindowActive) {
          state.lastObserved.siegeWindowOpenSeconds = elapsedSeconds;
        }
        if (structureProgress > state.previous.structureProgress + 0.001) {
          state.lastObserved.structureAdvanceSeconds = elapsedSeconds;
        }
        if (structureResolved && !state.previous.structureResolved) {
          state.lastObserved.structureResolveSeconds = elapsedSeconds;
        }
        if (closureValue > state.previous.closureValue + 0.001) {
          state.lastObserved.closureAdvanceSeconds = elapsedSeconds;
        }
        if (closureResolved && !state.previous.closureResolved) {
          state.lastObserved.closureResolveSeconds = elapsedSeconds;
        }

        const currentPhase = deriveObservationPhase(snapshot);
        if (currentPhase !== state.currentPhase) {
          state.currentPhase = currentPhase;
          state.phaseStartedAtSeconds = elapsedSeconds;
        }

        state.elapsedSeconds = elapsedSeconds;
        state.previous = {
          contactActive,
          pulseActive,
          siegeWindowActive,
          structureProgress,
          structureResolved,
          closureValue,
          closureResolved
        };
      },
      reset(snapshot) {
        Object.assign(state, createDefaultObservationState());
        if (!snapshot) {
          return;
        }

        state.elapsedSeconds = snapshot.elapsedSeconds;
        state.currentPhase = deriveObservationPhase(snapshot);
        state.phaseStartedAtSeconds = snapshot.elapsedSeconds;
        state.previous = derivePreviousObservationFlags(snapshot);
      },
      getSnapshot() {
        const currentPhaseAgeSeconds = Math.max(
          0,
          state.elapsedSeconds - state.phaseStartedAtSeconds
        );
        const orderingState = deriveOrderingState(state.lastObserved);
        const windowPlausibility = deriveWindowPlausibility(
          state,
          currentPhaseAgeSeconds
        );
        const progressionState = deriveProgressionState(state);

        return {
          elapsedSeconds: state.elapsedSeconds,
          currentPhase: state.currentPhase,
          currentPhaseAgeSeconds,
          orderingState,
          windowPlausibility,
          progressionState,
          lastObserved: { ...state.lastObserved },
          summary: buildObservationSummary(
            state.currentPhase,
            orderingState,
            windowPlausibility,
            progressionState
          )
        };
      }
    };
  };

const createDefaultObservationState = (): ObservationState => ({
  elapsedSeconds: 0,
  currentPhase: 'idle',
  phaseStartedAtSeconds: 0,
  lastObserved: {
    contactStartSeconds: null,
    pulseStartSeconds: null,
    pulseExpireSeconds: null,
    siegeWindowOpenSeconds: null,
    structureAdvanceSeconds: null,
    structureResolveSeconds: null,
    closureAdvanceSeconds: null,
    closureResolveSeconds: null
  },
  previous: {
    contactActive: false,
    pulseActive: false,
    siegeWindowActive: false,
    structureProgress: 0,
    structureResolved: false,
    closureValue: 0,
    closureResolved: false
  }
});

const derivePreviousObservationFlags = (
  snapshot: LivePrototypeSignalProviderDebugState
): PreviousObservationFlags => ({
  contactActive: hasRuntimeContact(snapshot),
  pulseActive: snapshot.runtimeLaneTelemetry?.interactionPulse.active === true,
  siegeWindowActive: snapshot.sharedSiegeWindow.siegeWindowActive,
  structureProgress: snapshot.sharedStructureConversion.conversionProgress,
  structureResolved:
    snapshot.sharedStructureConversion.lastResolvedStructureStep !== 'none',
  closureValue: snapshot.sharedClosureAdvancement.closureAdvancementValue,
  closureResolved:
    snapshot.sharedClosureAdvancement.lastResolvedClosureStep !== 'none'
});

const hasRuntimeContact = (
  snapshot: LivePrototypeSignalProviderDebugState
): boolean =>
  snapshot.runtimeLaneTelemetry !== null &&
  (
    snapshot.runtimeLaneTelemetry.structureContactByTier.outer.active ||
    snapshot.runtimeLaneTelemetry.structureContactByTier.inner.active ||
    snapshot.runtimeLaneTelemetry.structureContactByTier.core.active
  );

const deriveObservationPhase = (
  snapshot: LivePrototypeSignalProviderDebugState
): RuntimeInteractionObservationPhase => {
  if (
    snapshot.sharedClosureAdvancement.closureAdvancementActive ||
    snapshot.sharedClosureAdvancement.closureAdvancementValue > 0.01
  ) {
    return 'closure-advancement';
  }

  if (
    snapshot.sharedStructureConversion.conversionActive ||
    snapshot.sharedStructureConversion.conversionProgress > 0.01
  ) {
    return 'structure-conversion';
  }

  if (snapshot.sharedDefenderResponse.responseActive) {
    return 'defender-response';
  }

  if (snapshot.sharedPushReassertion.recoveryActive) {
    return 'push-reassertion';
  }

  if (snapshot.sharedSiegeWindow.siegeWindowActive) {
    return 'siege-window';
  }

  if (
    snapshot.runtimeLaneTelemetry?.interactionPulse.active === true ||
    hasRuntimeContact(snapshot)
  ) {
    return 'runtime-contact';
  }

  return 'idle';
};

const deriveOrderingState = (
  lastObserved: ObservationEventTimes
): RuntimeInteractionOrderingState => {
  if (lastObserved.structureAdvanceSeconds !== null) {
    if (
      lastObserved.siegeWindowOpenSeconds === null ||
      lastObserved.siegeWindowOpenSeconds > lastObserved.structureAdvanceSeconds
    ) {
      return 'out-of-order';
    }

    if (
      lastObserved.pulseStartSeconds === null ||
      lastObserved.pulseStartSeconds > lastObserved.structureAdvanceSeconds
    ) {
      return 'out-of-order';
    }
  }

  if (lastObserved.closureAdvanceSeconds !== null) {
    if (
      lastObserved.structureResolveSeconds === null ||
      lastObserved.structureResolveSeconds > lastObserved.closureAdvanceSeconds
    ) {
      return 'out-of-order';
    }
  }

  return lastObserved.closureResolveSeconds !== null
    ? 'correct'
    : 'awaiting-next-step';
};

const deriveWindowPlausibility = (
  state: ObservationState,
  currentPhaseAgeSeconds: number
): RuntimeInteractionWindowPlausibility => {
  if (state.previous.pulseActive) {
    return currentPhaseAgeSeconds <= pulseWindowReferenceSeconds * 1.35
      ? 'plausible'
      : 'lingering';
  }

  if (state.previous.siegeWindowActive) {
    return currentPhaseAgeSeconds <= 8
      ? 'plausible'
      : 'lingering';
  }

  if (state.previous.contactActive) {
    return currentPhaseAgeSeconds <= maxStructureContactWindowSeconds * 1.1
      ? 'plausible'
      : 'lingering';
  }

  return 'idle';
};

const deriveProgressionState = (
  state: ObservationState
): RuntimeInteractionProgressionState => {
  const structureAdvanceAge = ageSince(
    state.elapsedSeconds,
    state.lastObserved.structureAdvanceSeconds
  );
  const closureAdvanceAge = ageSince(
    state.elapsedSeconds,
    state.lastObserved.closureAdvanceSeconds
  );
  const siegeWindowAge = ageSince(
    state.elapsedSeconds,
    state.lastObserved.siegeWindowOpenSeconds
  );

  if (state.currentPhase === 'closure-advancement') {
    return closureAdvanceAge !== null && closureAdvanceAge <= 1
      ? 'progressing'
      : 'stalling';
  }

  if (state.currentPhase === 'structure-conversion') {
    return structureAdvanceAge !== null && structureAdvanceAge <= 1
      ? 'progressing'
      : 'stalling';
  }

  if (state.currentPhase === 'siege-window') {
    if (state.previous.pulseActive) {
      return 'progressing';
    }

    return siegeWindowAge !== null && siegeWindowAge > 1.5
      ? 'stalling'
      : 'idle';
  }

  if (
    state.currentPhase === 'runtime-contact' ||
    state.currentPhase === 'defender-response' ||
    state.currentPhase === 'push-reassertion'
  ) {
    return 'progressing';
  }

  return 'idle';
};

const buildObservationSummary = (
  currentPhase: RuntimeInteractionObservationPhase,
  orderingState: RuntimeInteractionOrderingState,
  windowPlausibility: RuntimeInteractionWindowPlausibility,
  progressionState: RuntimeInteractionProgressionState
): string => {
  if (orderingState === 'out-of-order') {
    return 'Observed runtime events are out of the expected macro order.';
  }

  if (progressionState === 'stalling') {
    return `Observed runtime path is stalling during ${currentPhase}.`;
  }

  if (currentPhase === 'idle') {
    return 'Observed runtime path is idle.';
  }

  if (orderingState === 'awaiting-next-step') {
    return `Observed runtime path is in ${currentPhase} and waiting for the next bounded step.`;
  }

  return `Observed runtime path is progressing through ${currentPhase} with ${windowPlausibility} windows.`;
};

const ageSince = (
  elapsedSeconds: number,
  eventSeconds: number | null
): number | null =>
  eventSeconds === null ? null : Math.max(0, elapsedSeconds - eventSeconds);
