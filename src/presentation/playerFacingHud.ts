import { type HeadlessCombatRuntimeSnapshot } from '../gameplay/headlessCombatRuntime';
import { type LivePrototypeSignalProviderDebugState } from '../gameplay/livePrototypeSignalProvider';
import { presentationTuning } from './presentationTuning';

type HudSignals = Pick<
  LivePrototypeSignalProviderDebugState,
  | 'sharedSiegeWindow'
  | 'sharedStructureConversion'
  | 'sharedClosureAdvancement'
  | 'sharedDefenderResponse'
  | 'sharedPushReassertion'
>;

export interface PlayerFacingHudInput {
  combat: HeadlessCombatRuntimeSnapshot;
  signals: HudSignals;
}

export interface PlayerFacingHud {
  update(dt: number, input: PlayerFacingHudInput): void;
  destroy(): void;
}

interface HudChip {
  root: HTMLDivElement;
  value: HTMLSpanElement;
}

interface HudMeter {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  fill: HTMLDivElement;
}

interface HudStrip {
  root: HTMLDivElement;
  fill: HTMLDivElement;
}

type HudTone =
  | 'ready'
  | 'blocked'
  | 'active'
  | 'contest'
  | 'recovery'
  | 'resolved'
  | 'idle';

interface HudStatus {
  value: string;
  tone: HudTone;
}

interface HudMeterState {
  value: string;
  fraction: number;
  active: boolean;
}

interface HudStripState {
  visible: boolean;
  fraction: number;
}

interface AggregatedCombatHudStatuses {
  combat: HudStatus;
  next: HudStatus;
}

type AggregatedCombatState =
  | 'dead-actor'
  | 'cleared'
  | 'out-of-range'
  | 'cooldown'
  | 'in-range';

export const createPlayerFacingHud = (): PlayerFacingHud => {
  const root = document.createElement('div');
  root.id = 'player-hud-root';

  const panel = document.createElement('div');
  panel.className = 'player-hud';
  root.appendChild(panel);

  const vitalsRow = createRow();
  const focusRow = createRow();
  const topRow = createRow();
  const statusRow = createRow();
  const meterColumn = document.createElement('div');
  meterColumn.className = 'player-hud-meter-column';
  const abilityColumn = document.createElement('div');
  abilityColumn.className = 'player-hud-chip-column';

  const playerHealthStrip = createStrip('player-hud-player-health-fill');
  const abilityCooldownStrip = createStrip('player-hud-ability-cooldown-fill');
  const combatChip = createChip('Combat');
  const nextChip = createChip('Next');
  const abilityChip = createChip('Ability');
  const castChip = createChip('Cast');
  const lastCastChip = createChip('Last Cast');
  const targetChip = createChip('Target');
  const siegeChip = createChip('Siege');
  const contestChip = createChip('Contest');
  const recoveryChip = createChip('Recovery');
  const structureMeter = createMeter('Structure');
  const closureMeter = createMeter('Closure');

  vitalsRow.append(playerHealthStrip.root);
  abilityColumn.append(abilityChip.root, abilityCooldownStrip.root);
  focusRow.append(combatChip.root, nextChip.root);
  topRow.append(
    abilityColumn,
    castChip.root,
    lastCastChip.root,
    targetChip.root
  );
  statusRow.append(siegeChip.root, contestChip.root, recoveryChip.root);
  meterColumn.append(structureMeter.root, closureMeter.root);
  panel.append(vitalsRow, focusRow, topRow, statusRow, meterColumn);
  document.body.appendChild(root);

  return {
    update(_dt, input) {
      updateStrip(
        playerHealthStrip,
        derivePlayerHealthStripState(
          input.combat.player.alive,
          input.combat.player.currentHp,
          input.combat.player.maxHp
        )
      );
      const combatState = deriveAggregatedCombatState(input.combat);
      const combatHudStatuses = deriveAggregatedCombatHudStatuses(
        combatState,
        input.combat.player.basicAbilityCooldownRemaining
      );
      updateChip(
        combatChip,
        combatHudStatuses.combat
      );
      updateChip(nextChip, combatHudStatuses.next);
      updateChip(
        abilityChip,
        deriveAbilityStatus(input.combat.player.basicAbilityCooldownRemaining)
      );
      updateStrip(
        abilityCooldownStrip,
        deriveAbilityCooldownStripState(
          input.combat.player.alive,
          input.combat.player.basicAbilityCooldownRemaining
        )
      );
      updateChip(
        castChip,
        deriveCastStatus(
          input.combat.lastLegalityFailureReason,
          input.combat.lastResolvedCast,
          input.combat.player.basicAbilityCooldownRemaining
        )
      );
      updateChip(
        lastCastChip,
        deriveLastCastStatus(
          input.combat.lastResolvedCast
        )
      );
      lastCastChip.root.dataset.visible =
        input.combat.lastResolvedCast !== null ? 'true' : 'false';
      updateChip(
        targetChip,
        deriveTargetStatus(
          input.combat.target.alive,
          input.combat.target.currentHp,
          input.combat.target.maxHp
        )
      );
      updateChip(
        siegeChip,
        deriveSiegeStatus(
          input.signals.sharedSiegeWindow.siegeWindowActive,
          input.signals.sharedSiegeWindow.siegeWindowRemainingSeconds
        )
      );
      updateChip(
        contestChip,
        deriveTimedWindowStatus(
          input.signals.sharedDefenderResponse.responseActive,
          input.signals.sharedDefenderResponse.responseEligible,
          input.signals.sharedDefenderResponse.responseCooldownRemaining,
          'contest'
        )
      );
      updateChip(
        recoveryChip,
        deriveTimedWindowStatus(
          input.signals.sharedPushReassertion.recoveryActive,
          input.signals.sharedPushReassertion.recoveryEligible,
          input.signals.sharedPushReassertion.recoveryCooldownRemaining,
          'recovery'
        )
      );
      updateMeter(
        structureMeter,
        deriveStructureMeterState(input.signals.sharedStructureConversion)
      );
      updateMeter(
        closureMeter,
        deriveClosureMeterState(input.signals.sharedClosureAdvancement)
      );
    },
    destroy() {
      root.remove();
    }
  };
};

