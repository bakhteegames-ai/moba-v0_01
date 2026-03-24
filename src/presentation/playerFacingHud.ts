import { type HeadlessCombatRuntimeSnapshot } from '../gameplay/headlessCombatRuntime';
import { type LivePrototypeSignalProviderDebugState } from '../gameplay/livePrototypeSignalProvider';

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

export const createPlayerFacingHud = (): PlayerFacingHud => {
  const root = document.createElement('div');
  root.id = 'player-hud-root';

  const panel = document.createElement('div');
  panel.className = 'player-hud';
  root.appendChild(panel);

  const topRow = createRow();
  const statusRow = createRow();
  const meterColumn = document.createElement('div');
  meterColumn.className = 'player-hud-meter-column';

  const abilityChip = createChip('Ability');
  const targetChip = createChip('Target');
  const siegeChip = createChip('Siege');
  const contestChip = createChip('Contest');
  const recoveryChip = createChip('Recovery');
  const structureMeter = createMeter('Structure');
  const closureMeter = createMeter('Closure');

  topRow.append(abilityChip.root, targetChip.root);
  statusRow.append(siegeChip.root, contestChip.root, recoveryChip.root);
  meterColumn.append(structureMeter.root, closureMeter.root);
  panel.append(topRow, statusRow, meterColumn);
  document.body.appendChild(root);

  return {
    update(_dt, input) {
      const cooldownRemaining = input.combat.player.basicAbilityCooldownRemaining;
      updateChip(
        abilityChip,
        cooldownRemaining > 0
          ? `Cooling ${formatSeconds(cooldownRemaining)}`
          : 'Ready',
        cooldownRemaining > 0 ? 'blocked' : 'ready'
      );
      updateChip(
        targetChip,
        input.combat.target.alive
          ? `${input.combat.target.currentHp}/${input.combat.target.maxHp}`
          : 'Cleared',
        input.combat.target.alive ? 'active' : 'resolved'
      );
      updateChip(
        siegeChip,
        input.signals.sharedSiegeWindow.siegeWindowActive
          ? `Open ${formatSeconds(
              input.signals.sharedSiegeWindow.siegeWindowRemainingSeconds
            )}`
          : 'Closed',
        input.signals.sharedSiegeWindow.siegeWindowActive ? 'active' : 'idle'
      );
      updateChip(
        contestChip,
        input.signals.sharedDefenderResponse.responseActive
          ? 'Active'
          : input.signals.sharedDefenderResponse.responseCooldownRemaining > 0
            ? `Cooling ${formatSeconds(
                input.signals.sharedDefenderResponse.responseCooldownRemaining
              )}`
            : 'Waiting',
        input.signals.sharedDefenderResponse.responseActive
          ? 'contest'
          : input.signals.sharedDefenderResponse.responseEligible
            ? 'active'
            : 'idle'
      );
      updateChip(
        recoveryChip,
        input.signals.sharedPushReassertion.recoveryActive
          ? 'Active'
          : input.signals.sharedPushReassertion.recoveryCooldownRemaining > 0
            ? `Cooling ${formatSeconds(
                input.signals.sharedPushReassertion.recoveryCooldownRemaining
              )}`
            : 'Waiting',
        input.signals.sharedPushReassertion.recoveryActive
          ? 'recovery'
          : input.signals.sharedPushReassertion.recoveryEligible
            ? 'active'
            : 'idle'
      );

      const structureFraction =
        input.signals.sharedStructureConversion.conversionThreshold > 0
          ? input.signals.sharedStructureConversion.conversionProgress /
            input.signals.sharedStructureConversion.conversionThreshold
          : 0;
      updateMeter(
        structureMeter,
        input.signals.sharedStructureConversion.lastResolvedStructureStep !== 'none'
          ? input.signals.sharedStructureConversion.lastResolvedStructureStep
          : input.signals.sharedStructureConversion.conversionActive
            ? `${input.signals.sharedStructureConversion.conversionProgress.toFixed(
                2
              )} / ${input.signals.sharedStructureConversion.conversionThreshold.toFixed(
                2
              )}`
            : 'Idle',
        input.signals.sharedStructureConversion.lastResolvedStructureStep !== 'none'
          ? 1
          : structureFraction,
        input.signals.sharedStructureConversion.conversionActive ||
          input.signals.sharedStructureConversion.lastResolvedStructureStep !==
            'none'
      );

      const closureFraction =
        input.signals.sharedClosureAdvancement.lastResolvedClosureStep !== 'none'
          ? 1
          : input.signals.sharedClosureAdvancement.closureAdvancementActive
            ? input.signals.sharedClosureAdvancement.readinessLevel
            : 0;
      updateMeter(
        closureMeter,
        input.signals.sharedClosureAdvancement.lastResolvedClosureStep !== 'none'
          ? input.signals.sharedClosureAdvancement.lastResolvedClosureStep
          : input.signals.sharedClosureAdvancement.closureAdvancementActive
            ? `${Math.round(
                input.signals.sharedClosureAdvancement.readinessLevel * 100
              )}% ready`
            : 'Idle',
        closureFraction,
        input.signals.sharedClosureAdvancement.closureAdvancementActive ||
          input.signals.sharedClosureAdvancement.lastResolvedClosureStep !== 'none'
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
  value: string,
  tone: 'ready' | 'blocked' | 'active' | 'contest' | 'recovery' | 'resolved' | 'idle'
): void => {
  chip.value.textContent = value;
  chip.root.dataset.tone = tone;
};

const updateMeter = (
  meter: HudMeter,
  value: string,
  fraction: number,
  active: boolean
): void => {
  meter.value.textContent = value;
  meter.fill.style.transform = `scaleX(${clamp(fraction, 0, 1)})`;
  meter.root.dataset.active = active ? 'true' : 'false';
};

const formatSeconds = (seconds: number): string => `${seconds.toFixed(1)}s`;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
