import * as pc from 'playcanvas';
import { layoutConfig } from '../config/layout';
import { type HeadlessCombatRuntimeSnapshot } from '../gameplay/headlessCombatRuntime';
import { type LivePrototypeSignalProviderDebugState } from '../gameplay/livePrototypeSignalProvider';
import {
  colorFromHex,
  surfaceHeightAt,
  type SceneRegistry
} from '../scene/grayboxFactory';
import { presentationTuning } from './presentationTuning';

type PresentationSignals = Pick<
  LivePrototypeSignalProviderDebugState,
  | 'sharedSiegeWindow'
  | 'sharedStructureConversion'
  | 'sharedClosureAdvancement'
  | 'sharedDefenderResponse'
  | 'sharedPushReassertion'
>;

export interface AuthoritativePresentationShellInput {
  combat: HeadlessCombatRuntimeSnapshot;
  signals: PresentationSignals;
}

export interface AuthoritativePresentationShellDebugState {
  castPulseActive: boolean;
  impactPulseActive: boolean;
  targetCueActive: boolean;
  targetCueState: 'hidden' | 'in-range' | 'cooldown' | 'out-of-range';
  defenderCueActive: boolean;
  pushCueActive: boolean;
  sourceTier: 'outer' | 'inner' | 'core';
  sourceSegment: 'outer-front' | 'inner-siege' | 'core-approach';
  siegeLevel: number;
  structureLevel: number;
  closureLevel: number;
}

export interface AuthoritativePresentationShell {
  update(dt: number, input: AuthoritativePresentationShellInput): void;
  getDebugState(): AuthoritativePresentationShellDebugState;
  destroy(): void;
}

interface PulseState {
  remainingSeconds: number;
  durationSeconds: number;
  start: pc.Vec3;
  end: pc.Vec3;
}

interface CueMaterialBinding {
  material: pc.StandardMaterial;
  color: pc.Color;
}

interface DiscCueScale {
  radius: number;
  thickness: number;
}

interface FocusMarkerCue {
  root: pc.Entity;
}

interface TargetHealthStripCue {
  root: pc.Entity;
  fill: pc.Entity;
}

type TargetabilityCueState =
  | 'hidden'
  | 'in-range'
  | 'cooldown'
  | 'out-of-range';

type RangeEnvelopeCueState =
  | 'hidden'
  | 'in-range'
  | 'out-of-range';

type PresentationTier = keyof typeof presentationTuning.indicatorBar.tierOffsets;

function toVec3(offset: { x: number; y: number; z: number }): pc.Vec3 {
  return new pc.Vec3(offset.x, offset.y, offset.z);
}

const indicatorOffsetByTier: Record<PresentationTier, pc.Vec3> = {
  outer: toVec3(presentationTuning.indicatorBar.tierOffsets.outer),
  inner: toVec3(presentationTuning.indicatorBar.tierOffsets.inner),
  core: toVec3(presentationTuning.indicatorBar.tierOffsets.core)
};

