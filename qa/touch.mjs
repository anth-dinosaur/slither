// Verifies real touch-swipe input (CDP touch events) + audio synth execution.
// usage: node qa/touch.mjs http://localhost:PORT
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL);
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);

async function swipe(x0, y0, dx, dy, steps = 6) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const S = (fn, a) => page.evaluate(fn, a);
const dir = () => S(() => window.__slither.game && { ...window.__slither.game.dir, started: window.__slither.game.started, state: window.__slither.state, q: window.__slither.game.queue.length });

await page.tap('#btn-play');
await page.waitForTimeout(300);
console.log('before swipe:', JSON.stringify(await dir()));

const results = [];
await swipe(200, 500, 0, -80); // up
await page.waitForTimeout(400);
results.push(['up', await dir()]);
await swipe(200, 500, -80, 0); // left
await page.waitForTimeout(400);
results.push(['left', await dir()]);
await swipe(200, 500, 0, 80); // down
await page.waitForTimeout(400);
results.push(['down', await dir()]);
await swipe(200, 500, 90, 10); // right, slightly diagonal
await page.waitForTimeout(400);
results.push(['right', await dir()]);
// quick flick (below chained-threshold, detected on touchend)
await swipe(200, 500, 0, -12, 1);
await page.waitForTimeout(400);
results.push(['flick-up', await dir()]);
// one continuous L-shaped drag: right then down, should chain two turns
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 400 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 140, y: 402 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 142, y: 450 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
results.push(['L-drag right→down', await dir()]);

const expect = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0], 'flick-up': [0, -1], 'L-drag right→down': [0, 1] };
let ok = true;
for (const [name, d] of results) {
  const [ex, ey] = expect[name];
  const pass = d.x === ex && d.y === ey;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: dir=(${d.x},${d.y}) state=${d.state}`);
}

// page must not scroll/zoom from swipes
console.log('scroll:', await S(() => [window.scrollX, window.scrollY, window.visualViewport.scale]));

// audio: run synth paths (sound is on by default)
const audio = await S(async () => {
  const m = await import('/src/audio.js');
  m.unlockAudio();
  await new Promise((r) => setTimeout(r, 200));
  const t = performance.now();
  for (let i = 0; i < 12; i++) m.fart();
  const fartMs = (performance.now() - t) / 12;
  m.womp();
  return { fartMs: fartMs.toFixed(2) };
});
console.log('audio synth ok, avg fart synth ms:', audio.fartMs);

console.log(ok ? 'ALL SWIPES PASS' : 'SWIPE FAILURES');
console.log(errors.length ? `ERRORS: ${errors.join('\n')}` : 'no page errors');
await browser.close();
