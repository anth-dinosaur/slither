// Update path: a changed file must produce a new SW + cache, and drop the old cache.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const URL = process.argv[2];
const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true });
const p = await ctx.newPage();
await p.goto(URL);
const before = await p.evaluate(async () => { await navigator.serviceWorker.ready; return caches.keys(); });
const css = 'public/styles.css';
const orig = fs.readFileSync(css, 'utf8');
fs.writeFileSync(css, orig + '\n/* update-test */\n');
try {
  const after = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
    for (let i = 0; i < 50; i++) {
      const keys = await caches.keys();
      if (keys.length === 1 && !keys.includes(window.__before)) return keys;
      await new Promise((r) => setTimeout(r, 100));
    }
    return caches.keys();
  }, null);
  const fresh = await p.evaluate(async (k) => (await (await caches.open(k)).match('styles.css')).text(), after[0]);
  const pass = before[0] !== after[0] && after.length === 1 && fresh.includes('update-test');
  console.log(`${pass ? 'PASS' : 'FAIL'} update: ${before} -> ${after}, new css cached: ${fresh.includes('update-test')}`);
  process.exitCode = pass ? 0 : 1;
} finally {
  fs.writeFileSync(css, orig);
  await b.close();
}
