import { chromium } from 'file:///C:/Users/bakht/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const readCombatChip = async (page) => page.evaluate(() => {
  const chips = [...document.querySelectorAll('.player-hud-chip')];
  const combatChip = chips.find((chip) =>
    chip.querySelector('.player-hud-label')?.textContent === 'Combat'
  );
  return combatChip?.querySelector('.player-hud-value')?.textContent ?? null;
});

const readState = async (page) => page.evaluate(() =>
  typeof window.render_game_to_text === 'function'
    ? JSON.parse(window.render_game_to_text())
    : null
);

const advanceFrames = async (page, frames) => {
  for (let i = 0; i < frames; i += 1) {
    await page.evaluate(async () => {
      if (typeof window.advanceTime === 'function') {
        await window.advanceTime(1000 / 60);
      }
    });
  }
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4179', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);

const initialChip = await readCombatChip(page);
const initialState = await readState(page);

await page.keyboard.down('ArrowRight');
await advanceFrames(page, 420);
await page.keyboard.up('ArrowRight');
await advanceFrames(page, 8);
const inRangeChip = await readCombatChip(page);
const inRangeState = await readState(page);

await page.keyboard.press('Space');
await advanceFrames(page, 8);
const coolingChip = await readCombatChip(page);
const coolingState = await readState(page);

console.log(JSON.stringify({
  initialChip,
  initialCue: initialState?.combat?.presentation?.targetCueState,
  inRangeChip,
  inRangeCue: inRangeState?.combat?.presentation?.targetCueState,
  coolingChip,
  coolingRemaining: coolingState?.combat?.player?.cooldownRemaining,
  determinismPassed: coolingState?.combat?.determinismProof?.passed
}, null, 2));

await browser.close();
