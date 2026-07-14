import { describe, it, expect } from 'vitest';
import {
  computeLayoutRegions,
  computePlaceholderLayout,
  computeTableSpan,
  computeBossHudLayout,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  Band,
} from '../../src/scenes/compositionLayout';
import { DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';

// compositionLayout no longer holds its own copy of the composition ranges —
// BattleLayoutPolicy is the single source of truth. Tests supply the same
// canonical ranges the production path does, via this thin wrapper.
const BANDS = DEFAULT_BATTLE_LAYOUT_POLICY.bands;
const TABLE_WIDTH_FRACTION = DEFAULT_BATTLE_LAYOUT_POLICY.tableWidthFraction;
const regions = (width: number, height: number) => computeLayoutRegions(width, height, BANDS, TABLE_WIDTH_FRACTION);

// Region math is proportional (height * pct), so results carry benign
// floating-point noise (e.g. 187.20000000000002). Assert with tolerance.
function expectBand(b: Band, top: number, bottom: number): void {
  expect(b.top).toBeCloseTo(top, 6);
  expect(b.bottom).toBeCloseTo(bottom, 6);
  expect(b.height).toBeCloseTo(bottom - top, 6);
}

describe('computeLayoutRegions', () => {
  const r = regions(CANVAS_WIDTH, CANVAS_HEIGHT);

  it('matches the policy percentage ranges for the fixed canvas', () => {
    expectBand(r.topHud, 28.8, 86.4);
    expectBand(r.monster, 86.4, 273.6);
    expectBand(r.hero, 273.6, 360);
    expectBand(r.board, 360, 669.6);
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
    const big = regions(960, 1440);
    expect(big.board.top).toBeCloseTo(1440 * 0.5, 5);
    expect(big.board.bottom).toBeCloseTo(1440 * 0.93, 5);
  });
});

describe('computeLayoutRegions — explicit band ranges / tableWidthFraction params', () => {
  it('honors an alternate table width fraction', () => {
    const r = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT, BANDS, 0.5);
    expect(r.boardWidthBand.width).toBeCloseTo(240, 5); // 480 * 0.5
    expect(r.boardWidthBand.left).toBeCloseTo(120, 5); // centered: (480-240)/2
  });

  it('honors alternate band ranges', () => {
    const r = computeLayoutRegions(
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      { topHud: [0, 10], monster: [10, 40], hero: [40, 50], board: [50, 95], safeBottom: [95, 100] },
      0.88,
    );
    expectBand(r.topHud, 0, 72); // 720 * 0.10
    expectBand(r.board, 360, 684); // 720 * [0.50, 0.95]
  });
});

describe('computePlaceholderLayout', () => {
  const p = computePlaceholderLayout(regions(CANVAS_WIDTH, CANVAS_HEIGHT));

  it('places a dominant monster centered in the monster band', () => {
    expect(p.monster.x).toBeCloseTo(150, 5);
    expect(p.monster.y).toBeCloseTo(110, 5);
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
    });
  });

  it('grounds each hero so its lower edge overlaps the table rear edge by ~8px', () => {
    const tableTop = computeTableSpan(regions(CANVAS_WIDTH, CANVAS_HEIGHT)).top;
    expect(tableTop).toBeCloseTo(352, 5);
    p.heroes.forEach((h) => {
      expect(h.y + h.height).toBeCloseTo(tableTop + 8, 5); // 360
    });
  });
});

describe('computeBossHudLayout', () => {
  const r = regions(CANVAS_WIDTH, CANVAS_HEIGHT);
  const hud = computeBossHudLayout(r);

  it('centers the boss HP text above the monster', () => {
    const monster = computePlaceholderLayout(r).monster;
    expect(hud.text.x).toBeCloseTo(monster.x + monster.width / 2, 5); // 240
    expect(hud.text.x).toBeCloseTo(240, 5);
    expect(hud.text.y).toBeCloseTo(36.8, 5);
  });

  it('derives a centered bar from the monster footprint (monster.width + 60)', () => {
    const monster = computePlaceholderLayout(r).monster;
    expect(hud.bar.width).toBeCloseTo(monster.width + 60, 5); // 240
    expect(hud.bar.height).toBe(12);
    expect(hud.bar.x).toBeCloseTo(120, 5);
    expect(hud.bar.y).toBeCloseTo(64.8, 5);
    // Bar is centered on the same axis as the text.
    expect(hud.bar.x + hud.bar.width / 2).toBeCloseTo(hud.text.x, 5);
  });

  it('keeps the HP presentation inside the topHud band with room before the monster', () => {
    const barBottom = hud.bar.y + hud.bar.height;
    expect(barBottom).toBeLessThanOrEqual(r.topHud.bottom);
    expect(barBottom).toBeLessThan(computePlaceholderLayout(r).monster.y);
  });
});

// The `table` composition rectangle (full-viewport-width lower band, from the
// combat/prep separation line to the bottom of the viewport) is now assembled
// directly in battleLayout.ts from `bands.hero.bottom` — see
// battleLayout.test.ts's "table — lower composition band" suite.
