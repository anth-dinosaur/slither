import {
  loadSettings,
  saveSettings,
  byId,
  SNAKE_COLORS,
  SNAKE_SHAPES,
  SNAKE_SPEEDS,
  FOOD_COLORS,
  FOOD_ICONS,
  BOARD_STYLES,
  BOARD_COLORS,
  DIFFICULTIES,
} from './settings.js';
import { Game, DIRS, autopilot } from './game.js';
import { Renderer, paintShapeChip, paintStyleChip, paintFoodChip, foodColor } from './render.js';
import { unlockAudio, fart, womp, setVolume } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const renderer = new Renderer(canvas);
const previewCanvas = $('preview');
const preview = new Renderer(previewCanvas, { preview: true });

let settings = loadSettings();
let state = 'title'; // title | ready | playing | paused | dying | over
let resumeState = 'ready';
let game = null;
let demo = null;
let demoAcc = 0;
let acc = 0;
let alpha = 1;
let last = performance.now();
let runTime = 0;
let score = 0;
let settingsFrom = null;
let gridDirty = false;
let dpr = Math.min(window.devicePixelRatio || 1, 3);

// ---------- layout ----------

function insets() {
  const cs = getComputedStyle($('safe-probe'));
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

// Fit a grid into the play area. `size` = cells across the short axis; or keep fixed cols/rows.
function layout(size, fixed) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ins = insets();
  const top = ins.top + 66;
  const bottom = ins.bottom + 36;
  const side = Math.max(ins.left, ins.right) + 12;
  const aw = w - side * 2;
  const ah = h - top - bottom;
  let cell, cols, rows;
  if (fixed) {
    ({ cols, rows } = fixed);
    cell = Math.max(4, Math.floor(Math.min(aw / cols, ah / rows)));
  } else {
    cell = Math.max(8, Math.floor(Math.min(aw, ah) / size));
    cols = Math.max(6, Math.floor(aw / cell));
    rows = Math.max(6, Math.floor(ah / cell));
  }
  return {
    x: Math.round((w - cols * cell) / 2),
    y: Math.round(top + (ah - rows * cell) / 2),
    cell,
    cols,
    rows,
  };
}

const difficulty = () => byId(DIFFICULTIES, settings.difficulty);
const speedMult = () => byId(SNAKE_SPEEDS, settings.snakeSpeed).mult;

function tickInterval(g) {
  const base = difficulty().base / speedMult();
  return Math.max(base * 0.55, base * Math.pow(0.985, g.eaten));
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, dpr);
  if (game && state !== 'title') {
    renderer.setBoard(layout(null, game));
  } else {
    newDemo();
  }
  sizePreview();
}

// ---------- attract mode ----------

function newDemo() {
  const L = layout(difficulty().size);
  demo = new Game(L.cols, L.rows);
  demo.launch(DIRS.right);
  renderer.reset();
  renderer.setBoard(L);
  demoAcc = 0;
}

function runAutopilot(g, r, dt, ms) {
  if (!g.alive) {
    if (r.deathDone(g)) {
      g.reset();
      g.launch(DIRS.right);
      r.reset();
    }
    return 1;
  }
  let a = (g._acc || 0) + dt;
  while (a >= ms) {
    a -= ms;
    g.queueDir(autopilot(g));
    const ev = g.step();
    if (ev.died) {
      r.fxDeath(g);
      break;
    }
    if (ev.ate) r.fxEat(ev.ate, 0, g.snake.length);
    if (ev.wrapped) r.fxWrap(ev.wrapped);
    if (g.snake.length > g.cols * g.rows * 0.45) {
      g.alive = false;
      r.fxDeath(g);
      break;
    }
  }
  g._acc = a;
  return g.alive ? a / ms : 1;
}

// ---------- game flow ----------

function show(id, on) {
  $(id).classList.toggle('hidden', !on);
}

