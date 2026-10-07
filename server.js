// Zero-dependency static server for LAN play + offline PWA install.
//
// HTTPS (port P) is what iOS needs for service workers / offline. It's signed by a
// local CA generated on first run (.certs/, never committed); install that CA on the
// phone once via the HTTP setup page (port P+1).
//
// P is picked at random on first run and persisted to .port so an installed
// home-screen app keeps working across restarts. Override with $PORT.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'public');
const CERTS = path.join(HERE, '.certs');
const PORT_FILE = path.join(HERE, '.port');
const HOST = process.env.HOST || '0.0.0.0';

function choosePort() {
  if (process.env.PORT) return Number(process.env.PORT);
  try {
    const saved = Number(fs.readFileSync(PORT_FILE, 'utf8'));
    if (saved > 0) return saved;
  } catch {
    /* first run */
  }
  const p = 20000 + Math.floor(Math.random() * 40000);
  fs.writeFileSync(PORT_FILE, String(p));
  return p;
}
const PORT = choosePort();
const SETUP_PORT = PORT + 1;

// ---------- local CA + server certificate ----------

function lanIPs() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces()))
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

function localHostName() {
  try {
    return execFileSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' }).trim() + '.local';
  } catch {
    return os.hostname().replace(/\.local$/, '') + '.local';
  }
}

function ensureCerts() {
  fs.mkdirSync(CERTS, { recursive: true });
  const f = (n) => path.join(CERTS, n);
  const ssl = (...args) => execFileSync('openssl', args, { stdio: 'pipe' });

  if (!fs.existsSync(f('ca.crt'))) {
    fs.writeFileSync(f('ca.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
    ssl('genrsa', '-out', f('ca.key'), '2048');
    ssl('req', '-new', '-key', f('ca.key'), '-subj', '/CN=SLITHER CC Local CA/O=slither-cc', '-out', f('ca.csr'));
    ssl('x509', '-req', '-in', f('ca.csr'), '-signkey', f('ca.key'), '-days', '3650', '-sha256', '-extfile', f('ca.ext'), '-out', f('ca.crt'));
    ssl('x509', '-in', f('ca.crt'), '-outform', 'DER', '-out', f('ca.der'));
    fs.rmSync(f('server.crt'), { force: true });
  }

  const names = ['localhost', localHostName()];
  const ips = ['127.0.0.1', ...lanIPs()];
  let covered = [];
  try {
    covered = JSON.parse(fs.readFileSync(f('san.json'), 'utf8'));
  } catch {
    /* none yet */
  }
  const needed = [...names, ...ips];
  if (fs.existsSync(f('server.crt')) && needed.every((n) => covered.includes(n))) return;

  // (Re)issue the leaf when a new LAN address/hostname shows up. iOS caps leaf validity at 825 days.
  const san = [...names.map((n) => `DNS:${n}`), ...ips.map((i) => `IP:${i}`)].join(',');
  fs.writeFileSync(
    f('server.ext'),
    `basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`,
  );
  if (!fs.existsSync(f('server.key'))) ssl('genrsa', '-out', f('server.key'), '2048');
  ssl('req', '-new', '-key', f('server.key'), '-subj', `/CN=${names[1]}`, '-out', f('server.csr'));
  ssl('x509', '-req', '-in', f('server.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAserial', f('ca.srl'), '-CAcreateserial', '-days', '800', '-sha256', '-extfile', f('server.ext'), '-out', f('server.crt'));
  fs.writeFileSync(f('san.json'), JSON.stringify(needed));
}

// ---------- static files ----------

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

// Content hash of everything the app ships; stamped into sw.js so any change
// produces a new service worker that atomically re-caches the whole app.
function buildVersion() {
  const h = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name !== 'sw.js') h.update(name).update(fs.readFileSync(p));
    }
  };
  walk(ROOT);
  return h.digest('hex').slice(0, 12);
}

function serveStatic(req, res) {
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
    if (path.basename(file) === 'sw.js' && path.dirname(file) === ROOT) {
      data = Buffer.from(data.toString().replace('__BUILD_VERSION__', buildVersion()));
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---------- setup page (HTTP) ----------

function setupPage(host) {
  const ip = host.split(':')[0];
  const httpsUrl = `https://${ip}:${PORT}/`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SLITHER//CC setup</title><style>
body{background:#020309;color:#d9f7ff;font:15px/1.6 ui-monospace,Menlo,monospace;padding:24px;max-width:560px;margin:auto}
h1{color:#fff;text-shadow:0 0 12px #00f0ff;font-style:italic}a{color:#00f0ff}
.btn{display:block;text-align:center;word-break:break-all;padding:16px;margin:14px 0;border:1px solid #00f0ff;background:rgba(0,240,255,.12);color:#fff;text-decoration:none;font-weight:800;letter-spacing:.15em}
li{margin:10px 0}code{color:#ff2bd6}small{color:#7aa}</style></head><body>
<h1>SLITHER//CC</h1><p>Offline install for iPhone. Do steps 1–2 once per phone.</p>
<ol>
<li><b>Get the certificate.</b><a class="btn" href="/ca.crt">⤓ DOWNLOAD CERTIFICATE</a>Tap <i>Allow</i>. Then go to <b>Settings → General → VPN &amp; Device Management</b>, tap <i>SLITHER CC Local CA</i> → <b>Install</b>.</li>
<li><b>Trust it.</b> Go to <b>Settings → General → About → Certificate Trust Settings</b> and switch on <i>SLITHER CC Local CA</i>.</li>
<li><b>Install the app.</b> In Safari, open<a class="btn" href="${httpsUrl}">${httpsUrl}</a>then tap Share → <b>Add to Home Screen</b>.</li>
<li><b>Launch it once from the Home Screen</b> while on Wi-Fi to cache it. After that it works fully offline.</li>
</ol>
<p><small>This certificate was generated on this Mac just for this server; its private key never leaves the Mac. Remove it any time in VPN &amp; Device Management.</small></p>
</body></html>`;
}

// ---------- boot ----------

ensureCerts();

https
  .createServer({ key: fs.readFileSync(path.join(CERTS, 'server.key')), cert: fs.readFileSync(path.join(CERTS, 'server.crt')) }, serveStatic)
  .listen(PORT, HOST);

http
  .createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/ca.crt') {
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="slither-cc-ca.crt"',
      });
      res.end(fs.readFileSync(path.join(CERTS, 'ca.der')));
    } else if (p === '/' || p === '/setup') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(setupPage(req.headers.host || 'localhost'));
    } else {
      serveStatic(req, res);
    }
  })
  .listen(SETUP_PORT, HOST, () => {
    console.log(`SLITHER//CC online (${HOST})`);
    console.log(`  game (https):  https://localhost:${PORT}/`);
    for (const ip of lanIPs()) {
      console.log(`  lan  (https):  https://${ip}:${PORT}/`);
      console.log(`  phone setup:   http://${ip}:${SETUP_PORT}/`);
    }
    console.log(`  bonjour:       https://${localHostName()}:${PORT}/`);
  });
