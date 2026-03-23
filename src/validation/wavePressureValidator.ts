import * as pc from 'playcanvas';
import { layoutConfig } from '../config/layout';
import { type SceneRegistry } from '../scene/grayboxFactory';

export interface WavePressureDebugState {
  scenarioLabel: string;
  stageLabel: string;
  running: boolean;
  secondsToNextStage: number;
}

export interface WavePressureValidator {
  update(dt: number): void;
  getDebugState(): WavePressureDebugState;
  destroy(): void;
}

interface ScenarioStage {
  label: string;
  waveBlueX: number;
  waveRedX: number;
  showPushOne?: boolean;
  showPushTwo?: boolean;
  showHold?: boolean;
  showExposure?: boolean;
  showReclear?: boolean;
}

interface ScenarioDef {
  label: string;
  stageDurationSeconds: number;
  stages: ScenarioStage[];
}

interface MarkerSet {
  waveBlue: pc.Entity;
  waveRed: pc.Entity;
  pushBlueOne: pc.Entity;
  pushBlueTwo: pc.Entity;
  pushRedOne: pc.Entity;
  pushRedTwo: pc.Entity;
  holdBlue: pc.Entity;
  holdRed: pc.Entity;
  exposureBlue: pc.Entity;
  exposureRed: pc.Entity;
  reclearBlue: pc.Entity;
  reclearRed: pc.Entity;
}

const scenarios: ScenarioDef[] = [
  {
    label: 'Outer -> Inner Continuation',
    stageDurationSeconds: 2.75,
    stages: [
      { label: 'Post-Outer occupancy', waveBlueX: -44, waveRedX: 44 },
      { label: 'Inner choke pressure', waveBlueX: -59, waveRedX: 59 },
      { label: 'Inner tower setup window', waveBlueX: -74, waveRedX: 74, showPushOne: true }
    ]
  },
  {
    label: 'Inner -> Core Push Pressure',
    stageDurationSeconds: 2.75,
    stages: [
      { label: 'Inner siege hold', waveBlueX: -74, waveRedX: 74, showPushOne: true },
      { label: 'Core approach pressure', waveBlueX: -87, waveRedX: 87, showPushOne: true },
      { label: 'Core front commit', waveBlueX: -100, waveRedX: 100, showPushTwo: true, showExposure: true }
    ]
  },
  {
    label: 'Two-Wave Closure Attempt',
    stageDurationSeconds: 2.5,
    stages: [
      { label: 'Wave one occupies front', waveBlueX: -92, waveRedX: 92, showPushOne: true },
      { label: 'Defender holds and delays', waveBlueX: -100, waveRedX: 100, showHold: true },
      { label: 'Wave two commit window', waveBlueX: -98, waveRedX: 98, showPushTwo: true, showExposure: true },
      { label: 'Re-clear checkpoint', waveBlueX: -100, waveRedX: 100, showReclear: true, showExposure: true }
    ]
  },
  {
    label: 'Defender Hold / Re-clear',
    stageDurationSeconds: 2.5,
    stages: [
      { label: 'Hold line near core', waveBlueX: -106, waveRedX: 106, showHold: true },
      { label: 'Exposure to clear', waveBlueX: -98, waveRedX: 98, showExposure: true },
      { label: 'Fallback reset', waveBlueX: -110, waveRedX: 110, showHold: true },
      { label: 'Re-clear step out', waveBlueX: -100, waveRedX: 100, showReclear: true, showExposure: true }
    ]
  }
];

export const createWavePressureValidator = (
  registry: SceneRegistry
): WavePressureValidator => {
  const root = new pc.Entity('WavePressureValidationRoot');
  registry.debugRoot.addChild(root);

  const markerY = layoutConfig.elevations.laneTop + layoutConfig.elevations.markerLift + 0.03;
  const markers = createMarkers(root, markerY);

  let scenarioIndex = 0;
  let stageIndex = 0;
  let stageElapsed = 0;
  let running = false;

  applyStage();

  const keydown = (event: KeyboardEvent): void => {
    const key = normalizeKey(event.key);
    if (key === 'o') {
      running = !running;
      stageElapsed = 0;
      event.preventDefault();
      return;
    }

    if (key === 'i') {
      scenarioIndex = (scenarioIndex + 1) % scenarios.length;
      stageIndex = 0;
      stageElapsed = 0;
      applyStage();
      event.preventDefault();
      return;
    }

    if (key === 'k') {
      stageIndex = 0;
      stageElapsed = 0;
      applyStage();
      event.preventDefault();
    }
  };

  window.addEventListener('keydown', keydown);

  return {
    update(dt) {
      if (!running) {
        return;
      }

      const scenario = scenarios[scenarioIndex];
      stageElapsed += dt;
      if (stageElapsed < scenario.stageDurationSeconds) {
        return;
      }

      stageElapsed = 0;
      stageIndex = (stageIndex + 1) % scenario.stages.length;
      applyStage();
    },
    getDebugState() {
      const scenario = scenarios[scenarioIndex];
      const stage = scenario.stages[stageIndex];
      const secondsToNextStage = running
        ? Math.max(0, scenario.stageDurationSeconds - stageElapsed)
        : scenario.stageDurationSeconds;

      return {
        scenarioLabel: scenario.label,
        stageLabel: stage.label,
        running,
        secondsToNextStage
      };
    },
    destroy() {
      window.removeEventListener('keydown', keydown);
      root.destroy();
    }
  };

  function applyStage(): void {
    const scenario = scenarios[scenarioIndex];
    const stage = scenario.stages[stageIndex];

    markers.waveBlue.setPosition(stage.waveBlueX, markerY + 0.05, 0);
    markers.waveRed.setPosition(stage.waveRedX, markerY + 0.05, 0);
    markers.waveBlue.enabled = true;
    markers.waveRed.enabled = true;

    markers.pushBlueOne.enabled = !!stage.showPushOne;
    markers.pushRedOne.enabled = !!stage.showPushOne;
    markers.pushBlueTwo.enabled = !!stage.showPushTwo;
    markers.pushRedTwo.enabled = !!stage.showPushTwo;
    markers.holdBlue.enabled = !!stage.showHold;
    markers.holdRed.enabled = !!stage.showHold;
    markers.exposureBlue.enabled = !!stage.showExposure;
    markers.exposureRed.enabled = !!stage.showExposure;
    markers.reclearBlue.enabled = !!stage.showReclear;
    markers.reclearRed.enabled = !!stage.showReclear;
  }
};

