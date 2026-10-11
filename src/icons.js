// Pixel-art food icons, rendered into cached glowing sprites.

const MASKS = {
  apple: [
    '.....##..',
    '....#....',
    '.###.###.',
    '#########',
    '######.##',
    '#######.#',
    '#########',
    '.#######.',
    '..##.##..',
  ],
  chip: [
    '..#.#.#..',
    '.#######.',
    '##.....##',
    '.#.###.#.',
    '##.#.#.##',
    '.#.###.#.',
    '##.....##',
    '.#######.',
    '..#.#.#..',
  ],
  bug: [
    '.#.....#.',
    '..#...#..',
    '...###...',
    '#.#####.#',
    '.##.#.##.',
    '###.#.###',
    '.##.#.##.',
    '#.#####.#',
    '...###...',
  ],
  skull: [
    '..#####..',
    '.#######.',
    '#########',
    '#..###..#',
    '#..###..#',
    '####.####',
    '.#######.',
    '..#.#.#..',
    '..#####..',
  ],
  gem: [
    '.........',
    '..#####..',
    '.##.#.##.',
    '#########',
    '.#.###.#.',
    '..#####..',
    '...###...',
    '....#....',
    '.........',
  ],
  bolt: [
    '....####.',
    '...####..',
    '..####...',
    '.#######.',
    '..#####..',
    '...###...',
    '..###....',
    '.##......',
    '#........',
  ],
  invader: [
    '..#.....#..',
    '...#...#...',
    '..#######..',
    '.##.###.##.',
    '###########',
    '#.#######.#',
    '#.#.....#.#',
    '...##.##...',
  ],
};

export const ICON_IDS = ['orb', 'apple', 'chip', 'bug', 'skull', 'gem', 'bolt', 'invader'];

const cache = new Map();

// Returns a square canvas (size px) with the glowing icon centered in the inner ~55%.
export function getFoodSprite(id, color, size) {
  size = Math.max(8, Math.round(size));
  const key = `${id}|${color}|${size}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 200) cache.clear();
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const inner = size * 0.5;

  if (id === 'orb') {
    const cx = size / 2;
    const r = inner * 0.42;
    g.shadowColor = color;
    g.shadowBlur = size * 0.12;
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, inner * 0.07);
    g.beginPath();
    g.arc(cx, cx, r * 1.25, 0, Math.PI * 2);
    g.stroke();
    const grad = g.createRadialGradient(cx - r * 0.3, cx - r * 0.3, 0, cx, cx, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, color);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cx, r * 0.85, 0, Math.PI * 2);
    g.fill();
  } else {
    const mask = MASKS[id] || MASKS.apple;
    const h = mask.length;
    const w = mask[0].length;
    const px = inner / Math.max(w, h);
    const x0 = (size - px * w) / 2;
    const y0 = (size - px * h) / 2;
    const path = new Path2D();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (mask[y][x] === '#') path.rect(x0 + x * px, y0 + y * px, px + 0.35, px + 0.35);
    g.shadowColor = color;
    g.shadowBlur = size * 0.14;
    g.fillStyle = color;
    g.fill(path);
    g.shadowBlur = 0;
    g.fill(path);
    // hot core highlight + scanline texture
    g.save();
    g.clip(path);
    const hl = g.createLinearGradient(0, y0, 0, y0 + px * h);
    hl.addColorStop(0, 'rgba(255,255,255,0.55)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    hl.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = hl;
    g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = y0; y < y0 + px * h; y += Math.max(2, px / 2)) g.fillRect(0, y, size, Math.max(1, px / 6));
    g.restore();
  }
  cache.set(key, c);
  return c;
}
