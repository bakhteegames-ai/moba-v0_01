import {
  type RuntimeInteractionObservationPhase,
  type RuntimeInteractionObservationSnapshot
} from './runtimeInteractionObservation';
import {
  type RuntimeInteractionSequenceAssessmentSnapshot,
  type RuntimeInteractionSequenceVerdict
} from './runtimeInteractionSequenceAssessment';

export type RuntimeInteractionEvidenceEntryKind =
  | 'completed-sequence'
  | 'incident';

export type RuntimeInteractionEvidenceIncidentTag =
  | 'out-of-order'
  | 'lingering-window'
  | 'stall';

export interface RuntimeInteractionEvidenceEntry {
  kind: RuntimeInteractionEvidenceEntryKind;
  verdict: RuntimeInteractionSequenceVerdict;
  observedAtSeconds: number;
  triggerPhase: RuntimeInteractionObservationPhase;
  durationSeconds: number | null;
  incidentTag: RuntimeInteractionEvidenceIncidentTag | null;
  summary: string;
}

export interface RuntimeInteractionEvidenceLedgerSnapshot {
  capacity: number;
  entries: RuntimeInteractionEvidenceEntry[];
  summary: string;
}

export interface RuntimeInteractionEvidenceLedger {
  update(
    observation: RuntimeInteractionObservationSnapshot,
    assessment: RuntimeInteractionSequenceAssessmentSnapshot
  ): void;
  getSnapshot(): RuntimeInteractionEvidenceLedgerSnapshot;
}

interface EvidenceLedgerState {
  entries: RuntimeInteractionEvidenceEntry[];
  activeSequenceStartSeconds: number | null;
  previous: {
    pulseStartSeconds: number | null;
    siegeWindowOpenSeconds: number | null;
    closureResolveSeconds: number | null;
    orderingState: RuntimeInteractionObservationSnapshot['orderingState'];
    windowPlausibility: RuntimeInteractionObservationSnapshot['windowPlausibility'];
    progressionState: RuntimeInteractionObservationSnapshot['progressionState'];
  };
}

const evidenceCapacity = 5;

export const createRuntimeInteractionEvidenceLedger =
  (): RuntimeInteractionEvidenceLedger => {
    const state: EvidenceLedgerState = {
      entries: [],
      activeSequenceStartSeconds: null,
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
      update(observation, assessment) {
        const pulseStarted = isNewTimestamp(
          observation.lastObserved.pulseStartSeconds,
          state.previous.pulseStartSeconds
        );
        const siegeOpened = isNewTimestamp(
          observation.lastObserved.siegeWindowOpenSeconds,
          state.previous.siegeWindowOpenSeconds
        );
        const closureResolved = isNewTimestamp(
          observation.lastObserved.closureResolveSeconds,
          state.previous.closureResolveSeconds
        );

        if (state.activeSequenceStartSeconds === null) {
          if (pulseStarted && observation.lastObserved.pulseStartSeconds !== null) {
            state.activeSequenceStartSeconds =
              observation.lastObserved.pulseStartSeconds;
          } else if (
            siegeOpened &&
            observation.lastObserved.siegeWindowOpenSeconds !== null
          ) {
            state.activeSequenceStartSeconds =
              observation.lastObserved.siegeWindowOpenSeconds;
          }
        }

        if (
          observation.orderingState === 'out-of-order' &&
          state.previous.orderingState !== 'out-of-order'
        ) {
          pushLedgerEntry(state, {
            kind: 'incident',
            verdict: 'fail',
            observedAtSeconds: observation.elapsedSeconds,
            triggerPhase: observation.currentPhase,
            durationSeconds: resolveSequenceDuration(
              state.activeSequenceStartSeconds,
              observation.elapsedSeconds
            ),
            incidentTag: 'out-of-order',
            summary: `Out-of-order runtime sequence observed during ${observation.currentPhase}.`
          });
        }

        if (
          observation.windowPlausibility === 'lingering' &&
          state.previous.windowPlausibility !== 'lingering'
        ) {
          pushLedgerEntry(state, {
            kind: 'incident',
            verdict: 'near-miss',
            observedAtSeconds: observation.elapsedSeconds,
            triggerPhase: observation.currentPhase,
            durationSeconds: resolveSequenceDuration(
              state.activeSequenceStartSeconds,
              observation.elapsedSeconds
            ),
            incidentTag: 'lingering-window',
            summary: `Runtime ${observation.currentPhase} window lingered beyond the plausible range.`
          });
        }

        if (
          observation.progressionState === 'stalling' &&
          state.previous.progressionState !== 'stalling'
        ) {
          pushLedgerEntry(state, {
            kind: 'incident',
            verdict: 'near-miss',
            observedAtSeconds: observation.elapsedSeconds,
            triggerPhase: observation.currentPhase,
            durationSeconds: resolveSequenceDuration(
              state.activeSequenceStartSeconds,
              observation.elapsedSeconds
            ),
            incidentTag: 'stall',
            summary: `Runtime sequence stalled during ${observation.currentPhase}.`
          });
        }

        if (
          closureResolved &&
          observation.lastObserved.closureResolveSeconds !== null &&
          state.activeSequenceStartSeconds !== null
        ) {
          pushLedgerEntry(state, {
            kind: 'completed-sequence',
            verdict: deriveCompletedSequenceVerdict(observation),
            observedAtSeconds: observation.lastObserved.closureResolveSeconds,
            triggerPhase: 'closure-advancement',
            durationSeconds: Math.max(
              0,
              observation.lastObserved.closureResolveSeconds -
                state.activeSequenceStartSeconds
            ),
            incidentTag: null,
            summary: buildCompletedSequenceSummary(
              observation,
              assessment,
              state.activeSequenceStartSeconds
            )
          });
          state.activeSequenceStartSeconds = null;
        } else if (
          observation.currentPhase === 'idle' &&
          state.activeSequenceStartSeconds !== null
        ) {
          state.activeSequenceStartSeconds = null;
        }

        state.previous = {
          pulseStartSeconds: observation.lastObserved.pulseStartSeconds,
          siegeWindowOpenSeconds: observation.lastObserved.siegeWindowOpenSeconds,
          closureResolveSeconds: observation.lastObserved.closureResolveSeconds,
          orderingState: observation.orderingState,
          windowPlausibility: observation.windowPlausibility,
          progressionState: observation.progressionState
        };
      },
      getSnapshot() {
        return {
          capacity: evidenceCapacity,
          entries: state.entries.map((entry) => ({ ...entry })),
          summary: buildLedgerSummary(state.entries)
        };
      }
    };
  };

