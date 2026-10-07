// Zero-dependency static server. Binds 0.0.0.0 on a random high port (or $PORT).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildVersion } from './scripts/version.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT ? Number(process.env.PORT) : 20000 + Math.floor(Math.random() * 40000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
      return;
    }
    // Stamp the service worker with a content hash so changes re-cache the app.
    if (file === path.join(ROOT, 'sw.js')) data = Buffer.from(data.toString().replace('__BUILD_VERSION__', buildVersion(ROOT)));
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`SLITHER online on ${HOST}:${PORT}`);
  console.log(`  local: http://localhost:${PORT}/`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  lan:   http://${a.address}:${PORT}/`);
    }
  }
});
