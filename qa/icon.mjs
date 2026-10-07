// Renders the app icon with the game's own drawing code → public/icon-{180,512}.png
import { chromium } from 'playwright';
import fs from 'node:fs';
const URL = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(URL);
for (const size of [180, 512]) {
  const data = await p.evaluate(async (size) => {
    const { drawSnake, hexA } = await import('/src/render.js');
    const { getFoodSprite } = await import('/src/icons.js');
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.75);
    bg.addColorStop(0, '#0a1a2a');
    bg.addColorStop(1, '#020309');
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    const cell = size / 7;
    g.strokeStyle = hexA('#00f0ff', 0.12);
    g.lineWidth = Math.max(1, size / 256);
    for (let i = 0; i <= 7; i++) {
      g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke();
      g.beginPath(); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke();
    }
    // S-shaped snake
    const path = [[5,1],[4,1],[3,1],[2,1],[1,1],[1,2],[1,3],[2,3],[3,3],[4,3],[5,3],[5,4],[5,5],[4,5],[3,5],[2,5]];
    const pts = path.map(([x, y]) => ({ x: (x + 0.5) * cell, y: (y + 0.5) * cell }));
    const food = getFoodSprite('apple', '#ff2bd6', cell * 2.4);
    g.drawImage(food, 0.95 * cell - cell * 1.2, 5.5 * cell - cell * 1.2, cell * 2.4, cell * 2.4);
    drawSnake(g, pts, cell, { shape: 'block', colorId: 'cyan', time: 0, dir: { x: 1, y: 0 }, glow: 1.2 });
    return c.toDataURL('image/png');
  }, size);
  fs.writeFileSync(`public/icon-${size}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote icon', size);
}
await b.close();