function startRun() {
  const L = layout(difficulty().size);
  game = new Game(L.cols, L.rows);
  renderer.reset();
  renderer.setBoard(L);
  score = 0;
  runTime = 0;
  acc = 0;
  alpha = 1;
  gridDirty = false;
  state = 'ready';
  setHint('SWIPE TO STEER');
  ['screen-title', 'screen-over', 'screen-pause', 'screen-settings'].forEach((s) => show(s, false));
  show('hud', true);
  updateHud();
}

function setHint(text) {
  $('hint').querySelector('.hint-text').textContent = text;
  show('hint', true);
}

function toTitle() {
  state = 'title';
  game = null;
  ['screen-over', 'screen-pause', 'screen-settings', 'hud', 'hint'].forEach((s) => show(s, false));
  show('screen-title', true);
  newDemo();
}

function pause() {
  if (state !== 'playing' && state !== 'ready') return;
  resumeState = state === 'playing' || game.started ? 'resume' : 'ready';
  state = 'paused';
  show('hint', false);
  show('screen-pause', true);
}

function resume() {
  show('screen-pause', false);
  if (gridDirty) {
    startRun();
    toast('GRID REBUILT // NEW RUN');
    return;
  }
  state = 'ready';
  setHint(resumeState === 'resume' ? 'SWIPE TO RESUME' : 'SWIPE TO STEER');
}

function points() {
  return Math.round(difficulty().points * speedMult());
}

function tick() {
  const ev = game.step();
  if (ev.died) {
    die();
    return;
  }
  if (ev.wrapped) renderer.fxWrap(ev.wrapped);
  if (ev.ate) {
    const p = points();
    score += p;
    renderer.fxEat(ev.ate, p, game.snake.length);
    if (settings.sound) fart();
    updateHud(true);
  }
  if (ev.won) {
    game.alive = false;
    state = 'dying';
    renderer.fxDeath(game);
    $('over-title').textContent = 'SYSTEM OVERRIDE';
    $('over-title').dataset.text = 'SYSTEM OVERRIDE';
    $('over-reason').textContent = 'GRID FULLY CONSUMED — YOU WIN';
  }
}

function die() {
  state = 'dying';
  renderer.fxDeath(game);
  canvas.classList.add('rgb-split');
  setTimeout(() => canvas.classList.remove('rgb-split'), 450);
  if (settings.sound) womp();
  $('over-title').textContent = 'CORE DUMPED';
  $('over-title').dataset.text = 'CORE DUMPED';
  $('over-reason').textContent = 'SELF-COLLISION DETECTED';
}

function showOver() {
  state = 'over';
  $('over-score').textContent = String(score);
  $('over-len').textContent = String(game.snake.length);
  const s = Math.floor(runTime / 1000);
  $('over-time').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const scr = $('screen-over');
  scr.style.pointerEvents = 'none';
  show('screen-over', true);
  setTimeout(() => (scr.style.pointerEvents = ''), 650);
}

function updateHud(bump) {
  if (!game) return;
  $('hud-score').textContent = String(score).padStart(6, '0');
  $('hud-len').textContent = String(game.snake.length).padStart(2, '0');
  $('hud-hz').innerHTML = `${(1000 / tickInterval(game)).toFixed(1)}<small>HZ</small>`;
  if (bump) {
    const el = $('hud-score');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1600);
}

// ---------- input ----------

function steer(name) {
  if (state === 'ready') {
    if (!game.started) game.launch(DIRS[name]);
    else game.queueDir(DIRS[name]);
    state = 'playing';
    acc = 0;
    show('hint', false);
    return;
  }
  if (state === 'playing') game.queueDir(DIRS[name]);
}

const SWIPE_PX = 18;
let touch = null;

