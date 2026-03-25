import { type RuntimeInteractionObservationSnapshot } from './runtimeInteractionObservation';

export type RuntimeInteractionSequenceVerdict =
  | 'pass'
  | 'near-miss'
  | 'fail';

export type RuntimeInteractionSequenceHealth =
  | 'idle'
  | 'healthy'
  | 'degraded'
  | 'broken';

export interface RuntimeInteractionSequenceAssessmentSnapshot {
  overallVerdict: RuntimeInteractionSequenceVerdict;
  observedSequenceCount: number;
  completedSequenceCount: number;
  incidentCounts: {
    outOfOrder: number;
    lingeringWindow: number;
    stalls: number;
  };
  currentLiveSequenceHealth: RuntimeInteractionSequenceHealth;
  lastCompletedSequenceSummary: string | null;
  summary: string;
}

export interface RuntimeInteractionSequenceAssessment {
  update(snapshot: RuntimeInteractionObservationSnapshot): void;
  getSnapshot(): RuntimeInteractionSequenceAssessmentSnapshot;
}

interface AssessmentState {
  observedSequenceCount: number;
  completedSequenceCount: number;
  incidentCounts: RuntimeInteractionSequenceAssessmentSnapshot['incidentCounts'];
  activeSequenceStartSeconds: number | null;
  lastCompletedSequenceSummary: string | null;
  previous: {
    pulseStartSeconds: number | null;
    siegeWindowOpenSeconds: number | null;
    closureResolveSeconds: number | null;
    orderingState: RuntimeInteractionObservationSnapshot['orderingState'];
    windowPlausibility: RuntimeInteractionObservationSnapshot['windowPlausibility'];
    progressionState: RuntimeInteractionObservationSnapshot['progressionState'];
  };
}

export const createRuntimeInteractionSequenceAssessment =
  (): RuntimeInteractionSequenceAssessment => {
    const state: AssessmentState = {
      observedSequenceCount: 0,
      completedSequenceCount: 0,
      incidentCounts: {
        outOfOrder: 0,
        lingeringWindow: 0,
        stalls: 0
      },
      activeSequenceStartSeconds: null,
      lastCompletedSequenceSummary: null,
      previous: {
        pulseStartSeconds: null,
        siegeWindowOpenSeconds: null,
        closureResolveSeconds: null,
        orderingState: 'awaiting-next-step',
        windowPlausibility: 'idle',
        progressionState: 'idle'
      }
    };

    return {
      update(snapshot) {
        const pulseStarted = isNewTimestamp(
          snapshot.lastObserved.pulseStartSeconds,
          state.previous.pulseStartSeconds
        );
        const siegeOpened = isNewTimestamp(
          snapshot.lastObserved.siegeWindowOpenSeconds,
          state.previous.siegeWindowOpenSeconds
        );
        const closureResolved = isNewTimestamp(
          snapshot.lastObserved.closureResolveSeconds,
          state.previous.closureResolveSeconds
        );

        if (snapshot.orderingState === 'out-of-order') {
          if (state.previous.orderingState !== 'out-of-order') {
            state.incidentCounts.outOfOrder += 1;
          }
        }

        if (snapshot.windowPlausibility === 'lingering') {
          if (state.previous.windowPlausibility !== 'lingering') {
            state.incidentCounts.lingeringWindow += 1;
          }
        }

        if (snapshot.progressionState === 'stalling') {
          if (state.previous.progressionState !== 'stalling') {
            state.incidentCounts.stalls += 1;
          }
        }

        if (state.activeSequenceStartSeconds === null) {
          if (pulseStarted && snapshot.lastObserved.pulseStartSeconds !== null) {
            state.observedSequenceCount += 1;
            state.activeSequenceStartSeconds =
              snapshot.lastObserved.pulseStartSeconds;
          } else if (
            siegeOpened &&
            snapshot.lastObserved.siegeWindowOpenSeconds !== null
          ) {
            state.observedSequenceCount += 1;
            state.activeSequenceStartSeconds =
              snapshot.lastObserved.siegeWindowOpenSeconds;
          }
        }

        if (
          closureResolved &&
          state.activeSequenceStartSeconds !== null &&
          snapshot.lastObserved.closureResolveSeconds !== null
        ) {
          state.completedSequenceCount += 1;
          state.lastCompletedSequenceSummary = buildCompletedSequenceSummary(
            state.activeSequenceStartSeconds,
            snapshot
          );
          state.activeSequenceStartSeconds = null;
        } else if (
          snapshot.currentPhase === 'idle' &&
          state.activeSequenceStartSeconds !== null
        ) {
          state.activeSequenceStartSeconds = null;
        }

        state.previous = {
          pulseStartSeconds: snapshot.lastObserved.pulseStartSeconds,
          siegeWindowOpenSeconds: snapshot.lastObserved.siegeWindowOpenSeconds,
          closureResolveSeconds: snapshot.lastObserved.closureResolveSeconds,
          orderingState: snapshot.orderingState,
          windowPlausibility: snapshot.windowPlausibility,
          progressionState: snapshot.progressionState
        };
      },
      getSnapshot() {
        const currentLiveSequenceHealth = deriveCurrentSequenceHealth(state);
        const overallVerdict = deriveOverallVerdict(
          state,
          currentLiveSequenceHealth
        );

        return {
          overallVerdict,
          observedSequenceCount: state.observedSequenceCount,
          completedSequenceCount: state.completedSequenceCount,
          incidentCounts: { ...state.incidentCounts },
          currentLiveSequenceHealth,
          lastCompletedSequenceSummary: state.lastCompletedSequenceSummary,
          summary: buildAssessmentSummary(
            overallVerdict,
            currentLiveSequenceHealth,
            state
          )
        };
      }
    };
  };

