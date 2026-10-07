// Canvas renderer: board layers, neon snake, food, particles and glitch post-FX.

import { byId, SNAKE_COLORS, FOOD_COLORS, BOARD_COLORS, PALETTE } from './settings.js';
import { getFoodSprite, ICON_IDS } from './icons.js';

const TAU = Math.PI * 2;
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/\\#$%';

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function hash(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function snakeColor(id, i, t) {
  if (id === 'spectrum') return `hsl(${((((t * 80 - i * 16) % 360) + 360) % 360).toFixed(0)},100%,62%)`;
  if (id === 'glitch') {
    const r = hash(i, Math.floor(t * 9));
    return r < 0.1 ? '#ff2bd6' : r < 0.14 ? '#ffffff' : r < 0.19 ? '#7dff1f' : '#00f0ff';
  }
  return byId(SNAKE_COLORS, id).c;
}

export function foodColor(id, seed) {
  if (id === 'random') return PALETTE[Math.floor(seed * 7919) % PALETTE.length].c;
  return byId(FOOD_COLORS, id).c;
}

export function foodIcon(id, seed) {
  if (id === 'shuffle') return ICON_IDS[Math.floor(seed * 104729) % ICON_IDS.length];
  return id;
}

// ---------- snake primitives ----------

function roundRect(p, x, y, w, h, r) {
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

function addShape(p, shape, x, y, s) {
  const h = s / 2;
  switch (shape) {
    case 'orb':
      p.moveTo(x + h, y);
      p.arc(x, y, h, 0, TAU);
      break;
    case 'shard':
      p.moveTo(x, y - h * 1.12);
      p.lineTo(x + h * 1.12, y);
      p.lineTo(x, y + h * 1.12);
      p.lineTo(x - h * 1.12, y);
      p.closePath();
      break;
    case 'hex':
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6 + TAU / 12;
        const px = x + Math.cos(a) * h * 1.08;
        const py = y + Math.sin(a) * h * 1.08;
        if (k === 0) p.moveTo(px, py);
        else p.lineTo(px, py);
      }
      p.closePath();
      break;
    default:
      roundRect(p, x - h, y - h, s, s, s * 0.2);
  }
}

function shapePath(shape, x, y, s) {
  const p = new Path2D();
  addShape(p, shape, x, y, s);
  return p;
}

// pts: pixel-space segment centers, head first. o: { shape, colorId, time, dir, dead, skip, bulge, glow }
export function drawSnake(ctx, pts, cell, o) {
  const n = pts.length;
  const start = o.skip || 0;
  if (n === 0 || start >= n) return;
  const t = o.time;
  const shape = o.shape;
  const flat = shape === 'block' || shape === 'wire';
  const scale = (i) => {
    const u = n > 1 ? i / (n - 1) : 0;
    const taper = flat ? 1 - 0.25 * u : 1 - 0.45 * Math.pow(u, 1.2);
    return taper * (1 + (o.bulge ? o.bulge(i) : 0));
  };
  const headC = snakeColor(o.colorId, 0, t);
  const glow = o.glow ?? 1;

  // 1) glow underlay — one blurred draw call for the whole body
  ctx.save();
  ctx.shadowColor = headC;
  ctx.shadowBlur = cell * 0.9 * glow;
  if (shape === 'plasma') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = headC;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = cell * 0.55;
    ctx.beginPath();
    ctx.moveTo(pts[start].x, pts[start].y);
    for (let i = start + 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (n - start === 1) ctx.lineTo(pts[start].x + 0.01, pts[start].y);
    ctx.stroke();
  } else if (shape === 'wire') {
    ctx.strokeStyle = headC;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(2, cell * 0.14);
    const p = new Path2D();
    for (let i = start; i < n; i++) addShape(p, 'block', pts[i].x, pts[i].y, cell * 0.74 * scale(i));
    ctx.stroke(p);
  } else {
    ctx.fillStyle = headC;
    ctx.globalAlpha = 0.5;
    const p = new Path2D();
    for (let i = start; i < n; i++) addShape(p, shape, pts[i].x, pts[i].y, cell * 0.84 * scale(i));
    ctx.fill(p);
  }
  ctx.restore();

  // 2) crisp body, tail → head
  ctx.save();
  if (shape === 'plasma') {
    ctx.lineCap = 'round';
    for (let i = n - 1; i > start; i--) {
      const a = pts[i];
      const b = pts[i - 1];
      ctx.strokeStyle = snakeColor(o.colorId, i, t);
      ctx.globalAlpha = 1 - 0.3 * (i / n);
      ctx.lineWidth = cell * 0.56 * scale(i);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // white-hot core
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, cell * 0.1);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[start].x, pts[start].y);
    for (let i = start + 1; i < Math.max(start + 1, Math.floor(n * 0.8)); i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // energy rings every few segments, scrolling along
    ctx.globalAlpha = 0.9;
    const phase = Math.floor(t * 8);
    for (let i = start + 1; i < n; i++) {
      if ((i + phase) % 4) continue;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, cell * 0.08 * scale(i) + 0.6, 0, TAU);
      ctx.fill();
    }
  } else if (shape === 'wire') {
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = headC;
    ctx.beginPath();
    ctx.moveTo(pts[start].x, pts[start].y);
    for (let i = start + 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    for (let i = n - 1; i >= Math.max(start, 1); i--) {
      const c = snakeColor(o.colorId, i, t);
      const s = cell * 0.74 * scale(i);
      ctx.globalAlpha = 1 - 0.35 * (i / n);
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1.5, cell * 0.12);
      ctx.stroke(shapePath('block', pts[i].x, pts[i].y, s));
      ctx.fillStyle = c;
      ctx.fillRect(pts[i].x - s * 0.12, pts[i].y - s * 0.12, s * 0.24, s * 0.24);
    }
  } else {
    for (let i = n - 1; i >= Math.max(start, 1); i--) {
      const c = snakeColor(o.colorId, i, t);
      const s = cell * 0.84 * scale(i);
      const { x, y } = pts[i];
      ctx.globalAlpha = 1 - 0.35 * (i / n);
      ctx.fillStyle = c;
      ctx.fill(shapePath(shape, x, y, s));
      // inner detail: dark core + hot pixel — "LED cell" look
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fill(shapePath(shape, x, y, s * 0.5));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      if (shape === 'orb') {
        ctx.beginPath();
        ctx.arc(x - s * 0.18, y - s * 0.18, s * 0.1, 0, TAU);
        ctx.fill();
      } else {
        ctx.fill(shapePath(shape, x, y, s * 0.16));
      }
    }
  }
  ctx.restore();

  if (start === 0) drawHead(ctx, pts, cell, o, headC, scale(0));
}