const createRow = (): HTMLDivElement => {
  const row = document.createElement('div');
  row.className = 'player-hud-row';
  return row;
};

const createChip = (label: string): HudChip => {
  const root = document.createElement('div');
  root.className = 'player-hud-chip';

  const labelElement = document.createElement('span');
  labelElement.className = 'player-hud-label';
  labelElement.textContent = label;

  const value = document.createElement('span');
  value.className = 'player-hud-value';

  root.append(labelElement, value);

  return { root, value };
};

const createStrip = (fillClassName: string): HudStrip => {
  const root = document.createElement('div');
  root.className = 'player-hud-strip';

  const track = document.createElement('div');
  track.className = 'player-hud-strip-track';

  const fill = document.createElement('div');
  fill.className = fillClassName;

  track.appendChild(fill);
  root.appendChild(track);

  return { root, fill };
};

const createMeter = (label: string): HudMeter => {
  const root = document.createElement('div');
  root.className = 'player-hud-meter';

  const header = document.createElement('div');
  header.className = 'player-hud-meter-header';

  const labelElement = document.createElement('span');
  labelElement.className = 'player-hud-label';
  labelElement.textContent = label;

  const value = document.createElement('span');
  value.className = 'player-hud-value';

  const track = document.createElement('div');
  track.className = 'player-hud-meter-track';

  const fill = document.createElement('div');
  fill.className = 'player-hud-meter-fill';

  track.appendChild(fill);
  header.append(labelElement, value);
  root.append(header, track);

  return { root, value, fill };
};

const updateChip = (
  chip: HudChip,
  status: HudStatus
): void => {
  chip.value.textContent = status.value;
  chip.root.dataset.tone = status.tone;
};

const updateMeter = (
  meter: HudMeter,
  state: HudMeterState
): void => {
  meter.value.textContent = state.value;
  meter.fill.style.transform = `scaleX(${clamp(state.fraction, 0, 1)})`;
  meter.root.dataset.active = state.active ? 'true' : 'false';
};

const updateStrip = (
  strip: HudStrip,
  state: HudStripState
): void => {
  strip.root.dataset.visible = state.visible ? 'true' : 'false';
  strip.fill.style.transform = `scaleX(${clamp(state.fraction, 0, 1)})`;
};

const derivePlayerHealthStripState = (
  alive: boolean,
  currentHp: number,
  maxHp: number
): HudStripState => ({
  visible: alive,
  fraction: alive && maxHp > 0 ? clamp(currentHp / maxHp, 0, 1) : 0
});

const deriveAbilityCooldownStripState = (
  alive: boolean,
  cooldownRemaining: number
): HudStripState => {
  if (!alive) {
    return {
      visible: false,
      fraction: 0
    };
  }

  if (cooldownRemaining <= 0) {
    return {
      visible: true,
      fraction: 1
    };
  }

  return {
    visible: true,
    fraction: 0
  };
};

