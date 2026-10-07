// Visual + gameplay QA in iPhone-emulated WebKit (Safari engine).
// usage: node qa/qa.mjs http://localhost:PORT [shotDir]
import { webkit, devices } from 'playwright';
import fs from 'node:fs';

const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.argv[3] || 'qa/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${(e.stack||"").split("\n").slice(0,4).join(" | ")}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

// Emulate the iPhone notch / home-indicator safe areas (Playwright doesn't).
await page.addInitScript(() => {
  localStorage.clear();
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.setProperty('--sat', '59px');
    document.documentElement.style.setProperty('--sab', '34px');
  });
});
await page.goto(URL);
await page.waitForTimeout(400);
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};
const S = (fn, arg) => page.evaluate(fn, arg);

await page.waitForTimeout(2500);
await shot('01-title');

// ---- settings tabs
await page.click('#btn-config');
await page.waitForTimeout(900);
await shot('02-settings-snake');
for (const tab of ['food', 'board', 'audio']) {
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(700);
  await shot(`03-settings-${tab}`);
}
await page.click('#btn-settings-back');

// ---- start run
await page.click('#btn-play');
await page.waitForTimeout(600);
await shot('04-ready');

// Autopilot via the same pure function, steering through the real input path.
await S(async () => {
  const { autopilot } = await import('/src/game.js');
  const names = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };
  window.__bot = setInterval(() => {
    const s = window.__slither;
    if (!s.game || !['ready', 'playing'].includes(s.state)) return;
    const d = autopilot(s.game);
    if (s.game.queue.length === 0) s.steer(names[`${d.x},${d.y}`]);
  }, 15);
});

// wait for a few foods
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  const eaten = await S(() => window.__slither.game.eaten);
  if (eaten >= 6) break;
  await page.waitForTimeout(100);
}
// catch an eat effect mid-flight
const eatenBefore = await S(() => window.__slither.game.eaten);
while ((await S(() => window.__slither.game.eaten)) === eatenBefore) await page.waitForTimeout(10);
await page.waitForTimeout(60);
await shot('05-eat-fx');
await page.waitForTimeout(1500);
await shot('06-playing');

const stats = await S(() => ({ score: window.__slither.score, len: window.__slither.game.snake.length, eaten: window.__slither.game.eaten, state: window.__slither.state }));
console.log('after bot:', JSON.stringify(stats));

// ---- wrap check: drive straight until the head crosses an edge
await S(() => clearInterval(window.__bot));
const wrapOk = await S(
  () =>
    new Promise((res) => {
      const s = window.__slither;
      const start = Date.now();
      let lastX = s.game.snake[0].x;
      let lastY = s.game.snake[0].y;
      const id = setInterval(() => {
        const h = s.game.snake[0];
        if (Math.abs(h.x - lastX) > 1 || Math.abs(h.y - lastY) > 1) {
          clearInterval(id);
          res({ wrapped: true, alive: s.game.alive, from: [lastX, lastY], to: [h.x, h.y] });
        }
        lastX = h.x;
        lastY = h.y;
        if (Date.now() - start > 8000 || !s.game.alive) {
          clearInterval(id);
          res({ wrapped: false, alive: s.game.alive });
        }
      }, 5);
    }),
);
console.log('wrap:', JSON.stringify(wrapOk));
await page.waitForTimeout(40);
await shot('07-after-wrap');

// ---- pause
await page.click('#btn-pause');
await page.waitForTimeout(500);
await shot('08-paused');
await page.click('#btn-resume');
await page.waitForTimeout(300);

// ---- force a self-collision: tight U-turn (needs length >= 5)
const dirName = await S(() => {
  const d = window.__slither.game.dir;
  return d.x ? 'x' : 'y';
});
const seq = dirName === 'x' ? ['up', 'left', 'down'] : ['left', 'up', 'right'];
// if heading left/up the reversal will be rejected — pick perpendicular based on actual heading
const seqFixed = await S((seq) => {
  const d = window.__slither.game.dir;
  if (d.x === 1) return ['up', 'left', 'down'];
  if (d.x === -1) return ['up', 'right', 'down'];
  if (d.y === 1) return ['left', 'up', 'right'];
  return ['left', 'down', 'right'];
}, seq);
for (const k of seqFixed) await S((k) => window.__slither.steer(k), k);
await page.waitForTimeout(700);
const deadState = await S(() => ({ state: window.__slither.state, alive: window.__slither.game.alive }));
console.log('after crash:', JSON.stringify(deadState));
await shot('09-dying');
await page.waitForTimeout(2600);
await shot('10-game-over');
console.log('final state:', await S(() => window.__slither.state));

// ---- alternate looks
await page.click('#btn-over-config');
await page.waitForTimeout(300);
const combos = [
  { snakeShape: 'plasma', snakeColor: 'spectrum', boardStyle: 'circuit', boardColor: 'magenta', foodIcon: 'skull', foodColor: 'acid', difficulty: 'hard' },
  { snakeShape: 'hex', snakeColor: 'acid', boardStyle: 'matrix', boardColor: 'acid', foodIcon: 'chip', foodColor: 'amber', difficulty: 'easy' },
  { snakeShape: 'wire', snakeColor: 'glitch', boardStyle: 'hex', boardColor: 'violet', foodIcon: 'invader', foodColor: 'random', difficulty: 'insane' },
  { snakeShape: 'orb', snakeColor: 'amber', boardStyle: 'dots', boardColor: 'amber', foodIcon: 'gem', foodColor: 'cyan', difficulty: 'normal' },
  { snakeShape: 'shard', snakeColor: 'crimson', boardStyle: 'void', boardColor: 'crimson', foodIcon: 'bolt', foodColor: 'ice', difficulty: 'normal' },
];
for (let i = 0; i < combos.length; i++) {
  await S((c) => {
    for (const [k, v] of Object.entries(c)) window.__slither.set(k, v);
  }, combos[i]);
  await page.waitForTimeout(500);
  await shot(`11-combo-${i}-settings`);
  await S(() => {
    document.getElementById('btn-settings-back').click();
    window.__slither.startRun();
  });
  await S(async () => {
    const { autopilot } = await import('/src/game.js');
    const names = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };
    clearInterval(window.__bot);
    window.__bot = setInterval(() => {
      const s = window.__slither;
      if (!s.game || !['ready', 'playing'].includes(s.state)) return;
      const d = autopilot(s.game);
      if (s.game.queue.length === 0) s.steer(names[`${d.x},${d.y}`]);
    }, 15);
  });
  await page.waitForTimeout(6000);
  await shot(`12-combo-${i}-play`);
  await S(() => {
    clearInterval(window.__bot);
    document.getElementById('btn-pause').click();
    document.getElementById('btn-pause-config').click();
  });
  await page.waitForTimeout(300);
}

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