export const createAuthoritativePresentationShell = (
  registry: SceneRegistry
): AuthoritativePresentationShell => {
  const root = new pc.Entity('AuthoritativePresentationShellRoot');
  registry.root.addChild(root);

  const castMaterial = createCueMaterial(presentationTuning.materials.cast);
  const impactMaterial = createCueMaterial(presentationTuning.materials.impact);
  const defenderMaterial = createCueMaterial(presentationTuning.materials.defender);
  const pushMaterial = createCueMaterial(presentationTuning.materials.push);
  const siegeMaterial = createCueMaterial(presentationTuning.materials.siege);
  const structureMaterial = createCueMaterial(
    presentationTuning.materials.structure
  );
  const closureMaterial = createCueMaterial(presentationTuning.materials.closure);

  const castPulse = createSphereCue(
    'CastPulseCue',
    castMaterial.material,
    root,
    presentationTuning.castPulse.diameter
  );
  const targetabilityMaterial = createCueMaterial(
    presentationTuning.targetabilityCue.states.outOfRange
  );
  const impactPulse = createSphereCue(
    'ImpactPulseCue',
    impactMaterial.material,
    root,
    presentationTuning.impactPulse.diameter
  );
  const defenderCue = createDiscCue(
    'DefenderContestCue',
    defenderMaterial.material,
    root,
    {
      radius: presentationTuning.contestCue.diameter,
      thickness: presentationTuning.contestCue.thickness
    }
  );
  const pushCue = createDiscCue(
    'PushReassertionCue',
    pushMaterial.material,
    root,
    {
      radius: presentationTuning.contestCue.diameter,
      thickness: presentationTuning.contestCue.thickness
    }
  );
  const targetabilityCue = createDiscCue(
    'TargetabilityCue',
    targetabilityMaterial.material,
    root,
    {
      radius: presentationTuning.targetabilityCue.radiusClamp.max,
      thickness: presentationTuning.targetabilityCue.thickness
    }
  );
  const rangeEnvelopeMaterial = createCueMaterial(
    presentationTuning.targetabilityCue.states.outOfRange
  );
  const rangeEnvelopeCue = createDiscCue(
    'TargetabilityEnvelopeCue',
    rangeEnvelopeMaterial.material,
    root,
    {
      radius: 0,
      thickness: presentationTuning.targetabilityCue.envelopeThickness
    }
  );
  const targetFocusMaterial = createCueMaterial(
    presentationTuning.targetabilityCue.states.outOfRange
  );
  const targetFocusCue = createTargetFocusCue(
    'TargetFocusCue',
    targetFocusMaterial.material,
    root
  );
  const targetHealthStripBackplateMaterial = createCueMaterial(
    presentationTuning.targetabilityCue.healthStripBackplate
  );
  const targetHealthStripFillMaterial = createCueMaterial(
    presentationTuning.targetabilityCue.healthStripFill
  );
  const targetHealthStripCue = createTargetHealthStripCue(
    'TargetHealthStripCue',
    targetHealthStripBackplateMaterial.material,
    targetHealthStripFillMaterial.material,
    root
  );

  const indicatorRoot = new pc.Entity('MacroIndicatorRoot');
  root.addChild(indicatorRoot);
  const siegeIndicator = createIndicatorBar(
    'SiegeWindowIndicator',
    siegeMaterial.material,
    indicatorRoot,
    presentationTuning.indicatorBar.localOffsetX.siege
  );
  const structureIndicator = createIndicatorBar(
    'StructureConversionIndicator',
    structureMaterial.material,
    indicatorRoot,
    presentationTuning.indicatorBar.localOffsetX.structure
  );
  const closureIndicator = createIndicatorBar(
    'ClosureAdvancementIndicator',
    closureMaterial.material,
    indicatorRoot,
    presentationTuning.indicatorBar.localOffsetX.closure
  );

  let castPulseState = createEmptyPulseState(
    presentationTuning.castPulse.durationSeconds
  );
  let impactPulseState = createEmptyPulseState(
    presentationTuning.impactPulse.durationSeconds
  );
  let previousCastCooldownRemaining: number | null = null;
  let debugState: AuthoritativePresentationShellDebugState = {
    castPulseActive: false,
    impactPulseActive: false,
    targetCueActive: false,
    targetCueState: 'hidden',
    defenderCueActive: false,
    pushCueActive: false,
    sourceTier: 'outer',
    sourceSegment: 'outer-front',
    siegeLevel: 0,
    structureLevel: 0,
    closureLevel: 0
  };

  return {
    update(dt, input) {
      const step = Math.max(0, dt);
      const anchor = resolvePresentationAnchor(registry, input);
      const surfaceHeight =
        surfaceHeightAt(registry.walkAreas, anchor.x, anchor.z) ??
        layoutConfig.elevations.laneTop;
      const anchorWorld = new pc.Vec3(anchor.x, surfaceHeight, anchor.z);

      const latestCastCooldown =
        input.combat.lastResolvedCast?.success === true
          ? input.combat.lastResolvedCast.cooldownRemaining
          : null;
      if (
        latestCastCooldown !== null &&
        (previousCastCooldownRemaining === null ||
          latestCastCooldown >
            previousCastCooldownRemaining +
              presentationTuning.castPulse.cooldownResetThreshold)
      ) {
        const playerWorld = toWorldPoint(
          registry,
          input.combat.player.position.x,
          input.combat.player.position.z,
          layoutConfig.player.height *
            presentationTuning.castPulse.playerHeightFactor
        );
        const targetWorld = toWorldPoint(
          registry,
          input.combat.target.position.x,
          input.combat.target.position.z,
          layoutConfig.player.height *
            presentationTuning.castPulse.targetHeightFactor
        );
        castPulseState = createPulseState(
          presentationTuning.castPulse.durationSeconds,
          playerWorld,
          targetWorld
        );
        impactPulseState = createPulseState(
          presentationTuning.impactPulse.durationSeconds,
          targetWorld,
          targetWorld
        );
      }
      previousCastCooldownRemaining = latestCastCooldown;

      castPulseState.remainingSeconds = Math.max(
        0,
        castPulseState.remainingSeconds - step
      );
      impactPulseState.remainingSeconds = Math.max(
        0,
        impactPulseState.remainingSeconds - step
      );

      updateCastPulseCue(castPulse, castMaterial, castPulseState);
      updateImpactPulseCue(impactPulse, impactMaterial, impactPulseState);
      const targetabilityCueState = deriveTargetabilityCueState(input.combat);
      const rangeEnvelopeCueState = deriveRangeEnvelopeCueState(input.combat);
      updateTargetabilityCue(
        targetabilityCue,
        targetabilityMaterial,
        registry,
        input.combat,
        targetabilityCueState
      );
      updateRangeEnvelopeCue(
        rangeEnvelopeCue,
        rangeEnvelopeMaterial,
        registry,
        input.combat,
        rangeEnvelopeCueState
      );
      updateTargetFocusCue(
        targetFocusCue,
        targetFocusMaterial,
        registry,
        input.combat,
        rangeEnvelopeCueState
      );
      updateTargetHealthStripCue(
        targetHealthStripCue,
        targetHealthStripBackplateMaterial,
        targetHealthStripFillMaterial,
        registry,
        input.combat
      );
      updateContestCue(
        defenderCue,
        defenderMaterial,
        anchorWorld,
        input.signals.sharedDefenderResponse.responseActive,
        input.signals.sharedDefenderResponse.responseRemainingSeconds,
        input.signals.sharedDefenderResponse.structureConversionSuppression,
        presentationTuning.contestCue.heightOffsets.defender
      );
      updateContestCue(
        pushCue,
        pushMaterial,
        anchorWorld,
        input.signals.sharedPushReassertion.recoveryActive,
        input.signals.sharedPushReassertion.recoveryRemainingSeconds,
        input.signals.sharedPushReassertion.structureSuppressionRecovery,
        presentationTuning.contestCue.heightOffsets.push
      );

      const indicatorBase = anchorWorld
        .clone()
        .add(getIndicatorOffset(input.signals.sharedSiegeWindow.sourceTier));
      indicatorRoot.setPosition(indicatorBase);

      const siegeLevel = input.signals.sharedSiegeWindow.siegeWindowActive
        ? Math.max(
            input.signals.sharedSiegeWindow.pressureSupportLevel,
            input.signals.sharedSiegeWindow.occupancySupportLevel
          )
        : 0;
      const structureLevel =
        input.signals.sharedStructureConversion.conversionThreshold > 0
          ? input.signals.sharedStructureConversion.conversionProgress /
            input.signals.sharedStructureConversion.conversionThreshold
          : 0;
      const closureLevel =
        input.signals.sharedClosureAdvancement.lastResolvedClosureStep !== 'none'
          ? 1
          : clamp(
              input.signals.sharedClosureAdvancement.closureAdvancementValue /
                presentationTuning.closureLevelNormalizationThreshold,
              0,
              1
            );

      updateIndicatorBar(siegeIndicator, siegeMaterial, siegeLevel);
      updateIndicatorBar(
        structureIndicator,
        structureMaterial,
        clamp(structureLevel, 0, 1)
      );
      updateIndicatorBar(
        closureIndicator,
        closureMaterial,
        clamp(closureLevel, 0, 1)
      );
      indicatorRoot.enabled =
        siegeLevel > 0 ||
        structureLevel > 0 ||
        closureLevel > 0 ||
        input.combat.target.alive;

      debugState = {
        castPulseActive: castPulse.enabled,
        impactPulseActive: impactPulse.enabled,
        targetCueActive: targetabilityCue.enabled,
        targetCueState: targetabilityCueState,
        defenderCueActive: defenderCue.enabled,
        pushCueActive: pushCue.enabled,
        sourceTier: input.signals.sharedSiegeWindow.sourceTier,
        sourceSegment: input.signals.sharedSiegeWindow.sourceSegment,
        siegeLevel: clamp(siegeLevel, 0, 1),
        structureLevel: clamp(structureLevel, 0, 1),
        closureLevel: clamp(closureLevel, 0, 1)
      };
    },
    getDebugState() {
      return {
        ...debugState
      };
    },
    destroy() {
      root.destroy();
    }
  };
};

