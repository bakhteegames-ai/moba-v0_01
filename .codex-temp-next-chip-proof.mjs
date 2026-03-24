import { chromium } from 'file:///C:/Users/bakht/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const readChip = async (page, label) => page.evaluate((wantedLabel) => {
  const chips = [...document.querySelectorAll('.player-hud-chip')];
  const chip = chips.find((node) =>
    node.querySelector('.player-hud-label')?.textContent === wantedLabel
  );
  return chip?.querySelector('.player-hud-value')?.textContent ?? null;
}, label);

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

const initialCombat = await readChip(page, 'Combat');
const initialNext = await readChip(page, 'Next');

await page.keyboard.down('ArrowRight');
await advanceFrames(page, 420);
await page.keyboard.up('ArrowRight');
await advanceFrames(page, 8);
const inRangeCombat = await readChip(page, 'Combat');
const inRangeNext = await readChip(page, 'Next');

await page.keyboard.press('Space');
await advanceFrames(page, 8);
const coolingCombat = await readChip(page, 'Combat');
const coolingNext = await readChip(page, 'Next');
const coolingState = await readState(page);

console.log(JSON.stringify({
  initialCombat,
  initialNext,
  inRangeCombat,
  inRangeNext,
  coolingCombat,
  coolingNext,
  targetCueState: coolingState?.combat?.presentation?.targetCueState,
  determinismPassed: coolingState?.combat?.determinismProof?.passed
}, null, 2));

await browser.close();
