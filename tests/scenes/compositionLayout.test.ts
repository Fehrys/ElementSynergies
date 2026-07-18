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

// computePlaceholderLayout/computeBossHudLayout take the caller-resolved
// combatScale and tableY (battleLayout.ts owns that resolution — see its
// combatScale/tableY doc comments). At the 480x720 composition baseline with
// no insets, the real pipeline resolves combatScale to exactly 1 (board scale
// floored at 1) and tableY to policy.tableYFraction * CANVAS_HEIGHT — used
// here so this file's assertions stay faithful to the real pipeline.
const COMBAT_SCALE = 1;
const TABLE_Y = DEFAULT_BATTLE_LAYOUT_POLICY.tableYFraction * CANVAS_HEIGHT;

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
  const p = computePlaceholderLayout(regions(CANVAS_WIDTH, CANVAS_HEIGHT), COMBAT_SCALE, TABLE_Y);

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

  it('anchors the hero row a fixed gap below the boss footprint (2026-07-18 review fix)', () => {
    // Heroes are grounded relative to the boss, not the table span, so the
    // boss/hero visual relationship stays constant across viewports instead
    // of drifting toward the table on taller ones — see BOSS_HERO_GAP.
    const BOSS_HERO_GAP = 12;
    p.heroes.forEach((h) => {
      expect(h.y).toBeCloseTo(p.monster.y + p.monster.height + BOSS_HERO_GAP, 5);
    });
  });

  it('keeps the hero row well above the table span (independent composition elements)', () => {
    const tableTop = computeTableSpan(regions(CANVAS_WIDTH, CANVAS_HEIGHT)).top;
    p.heroes.forEach((h) => {
      expect(h.y + h.height).toBeLessThan(tableTop);
    });
  });
});

describe('computeBossHudLayout', () => {
  const r = regions(CANVAS_WIDTH, CANVAS_HEIGHT);
  const hud = computeBossHudLayout(r, COMBAT_SCALE, TABLE_Y);

  it('centers the boss HP text above the monster', () => {
    const monster = computePlaceholderLayout(r, COMBAT_SCALE, TABLE_Y).monster;
    expect(hud.text.x).toBeCloseTo(monster.x + monster.width / 2, 5); // 240
    expect(hud.text.x).toBeCloseTo(240, 5);
    expect(hud.text.y).toBeCloseTo(36.8, 5);
  });

  it('derives a centered bar from the monster footprint (monster.width + 60)', () => {
    const monster = computePlaceholderLayout(r, COMBAT_SCALE, TABLE_Y).monster;
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
    expect(barBottom).toBeLessThan(computePlaceholderLayout(r, COMBAT_SCALE, TABLE_Y).monster.y);
  });
});

describe('computePlaceholderLayout — combatScale', () => {
  const r = regions(CANVAS_WIDTH, CANVAS_HEIGHT);

  it('scales the monster and hero footprints isotropically and identically', () => {
    const base = computePlaceholderLayout(r, 1, TABLE_Y);
    const grown = computePlaceholderLayout(r, 1.25, TABLE_Y);
    expect(grown.monster.width).toBeCloseTo(base.monster.width * 1.25, 6);
    expect(grown.monster.height).toBeCloseTo(base.monster.height * 1.25, 6);
    grown.heroes.forEach((h, i) => {
      expect(h.width).toBeCloseTo(base.heroes[i].width * 1.25, 6);
      expect(h.height).toBeCloseTo(base.heroes[i].height * 1.25, 6);
    });
  });

  it('keeps all four heroes the same size as each other at any scale', () => {
    const p = computePlaceholderLayout(r, 1.3, TABLE_Y);
    const [first, ...rest] = p.heroes;
    for (const h of rest) {
      expect(h.width).toBe(first.width);
      expect(h.height).toBe(first.height);
    }
  });

  it('never shrinks the monster/hero footprint below scale 1, even if combatScale < 1', () => {
    // computePlaceholderLayout itself trusts its caller's combatScale — the
    // floor-at-1 clamp lives in battleLayout.ts (see combatScale's doc
    // comment there); this only documents that passing exactly 1 reproduces
    // the long-standing baseline footprint.
    const p = computePlaceholderLayout(r, 1, TABLE_Y);
    expect(p.monster.width).toBe(180);
    expect(p.monster.height).toBe(140);
    expect(p.heroes[0].width).toBe(50);
    expect(p.heroes[0].height).toBe(70);
  });
});

// The `table` composition rectangle (full-viewport-width lower band, from the
// combat/prep separation line to the bottom of the viewport) is now assembled
// directly in battleLayout.ts from `bands.hero.bottom` — see
// battleLayout.test.ts's "table — lower composition band" suite.