const createCueMaterial = (config: {
  hex: string;
  emissive: number;
  opacity: number;
}): CueMaterialBinding => {
  const material = new pc.StandardMaterial();
  const color = colorFromHex(config.hex);
  material.diffuse = color.clone();
  material.emissive = color.clone().mulScalar(config.emissive);
  material.opacity = config.opacity;
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.gloss = 18;
  material.useMetalness = false;
  material.update();
  return {
    material,
    color
  };
};

const createSphereCue = (
  name: string,
  material: pc.StandardMaterial,
  parent: pc.Entity,
  diameter: number
): pc.Entity => {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'sphere',
    material
  });
  entity.setLocalScale(diameter, diameter, diameter);
  entity.enabled = false;
  parent.addChild(entity);
  return entity;
};

const createDiscCue = (
  name: string,
  material: pc.StandardMaterial,
  parent: pc.Entity,
  scale: DiscCueScale
): pc.Entity => {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'cylinder',
    material
  });
  entity.setLocalScale(scale.radius, scale.thickness, scale.radius);
  entity.enabled = false;
  parent.addChild(entity);
  return entity;
};

const createTargetFocusCue = (
  name: string,
  material: pc.StandardMaterial,
  parent: pc.Entity
): FocusMarkerCue => {
  const root = new pc.Entity(name);
  root.enabled = false;
  parent.addChild(root);

  const leftArm = createFocusMarkerArm('LeftArm', material, root);
  leftArm.setLocalPosition(
    -presentationTuning.targetabilityCue.focusMarkerArmOffsetX,
    0,
    0
  );
  leftArm.setLocalEulerAngles(
    0,
    0,
    presentationTuning.targetabilityCue.focusMarkerArmAngleDegrees
  );

  const rightArm = createFocusMarkerArm('RightArm', material, root);
  rightArm.setLocalPosition(
    presentationTuning.targetabilityCue.focusMarkerArmOffsetX,
    0,
    0
  );
  rightArm.setLocalEulerAngles(
    0,
    0,
    -presentationTuning.targetabilityCue.focusMarkerArmAngleDegrees
  );

  return { root };
};

