export interface BrowserRuntimeDebugBindings {
  advanceTime: (ms: number) => void;
  renderGameToText: () => string;
  startRuntimeProbe?: () => void;
  clearRuntimeProbe?: () => void;
}

type BrowserDebugWindow = Window & {
  advanceTime?: (ms: number) => void;
  render_game_to_text?: () => string;
  start_runtime_probe?: () => void;
  clear_runtime_probe?: () => void;
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
};