const deriveAbilityStatus = (cooldownRemaining: number): HudStatus =>
  cooldownRemaining > 0
    ? buildCoolingStatus(cooldownRemaining, 'blocked')
    : {
        value: presentationTuning.hud.text.ready,
        tone: 'ready'
      };

const deriveAggregatedCombatState = (
  combat: HeadlessCombatRuntimeSnapshot
): AggregatedCombatState => {
  if (!combat.player.alive) {
    return 'dead-actor';
  }

  if (!combat.target.alive) {
    return 'cleared';
  }

  if (!isTargetWithinCastRange(combat)) {
    return 'out-of-range';
  }

  return combat.player.basicAbilityCooldownRemaining > 0
    ? 'cooldown'
    : 'in-range';
};

const deriveAggregatedCombatHudStatuses = (
  state: AggregatedCombatState,
  cooldownRemaining: number
): AggregatedCombatHudStatuses =>
  state === 'dead-actor'
    ? {
        combat: buildStaticStatus(
          presentationTuning.hud.castFailureReasons.deadActor,
          'blocked'
        ),
        next: buildStaticStatus(
          presentationTuning.hud.castFailureReasons.deadActor,
          'blocked'
        )
      }
    : state === 'cleared'
      ? {
          combat: buildStaticStatus(
            presentationTuning.hud.text.cleared,
            'resolved'
          ),
          next: buildStaticStatus(
            presentationTuning.hud.nextStep.targetCleared,
            'resolved'
          )
        }
      : state === 'out-of-range'
        ? {
            combat: buildStaticStatus(
              presentationTuning.hud.castFailureReasons.outOfRange,
              'blocked'
            ),
            next: buildStaticStatus(
              presentationTuning.hud.nextStep.moveIntoRange,
              'blocked'
            )
          }
        : state === 'cooldown'
          ? {
              combat: buildCoolingStatus(cooldownRemaining, 'blocked'),
              next: buildStaticStatus(
                `${presentationTuning.hud.nextStep.cooldownRecovering} ${formatSeconds(
                  cooldownRemaining
                )}`,
                'blocked'
              )
            }
          : {
              combat: buildStaticStatus(
                presentationTuning.hud.text.inRange,
                'ready'
              ),
              next: buildStaticStatus(
                presentationTuning.hud.nextStep.castNow,
                'ready'
              )
            };

const isTargetWithinCastRange = (
  combat: HeadlessCombatRuntimeSnapshot
): boolean => {
  const maxCastDistance =
    combat.castRange + combat.player.bodyRadius + combat.target.bodyRadius;
  const targetDistance = Math.hypot(
    combat.target.position.x - combat.player.position.x,
    combat.target.position.z - combat.player.position.z
  );

  return targetDistance <= maxCastDistance;
};

const deriveCastStatus = (
  lastLegalityFailureReason: HeadlessCombatRuntimeSnapshot['lastLegalityFailureReason'],
  lastResolvedCast: HeadlessCombatRuntimeSnapshot['lastResolvedCast'],
  cooldownRemaining: number
): HudStatus => {
  if (lastLegalityFailureReason !== 'none') {
    return {
      value: formatCastFailureReason(lastLegalityFailureReason),
      tone: 'blocked'
    };
  }

  if (lastResolvedCast?.success === false && lastResolvedCast.failureReason) {
    return {
      value: formatCastFailureReason(lastResolvedCast.failureReason),
      tone: 'blocked'
    };
  }

  if (cooldownRemaining > 0) {
    return {
      value: presentationTuning.hud.castFailureReasons.onCooldown,
      tone: 'blocked'
    };
  }

  return {
    value: presentationTuning.hud.text.legal,
    tone: 'ready'
  };
};

const deriveLastCastStatus = (
  lastResolvedCast: HeadlessCombatRuntimeSnapshot['lastResolvedCast']
): HudStatus => {
  if (!lastResolvedCast) {
    return buildStaticStatus(presentationTuning.hud.lastCast.none, 'idle');
  }

  if (lastResolvedCast.success && lastResolvedCast.targetAliveAfter === false) {
    return buildStaticStatus(
      presentationTuning.hud.lastCast.targetCleared,
      'resolved'
    );
  }

  if (lastResolvedCast.success) {
    return buildStaticStatus(
      presentationTuning.hud.lastCast.castCommitted,
      'ready'
    );
  }

  if (lastResolvedCast.failureReason === 'on-cooldown') {
    return buildStaticStatus(
      presentationTuning.hud.lastCast.cooldownRecovering,
      'blocked'
    );
  }

  if (!lastResolvedCast.failureReason) {
    return buildStaticStatus(
      presentationTuning.hud.lastCast.none,
      'idle'
    );
  }

  return buildStaticStatus(
    `${presentationTuning.hud.lastCast.blockedPrefix} ${formatCastFailureReason(
      lastResolvedCast.failureReason
    )}`,
    'blocked'
  );
};

