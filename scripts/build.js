// Static build for GitHub Pages: copy public/ to dist/ and stamp sw.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVersion } from './version.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'public');
const OUT = path.join(HERE, '..', 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
const version = buildVersion(SRC);
const sw = path.join(OUT, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD_VERSION__', version));
console.log(`built dist/ (sw ${version})`);
