// WebKit offline check: install from a temporary server, kill it, relaunch.
// (Playwright's setOffline() is unreliable in WebKit, and a dead server is the
// realistic case anyway: the phone away from home Wi-Fi.)
import { webkit, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 47000 + Math.floor(Math.random() * 1000);
const URL = `https://localhost:${PORT}/`;
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('online') && r()));

let ok = true;
const check = (name, pass, extra = '') => {
  ok &&= !!pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], ignoreHTTPSErrors: true, serviceWorkers: 'allow' });
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
const sw = await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  return { cached: (await (await caches.open(keys[0])).keys()).length };
});
check('service worker installed + precached', sw.cached === 13, `${sw.cached} entries`);
await page.reload();
await page.waitForTimeout(400);

srv.kill();
await new Promise((r) => setTimeout(r, 500));
const reachable = await fetch(URL).then(() => true, () => false);
check('server is really down', !reachable);

const p2 = await ctx.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto(URL);
await p2.waitForTimeout(1500);
const boot = await p2.evaluate(() => ({ controlled: !!navigator.serviceWorker.controller, state: window.__slither?.state }));
check('cold launch with server down', boot.controlled && boot.state === 'title', JSON.stringify(boot));
await p2.click('#btn-play');
await p2.evaluate(() => window.__slither.steer('up'));
await p2.waitForTimeout(1500);
const play = await p2.evaluate(() => ({ state: window.__slither.state, steps: window.__slither.game.steps }));
check('gameplay offline', play.state === 'playing' && play.steps > 3, JSON.stringify(play));
await p2.screenshot({ path: 'qa/shots/30-webkit-offline.png' });
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(ok ? 'WEBKIT OFFLINE: ALL PASS' : 'WEBKIT OFFLINE: FAILURES');
process.exit(ok ? 0 : 1);