const createMarkers = (parent: pc.Entity, markerY: number): MarkerSet => {
  const occupancyMaterial = createMaterial('#d34f4f');
  const pushMaterial = createMaterial('#bd8745');
  const holdMaterial = createMaterial('#4f7cc2');
  const exposureMaterial = createMaterial('#8d5d35');
  const reclearMaterial = createMaterial('#6e767f');

  const waveBlue = createCylinderMarker(parent, 'WaveOccupancyBlue', occupancyMaterial, markerY);
  const waveRed = createCylinderMarker(parent, 'WaveOccupancyRed', occupancyMaterial, markerY);

  const pushBlueOne = createStripMarker(parent, 'PushWindowBlueOne', -92, 1.8, 10.4, pushMaterial, markerY);
  const pushBlueTwo = createStripMarker(parent, 'PushWindowBlueTwo', -98, 1.6, 10.4, pushMaterial, markerY);
  const pushRedOne = createStripMarker(parent, 'PushWindowRedOne', 92, 1.8, 10.4, pushMaterial, markerY);
  const pushRedTwo = createStripMarker(parent, 'PushWindowRedTwo', 98, 1.6, 10.4, pushMaterial, markerY);

  const holdBlue = createStripMarker(parent, 'DefenderHoldBlue', -106, 1.2, 12.2, holdMaterial, markerY);
  const holdRed = createStripMarker(parent, 'DefenderHoldRed', 106, 1.2, 12.2, holdMaterial, markerY);

  const exposureBlue = createStripMarker(parent, 'DefenderExposureBlue', -98, 1.2, 12.2, exposureMaterial, markerY);
  const exposureRed = createStripMarker(parent, 'DefenderExposureRed', 98, 1.2, 12.2, exposureMaterial, markerY);

  const reclearBlue = createStripMarker(parent, 'DefenderReclearBlue', -100, 1.2, 11.6, reclearMaterial, markerY);
  const reclearRed = createStripMarker(parent, 'DefenderReclearRed', 100, 1.2, 11.6, reclearMaterial, markerY);

  for (const marker of [
    pushBlueOne,
    pushBlueTwo,
    pushRedOne,
    pushRedTwo,
    holdBlue,
    holdRed,
    exposureBlue,
    exposureRed,
    reclearBlue,
    reclearRed
  ]) {
    marker.enabled = false;
  }

  return {
    waveBlue,
    waveRed,
    pushBlueOne,
    pushBlueTwo,
    pushRedOne,
    pushRedTwo,
    holdBlue,
    holdRed,
    exposureBlue,
    exposureRed,
    reclearBlue,
    reclearRed
  };
};

const createStripMarker = (
  parent: pc.Entity,
  name: string,
  x: number,
  width: number,
  depth: number,
  material: pc.StandardMaterial,
  y: number
): pc.Entity => {
  const marker = new pc.Entity(name);
  marker.addComponent('render', {
    type: 'box',
    material
  });
  marker.setLocalScale(width, 0.1, depth);
  marker.setPosition(x, y, 0);
  parent.addChild(marker);
  return marker;
};

const createCylinderMarker = (
  parent: pc.Entity,
  name: string,
  material: pc.StandardMaterial,
  y: number
): pc.Entity => {
  const marker = new pc.Entity(name);
  marker.addComponent('render', {
    type: 'cylinder',
    material
  });
  marker.setLocalScale(2.2, 0.16, 2.2);
  marker.setPosition(0, y + 0.05, 0);
  parent.addChild(marker);
  return marker;
};

const createMaterial = (hexColor: string): pc.StandardMaterial => {
  const material = new pc.StandardMaterial();
  const color = hexToColor(hexColor);
  material.diffuse = color.clone();
  material.emissive = color.clone().mulScalar(0.12);
  material.gloss = 16;
  material.useMetalness = false;
  material.update();
  return material;
};

const hexToColor = (hexColor: string): pc.Color => {
  const normalized = hexColor.replace('#', '');
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;

  return new pc.Color(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    1
  );
};

const normalizeKey = (key: string): string =>
  key.length === 1 ? key.toLowerCase() : key.toLowerCase();