function dirFrom(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

canvas.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touch = { id: t.identifier, x: t.clientX, y: t.clientY, fired: false };
  },
  { passive: false },
);
canvas.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    if (!touch) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.id) continue;
      const dx = t.clientX - touch.x;
      const dy = t.clientY - touch.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_PX) {
        unlockAudio();
        steer(dirFrom(dx, dy));
        // re-anchor so one continuous drag can chain turns
        touch.x = t.clientX;
        touch.y = t.clientY;
        touch.fired = true;
      }
    }
  },
  { passive: false },
);
canvas.addEventListener('touchend', (e) => {
  unlockAudio();
  if (!touch) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== touch.id) continue;
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    // short fast flick that never crossed the threshold
    if (!touch.fired && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) steer(dirFrom(dx, dy));
    touch = null;
  }
});
canvas.addEventListener('touchcancel', () => (touch = null));

// Mouse drag (desktop testing) — touches are handled above.
let mouse = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || !mouse) return;
  const dx = e.clientX - mouse.x;
  const dy = e.clientY - mouse.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_PX) {
    unlockAudio();
    steer(dirFrom(dx, dy));
    mouse = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('pointerup', () => (mouse = null));

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (!$('screen-settings').classList.contains('hidden')) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  const k = KEYS[e.key] || KEYS[e.key.toLowerCase?.()];
  if (k && (state === 'ready' || state === 'playing')) {
    e.preventDefault();
    steer(k);
  } else if (e.key === ' ' || e.key === 'Escape' || e.key === 'p') {
    e.preventDefault();
    if (state === 'playing' || state === 'ready') pause();
    else if (state === 'paused') resume();
  } else if (e.key === 'Enter') {
    if (state === 'title' || state === 'over') startRun();
  }
});

// Block iOS rubber-banding everywhere except the scrollable settings body.
document.addEventListener(
  'touchmove',
  (e) => {
    if (!e.target.closest?.('.settings-body')) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchend', () => unlockAudio(), { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'playing' || state === 'ready')) pause();
});

// ---------- buttons ----------

const on = (id, fn) =>
  $(id).addEventListener('click', () => {
    unlockAudio();
    fn();
  });
on('btn-play', startRun);
on('btn-config', () => openSettings('title'));
on('btn-pause', pause);
on('btn-resume', resume);
on('btn-restart', startRun);
on('btn-pause-config', () => openSettings('pause'));
on('btn-quit', toTitle);
on('btn-again', startRun);
on('btn-over-config', () => openSettings('over'));
on('btn-over-quit', toTitle);
on('btn-settings-back', closeSettings);

// ---------- settings UI ----------

let tab = 'snake';
let previewGame = null;
let chipTimer = 0;

function applyTheme() {
  const c = byId(BOARD_COLORS, settings.boardColor).c;
  const n = parseInt(c.slice(1), 16);
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--accent-rgb', `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`);
  renderer.setSettings(settings);
  preview.setSettings(settings);
  setVolume(settings.volume);
}

function set(key, value) {
  const prevSize = difficulty().size;
  settings[key] = value;
  saveSettings(settings);
  applyTheme();
  if (key === 'difficulty' && difficulty().size !== prevSize) {
    if (state === 'title') newDemo();
    else if (game) gridDirty = true;
  }
  if (game) updateHud();
  buildTab();
}

function openSettings(from) {
  settingsFrom = from;
  show('screen-settings', true);
  if (from !== 'title') show(from === 'pause' ? 'screen-pause' : 'screen-over', false);
  else show('screen-title', false);
  sizePreview();
  buildTab();
}

function closeSettings() {
  show('screen-settings', false);
  if (settingsFrom === 'title') show('screen-title', true);
  else if (settingsFrom === 'pause') {
    if (gridDirty) {
      startRun();
      toast('GRID REBUILT // NEW RUN');
    } else show('screen-pause', true);
  } else show('screen-over', true);
}

function sizePreview() {
  const w = previewCanvas.clientWidth;
  const h = previewCanvas.clientHeight;
  if (!w || !h) return;
  preview.setSize(w, h, dpr);
  const cell = Math.floor((h - 26) / 5);
  const cols = Math.floor((w - 24) / cell);
  const rows = 5;
  previewGame = new Game(cols, rows);
  previewGame.launch(DIRS.right);
  preview.reset();
  preview.setBoard({ x: Math.round((w - cols * cell) / 2), y: 11, cell, cols, rows });
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  tab = b.dataset.tab;
  [...$('tabs').children].forEach((x) => x.classList.toggle('on', x === b));
  buildTab();
});

