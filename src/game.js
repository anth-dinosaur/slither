// Pure snake simulation on a torus: edges wrap, only self-collision kills.

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const MAX_QUEUE = 3;

export class Game {
  constructor(cols, rows, rand = Math.random) {
    this.cols = cols;
    this.rows = rows;
    this.rand = rand;
    this.reset();
  }

  reset() {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    this.snake = [];
    for (let i = 0; i < 4; i++) this.snake.push({ x: (cx - i + this.cols) % this.cols, y: cy });
    this.prev = this.snake.map((p) => ({ ...p }));
    this.dir = DIRS.right;
    this.queue = [];
    this.alive = true;
    this.started = false;
    this.won = false;
    this.grow = 0;
    this.eaten = 0;
    this.steps = 0;
    this.food = null;
    this.spawnFood();
  }

  wrap(x, y) {
    return { x: ((x % this.cols) + this.cols) % this.cols, y: ((y % this.rows) + this.rows) % this.rows };
  }

  // Queue a turn; reversals and duplicates relative to the last queued heading are ignored.
  queueDir(d) {
    if (!this.alive) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d.x === -last.x && d.y === -last.y) return false;
    if (d.x === last.x && d.y === last.y) {
      if (!this.started) this.started = true;
      return false;
    }
    if (this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(d);
    this.started = true;
    return true;
  }

  // First move of a run: any direction is allowed (turning around flips the snake).
  launch(d) {
    if (d.x === -this.dir.x && d.y === -this.dir.y) {
      this.snake.reverse();
      this.prev = this.snake.map((p) => ({ ...p }));
    }
    this.dir = d;
    this.queue = [];
    this.started = true;
  }

  occupied(x, y, ignoreTail = false) {
    const n = ignoreTail ? this.snake.length - 1 : this.snake.length;
    for (let i = 0; i < n; i++) if (this.snake[i].x === x && this.snake[i].y === y) return true;
    return false;
  }

  spawnFood() {
    const free = [];
    const taken = new Set(this.snake.map((p) => p.y * this.cols + p.x));
    for (let i = 0; i < this.cols * this.rows; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) {
      this.food = null;
      this.won = true;
      return;
    }
    const idx = free[Math.floor(this.rand() * free.length)];
    this.food = { x: idx % this.cols, y: Math.floor(idx / this.cols), seed: this.rand(), born: performance.now() };
  }

  step() {
    if (!this.alive) return { died: false };
    if (this.queue.length) this.dir = this.queue.shift();
    const head = this.snake[0];
    const next = this.wrap(head.x + this.dir.x, head.y + this.dir.y);
    const wrapped = Math.abs(next.x - head.x) > 1 || Math.abs(next.y - head.y) > 1;
    const eating = this.food && next.x === this.food.x && next.y === this.food.y;
    const willGrow = this.grow > 0 || eating;

    // The tail vacates its cell this tick unless we're growing.
    if (this.occupied(next.x, next.y, !willGrow)) {
      this.alive = false;
      this.prev = this.snake.map((p) => ({ ...p }));
      return { died: true, at: next };
    }

    const old = this.snake;
    this.snake = [next, ...old];
    if (eating) this.grow += 1;
    if (this.grow > 0) this.grow--;
    else this.snake.pop();
    this.prev = this.snake.map((_, i) => ({ ...old[Math.min(i, old.length - 1)] }));
    this.steps++;

    let ate = null;
    if (eating) {
      ate = { ...this.food };
      this.eaten++;
      this.spawnFood();
    }
    return { ate, wrapped: wrapped ? { from: head, to: next, dir: this.dir } : null, won: this.won };
  }
}

// ---------- Attract-mode autopilot (title screen + settings preview) ----------

function floodCount(game, sx, sy, blocked) {
  const { cols, rows } = game;
  const seen = new Uint8Array(cols * rows);
  for (const k of blocked) seen[k] = 1;
  const stack = [sy * cols + sx];
  let count = 0;
  while (stack.length && count < 400) {
    const k = stack.pop();
    if (seen[k]) continue;
    seen[k] = 1;
    count++;
    const x = k % cols;
    const y = (k / cols) | 0;
    stack.push(y * cols + ((x + 1) % cols), y * cols + ((x - 1 + cols) % cols));
    stack.push(((y + 1) % rows) * cols + x, ((y - 1 + rows) % rows) * cols + x);
  }
  return count;
}

export function autopilot(game) {
  const { cols, rows, snake, food } = game;
  const heading = game.queue.length ? game.queue[game.queue.length - 1] : game.dir;
  const body = new Set();
  for (let i = 0; i < snake.length - 1; i++) body.add(snake[i].y * cols + snake[i].x);
  const options = Object.values(DIRS).filter((d) => !(d.x === -heading.x && d.y === -heading.y));
  const head = snake[0];

  // BFS toward food on the torus.
  let best = null;
  if (food) {
    const start = head.y * cols + head.x;
    const prevStep = new Map([[start, null]]);
    const q = [start];
    const target = food.y * cols + food.x;
    while (q.length) {
      const k = q.shift();
      if (k === target) break;
      const x = k % cols;
      const y = (k / cols) | 0;
      for (const d of Object.values(DIRS)) {
        const n = game.wrap(x + d.x, y + d.y);
        const nk = n.y * cols + n.x;
        if (prevStep.has(nk) || body.has(nk)) continue;
        prevStep.set(nk, { k, d });
        q.push(nk);
      }
    }
    if (prevStep.has(target)) {
      let k = target;
      let d = null;
      while (prevStep.get(k)) {
        ({ k, d } = { k: prevStep.get(k).k, d: prevStep.get(k).d });
      }
      best = d;
    }
  }

  const room = (d) => {
    const n = game.wrap(head.x + d.x, head.y + d.y);
    if (body.has(n.y * cols + n.x)) return -1;
    return floodCount(game, n.x, n.y, body);
  };
  const need = Math.min(snake.length + 2, 60);
  if (best && room(best) >= need) return best;
  let pick = heading;
  let pickRoom = -2;
  for (const d of options) {
    const r = room(d) + Math.random() * 0.5;
    if (r > pickRoom) {
      pickRoom = r;
      pick = d;
    }
  }
  return pick;
}