const deriveCurrentSequenceHealth = (
  state: AssessmentState
): RuntimeInteractionSequenceHealth => {
  if (state.previous.orderingState === 'out-of-order') {
    return 'broken';
  }

  if (state.activeSequenceStartSeconds === null) {
    return 'idle';
  }

  if (
    state.previous.windowPlausibility === 'lingering' ||
    state.previous.progressionState === 'stalling'
  ) {
    return 'degraded';
  }

  return 'healthy';
};

const deriveOverallVerdict = (
  state: AssessmentState,
  currentLiveSequenceHealth: RuntimeInteractionSequenceHealth
): RuntimeInteractionSequenceVerdict => {
  if (state.incidentCounts.outOfOrder > 0) {
    return 'fail';
  }

  if (
    state.incidentCounts.lingeringWindow > 0 ||
    state.incidentCounts.stalls > 0 ||
    currentLiveSequenceHealth === 'degraded'
  ) {
    return 'near-miss';
  }

  if (state.observedSequenceCount > 0) {
    return 'pass';
  }

  return 'near-miss';
};

const buildAssessmentSummary = (
  overallVerdict: RuntimeInteractionSequenceVerdict,
  currentLiveSequenceHealth: RuntimeInteractionSequenceHealth,
  state: AssessmentState
): string => {
  if (overallVerdict === 'fail') {
    return `Observed ${state.incidentCounts.outOfOrder} out-of-order runtime incident(s) across ${state.observedSequenceCount} live sequence(s).`;
  }

  if (currentLiveSequenceHealth === 'degraded') {
    return `Observed live sequence is degraded with ${state.incidentCounts.lingeringWindow} lingering window incident(s) and ${state.incidentCounts.stalls} stall incident(s).`;
  }

  if (state.lastCompletedSequenceSummary) {
    return `Observed ${state.completedSequenceCount} completed ordered live sequence(s). Last: ${state.lastCompletedSequenceSummary}`;
  }

  if (state.observedSequenceCount > 0) {
    return `Observed live sequence ${state.observedSequenceCount} is ${currentLiveSequenceHealth}.`;
  }

  return 'No ordered runtime interaction sequence has been completed yet.';
};

const buildCompletedSequenceSummary = (
  sequenceStartSeconds: number,
  snapshot: RuntimeInteractionObservationSnapshot
): string => {
  const completionSeconds = snapshot.lastObserved.closureResolveSeconds;
  if (completionSeconds === null) {
    return 'Ordered runtime sequence completed.';
  }

  const totalDurationSeconds = Math.max(0, completionSeconds - sequenceStartSeconds);
  return `pulse/siege to closure resolve in ${round(totalDurationSeconds)}s`;
};

const isNewTimestamp = (
  currentValue: number | null,
  previousValue: number | null
): boolean =>
  currentValue !== null &&
  (previousValue === null || currentValue > previousValue + 0.0001);

const round = (value: number): number => Math.round(value * 100) / 100;
