// Option catalogs + persisted user settings (settings only — never scores).

export const PALETTE = [
  { id: 'cyan', name: 'NEON CYAN', c: '#00f0ff' },
  { id: 'magenta', name: 'HOT MAGENTA', c: '#ff2bd6' },
  { id: 'acid', name: 'ACID', c: '#7dff1f' },
  { id: 'amber', name: 'AMBER', c: '#ffb000' },
  { id: 'violet', name: 'ULTRAVIOLET', c: '#a45cff' },
  { id: 'crimson', name: 'CRIMSON', c: '#ff2a55' },
  { id: 'ice', name: 'ICE', c: '#dff6ff' },
];

export const SNAKE_COLORS = [
  ...PALETTE,
  { id: 'spectrum', name: 'SPECTRUM', c: 'spectrum' },
  { id: 'glitch', name: 'GLITCH', c: 'glitch' },
];

export const SNAKE_SHAPES = [
  { id: 'block', name: 'BLOCK' },
  { id: 'plasma', name: 'PLASMA' },
  { id: 'orb', name: 'ORB' },
  { id: 'shard', name: 'SHARD' },
  { id: 'hex', name: 'HEX' },
  { id: 'wire', name: 'WIRE' },
];

export const SNAKE_SPEEDS = [
  { id: 'idle', name: 'IDLE', mult: 0.75, sub: '×0.75' },
  { id: 'stock', name: 'STOCK', mult: 1, sub: '×1.00' },
  { id: 'overclock', name: 'OVERCLOCK', mult: 1.3, sub: '×1.30' },
  { id: 'hyper', name: 'HYPERDRIVE', mult: 1.65, sub: '×1.65' },
];

export const FOOD_COLORS = [
  ...PALETTE,
  { id: 'random', name: 'RANDOM', c: 'random' },
];

export const FOOD_ICONS = [
  { id: 'orb', name: 'DATA ORB' },
  { id: 'apple', name: 'APPLE' },
  { id: 'chip', name: 'CHIP' },
  { id: 'bug', name: 'BUG' },
  { id: 'skull', name: 'SKULL' },
  { id: 'gem', name: 'GEM' },
  { id: 'bolt', name: 'BOLT' },
  { id: 'invader', name: 'INVADER' },
  { id: 'shuffle', name: 'SHUFFLE' },
];

export const BOARD_STYLES = [
  { id: 'grid', name: 'GRID' },
  { id: 'dots', name: 'DOT MATRIX' },
  { id: 'circuit', name: 'CIRCUIT' },
  { id: 'hex', name: 'HEXFIELD' },
  { id: 'matrix', name: 'RAIN' },
  { id: 'void', name: 'VOID' },
];

export const BOARD_COLORS = PALETTE;

// size = cells across the short axis of the screen; base = ms per tick at STOCK speed.
export const DIFFICULTIES = [
  { id: 'easy', name: 'EASY', size: 12, base: 165, points: 10 },
  { id: 'normal', name: 'NORMAL', size: 16, base: 125, points: 20 },
  { id: 'hard', name: 'HARD', size: 21, base: 95, points: 35 },
  { id: 'insane', name: 'INSANE', size: 27, base: 72, points: 60 },
];

export const DEFAULTS = {
  snakeColor: 'cyan',
  snakeShape: 'block',
  snakeSpeed: 'stock',
  foodColor: 'magenta',
  foodIcon: 'apple',
  boardStyle: 'grid',
  boardColor: 'cyan',
  difficulty: 'normal',
  sound: true,
  volume: 0.8,
};

const KEY = 'slither-cc.settings.v1';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode — fine */
  }
}

export const byId = (list, id) => list.find((o) => o.id === id) || list[0];