const createTargetHealthStripCue = (
  name: string,
  backplateMaterial: pc.StandardMaterial,
  fillMaterial: pc.StandardMaterial,
  parent: pc.Entity
): TargetHealthStripCue => {
  const root = new pc.Entity(name);
  root.enabled = false;
  parent.addChild(root);

  const backplate = new pc.Entity('Backplate');
  backplate.addComponent('render', {
    type: 'box',
    material: backplateMaterial
  });
  backplate.setLocalScale(
    presentationTuning.targetabilityCue.healthStripWidth,
    presentationTuning.targetabilityCue.healthStripHeight,
    presentationTuning.targetabilityCue.healthStripDepth
  );
  root.addChild(backplate);

  const fill = new pc.Entity('Fill');
  fill.addComponent('render', {
    type: 'box',
    material: fillMaterial
  });
  root.addChild(fill);

  return { root, fill };
};

const createFocusMarkerArm = (
  name: string,
  material: pc.StandardMaterial,
  parent: pc.Entity
): pc.Entity => {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'box',
    material
  });
  entity.setLocalScale(
    presentationTuning.targetabilityCue.focusMarkerArmLength,
    presentationTuning.targetabilityCue.focusMarkerArmThickness,
    presentationTuning.targetabilityCue.focusMarkerArmDepth
  );
  parent.addChild(entity);
  return entity;
};

