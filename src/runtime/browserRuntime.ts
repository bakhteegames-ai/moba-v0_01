export interface BrowserRuntimeDebugBindings {
  advanceTime: (ms: number) => void;
  renderGameToText: () => string;
  startRuntimeProbe?: () => void;
  clearRuntimeProbe?: () => void;
  resetRuntimeValidationState?: () => void;
  runCleanRuntimeProbe?: () => void;
  runCleanRuntimeDefenderProbe?: () => void;
  runStructureToClosureSmoke?: () => void;
  runDefenderResponseRecoverySmoke?: () => void;
  runFullRuntimeValidationCycle?: () => void;
}

type BrowserDebugWindow = Window & {
  advanceTime?: (ms: number) => void;
  render_game_to_text?: () => string;
  start_runtime_probe?: () => void;
  clear_runtime_probe?: () => void;
  reset_runtime_validation_state?: () => void;
  run_clean_runtime_probe?: () => void;
  run_clean_runtime_defender_probe?: () => void;
  run_structure_to_closure_smoke?: () => void;
  run_defender_response_recovery_smoke?: () => void;
  run_full_runtime_validation_cycle?: () => void;
};

export const requireBrowserCanvas = (elementId: string): HTMLCanvasElement => {
  const canvas = document.getElementById(elementId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing application canvas.');
  }

  return canvas;
};

export const bindWindowEvent = <K extends keyof WindowEventMap>(
  eventName: K,
  listener: (event: WindowEventMap[K]) => void
): (() => void) => {
  const eventListener = listener as EventListener;
  window.addEventListener(eventName, eventListener);
  return () => window.removeEventListener(eventName, eventListener);
};

export const getBrowserNowSeconds = (): number => performance.now() * 0.001;

export const installBrowserDebugBindings = (
  bindings: BrowserRuntimeDebugBindings
): void => {
  const debugWindow = window as BrowserDebugWindow;
  debugWindow.advanceTime = bindings.advanceTime;
  debugWindow.render_game_to_text = bindings.renderGameToText;
  if (bindings.startRuntimeProbe) {
    debugWindow.start_runtime_probe = bindings.startRuntimeProbe;
  }
  if (bindings.clearRuntimeProbe) {
    debugWindow.clear_runtime_probe = bindings.clearRuntimeProbe;
  }
  if (bindings.resetRuntimeValidationState) {
    debugWindow.reset_runtime_validation_state =
      bindings.resetRuntimeValidationState;
  }
  if (bindings.runCleanRuntimeProbe) {
    debugWindow.run_clean_runtime_probe = bindings.runCleanRuntimeProbe;
  }
  if (bindings.runCleanRuntimeDefenderProbe) {
    debugWindow.run_clean_runtime_defender_probe =
      bindings.runCleanRuntimeDefenderProbe;
  }
  if (bindings.runStructureToClosureSmoke) {
    debugWindow.run_structure_to_closure_smoke =
      bindings.runStructureToClosureSmoke;
  }
  if (bindings.runDefenderResponseRecoverySmoke) {
    debugWindow.run_defender_response_recovery_smoke =
      bindings.runDefenderResponseRecoverySmoke;
  }
  if (bindings.runFullRuntimeValidationCycle) {
    debugWindow.run_full_runtime_validation_cycle =
      bindings.runFullRuntimeValidationCycle;
  }
};