function group(label, value, inner) {
  return `<div class="group"><div class="group-label"><span>${label}</span><b>${value}</b></div>${inner}</div>`;
}

function swatches(key, list) {
  return `<div class="swatches">${list
    .map((o) => {
      const special = o.c.startsWith('#') ? '' : o.c;
      return `<button class="swatch ${special} ${settings[key] === o.id ? 'on' : ''}" data-key="${key}" data-val="${o.id}" aria-label="${o.name}" style="--c:${o.c.startsWith('#') ? o.c : '#fff'}"><i></i></button>`;
    })
    .join('')}</div>`;
}

function chips(key, list, { cls = '', canvasKind = '', cols = 3, sub } = {}) {
  return `<div class="chips cols-${cols}">${list
    .map(
      (o) =>
        `<button class="chip ${cls} ${settings[key] === o.id ? 'on' : ''}" data-key="${key}" data-val="${o.id}">${
          canvasKind ? `<canvas data-kind="${canvasKind}" data-id="${o.id}"></canvas>` : ''
        }<span>${o.name}</span>${sub ? `<span class="sub">${sub(o)}</span>` : ''}</button>`,
    )
    .join('')}</div>`;
}

function buildTab() {
  const body = $('settings-body');
  let html = '';
  if (tab === 'snake') {
    html += group('COLOR', byId(SNAKE_COLORS, settings.snakeColor).name, swatches('snakeColor', SNAKE_COLORS));
    html += group('SHAPE', byId(SNAKE_SHAPES, settings.snakeShape).name, chips('snakeShape', SNAKE_SHAPES, { canvasKind: 'shape' }));
    html += group('SPEED', byId(SNAKE_SPEEDS, settings.snakeSpeed).name, chips('snakeSpeed', SNAKE_SPEEDS, { cols: 2, cls: 'big', sub: (o) => o.sub }));
  } else if (tab === 'food') {
    html += group('COLOR', byId(FOOD_COLORS, settings.foodColor).name, swatches('foodColor', FOOD_COLORS));
    html += group('ICON', byId(FOOD_ICONS, settings.foodIcon).name, chips('foodIcon', FOOD_ICONS, { canvasKind: 'food', cls: 'food' }));
  } else if (tab === 'board') {
    html += group('STYLE', byId(BOARD_STYLES, settings.boardStyle).name, chips('boardStyle', BOARD_STYLES, { canvasKind: 'style' }));
    html += group('COLOR', byId(BOARD_COLORS, settings.boardColor).name, swatches('boardColor', BOARD_COLORS));
    html += group(
      'GRID SIZE / DIFFICULTY',
      difficulty().name,
      chips('difficulty', DIFFICULTIES, {
        cols: 2,
        cls: 'big',
        sub: (o) => `${o.size} WIDE · ${(1000 / o.base).toFixed(1)}HZ · ${o.points}PTS`,
      }),
    );
    html += `<div class="note">GRID SIZE + BASE CLOCK ARE SET BY DIFFICULTY. SNAKE SPEED (SNAKE TAB) MULTIPLIES THE CLOCK. THE CLOCK ALSO CREEPS UP AS YOU EAT.</div>`;
  } else {
    html += `<div class="group"><div class="row"><div><div class="name">SOUND FX</div><div class="desc">RANDOMIZED FART ON EVERY FOOD PICKUP.<br/>WOMP WOMP WHEN YOU DIE.</div></div><button class="toggle ${settings.sound ? 'on' : ''}" id="tgl-sound" aria-label="Sound"></button></div></div>`;
    html += group(
      'VOLUME',
      `${Math.round(settings.volume * 100)}%`,
      `<input type="range" id="rng-volume" min="0" max="1" step="0.05" value="${settings.volume}" style="--p:${settings.volume * 100}%" />`,
    );
    html += `<div class="test-row"><button class="btn small" id="btn-test-fart"><span>💨 TEST FART</span></button><button class="btn small" id="btn-test-womp"><span>📯 TEST WOMP</span></button></div>`;
    html += `<div class="note">SOUNDS ARE SYNTHESIZED LIVE — EVERY FART IS UNIQUE.</div>`;
  }
  const scroll = body.scrollTop;
  body.innerHTML = html;
  body.scrollTop = scroll;

  body.querySelectorAll('[data-key]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.key;
      set(key, b.dataset.val);
    }),
  );
  const tgl = $('tgl-sound');
  if (tgl)
    tgl.addEventListener('click', () => {
      unlockAudio();
      set('sound', !settings.sound);
    });
  const rng = $('rng-volume');
  if (rng) {
    rng.addEventListener('input', () => {
      settings.volume = Number(rng.value);
      rng.style.setProperty('--p', `${settings.volume * 100}%`);
      rng.closest('.group').querySelector('b').textContent = `${Math.round(settings.volume * 100)}%`;
      setVolume(settings.volume);
    });
    rng.addEventListener('change', () => saveSettings(settings));
  }
  const tf = $('btn-test-fart');
  if (tf)
    tf.addEventListener('click', () => {
      unlockAudio();
      fart();
    });
  const tw = $('btn-test-womp');
  if (tw)
    tw.addEventListener('click', () => {
      unlockAudio();
      womp();
    });
  requestAnimationFrame(() => paintChips(0));
}