const deriveTargetStatus = (
  alive: boolean,
  currentHp: number,
  maxHp: number
): HudStatus =>
  alive
    ? {
        value: `${currentHp}/${maxHp}`,
        tone: 'active'
      }
    : {
        value: presentationTuning.hud.text.cleared,
        tone: 'resolved'
      };

const deriveSiegeStatus = (
  active: boolean,
  remainingSeconds: number
): HudStatus =>
  active
    ? {
        value: `${presentationTuning.hud.text.open} ${formatSeconds(
          remainingSeconds
        )}`,
        tone: 'active'
      }
    : {
        value: presentationTuning.hud.text.closed,
        tone: 'idle'
      };

const deriveTimedWindowStatus = (
  active: boolean,
  eligible: boolean,
  cooldownRemaining: number,
  activeTone: Extract<HudTone, 'contest' | 'recovery'>
): HudStatus =>
  active
    ? {
        value: presentationTuning.hud.text.active,
        tone: activeTone
      }
    : cooldownRemaining > 0
      ? buildCoolingStatus(cooldownRemaining, eligible ? 'active' : 'idle')
      : {
          value: presentationTuning.hud.text.waiting,
          tone: eligible ? 'active' : 'idle'
        };

const deriveStructureMeterState = (
  structureConversion: HudSignals['sharedStructureConversion']
): HudMeterState => {
  if (structureConversion.lastResolvedStructureStep !== 'none') {
    return {
      value: structureConversion.lastResolvedStructureStep,
      fraction: presentationTuning.hud.resolvedFraction,
      active: true
    };
  }

  if (structureConversion.conversionActive) {
    return {
      value: `${structureConversion.conversionProgress.toFixed(2)} / ${structureConversion.conversionThreshold.toFixed(2)}`,
      fraction:
        structureConversion.conversionThreshold > 0
          ? structureConversion.conversionProgress /
            structureConversion.conversionThreshold
          : 0,
      active: true
    };
  }

  return {
    value: presentationTuning.hud.text.idle,
    fraction: 0,
    active: false
  };
};

const deriveClosureMeterState = (
  closureAdvancement: HudSignals['sharedClosureAdvancement']
): HudMeterState => {
  if (closureAdvancement.lastResolvedClosureStep !== 'none') {
    return {
      value: closureAdvancement.lastResolvedClosureStep,
      fraction: presentationTuning.hud.resolvedFraction,
      active: true
    };
  }

  if (closureAdvancement.closureAdvancementActive) {
    return {
      value: `${Math.round(
        closureAdvancement.readinessLevel *
          presentationTuning.hud.readinessPercentScale
      )}% ${presentationTuning.hud.text.readySuffix}`,
      fraction: closureAdvancement.readinessLevel,
      active: true
    };
  }

  return {
    value: presentationTuning.hud.text.idle,
    fraction: 0,
    active: false
  };
};

const buildCoolingStatus = (
  cooldownRemaining: number,
  tone: Extract<HudTone, 'blocked' | 'active' | 'idle'>
): HudStatus => ({
  value: `${presentationTuning.hud.text.cooling} ${formatSeconds(
    cooldownRemaining
  )}`,
  tone
});

const buildStaticStatus = (value: string, tone: HudTone): HudStatus => ({
  value,
  tone
});

const formatSeconds = (seconds: number): string =>
  `${seconds.toFixed(presentationTuning.hud.secondsFractionDigits)}s`;

const formatCastFailureReason = (
  reason: Exclude<HeadlessCombatRuntimeSnapshot['lastLegalityFailureReason'], 'none'>
): string =>
  reason === 'on-cooldown'
    ? presentationTuning.hud.castFailureReasons.onCooldown
    : reason === 'out-of-range'
      ? presentationTuning.hud.castFailureReasons.outOfRange
      : reason === 'dead-actor'
        ? presentationTuning.hud.castFailureReasons.deadActor
        : presentationTuning.hud.castFailureReasons.invalidTarget;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