function drawHead(ctx, pts, cell, o, headC, sc) {
  const { x, y } = pts[0];
  const shape = o.shape === 'plasma' ? 'orb' : o.shape === 'wire' ? 'block' : o.shape;
  const s = cell * (o.shape === 'plasma' ? 0.78 : 0.92) * sc;
  ctx.save();
  ctx.shadowColor = headC;
  ctx.shadowBlur = cell * 0.7;
  if (o.shape === 'wire') {
    ctx.strokeStyle = headC;
    ctx.lineWidth = Math.max(1.5, cell * 0.11);
    ctx.stroke(shapePath(shape, x, y, s));
    ctx.fillStyle = hexA('#000000', 0.6);
    ctx.fill(shapePath(shape, x, y, s * 0.8));
  } else {
    ctx.fillStyle = headC;
    ctx.fill(shapePath(shape, x, y, s));
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill(shapePath(shape, x, y, s));
  }
  ctx.restore();

  // eyes
  const d = o.dir || { x: 1, y: 0 };
  const fx = d.x;
  const fy = d.y;
  const px = -fy;
  const py = fx;
  const es = Math.max(2, cell * 0.15);
  ctx.save();
  for (const side of [-1, 1]) {
    const ex = x + fx * cell * 0.14 + px * side * cell * 0.2;
    const ey = y + fy * cell * 0.14 + py * side * cell * 0.2;
    if (o.dead) {
      ctx.strokeStyle = '#ff2a55';
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.beginPath();
      ctx.moveTo(ex - es * 0.6, ey - es * 0.6);
      ctx.lineTo(ex + es * 0.6, ey + es * 0.6);
      ctx.moveTo(ex + es * 0.6, ey - es * 0.6);
      ctx.lineTo(ex - es * 0.6, ey + es * 0.6);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#05060c';
      ctx.fillRect(ex - es * 0.75, ey - es * 0.75, es * 1.5, es * 1.5);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = cell * 0.3;
      ctx.fillRect(ex - es / 2 + fx * es * 0.2, ey - es / 2 + fy * es * 0.2, es, es);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

// ---------- board patterns ----------

function drawBoardPattern(g, style, color, cols, rows, cell, bright) {
  const W = cols * cell;
  const H = rows * cell;
  const k = bright ? 4.5 : 1;
  const A = (a) => hexA(color, Math.min(1, a * k));
  const rnd = mulberry(1337 + cols * 31 + rows);

  if (!bright) {
    const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    bg.addColorStop(0, hexA(color, 0.07));
    bg.addColorStop(1, hexA(color, 0.015));
    g.fillStyle = '#03040b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }

  const lw = bright ? 1.6 : 1;
  const gridLines = (alphaMinor, alphaMajor) => {
    for (let i = 0; i <= cols; i++) {
      g.strokeStyle = A(i % 4 === 0 ? alphaMajor : alphaMinor);
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(i * cell, 0);
      g.lineTo(i * cell, H);
      g.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      g.strokeStyle = A(j % 4 === 0 ? alphaMajor : alphaMinor);
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(0, j * cell);
      g.lineTo(W, j * cell);
      g.stroke();
    }
  };

  switch (style) {
    case 'grid': {
      gridLines(0.07, 0.17);
      g.fillStyle = A(0.5);
      for (let i = 0; i <= cols; i += 4)
        for (let j = 0; j <= rows; j += 4) g.fillRect(i * cell - 1.5, j * cell - 1.5, 3, 3);
      break;
    }
    case 'dots': {
      for (let i = 0; i <= cols; i++)
        for (let j = 0; j <= rows; j++) {
          const major = i % 4 === 0 && j % 4 === 0;
          g.fillStyle = A(major ? 0.6 : 0.28);
          g.beginPath();
          g.arc(i * cell, j * cell, major ? 1.7 : 1.1, 0, TAU);
          g.fill();
        }
      g.fillStyle = A(0.07);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.fillRect((i + 0.5) * cell - 0.5, (j + 0.5) * cell - 0.5, 1, 1);
      break;
    }
    case 'circuit': {
      gridLines(0.025, 0.05);
      const traces = Math.floor((cols * rows) / 5);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let n = 0; n < traces; n++) {
        let x = Math.floor(rnd() * (cols + 1));
        let y = Math.floor(rnd() * (rows + 1));
        const steps = 2 + Math.floor(rnd() * 6);
        let dx = rnd() < 0.5 ? (rnd() < 0.5 ? 1 : -1) : 0;
        let dy = dx === 0 ? (rnd() < 0.5 ? 1 : -1) : 0;
        g.strokeStyle = A(0.14 + rnd() * 0.12);
        g.lineWidth = bright ? 2 : 1.3;
        g.beginPath();
        g.moveTo(x * cell, y * cell);
        const sx = x;
        const sy = y;
        for (let s = 0; s < steps; s++) {
          if (rnd() < 0.3) {
            // 45° bend
            if (dx === 0) dx = rnd() < 0.5 ? 1 : -1;
            else if (dy === 0) dy = rnd() < 0.5 ? 1 : -1;
            else if (rnd() < 0.5) dx = 0;
            else dy = 0;
          }
          x += dx;
          y += dy;
          g.lineTo(x * cell, y * cell);
        }
        g.stroke();
        for (const [px, py, filled] of [[sx, sy, false], [x, y, rnd() < 0.5]]) {
          g.beginPath();
          g.arc(px * cell, py * cell, Math.max(1.6, cell * 0.11), 0, TAU);
          if (filled) {
            g.fillStyle = A(0.35);
            g.fill();
          } else g.stroke();
        }
      }
      break;
    }
    case 'hex': {
      const R = cell * 0.62;
      const hw = Math.sqrt(3) * R;
      g.strokeStyle = A(0.1);
      g.lineWidth = lw;
      for (let row = -1; row * R * 1.5 < H + R * 2; row++) {
        for (let col = -1; col * hw < W + hw; col++) {
          const cx = col * hw + (row % 2 ? hw / 2 : 0);
          const cy = row * R * 1.5;
          g.beginPath();
          for (let k2 = 0; k2 < 6; k2++) {
            const a = (k2 * TAU) / 6 + TAU / 12;
            const px = cx + Math.cos(a) * R;
            const py = cy + Math.sin(a) * R;
            if (k2 === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          if (rnd() < 0.06) {
            g.fillStyle = A(0.06);
            g.fill();
          }
          g.stroke();
        }
      }
      break;
    }
    case 'matrix': {
      for (let i = 0; i <= cols; i++) {
        g.strokeStyle = A(0.045);
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(i * cell, 0);
        g.lineTo(i * cell, H);
        g.stroke();
      }
      g.fillStyle = A(0.16);
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) g.fillRect(i * cell - 0.75, j * cell - 0.75, 1.5, 1.5);
      break;
    }
    case 'void':
    default: {
      const stars = Math.floor((cols * rows) / 2.5);
      for (let n = 0; n < stars; n++) {
        g.fillStyle = A(0.08 + rnd() * 0.3);
        const s = rnd() < 0.85 ? 1 : 2;
        g.fillRect(rnd() * W, rnd() * H, s, s);
      }
      break;
    }
  }

  if (!bright) {
    // inner vignette
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }
}

// ---------- settings chip previews ----------

export function paintShapeChip(canvas, shape, colorId, t = 0) {
  const g = canvas.getContext('2d');
  const dpr = canvas.width / canvas.clientWidth || 2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  g.clearRect(0, 0, w, h);
  const cell = Math.min(h * 0.62, w / 4.6);
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push({ x: w / 2 + (1.5 - i) * cell, y: h / 2 });
  drawSnake(g, pts, cell, { shape, colorId, time: t, dir: { x: 1, y: 0 }, glow: 0.7 });
}

export function paintStyleChip(canvas, style, color) {
  const g = canvas.getContext('2d');
  const dpr = canvas.width / canvas.clientWidth || 2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const cell = 9;
  g.clearRect(0, 0, w, h);
  drawBoardPattern(g, style, color, Math.ceil(w / cell), Math.ceil(h / cell), cell, false);
  if (style === 'matrix') {
    g.font = `bold ${cell}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    for (let c = 0; c < w / cell; c += 2)
      for (let j = 0; j < 5; j++) {
        g.fillStyle = hexA(color, 0.5 - j * 0.09);
        g.fillText(GLYPHS[(c * 7 + j * 3) % GLYPHS.length], (c + 0.5) * cell, ((c * 3) % 5) * cell + j * cell + cell);
      }
  }
  g.strokeStyle = hexA(color, 0.6);
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
}

export function paintFoodChip(canvas, icon, color) {
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width, canvas.height) * 1.5;
  g.drawImage(getFoodSprite(icon, color, s), (canvas.width - s) / 2, (canvas.height - s) / 2);
}

// ---------- the renderer ----------

export class Renderer {
  constructor(canvas, { preview = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.preview = preview;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.board = null; // { x, y, cell, cols, rows }
    this.s = null;
    this.layer = null;
    this.bright = null;
    this.dirty = true;
    this.scratch = document.createElement('canvas');
    this.tintR = document.createElement('canvas');
    this.tintC = document.createElement('canvas');
    this.reset();
  }

  reset() {
    this.particles = [];
    this.texts = [];
    this.waves = [];
    this.portals = [];
    this.gulps = [];
    this.glitch = { until: 0, dur: 1, k: 0 };
    this.shake = 0;
    this.flash = { a: 0, color: '#ffffff' };
    this.death = null;
    this.lastDust = 0;
    this.rain = null;
  }

  setSize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    for (const c of [this.scratch, this.tintR, this.tintC]) {
      c.width = W;
      c.height = H;
    }
    this.dirty = true;
  }

  setBoard(board) {
    this.board = board;
    this.dirty = true;
    this.rain = null;
  }

  setSettings(s) {
    this.s = { ...s };
    this.dirty = true;
  }

  get accent() {
    return byId(BOARD_COLORS, this.s.boardColor).c;
  }

  cellCenter(x, y) {
    const b = this.board;
    return { x: b.x + (x + 0.5) * b.cell, y: b.y + (y + 0.5) * b.cell };
  }

  buildBoard() {
    const b = this.board;
    const W = b.cols * b.cell;
    const H = b.rows * b.cell;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * this.dpr);
      c.height = Math.ceil(H * this.dpr);
      const g = c.getContext('2d');
      g.scale(this.dpr, this.dpr);
      return [c, g];
    };
    const [layer, g1] = mk();
    drawBoardPattern(g1, this.s.boardStyle, this.accent, b.cols, b.rows, b.cell, false);
    const [bright, g2] = mk();
    drawBoardPattern(g2, this.s.boardStyle === 'void' ? 'grid' : this.s.boardStyle, this.accent, b.cols, b.rows, b.cell, true);
    this.layer = layer;
    this.bright = bright;
    this.dirty = false;
  }

  // ----- FX triggers -----

  fxEat(food, points, snakeLen) {
    const c = this.cellCenter(food.x, food.y);
    const col = foodColor(this.s.foodColor, food.seed);
    const cell = this.board.cell;
    for (let i = 0; i < (this.preview ? 14 : 34); i++) {
      const a = Math.random() * TAU;
      const v = (60 + Math.random() * 260) * (cell / 22);
      this.particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, ttl: 0.4 + Math.random() * 0.5, size: 1.5 + Math.random() * cell * 0.16, color: i % 5 === 0 ? '#ffffff' : col });
    }
    this.waves.push({ x: c.x, y: c.y, t0: performance.now(), color: col });
    this.gulps.push({ at: snakeLen });
    if (!this.preview) {
      if (points) this.texts.push({ x: c.x, y: c.y - cell * 0.4, text: `+${points}`, color: col, t0: performance.now() });
      this.kickGlitch(140, 0.35);
      this.flash = { a: 0.07, color: col };
    }
  }

  fxWrap(w) {
    this.portals.push({ from: w.from, to: w.to, dir: w.dir, t0: performance.now() });
  }

  fxDeath(game) {
    const head = game.snake[0];
    const c = this.cellCenter(head.x, head.y);
    this.death = { t0: performance.now(), dissolved: 0 };
    this.waves.push({ x: c.x, y: c.y, t0: performance.now(), color: '#ff2a55', big: true });
    if (!this.preview) {
      this.kickGlitch(650, 1);
      this.shake = 14;
      this.flash = { a: 0.35, color: '#ff2a55' };
    }
  }

  kickGlitch(ms, k) {
    const now = performance.now();
    if (now + ms > this.glitch.until || k > this.glitch.k) this.glitch = { until: now + ms, dur: ms, k };
  }

  // True once the death dissolve has consumed the whole snake.
  deathDone(game) {
    return !!this.death && this.death.dissolved >= game.snake.length && performance.now() - this.death.t0 > 900;
  }

  // ----- frame -----

  render(game, alpha, now, opts = {}) {
    try {
      this.renderFrame(game, alpha, now, opts);
    } catch (err) {
      console.error(err);
      this.canvas.width = this.canvas.width; // resets any leaked save()/clip state
    }
  }

  renderFrame(game, alpha, now, opts) {
    const { ctx, dpr } = this;
    const t = now / 1000;
    const dt = Math.min(0.05, this._last ? (now - this._last) / 1000 : 0.016);
    this._last = now;
    if (!this.board || !this.s) return;
    if (this.dirty) this.buildBoard();
    const b = this.board;
    const bw = b.cols * b.cell;
    const bh = b.rows * b.cell;
    const accent = this.accent;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // background
    ctx.fillStyle = '#020309';
    ctx.fillRect(0, 0, this.w, this.h);
    if (!this.preview) {
      const g1 = ctx.createRadialGradient(this.w * (0.2 + 0.1 * Math.sin(t * 0.3)), this.h * 0.15, 0, this.w * 0.2, this.h * 0.15, this.h * 0.7);
      g1.addColorStop(0, hexA(accent, 0.13));
      g1.addColorStop(1, hexA(accent, 0));
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, this.w, this.h);
      const g2 = ctx.createRadialGradient(this.w * 0.85, this.h * (0.85 + 0.05 * Math.cos(t * 0.23)), 0, this.w * 0.85, this.h * 0.85, this.h * 0.6);
      g2.addColorStop(0, 'rgba(255,43,214,0.09)');
      g2.addColorStop(1, 'rgba(255,43,214,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= Math.pow(0.004, dt);
    }

    ctx.drawImage(this.layer, b.x, b.y, bw, bh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, bw, bh);
    ctx.clip();
    if (this.s.boardStyle === 'matrix') this.drawRain(ctx, t, dt, accent);
    this.drawSweep(ctx, t, accent, bw, bh);
    this.drawWaves(ctx, now, bw, bh);
    this.drawPortals(ctx, now);
    this.drawSnakeOnBoard(ctx, game, alpha, t, now);
    ctx.restore();

    this.drawBorder(ctx, t, accent, bw, bh, game);
    // food sits outside the board clip so edge-cell glow/reticle isn't cut off
    this.drawFood(ctx, game, now, t);
    this.drawParticles(ctx, dt);
    this.drawTexts(ctx, now);
    ctx.restore();

    if (opts.dim) {
      ctx.fillStyle = `rgba(2,3,9,${opts.dim})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    if (this.flash.a > 0.004) {
      ctx.globalAlpha = this.flash.a;
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      this.flash.a *= Math.pow(0.002, dt);
    }

    if (now < this.glitch.until) this.postGlitch(now);
  }

  drawSweep(ctx, t, accent, bw, bh) {
    const b = this.board;
    const period = 5;
    const u = (t % period) / period;
    const y = b.y - bh * 0.2 + u * bh * 1.4;
    const hh = b.cell * 3;
    const g = ctx.createLinearGradient(0, y - hh, 0, y);
    g.addColorStop(0, hexA(accent, 0));
    g.addColorStop(1, hexA(accent, 0.07));
    ctx.fillStyle = g;
    ctx.fillRect(b.x, y - hh, bw, hh);
    ctx.fillStyle = hexA(accent, 0.18);
    ctx.fillRect(b.x, y, bw, 1);
  }

  drawRain(ctx, t, dt, accent) {
    const b = this.board;
    if (!this.rain) {
      this.rain = [];
      for (let i = 0; i < b.cols; i++)
        this.rain.push({ y: Math.random() * b.rows * 2 - b.rows, v: 3 + Math.random() * 7, len: 5 + Math.floor(Math.random() * 9), seed: Math.floor(Math.random() * 999) });
    }
    ctx.font = `600 ${Math.round(b.cell * 0.6)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.rain.length; i++) {
      const r = this.rain[i];
      r.y += r.v * dt;
      if (r.y - r.len > b.rows) {
        r.y = -Math.random() * b.rows * 0.5;
        r.v = 3 + Math.random() * 7;
      }
      const hy = Math.floor(r.y);
      for (let j = 0; j < r.len; j++) {
        const cy = hy - j;
        if (cy < 0 || cy >= b.rows) continue;
        const a = j === 0 ? 0.32 : 0.14 * (1 - j / r.len);
        ctx.fillStyle = j === 0 ? `rgba(255,255,255,${a})` : hexA(accent, a);
        const gi = (r.seed + cy * 7 + Math.floor(t * 6 + j) * (j % 3 === 0 ? 1 : 0)) % GLYPHS.length;
        ctx.fillText(GLYPHS[gi], b.x + (i + 0.5) * b.cell, b.y + (cy + 0.5) * b.cell);
      }
    }
  }

  drawWaves(ctx, now, bw, bh) {
    const b = this.board;
    this.waves = this.waves.filter((w) => now - w.t0 < 900);
    for (const w of this.waves) {
      const age = Math.max(0, now - w.t0) / 1000;
      const r = age * (w.big ? 900 : 620) * (this.preview ? 0.5 : 1);
      const width = b.cell * (w.big ? 2.5 : 1.6);
      const fade = Math.max(0, 1 - age / 0.9);
      ctx.save();
      ctx.beginPath();
      ctx.arc(w.x, w.y, r + width, 0, TAU);
      ctx.arc(w.x, w.y, Math.max(0, r - width), 0, TAU, true);
      ctx.clip();
      ctx.globalAlpha = fade;
      ctx.drawImage(this.bright, b.x, b.y, bw, bh);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = fade * 0.5;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(0.1, r), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPortals(ctx, now) {
    const b = this.board;
    this.portals = this.portals.filter((p) => now - p.t0 < 450);
    const col = snakeColor(this.s.snakeColor, 0, now / 1000);
    for (const p of this.portals) {
      const fade = 1 - (now - p.t0) / 450;
      // glow inward from the entry edge (at `to`) and the exit edge (at `from`)
      for (const [cx, cy, sgn] of [[p.to.x, p.to.y, 1], [p.from.x, p.from.y, -1]]) {
        const d = { x: p.dir.x * sgn, y: p.dir.y * sgn };
        const c = this.cellCenter(cx, cy);
        const depth = b.cell * 2.2;
        const span = b.cell * 3;
        let x0, y0, x1, y1, rx, ry, rw, rh;
        if (d.x !== 0) {
          const edgeX = d.x > 0 ? b.x : b.x + b.cols * b.cell;
          x0 = edgeX;
          x1 = edgeX + d.x * depth;
          y0 = y1 = c.y;
          rx = Math.min(x0, x1);
          rw = depth;
          ry = c.y - span / 2;
          rh = span;
        } else {
          const edgeY = d.y > 0 ? b.y : b.y + b.rows * b.cell;
          y0 = edgeY;
          y1 = edgeY + d.y * depth;
          x0 = x1 = c.x;
          ry = Math.min(y0, y1);
          rh = depth;
          rx = c.x - span / 2;
          rw = span;
        }
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, hexA(col.startsWith('#') ? col : '#ffffff', 0.55 * fade));
        g.addColorStop(1, hexA(col.startsWith('#') ? col : '#ffffff', 0));
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
  }

  drawBorder(ctx, t, accent, bw, bh, game) {
    const b = this.board;
    ctx.save();
    ctx.strokeStyle = hexA(accent, 0.55 + 0.08 * Math.sin(t * 2.3));
    ctx.lineWidth = 1.5;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.strokeRect(b.x - 0.75, b.y - 0.75, bw + 1.5, bh + 1.5);
    ctx.shadowBlur = 0;

    // marching dashes: the edges are portals
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = -t * 18;
    ctx.strokeStyle = hexA(accent, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x - 5.5, b.y - 5.5, bw + 11, bh + 11);
    ctx.setLineDash([]);

    // corner brackets
    const L = Math.min(b.cell * 1.3, 26);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [b.x - 5, b.y - 5, 1, 1],
      [b.x + bw + 5, b.y - 5, -1, 1],
      [b.x - 5, b.y + bh + 5, 1, -1],
      [b.x + bw + 5, b.y + bh + 5, -1, -1],
    ]) {
      ctx.moveTo(cx + sx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * L);
    }
    ctx.stroke();
    ctx.restore();

    if (!this.preview && this.h - (b.y + bh) > 26) {
      ctx.save();
      ctx.font = '600 9px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.fillStyle = hexA(accent, 0.55);
      ctx.textBaseline = 'top';
      const head = game.snake[0];
      ctx.textAlign = 'left';
      ctx.fillText(`GRID ${b.cols}×${b.rows} // X:${String(head.x).padStart(2, '0')} Y:${String(head.y).padStart(2, '0')}`, b.x, b.y + bh + 12);
      ctx.textAlign = 'right';
      ctx.fillText(Math.floor(t * 2) % 2 ? 'EDGE WRAP: ONLINE ▮' : 'EDGE WRAP: ONLINE ▯', b.x + bw, b.y + bh + 12);
      ctx.restore();
    }
  }

  drawFood(ctx, game, now, t) {
    const f = game.food;
    if (!f) return;
    const b = this.board;
    const c = this.cellCenter(f.x, f.y);
    const col = foodColor(this.s.foodColor, f.seed);
    const icon = foodIcon(this.s.foodIcon, f.seed);
    const age = Math.max(0, now - f.born);
    const u = Math.min(1, age / 380);
    const back = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
    const pulse = 1 + 0.07 * Math.sin(t * 6.5);
    const bob = Math.sin(t * 3) * b.cell * 0.04;

    ctx.save();
    // spawn beam
    if (age < 520) {
      const k = 1 - age / 520;
      const g = ctx.createLinearGradient(0, b.y, 0, c.y);
      g.addColorStop(0, hexA(col, 0));
      g.addColorStop(1, hexA(col, 0.5 * k));
      ctx.fillStyle = g;
      const bwid = b.cell * 0.35 * k;
      ctx.fillRect(c.x - bwid / 2, b.y, bwid, c.y - b.y);
    }
    // floor glow
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, b.cell * 1.6);
    fg.addColorStop(0, hexA(col, 0.28));
    fg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(c.x - b.cell * 1.6, c.y - b.cell * 1.6, b.cell * 3.2, b.cell * 3.2);
    ctx.globalCompositeOperation = 'source-over';

    // sprite
    const S = b.cell * 2.3 * Math.max(0, back) * pulse;
    if (S > 1) {
      const sprite = getFoodSprite(icon, col, b.cell * 2.3 * this.dpr * 1.1);
      const jitter = age < 380 && Math.random() < 0.4 ? (Math.random() - 0.5) * b.cell * 0.4 : 0;
      ctx.drawImage(sprite, c.x - S / 2 + jitter, c.y - S / 2 + bob, S, S);
    }

    // rotating target reticle
    ctx.translate(c.x, c.y + bob);
    ctx.rotate(t * 1.4);
    ctx.strokeStyle = hexA(col, 0.8);
    ctx.lineWidth = 1.5;
    const R = b.cell * 0.82 * (2 - u);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4;
      ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.arc(0, 0, R, a, a + 0.75);
    }
    ctx.stroke();
    ctx.restore();
  }

  snakePoints(game, alpha) {
    const { cols, rows, snake, prev } = game;
    const n = snake.length;
    const pos = new Array(n);
    for (let i = 0; i < n; i++) {
      const c = snake[i];
      const p = prev[i] || c;
      let dx = c.x - p.x;
      let dy = c.y - p.y;
      if (dx > 1) dx = -1;
      else if (dx < -1) dx = 1;
      if (dy > 1) dy = -1;
      else if (dy < -1) dy = 1;
      pos[i] = { x: c.x - dx * (1 - alpha), y: c.y - dy * (1 - alpha) };
    }
    // unwrap into one continuous polyline
    for (let i = 1; i < n; i++) {
      let ddx = pos[i].x - pos[i - 1].x;
      let ddy = pos[i].y - pos[i - 1].y;
      ddx -= Math.round(ddx / cols) * cols;
      ddy -= Math.round(ddy / rows) * rows;
      pos[i] = { x: pos[i - 1].x + ddx, y: pos[i - 1].y + ddy };
    }
    return pos;
  }

  drawSnakeOnBoard(ctx, game, alpha, t, now) {
    const b = this.board;
    const { cols, rows } = game;
    const n = game.snake.length;
    const u = this.snakePoints(game, game.alive ? alpha : 1);

    // death dissolve bookkeeping
    let skip = 0;
    if (this.death) {
      const el = now - this.death.t0;
      const per = Math.min(55, 1000 / n);
      const target = el < 420 ? 0 : Math.min(n, Math.floor((el - 420) / per) + 1);
      while (this.death.dissolved < target) {
        const i = this.death.dissolved++;
        const seg = game.snake[i];
        const c = this.cellCenter(seg.x, seg.y);
        const col = snakeColor(this.s.snakeColor, i, t);
        const hex = col.startsWith('#') ? col : '#ffffff';
        for (let k = 0; k < (this.preview ? 4 : 9); k++) {
          const a = Math.random() * TAU;
          const v = (40 + Math.random() * 180) * (b.cell / 22);
          this.particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0, ttl: 0.5 + Math.random() * 0.6, size: 1.5 + Math.random() * b.cell * 0.2, color: k % 4 === 0 ? '#ffffff' : hex });
        }
        if (!this.preview && i % 4 === 0) this.kickGlitch(90, 0.3);
      }
      skip = this.death.dissolved;
      if (skip >= n) return;
    }

    // gulp bulges travelling down the body
    const steps = game.steps + (game.alive ? alpha : 1);
    for (const g of this.gulps) if (g.step === undefined) g.step = game.steps - 1;
    this.gulps = this.gulps.filter((g) => steps - g.step < n + 2);
    const gulps = this.gulps;
    const bulge = gulps.length
      ? (i) => {
          let s = 0;
          for (const g of gulps) {
            const pos = steps - g.step - 1;
            s += 0.32 * Math.exp(-((i - pos) * (i - pos)) / 1.4);
          }
          return s;
        }
      : null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of u) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const kx0 = Math.ceil((-1.5 - maxX) / cols);
    const kx1 = Math.floor((cols + 0.5 - minX) / cols);
    const ky0 = Math.ceil((-1.5 - maxY) / rows);
    const ky1 = Math.floor((rows + 0.5 - minY) / rows);

    const deadFlicker = !game.alive && Math.floor(now / 70) % 2 === 0;
    const opts = {
      shape: this.s.snakeShape,
      colorId: this.s.snakeColor,
      time: t,
      dir: game.dir,
      dead: !game.alive,
      skip,
      bulge,
      glow: deadFlicker ? 0.3 : 1,
    };
    for (let kx = kx0; kx <= kx1; kx++)
      for (let ky = ky0; ky <= ky1; ky++) {
        const pts = u.map((p) => ({ x: b.x + (p.x + kx * cols + 0.5) * b.cell, y: b.y + (p.y + ky * rows + 0.5) * b.cell }));
        drawSnake(ctx, pts, b.cell, opts);
      }

    // tail data-dust
    if (game.alive && game.started && now - this.lastDust > 70) {
      this.lastDust = now;
      const tail = game.snake[n - 1];
      const c = this.cellCenter(tail.x, tail.y);
      const col = snakeColor(this.s.snakeColor, n - 1, t);
      this.particles.push({ x: c.x + (Math.random() - 0.5) * b.cell * 0.6, y: c.y + (Math.random() - 0.5) * b.cell * 0.6, vx: (Math.random() - 0.5) * 12, vy: -8 - Math.random() * 14, life: 0, ttl: 0.6 + Math.random() * 0.6, size: 1 + Math.random() * 1.6, color: col.startsWith('#') ? col : '#ffffff', faint: true });
    }
  }

  drawParticles(ctx, dt) {
    const ps = this.particles;
    if (ps.length > 600) ps.splice(0, ps.length - 600);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const drag = Math.pow(0.06, dt);
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.ttl) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      const k = 1 - p.life / p.ttl;
      ctx.globalAlpha = (p.faint ? 0.45 : 1) * k;
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * k);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      ps[w++] = p;
    }
    ps.length = w;
    ctx.restore();
  }

  drawTexts(ctx, now) {
    this.texts = this.texts.filter((x) => now - x.t0 < 850);
    const cell = this.board.cell;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(Math.max(13, cell * 0.8))}px ui-monospace, "SF Mono", Menlo, monospace`;
    for (const x of this.texts) {
      const u = (now - x.t0) / 850;
      const jit = u < 0.15 ? (Math.random() - 0.5) * 6 : 0;
      const y = x.y - u * cell * 2;
      ctx.globalAlpha = 1 - u * u;
      ctx.fillStyle = '#ff2bd6';
      ctx.fillText(x.text, x.x + jit - 1.5, y);
      ctx.fillStyle = '#00f0ff';
      ctx.fillText(x.text, x.x + jit + 1.5, y);
      ctx.shadowColor = x.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(x.text, x.x + jit, y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  postGlitch(now) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const k = this.glitch.k * Math.max(0, (this.glitch.until - now) / this.glitch.dur);
    if (k < 0.02) return;
    const sc = this.scratch.getContext('2d');
    sc.globalCompositeOperation = 'copy';
    sc.drawImage(canvas, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // chromatic aberration: split into red / cyan plates and re-add offset
    if (k > 0.25) {
      const off = Math.round(k * 7 * this.dpr);
      for (const [cv, color] of [[this.tintR, '#ff0000'], [this.tintC, '#00ffff']]) {
        const g = cv.getContext('2d');
        g.globalCompositeOperation = 'copy';
        g.drawImage(this.scratch, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = color;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      }
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(this.tintC, -off, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.tintR, off, 0);
      ctx.globalCompositeOperation = 'source-over';
      sc.globalCompositeOperation = 'copy';
      sc.drawImage(canvas, 0, 0);
      sc.globalCompositeOperation = 'source-over';
    }

    // horizontal slice displacement
    const strips = 2 + Math.floor(k * 9);
    for (let i = 0; i < strips; i++) {
      const y = Math.floor(Math.random() * H);
      const h = Math.floor(2 + Math.random() * H * 0.05 * (0.3 + k));
      const dx = Math.round((Math.random() - 0.5) * 70 * k * this.dpr);
      ctx.drawImage(this.scratch, 0, y, W, h, dx, y, W, h);
    }
    // neon noise bars
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 1 + k * 5; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,240,255,${0.18 * k})` : `rgba(255,43,214,${0.18 * k})`;
      ctx.fillRect(Math.random() * W * 0.5, Math.random() * H, W * (0.2 + Math.random() * 0.8), 1 + Math.random() * 3 * this.dpr);
    }
    ctx.restore();
  }
}