const createIndicatorBar = (
  name: string,
  material: pc.StandardMaterial,
  parent: pc.Entity,
  offsetX: number
): pc.Entity => {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type: 'box',
    material
  });
  entity.setLocalPosition(offsetX, presentationTuning.indicatorBar.baseHeight, 0);
  entity.setLocalScale(
    presentationTuning.indicatorBar.width,
    presentationTuning.indicatorBar.baseHeight,
    presentationTuning.indicatorBar.width
  );
  parent.addChild(entity);
  return entity;
};

const updateCastPulseCue = (
  entity: pc.Entity,
  material: CueMaterialBinding,
  pulse: PulseState
): void => {
  if (pulse.remainingSeconds <= 0) {
    entity.enabled = false;
    return;
  }

  const normalized = 1 - pulse.remainingSeconds / pulse.durationSeconds;
  const position = lerpVec3(pulse.start, pulse.end, normalized);
  entity.enabled = true;
  entity.setPosition(position);
  const scale = lerpNumber(
    presentationTuning.castPulse.scaleRange.max,
    presentationTuning.castPulse.scaleRange.min,
    normalized
  );
  entity.setLocalScale(scale, scale, scale);
  applyMaterialState(
    material,
    lerpNumber(
      presentationTuning.castPulse.emissiveRange.max,
      presentationTuning.castPulse.emissiveRange.min,
      normalized
    ),
    presentationTuning.materials.cast.opacity
  );
};

const updateImpactPulseCue = (
  entity: pc.Entity,
  material: CueMaterialBinding,
  pulse: PulseState
): void => {
  if (pulse.remainingSeconds <= 0) {
    entity.enabled = false;
    return;
  }

  const normalized = 1 - pulse.remainingSeconds / pulse.durationSeconds;
  entity.enabled = true;
  entity.setPosition(pulse.end);
  const scale = lerpNumber(
    presentationTuning.impactPulse.scaleRange.min,
    presentationTuning.impactPulse.scaleRange.max,
    normalized
  );
  entity.setLocalScale(scale, scale, scale);
  applyMaterialState(
    material,
    lerpNumber(
      presentationTuning.impactPulse.emissiveRange.max,
      presentationTuning.impactPulse.emissiveRange.min,
      normalized
    ),
    lerpNumber(
      presentationTuning.impactPulse.opacityRange.max,
      presentationTuning.impactPulse.opacityRange.min,
      normalized
    )
  );
};

const updateTargetabilityCue = (
  entity: pc.Entity,
  material: CueMaterialBinding,
  registry: SceneRegistry,
  combat: HeadlessCombatRuntimeSnapshot,
  state: TargetabilityCueState
): void => {
  if (state === 'hidden') {
    entity.enabled = false;
    return;
  }

  entity.enabled = true;
  const targetWorld = toWorldPoint(
    registry,
    combat.target.position.x,
    combat.target.position.z,
    presentationTuning.targetabilityCue.heightOffset
  );
  const radius = clamp(
    combat.target.bodyRadius *
      presentationTuning.targetabilityCue.radiusBodyMultiplier,
    presentationTuning.targetabilityCue.radiusClamp.min,
    presentationTuning.targetabilityCue.radiusClamp.max
  );
  entity.setPosition(targetWorld);
  entity.setLocalScale(
    radius,
    presentationTuning.targetabilityCue.thickness,
    radius
  );

  const stateStyle = getTargetabilityCueStyle(
    state,
    combat.lastLegalityFailureReason === 'out-of-range'
  );
  applyMaterialState(
    material,
    stateStyle.emissive,
    stateStyle.opacity,
    stateStyle.hex
  );
};

