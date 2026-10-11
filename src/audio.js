// Procedural WebAudio SFX: randomized farts (food) and a sad "womp womp" (death).

let ctx = null;
let master = null;
let volume = 0.8;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(comp);
  comp.connect(ctx.destination);
  return ctx;
}

// Must run inside a user gesture on iOS.
export function unlockAudio() {
  try {
    // iOS 17+: play even with the ringer switch on silent.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    /* unsupported */
  }
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') c.resume();
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const FART_TYPES = {
  classic: () => ({ dur: rnd(0.4, 0.75), f0: rnd(70, 110), bend: rnd(0.55, 0.85), duty: rnd(0.25, 0.4), noise: rnd(0.1, 0.2), jitter: rnd(0.1, 0.2), wob: rnd(0.02, 0.08), bursts: 1, lp: rnd(700, 1200) }),
  squeaker: () => ({ dur: rnd(0.18, 0.4), f0: rnd(190, 330), bend: rnd(1.1, 1.5), duty: rnd(0.12, 0.22), noise: rnd(0.03, 0.08), jitter: rnd(0.05, 0.12), wob: rnd(0.05, 0.12), bursts: 1, lp: rnd(1600, 2600) }),
  rumbler: () => ({ dur: rnd(0.85, 1.35), f0: rnd(45, 68), bend: rnd(0.65, 0.9), duty: rnd(0.38, 0.5), noise: rnd(0.2, 0.3), jitter: rnd(0.15, 0.25), wob: rnd(0.04, 0.1), bursts: 1, lp: rnd(450, 800) }),
  sputter: () => ({ dur: rnd(0.55, 0.95), f0: rnd(80, 130), bend: rnd(0.6, 1.0), duty: rnd(0.22, 0.35), noise: rnd(0.12, 0.25), jitter: rnd(0.15, 0.3), wob: rnd(0.02, 0.06), bursts: Math.floor(rnd(3, 7)), lp: rnd(800, 1400) }),
  wet: () => ({ dur: rnd(0.35, 0.65), f0: rnd(55, 90), bend: rnd(0.7, 1.0), duty: rnd(0.4, 0.55), noise: rnd(0.4, 0.6), jitter: rnd(0.3, 0.45), wob: rnd(0.06, 0.14), bursts: Math.floor(rnd(1, 3)), lp: rnd(900, 1500) }),
  trumpet: () => ({ dur: rnd(0.5, 0.9), f0: rnd(105, 150), bend: rnd(0.75, 0.95), duty: rnd(0.16, 0.26), noise: rnd(0.05, 0.1), jitter: rnd(0.06, 0.12), wob: rnd(0.08, 0.16), bursts: 1, lp: rnd(1300, 2100), rise: true }),
};

export function fart() {
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') c.resume();
  const p = FART_TYPES[pick(Object.keys(FART_TYPES))]();
  const sr = c.sampleRate;
  const n = Math.floor(p.dur * sr);
  const buf = c.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);

  // Burst windows (sputter-style gaps).
  const bursts = [];
  if (p.bursts <= 1) bursts.push([0, p.dur]);
  else {
    let t = 0;
    const slot = p.dur / p.bursts;
    for (let i = 0; i < p.bursts; i++) {
      const len = slot * rnd(0.45, 0.85);
      bursts.push([t, t + len]);
      t += slot * rnd(0.9, 1.1);
    }
  }
  const burstEnv = (t) => {
    for (const [a, b] of bursts) {
      if (t >= a && t <= b) return Math.min(1, (t - a) / 0.008) * Math.min(1, (b - t) / 0.02);
    }
    return 0;
  };

  let phase = 0;
  let jit = 0;
  let lp = 0;
  const wobRate = rnd(4, 11);
  const swell = rnd(1.5, 4);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = t / p.dur;
    let contour = 1 + (p.bend - 1) * Math.pow(u, 0.8);
    if (p.rise) contour *= 1 + 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.6));
    jit += (Math.random() * 2 - 1) * p.jitter * 0.02;
    jit *= 0.996;
    const f = p.f0 * contour * (1 + p.wob * Math.sin(2 * Math.PI * wobRate * t)) * (1 + jit);
    phase += f / sr;
    phase -= Math.floor(phase);
    const flap = phase < p.duty ? Math.sin((Math.PI * phase) / p.duty) : 0;
    lp += (Math.random() * 2 - 1 - lp) * 0.3;
    const env =
      Math.min(1, t / 0.012) *
      Math.min(1, (p.dur - t) / 0.07) *
      (0.8 + 0.2 * Math.sin(2 * Math.PI * swell * t)) *
      burstEnv(t);
    d[i] = (flap * (1 - p.noise) + lp * p.noise * (0.4 + flap)) * env;
  }

  const t0 = c.currentTime + 0.005;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rnd(0.92, 1.1);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 38;
  const lpf = c.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = p.lp;
  lpf.Q.value = rnd(1, 4);
  const g = c.createGain();
  g.gain.value = 1.4;
  src.connect(hp).connect(lpf).connect(g).connect(master);
  src.start(t0);
}

function wompNote(c, t, dur, f1, f2, vib) {
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.55, t + 0.035);
  out.gain.setValueAtTime(0.55, t + dur * 0.75);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 7;
  filt.frequency.setValueAtTime(260, t);
  filt.frequency.exponentialRampToValueAtTime(1500, t + 0.09);
  filt.frequency.exponentialRampToValueAtTime(800, t + dur * 0.65);
  filt.frequency.exponentialRampToValueAtTime(220, t + dur);

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 5.2;
  lfoGain.gain.setValueAtTime(0, t);
  if (vib) lfoGain.gain.linearRampToValueAtTime(f1 * 0.035, t + dur * 0.6);
  lfo.connect(lfoGain);

  [
    ['sawtooth', 0, 0.5],
    ['sawtooth', 9, 0.5],
    ['square', -1200, 0.25],
  ].forEach(([type, detune, level]) => {
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.setValueAtTime(f1, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    lfoGain.connect(o.frequency);
    const g = c.createGain();
    g.gain.value = level;
    o.connect(g).connect(filt);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  filt.connect(out).connect(master);
}

export function womp() {
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') c.resume();
  const t = c.currentTime + 0.03;
  wompNote(c, t, 0.34, 196, 188, false);
  wompNote(c, t + 0.42, 1.05, 185, 139, true);
}
