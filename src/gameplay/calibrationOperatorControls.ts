import { cloneSnapshot } from './calibrationUtils';

export type CalibrationOperatorActionId =
  | 'none'
  | 'reset-calibration-digest'
  | 'capture-current-calibration-baseline'
  | 'clear-calibration-baseline'
  | 'freeze-current-calibration-pass-review'
  | 'clear-frozen-calibration-pass-review'
  | 'acknowledge-keep-existing-baseline'
  | 'acknowledge-observe-longer'
  | 'acknowledge-run-targeted-retune'
  | 'acknowledge-rerun-for-signal'
  | 'clear-calibration-loop-closure-decision';

export type CalibrationOperatorFeedbackSeverity =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning';

export interface CalibrationOperatorControlsSnapshot {
  lastActionId: CalibrationOperatorActionId;
  lastActionLabel: string;
  lastActionRuntimeSeconds: number | null;
  actionFeedbackText: string;
  actionFeedbackSeverity: CalibrationOperatorFeedbackSeverity;
}

export interface CalibrationOperatorActionRecord {
  actionId: Exclude<CalibrationOperatorActionId, 'none'>;
  runtimeSeconds: number;
  actionFeedbackText: string;
  actionFeedbackSeverity: CalibrationOperatorFeedbackSeverity;
}

export interface CalibrationOperatorControlsModel {
  recordAction(action: CalibrationOperatorActionRecord): void;
  getSnapshot(): CalibrationOperatorControlsSnapshot;
}

interface RuntimeState {
  snapshot: CalibrationOperatorControlsSnapshot;
}

export const createCalibrationOperatorControlsModel =
  (): CalibrationOperatorControlsModel => {
    const state: RuntimeState = {
      snapshot: createDefaultSnapshot()
    };

    return {
      recordAction(action) {
        state.snapshot = {
          lastActionId: action.actionId,
          lastActionLabel: actionLabelById[action.actionId],
          lastActionRuntimeSeconds: action.runtimeSeconds,
          actionFeedbackText: action.actionFeedbackText,
          actionFeedbackSeverity: action.actionFeedbackSeverity
        };
      },
      getSnapshot() {
        return cloneSnapshot(state.snapshot);
      }
    };
  };

const actionLabelById: Record<
  Exclude<CalibrationOperatorActionId, 'none'>,
  string
> = {
  'reset-calibration-digest': 'Reset Calibration Digest',
  'capture-current-calibration-baseline': 'Capture Current Calibration Baseline',
  'clear-calibration-baseline': 'Clear Calibration Baseline',
  'freeze-current-calibration-pass-review': 'Freeze Current Calibration Pass Review',
  'clear-frozen-calibration-pass-review': 'Clear Frozen Calibration Pass Review',
  'acknowledge-keep-existing-baseline': 'Acknowledge Keep Existing Baseline',
  'acknowledge-observe-longer': 'Acknowledge Observe Longer',
  'acknowledge-run-targeted-retune': 'Acknowledge Run Targeted Retune',
  'acknowledge-rerun-for-signal': 'Acknowledge Rerun For Signal',
  'clear-calibration-loop-closure-decision': 'Clear Calibration Loop Closure Decision'
};

const createDefaultSnapshot = (): CalibrationOperatorControlsSnapshot => ({
  lastActionId: 'none',
  lastActionLabel: '',
  lastActionRuntimeSeconds: null,
  actionFeedbackText: '',
  actionFeedbackSeverity: 'neutral'
});