const updateRangeEnvelopeCue = (
  entity: pc.Entity,
  material: CueMaterialBinding,
  registry: SceneRegistry,
  combat: HeadlessCombatRuntimeSnapshot,
  state: RangeEnvelopeCueState
): void => {
  if (state === 'hidden') {
    entity.enabled = false;
    return;
  }

  entity.enabled = true;
  const targetWorld = toWorldPoint(
    registry,
    combat.target.position.x,
    combat.target.position.z,
    presentationTuning.targetabilityCue.envelopeHeightOffset
  );
  const envelopeDiameter = getCastLegalityDistance(combat) * 2;
  const stateStyle = getTargetabilityCueStyle(
    state,
    combat.lastLegalityFailureReason === 'out-of-range'
  );

  entity.setPosition(targetWorld);
  entity.setLocalScale(
    envelopeDiameter,
    presentationTuning.targetabilityCue.envelopeThickness,
    envelopeDiameter
  );
  applyMaterialState(
    material,
    stateStyle.emissive *
      presentationTuning.targetabilityCue.envelopeEmissiveScale,
    stateStyle.opacity * presentationTuning.targetabilityCue.envelopeOpacityScale,
    stateStyle.hex
  );
};

const updateTargetFocusCue = (
  cue: FocusMarkerCue,
  material: CueMaterialBinding,
  registry: SceneRegistry,
  combat: HeadlessCombatRuntimeSnapshot,
  state: RangeEnvelopeCueState
): void => {
  if (state === 'hidden') {
    cue.root.enabled = false;
    return;
  }

  cue.root.enabled = true;
  cue.root.setPosition(
    toWorldPoint(
      registry,
      combat.target.position.x,
      combat.target.position.z,
      combat.target.bodyRadius *
        presentationTuning.targetabilityCue.focusMarkerHeightBodyMultiplier
    )
  );

  const stateStyle = getTargetabilityCueStyle(
    state,
    combat.lastLegalityFailureReason === 'out-of-range'
  );
  applyMaterialState(
    material,
    stateStyle.emissive *
      presentationTuning.targetabilityCue.focusMarkerEmissiveScale,
    stateStyle.opacity * presentationTuning.targetabilityCue.focusMarkerOpacityScale,
    stateStyle.hex
  );
};

const updateTargetHealthStripCue = (
  cue: TargetHealthStripCue,
  backplateMaterial: CueMaterialBinding,
  fillMaterial: CueMaterialBinding,
  registry: SceneRegistry,
  combat: HeadlessCombatRuntimeSnapshot
): void => {
  if (!combat.player.alive || !combat.target.alive) {
    cue.root.enabled = false;
    return;
  }

  cue.root.enabled = true;
  cue.root.setPosition(
    toWorldPoint(
      registry,
      combat.target.position.x,
      combat.target.position.z,
      combat.target.bodyRadius *
        presentationTuning.targetabilityCue.healthStripHeightBodyMultiplier
    )
  );

  const fillRatio = clamp(
    combat.target.maxHp > 0
      ? combat.target.currentHp / combat.target.maxHp
      : 0,
    0,
    1
  );
  const fillWidth =
    presentationTuning.targetabilityCue.healthStripWidth -
    presentationTuning.targetabilityCue.healthStripFillInset * 2;
  const fillHeight =
    presentationTuning.targetabilityCue.healthStripHeight -
    presentationTuning.targetabilityCue.healthStripFillInset * 2;
  const fillDepth =
    presentationTuning.targetabilityCue.healthStripDepth -
    presentationTuning.targetabilityCue.healthStripFillInset * 2;
  const scaledFillWidth = fillWidth * fillRatio;
  const leftEdgeOffset =
    -presentationTuning.targetabilityCue.healthStripWidth * 0.5 +
    presentationTuning.targetabilityCue.healthStripFillInset +
    scaledFillWidth * 0.5;

  cue.fill.setLocalScale(
    scaledFillWidth,
    Math.max(fillHeight, 0.01),
    Math.max(fillDepth, 0.01)
  );
  cue.fill.setLocalPosition(leftEdgeOffset, 0, 0);

  applyMaterialState(
    backplateMaterial,
    presentationTuning.targetabilityCue.healthStripBackplate.emissive,
    presentationTuning.targetabilityCue.healthStripBackplate.opacity,
    presentationTuning.targetabilityCue.healthStripBackplate.hex
  );
  applyMaterialState(
    fillMaterial,
    presentationTuning.targetabilityCue.healthStripFill.emissive,
    presentationTuning.targetabilityCue.healthStripFill.opacity,
    presentationTuning.targetabilityCue.healthStripFill.hex
  );
};

