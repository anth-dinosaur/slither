// Content hash of everything the app ships (excluding sw.js itself). Stamped into
// sw.js as BUILD so any change produces a new service worker + cache.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function buildVersion(root) {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name !== 'sw.js') h.update(path.relative(root, p)).update(fs.readFileSync(p));
    }
  };
  walk(root);
  return h.digest('hex').slice(0, 12);
}
