export type PlayerActionId =
  | 'move-up'
  | 'move-down'
  | 'move-left'
  | 'move-right'
  | 'primary-action'
  | 'toggle-camera'
  | 'toggle-tactical-mode'
  | 'toggle-labels'
  | 'toggle-routes'
  | 'previous-route'
  | 'next-route'
  | 'start-probe';

const actionBindings: Record<PlayerActionId, readonly string[]> = {
  'move-up': ['w', 'arrowup'],
  'move-down': ['s', 'arrowdown'],
  'move-left': ['a', 'arrowleft'],
  'move-right': ['d', 'arrowright'],
  'primary-action': ['f', 'space'],
  'toggle-camera': ['c'],
  'toggle-tactical-mode': ['v'],
  'toggle-labels': ['l'],
  'toggle-routes': ['g'],
  'previous-route': ['['],
  'next-route': [']'],
  'start-probe': ['p']
};

const preventDefaultActions: readonly PlayerActionId[] = [
  'previous-route',
  'next-route',
  'start-probe',
  'toggle-routes',
  'toggle-labels',
  'toggle-camera',
  'toggle-tactical-mode',
  'primary-action'
];

export const normalizeKeyboardActionKey = (key: string): string =>
  key === ' ' ? 'space' : key.toLowerCase();

export const isActionDown = (
  keysDown: ReadonlySet<string>,
  actionId: PlayerActionId
): boolean => isBindingDown(keysDown, actionBindings[actionId]);

export const isBindingDown = (
  keysDown: ReadonlySet<string>,
  binding: readonly string[]
): boolean => binding.some((key) => keysDown.has(key));

export const consumeActionPressed = (
  pressedKeys: Set<string>,
  actionId: PlayerActionId
): boolean => consumeBindingPressed(pressedKeys, actionBindings[actionId]);

export const consumeBindingPressed = (
  pressedKeys: Set<string>,
  binding: readonly string[]
): boolean => {
  for (const key of binding) {
    if (pressedKeys.has(key)) {
      pressedKeys.delete(key);
      return true;
    }
  }

  return false;
};

export const shouldPreventDefault = (key: string): boolean =>
  preventDefaultActions.some((actionId) =>
    actionBindings[actionId].includes(key)
  );