const updateContestCue = (
  entity: pc.Entity,
  material: CueMaterialBinding,
  anchorWorld: pc.Vec3,
  active: boolean,
  remainingSeconds: number,
  strength: number,
  heightOffset: number
): void => {
  if (!active) {
    entity.enabled = false;
    return;
  }

  entity.enabled = true;
  entity.setPosition(anchorWorld.x, anchorWorld.y + heightOffset, anchorWorld.z);
  const radius = clamp(
    presentationTuning.contestCue.radiusBase +
      strength * presentationTuning.contestCue.strengthRadiusMultiplier +
      remainingSeconds *
        presentationTuning.contestCue.remainingSecondsRadiusMultiplier,
    presentationTuning.contestCue.radiusClamp.min,
    presentationTuning.contestCue.radiusClamp.max
  );
  entity.setLocalScale(radius, presentationTuning.contestCue.thickness, radius);
  applyMaterialState(
    material,
    clamp(
      presentationTuning.contestCue.emissiveBase +
        strength * presentationTuning.contestCue.emissiveStrengthMultiplier,
      presentationTuning.contestCue.emissiveClamp.min,
      presentationTuning.contestCue.emissiveClamp.max
    ),
    clamp(
      presentationTuning.contestCue.opacityBase +
        remainingSeconds *
          presentationTuning.contestCue.opacityRemainingSecondsMultiplier,
      presentationTuning.contestCue.opacityClamp.min,
      presentationTuning.contestCue.opacityClamp.max
    )
  );
};

const updateIndicatorBar = (
  entity: pc.Entity,
  material: CueMaterialBinding,
  level: number
): void => {
  const clampedLevel = clamp(level, 0, 1);
  const height = lerpNumber(
    presentationTuning.indicatorBar.levelHeightRange.min,
    presentationTuning.indicatorBar.levelHeightRange.max,
    clampedLevel
  );
  entity.setLocalScale(
    presentationTuning.indicatorBar.width,
    height,
    presentationTuning.indicatorBar.width
  );
  const position = entity.getLocalPosition();
  entity.setLocalPosition(position.x, height * 0.5, position.z);
  applyMaterialState(
    material,
    lerpNumber(
      presentationTuning.indicatorBar.emissiveRange.min,
      presentationTuning.indicatorBar.emissiveRange.max,
      clampedLevel
    ),
    lerpNumber(
      presentationTuning.indicatorBar.opacityRange.min,
      presentationTuning.indicatorBar.opacityRange.max,
      clampedLevel
    )
  );
};

const resolvePresentationAnchor = (
  registry: SceneRegistry,
  input: AuthoritativePresentationShellInput
): { x: number; z: number } => {
  const sourceTier =
    input.signals.sharedStructureConversion.sourceTier ??
    input.signals.sharedSiegeWindow.sourceTier;

  if (sourceTier === 'outer') {
    return {
      x: input.combat.target.position.x,
      z: input.combat.target.position.z
    };
  }

  const anchor =
    sourceTier === 'inner'
      ? registry.nodeAnchors.redInnerTower
      : registry.nodeAnchors.redCore;
  const anchorPosition = anchor?.getPosition();

  return {
    x: anchorPosition?.x ?? input.combat.target.position.x,
    z: anchorPosition?.z ?? input.combat.target.position.z
  };
};

