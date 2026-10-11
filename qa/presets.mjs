// Preset save slots: save, rename, load from title + pause, survive reload.
// usage: node qa/presets.mjs http://localhost:PORT [shotDir]
// Uses WebKit when installed; falls back to Chromium with the same iPhone profile.
import { webkit, chromium, devices } from 'playwright';
import fs from 'node:fs';

const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.argv[3] || 'qa/shots';
fs.mkdirSync(OUT, { recursive: true });

let browser;
try {
  browser = await webkit.launch();
} catch {
  console.log('webkit unavailable, using chromium');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}
const { defaultBrowserType, ...iphone } = devices['iPhone 15 Pro'];
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
await page.addInitScript(() => {
  if (!sessionStorage.getItem('qa-init')) {
    localStorage.clear();
    sessionStorage.setItem('qa-init', '1');
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.setProperty('--sat', '59px');
    document.documentElement.style.setProperty('--sab', '34px');
  });
});
const S = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const check = (cond, msg) => {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('ok', msg);
};

await page.goto(URL);
await page.waitForTimeout(1200);
await shot('p01-title-empty');
check((await page.locator('#slots-title .slot.empty').count()) === 3, 'three empty slots on title');

// Configure "James": magenta hex snake, hard; tap empty slot 1 to save.
await S(() => {
  const s = window.__slither;
  s.set('snakeColor', 'magenta');
  s.set('snakeShape', 'hex');
  s.set('difficulty', 'hard');
});
await page.tap('#slots-title [data-slot="0"]');
check((await S(() => window.__slither.presets[0]?.settings.snakeColor)) === 'magenta', 'tap empty slot saves current config');

// Rename in CONFIG → SLOTS.
await page.tap('#btn-config');
await page.tap('[data-tab="slots"]');
await page.waitForTimeout(400);
await page.fill('[data-slot-name="0"]', 'james');
await page.press('[data-slot-name="0"]', 'Enter');
check((await S(() => window.__slither.presets[0].name)) === 'JAMES', 'rename slot 1 to JAMES');

// Configure "Leo" and save into empty slot 2 from the manager (focuses the name field).
await page.tap('[data-tab="board"]');
await page.waitForTimeout(200);
await S(() => {
  const s = window.__slither;
  s.set('snakeColor', 'acid');
  s.set('boardColor', 'amber');
  s.set('boardStyle', 'circuit');
  s.set('difficulty', 'easy');
});
await page.tap('[data-tab="slots"]');
await page.tap('[data-slot-act="save"][data-i="1"]');
check(await S(() => document.activeElement?.dataset.slotName === '1'), 'saving a fresh slot focuses its name');
await page.keyboard.type('leo');
await page.keyboard.press('Enter');
check((await S(() => window.__slither.presets[1].name)) === 'LEO', 'rename slot 2 to LEO');
await shot('p02-config-slots');

// Overwrite needs a second tap.
await page.tap('[data-slot-act="save"][data-i="0"]');
check((await S(() => window.__slither.presets[0].settings.snakeColor)) === 'magenta', 'first overwrite tap only arms');
await shot('p03-armed');
// Arming another button disarms the first.
await page.tap('[data-slot-act="clear"][data-i="0"]');
check((await page.locator('[data-slot-act="save"][data-i="0"]').innerText()) === 'SAVE', 'arming another button resets the first');
await page.waitForTimeout(2700);
check((await page.locator('[data-slot-act="clear"][data-i="0"]').innerText()) === 'CLEAR', 'armed button resets after timeout');

// Confirmed overwrite stores the current config (LEO's), then restore JAMES.
await page.tap('[data-slot-act="save"][data-i="0"]');
await page.tap('[data-slot-act="save"][data-i="0"]');
const ow = await S(() => window.__slither.presets[0]);
check(ow.settings.snakeColor === 'acid' && ow.name === 'JAMES', 'second tap overwrites slot and keeps its name');
await S(() => {
  const s = window.__slither;
  s.set('snakeColor', 'magenta');
  s.set('snakeShape', 'hex');
  s.set('boardColor', 'cyan');
  s.set('boardStyle', 'grid');
  s.set('difficulty', 'hard');
});
await page.tap('[data-slot-act="save"][data-i="0"]');
await page.tap('[data-slot-act="save"][data-i="0"]');
await page.tap('[data-slot-act="load"][data-i="1"]');

await page.tap('#btn-settings-back');
await page.waitForTimeout(300);
await shot('p04-title-filled');
check((await page.locator('#slots-title .slot.on .nm').innerText()) === 'LEO', 'LEO highlighted as active');

// One tap loads JAMES from title.
await page.tap('#slots-title [data-slot="0"]');
const st = await S(() => ({ ...window.__slither.settings }));
check(st.snakeColor === 'magenta' && st.snakeShape === 'hex' && st.difficulty === 'hard' && st.boardStyle === 'grid', 'tap loads JAMES on title');

// Pause screen load: different grid size rebuilds on resume.
await page.tap('#btn-play');
await page.waitForTimeout(300);
const cols = await S(() => window.__slither.game.cols);
await page.tap('#btn-pause');
await page.waitForTimeout(400);
await shot('p05-pause');
await page.tap('#slots-pause [data-slot="1"]');
check((await S(() => window.__slither.settings.boardColor)) === 'amber', 'tap loads LEO from pause');
await page.tap('#btn-resume');
await page.waitForTimeout(300);
check((await S(() => window.__slither.game.cols)) < cols, 'grid rebuilt for LEO difficulty after resume');

// Survives reload; main settings key untouched in format.
await page.reload();
await page.waitForTimeout(800);
const after = await S(() => ({ p: window.__slither.presets.map((x) => x?.name), s: JSON.parse(localStorage.getItem('slither-cc.settings.v1')).snakeColor }));
check(after.p[0] === 'JAMES' && after.p[1] === 'LEO' && after.p[2] === undefined && after.s === 'acid', 'presets + settings persist across reload');

// Clear needs two taps.
await page.tap('#btn-config');
await page.tap('[data-tab="slots"]');
await page.tap('[data-slot-act="clear"][data-i="1"]');
await page.tap('[data-slot-act="clear"][data-i="1"]');
check((await S(() => window.__slither.presets[1])) === null, 'double-tap clear empties slot');

check(errors.length === 0, 'no page errors ' + errors.join('; '));
await browser.close();