function paintChips(t) {
  const body = $('settings-body');
  body.querySelectorAll('canvas[data-kind]').forEach((c) => {
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const id = c.dataset.id;
    if (c.dataset.kind === 'shape') paintShapeChip(c, id, settings.snakeColor, t);
    else if (c.dataset.kind === 'style') paintStyleChip(c, id, byId(BOARD_COLORS, settings.boardColor).c);
    else if (c.dataset.kind === 'food') paintFoodChip(c, id === 'shuffle' ? 'invader' : id, foodColor(settings.foodColor, 0.37));
  });
}

// ---------- main loop ----------

let frameTimes = [];
function adaptQuality(dt) {
  frameTimes.push(dt);
  if (frameTimes.length < 120) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  frameTimes = [];
  if (avg > 22 && dpr > 1.5) {
    dpr = Math.max(1.5, dpr - 0.5);
    resize();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!document.hidden) adaptQuality(dt);

  const settingsOpen = !$('screen-settings').classList.contains('hidden');

  if (state === 'title') {
    const a = runAutopilot(demo, renderer, dt, Math.max(60, tickInterval(demo) * 0.85));
    if (!settingsOpen) renderer.render(demo, a, now);
  } else if (game) {
    if (state === 'playing') {
      acc += dt;
      runTime += dt;
      let iv = tickInterval(game);
      while (acc >= iv && state === 'playing') {
        acc -= iv;
        tick();
        iv = tickInterval(game);
        if (state === 'playing') updateHud();
      }
      alpha = state === 'playing' ? Math.min(1, acc / iv) : 1;
    }
    if (state === 'dying' && renderer.deathDone(game)) showOver();
    if (!settingsOpen) renderer.render(game, alpha, now);
  }

  if (settingsOpen && previewGame) {
    const a = runAutopilot(previewGame, preview, dt, tickInterval(previewGame) * 1.15);
    preview.render(previewGame, a, now);
    if (tab === 'snake' && now - chipTimer > 66) {
      chipTimer = now;
      paintChips(now / 1000);
    }
  }
}

// ---------- boot ----------

applyTheme();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();
requestAnimationFrame(frame);

// Offline PWA: service workers need a secure context (HTTPS or localhost).
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker:', err));
}

// Debug/QA hook (harmless in production).
window.__slither = {
  get state() {
    return state;
  },
  get game() {
    return game;
  },
  get score() {
    return score;
  },
  get settings() {
    return settings;
  },
  steer,
  startRun,
  set,
};
