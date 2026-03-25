interface ControlHintDefinition {
  keys: string;
  label: string;
}

const controlHints: ControlHintDefinition[] = [
  {
    keys: 'WASD / Arrows',
    label: 'Move'
  },
  {
    keys: 'Space / F',
    label: 'Cast'
  }
];

export const createControlsHintOverlay = (): void => {
  const root = document.createElement('div');
  root.id = 'controls-hint-root';

  const panel = document.createElement('div');
  panel.className = 'controls-hint-panel';

  const title = document.createElement('div');
  title.className = 'controls-hint-title';
  title.textContent = 'Controls';
  panel.appendChild(title);

  for (const hint of controlHints) {
    const row = document.createElement('div');
    row.className = 'controls-hint-row';

    const keys = document.createElement('span');
    keys.className = 'controls-hint-keys';
    keys.textContent = hint.keys;

    const label = document.createElement('span');
    label.className = 'controls-hint-label';
    label.textContent = hint.label;

    row.append(keys, label);
    panel.appendChild(row);
  }

  root.appendChild(panel);
  document.body.appendChild(root);
};
