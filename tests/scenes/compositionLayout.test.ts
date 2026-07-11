import { describe, it, expect } from 'vitest';
import {
  computeLayoutRegions,
  computePlaceholderLayout,
  computeTableBounds,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  Band,
} from '../../src/scenes/compositionLayout';

// Region math is proportional (height * pct), so results carry benign
// floating-point noise (e.g. 187.20000000000002). Assert with tolerance.
function expectBand(b: Band, top: number, bottom: number): void {
  expect(b.top).toBeCloseTo(top, 6);
  expect(b.bottom).toBeCloseTo(bottom, 6);
  expect(b.height).toBeCloseTo(bottom - top, 6);
}

describe('computeLayoutRegions', () => {
  const r = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);

  it('matches the blueprint percentage ranges for the fixed canvas', () => {
    expectBand(r.topHud, 0, 57.6);
    expectBand(r.monster, 57.6, 244.8);
    expectBand(r.hero, 244.8, 331.2);
    expectBand(r.board, 331.2, 669.6);
    expectBand(r.safeBottom, 669.6, 720);
  });

  it('produces contiguous, non-overlapping vertical bands', () => {
    // These compare identical computed expressions, so exact equality holds.
    expect(r.topHud.bottom).toBe(r.monster.top);
    expect(r.monster.bottom).toBe(r.hero.top);
    expect(r.hero.bottom).toBe(r.board.top);
    expect(r.board.bottom).toBe(r.safeBottom.top);
    expect(r.safeBottom.bottom).toBe(CANVAS_HEIGHT);
  });

  it('centers an 88%-wide board band on the canvas width', () => {
    expect(r.boardWidthBand.width).toBeCloseTo(422.4, 5);
    expect(r.boardWidthBand.left).toBeCloseTo(28.8, 5);
    expect(r.boardWidthBand.right).toBeCloseTo(451.2, 5);
  });

  it('scales proportionally for a different canvas size', () => {
    const big = computeLayoutRegions(960, 1440);
    expect(big.board.top).toBeCloseTo(1440 * 0.46, 5);
    expect(big.board.bottom).toBeCloseTo(1440 * 0.93, 5);
  });
});

describe('computePlaceholderLayout', () => {
  const p = computePlaceholderLayout(computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT));

  it('places a dominant monster centered in the monster band', () => {
    expect(p.monster.x).toBeCloseTo(150, 5);
    expect(p.monster.y).toBeCloseTo(81.2, 5);
    expect(p.monster.width).toBe(180);
    expect(p.monster.height).toBe(140);
  });

  it('makes the monster ~2x a hero placeholder tall', () => {
    expect(p.monster.height / p.heroes[0].height).toBeCloseTo(2, 5);
  });

  it('spaces four hero capsules evenly across the board width band', () => {
    expect(p.heroes).toHaveLength(4);
    const centers = p.heroes.map((h) => h.x + h.width / 2);
    [81.6, 187.2, 292.8, 398.4].forEach((expected, i) => {
      expect(centers[i]).toBeCloseTo(expected, 5);
    });
    p.heroes.forEach((h) => {
      expect(h.width).toBe(50);
      expect(h.height).toBe(70);
      expect(h.y + h.height / 2).toBeCloseTo(288, 5);
    });
  });
});

describe('computeTableBounds', () => {
  const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
  const tileBounds = { left: 50, right: 430, top: 426, bottom: 662 };
  const table = computeTableBounds(regions, tileBounds);

  it('produces the expected connecting-surface bounds for 480x720', () => {
    expect(table.x).toBeCloseTo(28.8, 5);
    expect(table.y).toBeCloseTo(323.2, 5);
    expect(table.width).toBeCloseTo(422.4, 5);
    expect(table.height).toBeCloseTo(388.8, 5);
  });

  it('rises into the hero band so the surface connects heroes to the board', () => {
    expect(table.y).toBeLessThan(regions.hero.bottom);
  });

  it('fully encloses the tile bounding box (art fits around tiles)', () => {
    expect(table.x).toBeLessThan(tileBounds.left);
    expect(table.x + table.width).toBeGreaterThan(tileBounds.right);
    expect(table.y).toBeLessThan(tileBounds.top);
    expect(table.y + table.height).toBeGreaterThan(tileBounds.bottom);
  });
});
