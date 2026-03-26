import * as pc from 'playcanvas';
import {
  bindWindowEvent,
  installBrowserDebugBindings,
  requireBrowserCanvas
} from './browserRuntime';

export interface BrowserBootstrapBindings {
  runFrame: (dt: number) => void;
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

export const createBrowserApplication = (
  canvasElementId: string
): pc.Application => {
  const app = new pc.Application(requireBrowserCanvas(canvasElementId));
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  bindWindowEvent('resize', () => app.resizeCanvas());
  return app;
};

export const wireBrowserRuntime = (
  app: pc.Application,
  bindings: BrowserBootstrapBindings
): void => {
  app.on('update', bindings.runFrame);
  installBrowserDebugBindings({
    advanceTime(ms) {
      const fixedStepSeconds = 1 / 60;
      const steps = Math.max(1, Math.round(ms / (fixedStepSeconds * 1000)));
      for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
        bindings.runFrame(fixedStepSeconds);
      }
    },
    renderGameToText: bindings.renderGameToText,
    startRuntimeProbe: bindings.startRuntimeProbe,
    clearRuntimeProbe: bindings.clearRuntimeProbe,
    resetRuntimeValidationState: bindings.resetRuntimeValidationState,
    runCleanRuntimeProbe: bindings.runCleanRuntimeProbe,
    runCleanRuntimeDefenderProbe: bindings.runCleanRuntimeDefenderProbe,
    runStructureToClosureSmoke: bindings.runStructureToClosureSmoke,
    runDefenderResponseRecoverySmoke: bindings.runDefenderResponseRecoverySmoke,
    runFullRuntimeValidationCycle: bindings.runFullRuntimeValidationCycle
  });
};
