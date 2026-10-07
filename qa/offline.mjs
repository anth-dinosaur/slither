// Offline PWA check (Chromium): install SW, go offline, reload, play.
// WebKit is covered by qa/offline-webkit.mjs.
// usage: node qa/offline.mjs http://localhost:PORT/
import { chromium, devices } from 'playwright';

const URL = process.argv[2];
let ok = true;
const check = (name, pass, extra = '') => {
  ok &&= !!pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

for (const [label, type, dev] of [['chromium', chromium, 'iPhone 13']]) {
  console.log(`\n== ${label}`);
  const browser = await type.launch();
  const ctx = await browser.newContext({ ...devices[dev], serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  let sw;
  try {
    sw = await page.evaluate(async () => {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, r) => setTimeout(() => r(new Error('sw timeout')), 8000))]);
      const keys = await caches.keys();
      const cached = keys.length ? (await (await caches.open(keys[0])).keys()).length : 0;
      return { active: !!reg.active, keys, cached };
    });
  } catch (e) {
    check(`${label}: service worker installs`, false, e.message.split('\n')[0]);
    await browser.close();
    continue;
  }
  check(`${label}: service worker active`, sw.active, `cache ${sw.keys.join(',')} with ${sw.cached} entries`);
  check(`${label}: all 13 assets precached`, sw.cached === 13);

  // make sure the page is controlled, then cut the network
  await page.reload();
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(1500);
  const boot = await page.evaluate(() => ({ controlled: !!navigator.serviceWorker.controller, state: window.__slither?.state, title: document.title }));
  check(`${label}: boots offline`, boot.state === 'title' && boot.controlled, JSON.stringify(boot));

  // a fresh navigation (simulates cold launch from home screen) while offline
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(URL);
  await p2.waitForTimeout(1200);
  await p2.click('#btn-play');
  await p2.evaluate(() => window.__slither.steer('up'));
  await p2.waitForTimeout(1500);
  const play = await p2.evaluate(() => ({ state: window.__slither.state, steps: window.__slither.game.steps }));
  check(`${label}: cold launch offline + gameplay`, play.state === 'playing' && play.steps > 3, JSON.stringify(play));
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await browser.close();
}
console.log(ok ? '\nOFFLINE: ALL PASS' : '\nOFFLINE: FAILURES');
process.exit(ok ? 0 : 1);