const deriveTargetabilityCueState = (
  combat: HeadlessCombatRuntimeSnapshot
): TargetabilityCueState => {
  if (!combat.player.alive || !combat.target.alive) {
    return 'hidden';
  }

  if (!isTargetWithinCastRange(combat)) {
    return 'out-of-range';
  }

  if (combat.player.basicAbilityCooldownRemaining > 0) {
    return 'cooldown';
  }

  return 'in-range';
};

const deriveRangeEnvelopeCueState = (
  combat: HeadlessCombatRuntimeSnapshot
): RangeEnvelopeCueState =>
  !combat.player.alive || !combat.target.alive
    ? 'hidden'
    : isTargetWithinCastRange(combat)
      ? 'in-range'
      : 'out-of-range';

const getTargetabilityCueStyle = (
  state: Exclude<TargetabilityCueState, 'hidden'>,
  boostBlockedOutOfRange: boolean
): {
  hex: string;
  emissive: number;
  opacity: number;
} => {
  const baseStyle =
    state === 'in-range'
      ? presentationTuning.targetabilityCue.states.inRange
      : state === 'cooldown'
        ? presentationTuning.targetabilityCue.states.cooldown
        : presentationTuning.targetabilityCue.states.outOfRange;

  if (!boostBlockedOutOfRange || state !== 'out-of-range') {
    return baseStyle;
  }

  return {
    hex: baseStyle.hex,
    emissive:
      baseStyle.emissive +
      presentationTuning.targetabilityCue.states.blockedBoost.emissiveBonus,
    opacity:
      baseStyle.opacity +
      presentationTuning.targetabilityCue.states.blockedBoost.opacityBonus
  };
};

const isTargetWithinCastRange = (
  combat: HeadlessCombatRuntimeSnapshot
): boolean =>
  getTargetDistance(combat) <= getCastLegalityDistance(combat);

const getCastLegalityDistance = (
  combat: HeadlessCombatRuntimeSnapshot
): number =>
  combat.castRange + combat.player.bodyRadius + combat.target.bodyRadius;

const getTargetDistance = (combat: HeadlessCombatRuntimeSnapshot): number =>
  Math.hypot(
    combat.target.position.x - combat.player.position.x,
    combat.target.position.z - combat.player.position.z
  );

const getIndicatorOffset = (
  tier: PresentationTier
): pc.Vec3 => indicatorOffsetByTier[tier];

const createEmptyPulseState = (durationSeconds: number): PulseState => ({
  remainingSeconds: 0,
  durationSeconds,
  start: new pc.Vec3(),
  end: new pc.Vec3()
});

const createPulseState = (
  durationSeconds: number,
  start: pc.Vec3,
  end: pc.Vec3
): PulseState => ({
  remainingSeconds: durationSeconds,
  durationSeconds,
  start: start.clone(),
  end: end.clone()
});

const toWorldPoint = (
  registry: SceneRegistry,
  x: number,
  z: number,
  heightOffset: number
): pc.Vec3 => {
  const surfaceHeight =
    surfaceHeightAt(registry.walkAreas, x, z) ?? layoutConfig.elevations.laneTop;
  return new pc.Vec3(x, surfaceHeight + heightOffset, z);
};

const lerpVec3 = (start: pc.Vec3, end: pc.Vec3, t: number): pc.Vec3 =>
  new pc.Vec3(
    lerpNumber(start.x, end.x, t),
    lerpNumber(start.y, end.y, t),
    lerpNumber(start.z, end.z, t)
  );

const lerpNumber = (start: number, end: number, t: number): number =>
  start + (end - start) * clamp(t, 0, 1);

const applyMaterialState = (
  binding: CueMaterialBinding,
  emissiveScalar: number,
  opacity: number,
  hex?: string
): void => {
  if (hex) {
    const color = colorFromHex(hex);
    binding.color = color;
    binding.material.diffuse = color.clone();
  }

  binding.material.emissive = binding.color.clone().mulScalar(emissiveScalar);
  binding.material.opacity = opacity;
  binding.material.update();
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
