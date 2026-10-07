// Edge cases: small screen, landscape, long wrapping snake, mid-run grid change.
import { webkit, devices } from 'playwright';
import fs from 'node:fs';
const URL = process.argv[2];
const OUT = 'qa/shots';
fs.mkdirSync(OUT, { recursive: true });
const b = await webkit.launch();
const errors = [];
async function open(dev, extra = {}) {
  const ctx = await b.newContext({ ...devices[dev], ...extra });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${dev}: ${e.message}`));
  await p.addInitScript(() => localStorage.clear());
  await p.goto(URL);
  await p.waitForTimeout(1200);
  return p;
}
const bot = (p) => p.evaluate(async () => {
  const { autopilot } = await import('/src/game.js');
  const names = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' };
  clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    const s = window.__slither;
    if (!s.game || !['ready', 'playing'].includes(s.state)) return;
    const d = autopilot(s.game);
    if (s.game.queue.length === 0) s.steer(names[`${d.x},${d.y}`]);
  }, 10);
});

// iPhone SE
let p = await open('iPhone SE');
await p.screenshot({ path: `${OUT}/20-se-title.png` });
await p.click('#btn-play');
await bot(p);
await p.evaluate(() => { window.__slither.game.grow = 45; });
await p.waitForTimeout(9000);
await p.screenshot({ path: `${OUT}/21-se-long-snake.png` });
console.log('SE long snake:', await p.evaluate(() => ({ len: window.__slither.game.snake.length, state: window.__slither.state, grid: [window.__slither.game.cols, window.__slither.game.rows] })));

// pause -> config -> change difficulty -> back => new run on new grid
await p.evaluate(() => clearInterval(window.__bot));
await p.click('#btn-pause');
await p.click('#btn-pause-config');
await p.click('[data-tab="board"]');
await p.click('[data-val="hard"]');
await p.click('#btn-settings-back');
await p.waitForTimeout(400);
console.log('after grid change:', await p.evaluate(() => ({ state: window.__slither.state, len: window.__slither.game.snake.length, grid: [window.__slither.game.cols, window.__slither.game.rows] })));
await p.screenshot({ path: `${OUT}/22-se-rebuilt.png` });

// Pause -> resume shows "swipe to resume" and holds
await p.evaluate(() => window.__slither.steer('up'));
await p.waitForTimeout(500);
await p.click('#btn-pause');
await p.click('#btn-resume');
const head1 = await p.evaluate(() => ({ ...window.__slither.game.snake[0], state: window.__slither.state, hint: document.querySelector('.hint-text').textContent }));
await p.waitForTimeout(600);
const head2 = await p.evaluate(() => ({ ...window.__slither.game.snake[0] }));
console.log('resume hold:', JSON.stringify(head1), 'moved while waiting?', head1.x !== head2.x || head1.y !== head2.y);

// Landscape
p = await open('iPhone 15 Pro landscape');
await p.click('#btn-play');
await bot(p);
await p.waitForTimeout(4000);
await p.screenshot({ path: `${OUT}/23-landscape.png` });

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await b.close();
