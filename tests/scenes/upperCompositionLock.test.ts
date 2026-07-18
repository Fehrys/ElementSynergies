import { describe, it, expect } from 'vitest';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';

// Regression lock for the Lot 2 gameplay-first lower-board refactor (see
// docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md).
// These are the REAL values computeBattleLayout produced before the board's
// geometry was decoupled from gameplayColumn — captured by actually running
// the function, not hand-derived. Every later task in that refactor must keep
// this test green: only `board`/`availableBoardRect`/`boardFrame` may change.

const none = { top: 0, right: 0, bottom: 0, left: 0 };
const P = DEFAULT_BATTLE_LAYOUT_POLICY;

const LOCKED = {
  360: {
    tableY: 326.4,
    table: { x: 0, y: 326.4, width: 360, height: 313.6 },
    boss: { x: 90, y: 83.60000000000002, width: 180, height: 140 },
    heroes: [
      { x: 32.88016447368422, y: 235.06666666666666, width: 50, height: 70 },
      { x: 114.29338815789475, y: 235.06666666666666, width: 50, height: 70 },
      { x: 195.70661184210525, y: 235.06666666666666, width: 50, height: 70 },
      { x: 277.1198355263158, y: 235.06666666666666, width: 50, height: 70 },
    ],
    bossHud: { text: { x: 180, y: 33.6 }, bar: { x: 60, y: 61.6, width: 240, height: 12 } },
  },
  480: {
    tableY: 367.2,
    table: { x: 0, y: 367.2, width: 480, height: 352.8 },
    boss: { x: 150, y: 110, width: 180, height: 140 },
    heroes: [
      { x: 56.60000000000001, y: 262, width: 50, height: 70 },
      { x: 162.2, y: 262, width: 50, height: 70 },
      { x: 267.8, y: 262, width: 50, height: 70 },
      { x: 373.4, y: 262, width: 50, height: 70 },
    ],
    bossHud: { text: { x: 240, y: 36.8 }, bar: { x: 120, y: 64.8, width: 240, height: 12 } },
  },
  768: {
    tableY: 522.24,
    table: { x: 0, y: 522.24, width: 768, height: 501.76 },
    boss: { x: 279, y: 198.78666666666672, width: 209.99999999999997, height: 163.33333333333331 },
    heroes: [
      { x: 170.03333333333333, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
      { x: 293.23333333333335, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
      { x: 416.43333333333334, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
      { x: 539.6333333333332, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
    ],
    bossHud: { text: { x: 384, y: 48.96 }, bar: { x: 249, y: 76.96000000000001, width: 270, height: 12 } },
  },
} as const;

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

function expectRectCloseTo(actual: { x: number; y: number; width: number; height: number }, expected: typeof actual) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.width).toBeCloseTo(expected.width, 9);
  expect(actual.height).toBeCloseTo(expected.height, 9);
}

describe('upper composition lock (Lot 2 refactor must not move any of this)', () => {
  for (const vp of FORMATS) {
    const locked = LOCKED[vp.width as keyof typeof LOCKED];
    it(`keeps table.y, table, boss, heroes, and bossHud at ${vp.width}x${vp.height}`, () => {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.table.y).toBeCloseTo(locked.tableY, 9);
      expectRectCloseTo(L.table, locked.table);
      expectRectCloseTo(L.boss, locked.boss);
      locked.heroes.forEach((h, i) => expectRectCloseTo(L.heroes[i], h));
      expect(L.bossHud.text.x).toBeCloseTo(locked.bossHud.text.x, 9);
      expect(L.bossHud.text.y).toBeCloseTo(locked.bossHud.text.y, 9);
      expectRectCloseTo(L.bossHud.bar, locked.bossHud.bar);
    });
  }
});