const deriveCompletedSequenceVerdict = (
  observation: RuntimeInteractionObservationSnapshot
): RuntimeInteractionSequenceVerdict => {
  if (observation.orderingState === 'out-of-order') {
    return 'fail';
  }

  if (
    observation.windowPlausibility === 'lingering' ||
    observation.progressionState === 'stalling'
  ) {
    return 'near-miss';
  }

  return 'pass';
};

const buildCompletedSequenceSummary = (
  observation: RuntimeInteractionObservationSnapshot,
  assessment: RuntimeInteractionSequenceAssessmentSnapshot,
  sequenceStartSeconds: number
): string => {
  const closureResolveSeconds = observation.lastObserved.closureResolveSeconds;
  if (closureResolveSeconds === null) {
    return 'Ordered runtime sequence completed.';
  }

  const totalDurationSeconds = Math.max(
    0,
    closureResolveSeconds - sequenceStartSeconds
  );
  return `Completed ordered runtime sequence in ${round(totalDurationSeconds)}s with ${assessment.currentLiveSequenceHealth} live health.`;
};

const buildLedgerSummary = (
  entries: RuntimeInteractionEvidenceEntry[]
): string => {
  if (entries.length === 0) {
    return 'No recent runtime sequence evidence recorded.';
  }

  const latestEntry = entries[entries.length - 1];
  return `Recent runtime evidence keeps ${entries.length} bounded entry(s). Latest: ${latestEntry.summary}`;
};

const pushLedgerEntry = (
  state: EvidenceLedgerState,
  entry: RuntimeInteractionEvidenceEntry
): void => {
  state.entries.push(entry);
  if (state.entries.length > evidenceCapacity) {
    state.entries.splice(0, state.entries.length - evidenceCapacity);
  }
};

const resolveSequenceDuration = (
  sequenceStartSeconds: number | null,
  observedAtSeconds: number
): number | null =>
  sequenceStartSeconds === null
    ? null
    : Math.max(0, observedAtSeconds - sequenceStartSeconds);

const isNewTimestamp = (
  currentValue: number | null,
  previousValue: number | null
): boolean =>
  currentValue !== null &&
  (previousValue === null || currentValue > previousValue + 0.0001);

const round = (value: number): number => Math.round(value * 100) / 100;
