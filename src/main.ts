import * as pc from 'playcanvas';
import './styles.css';
import { createDebugSystem } from './debug/debugBuilder';
import { createPlayerTestController } from './player/playerTestController';
import { buildGrayboxScene } from './scene/buildGrayboxScene';
import { createLiveInteractionValidator } from './validation/liveInteractionValidator';
import { createTempoHarness } from './validation/tempoHarness';
import { createWavePressureValidator } from './validation/wavePressureValidator';

const canvas = document.getElementById('application-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing application canvas.');
}

const app = new pc.Application(canvas);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

window.addEventListener('resize', () => app.resizeCanvas());

const registry = buildGrayboxScene(app);
const liveInteractionValidator = createLiveInteractionValidator();
const liveInteractionControls = liveInteractionValidator.getCalibrationOperatorControls();
const debugSystem = createDebugSystem(registry);
const playerController = createPlayerTestController(app, registry, debugSystem);
const tempoHarness = createTempoHarness();
const wavePressureValidator = createWavePressureValidator(registry);

app.on('update', (dt: number) => {
  playerController.update(dt);
  liveInteractionValidator.update(dt);
  tempoHarness.update(dt);
  wavePressureValidator.update(dt);
  debugSystem.update({
    playerPosition: playerController.getPlayerPosition(),
    camera: playerController.getActiveCamera(),
    cameraLabel: playerController.getCameraLabel(),
    tacticalModeLabel: playerController.getTacticalModeLabel(),
    activeProbeRouteId: playerController.getProbeRouteId(),
    probeElapsedSeconds: playerController.getProbeElapsedSeconds(),
    liveInteraction: liveInteractionValidator.getDebugState(),
    liveInteractionControls,
    tempo: tempoHarness.getDebugState(),
    wavePressure: wavePressureValidator.getDebugState()
  });
});

app.start();
