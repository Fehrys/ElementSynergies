import { describe, it, expect } from 'vitest';
import {
  computeBattleLayout,
  DEFAULT_BATTLE_LAYOUT_POLICY,
  sanitizeInsets,
  cssInsetsToGame,
  clampInsetsToViewport,
  resolveTileWidthFraction,
  resolveBandRanges,
  baseTileWidthFraction,
} from '../../src/scenes/battleLayout';
import { computeAvailableBoardRect } from '../../src/scenes/boardArea';
import { computeResponsiveBoardGeometry } from '../../src/scenes/boardGeometry';
import { HexGrid, getAllCells } from '../../src/core/grid';
import { cellToPixel } from '../../src/scenes/boardGeometry';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeBattleLayout — 480×720 baseline neutrality', () => {
  const L = computeBattleLayout({ width: 480, height: 720, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
  it('safeRect equals the full viewport with no insets', () => {
    expect(L.safeRect).toEqual({ x: 0, y: 0, width: 480, height: 720 });
  });
  it('gameplay column is the full width (≤ cap) and centered', () => {
    expect(L.gameplayColumn.width).toBe(480);
    expect(L.gameplayColumn.x).toBe(0);
  });
  // 2026-07-18 Lot 2: the board is no longer aligned to the legacy
  // column-constrained geometry — it fits availableBoardRect (a modest inset
  // of the full lower band). See tests/scenes/boardGeometry.test.ts and
  // tests/scenes/boardArea.test.ts for the formula's own unit coverage; this
  // just cross-checks the two are wired together correctly at the 480x720
  // reference format.
  it('fits the board to availableBoardRect, not to gameplayColumn/legacyBoard', () => {
    const avail = computeAvailableBoardRect(L.table, { top: 0, right: 0, bottom: 0, left: 0 });
    const expected = computeResponsiveBoardGeometry(avail, DEFAULT_BATTLE_LAYOUT_POLICY.targetMinHitRadius);
    expect(L.availableBoardRect).toEqual(avail);
    expect(L.board.tileBounds).toEqual(expected.tileBounds);
    expect(L.board.scale).toBeCloseTo(expected.scale!, 9);
  });
  it('keeps distinct widths separate', () => {
    expect(L.gameplayColumn.width).toBe(480); // column
    expect(L.table.width).toBe(480); // full-bleed composition band, == viewport width
  });
});

describe('computeBattleLayout — invariants across sizes', () => {
  it('caps and centers the column on a wide viewport', () => {
    const L = computeBattleLayout({ width: 1000, height: 700, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.gameplayColumn.width).toBe(560);
    expect(L.gameplayColumn.x).toBe(220); // (1000-560)/2
    expect(L.background).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
  });
  it('derives safeRect from insets', () => {
    const L = computeBattleLayout(
      { width: 390, height: 844, safeInsets: { top: 47, right: 0, bottom: 34, left: 0 } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect).toEqual({ x: 0, y: 47, width: 390, height: 844 - 47 - 34 });
  });
  it('never scales the board anisotropically (single isotropic scale)', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.colWidth / 56).toBeCloseTo(L.board.rowHeight / 48, 9);
    expect(L.board.visualRadius / 22).toBeCloseTo(L.board.rowHeight / 48, 9);
  });
  it('keeps the board fully inside availableBoardRect (not gameplayColumn — the puzzle now owns the lower band)', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.availableBoardRect.x + L.availableBoardRect.width + 0.5,
    );
  });
});

describe('inset helpers', () => {
  it('sanitizes non-finite/negative insets to 0', () => {
    expect(sanitizeInsets({ top: NaN, right: -5, bottom: Infinity, left: 10 })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 10,
    });
  });
  it('cssInsetsToGame is a no-op when gameSize equals canvasRect', () => {
    const css = { top: 47, right: 0, bottom: 34, left: 0 };
    expect(cssInsetsToGame(css, { width: 390, height: 844 }, { width: 390, height: 844 })).toEqual(css);
  });
  it('never produces a negative safeRect from oversized insets', () => {
    const clamped = clampInsetsToViewport({ top: 500, right: 0, bottom: 500, left: 0 }, 390, 844);
    expect(clamped.top + clamped.bottom).toBeLessThan(844);
    const L = computeBattleLayout({ width: 390, height: 844, safeInsets: clamped }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.safeRect.height).toBeGreaterThan(0);
  });
  it('cssInsetsToGame scales CSS px when canvasRect differs from gameSize', () => {
    // 780px canvas presenting a 390-unit game → factor 0.5 (pure function; RESIZE normally makes this a no-op)
    const game = cssInsetsToGame(
      { top: 20, right: 0, bottom: 40, left: 10 },
      { width: 390, height: 844 },
      { width: 780, height: 1688 },
    );
    expect(game.top).toBeCloseTo(10, 6);
    expect(game.bottom).toBeCloseTo(20, 6);
    expect(game.left).toBeCloseTo(5, 6);
  });
  it('clampInsetsToViewport stays non-negative and finite even when width/height is 0', () => {
    const c = clampInsetsToViewport({ top: 10, right: 10, bottom: 10, left: 10 }, 0, 0);
    expect(c).toEqual({ top: 0, right: 0, bottom: 0, left: 0 }); // degenerate viewport → insets 0
    const L = computeBattleLayout({ width: 0, height: 0, safeInsets: c }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(Number.isFinite(L.safeRect.width)).toBe(true);
    expect(L.safeRect.width).toBeGreaterThanOrEqual(0);
    expect(L.safeRect.height).toBeGreaterThanOrEqual(0);
  });
});

describe('computeBattleLayout — global coordinate spaces (offsets applied)', () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  it('centers board/table/boss about a horizontally-offset column center', () => {
    const L = computeBattleLayout({ width: 900, height: 800, safeInsets: none }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.gameplayColumn.x).toBeGreaterThan(0); // wide → capped, offset column
    const c = L.gameplayColumn.x + L.gameplayColumn.width / 2;
    expect(L.table.x + L.table.width / 2).toBeCloseTo(c, 3);
    expect(L.boss.x + L.boss.width / 2).toBeCloseTo(c, 3);
    // The board is centered on availableBoardRect (== the full-width lower
    // band's own center), not on gameplayColumn's center — see Task 5's design.
    const boardRectCenter = L.availableBoardRect.x + L.availableBoardRect.width / 2;
    expect(L.board.tileBounds.x + L.board.tileBounds.width / 2).toBeCloseTo(boardRectCenter, 3);
  });
  it('offsets bands and board by safeRect.y under a top inset', () => {
    const top = 60;
    const L = computeBattleLayout(
      { width: 390, height: 844, safeInsets: { top, right: 0, bottom: 0, left: 0 } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect.y).toBe(top);
    expect(L.bands.topHud.top).toBeGreaterThanOrEqual(top); // bands start below the inset
    expect(L.board.tileBounds.y).toBeGreaterThanOrEqual(top); // board pushed down by the inset
  });
  it('keeps heroes and board inside a left-inset, offset column', () => {
    const left = 40;
    const L = computeBattleLayout(
      { width: 500, height: 800, safeInsets: { top: 0, right: 0, bottom: 0, left } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect.x).toBe(left);
    expect(L.gameplayColumn.x).toBeGreaterThanOrEqual(left);
    for (const h of L.heroes) expect(h.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
  });
});

describe('computeBattleLayout — synthetic safe-area insets (audit cases)', () => {
  const W = 390;
  const H = 844;
  const cases: { name: string; insets: { top: number; right: number; bottom: number; left: number } }[] = [
    { name: 'no insets', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { name: 'top/bottom notch', insets: { top: 47, right: 0, bottom: 34, left: 0 } },
    { name: 'lateral + bottom insets', insets: { top: 0, right: 22, bottom: 20, left: 14 } },
  ];

  for (const { name, insets } of cases) {
    describe(name, () => {
      const L = computeBattleLayout({ width: W, height: H, safeInsets: insets }, DEFAULT_BATTLE_LAYOUT_POLICY);

      it('derives the correct safeRect from the insets', () => {
        expect(L.safeRect).toEqual({
          x: insets.left,
          y: insets.top,
          width: W - insets.left - insets.right,
          height: H - insets.top - insets.bottom,
        });
      });

      it('centers the gameplay column IN the safeRect (not the raw viewport)', () => {
        const width = Math.min(L.safeRect.width, DEFAULT_BATTLE_LAYOUT_POLICY.maxGameplayColumnWidth);
        expect(L.gameplayColumn.width).toBeCloseTo(width, 9);
        expect(L.gameplayColumn.x).toBeCloseTo(L.safeRect.x + (L.safeRect.width - width) / 2, 9);
      });

      it('keeps the board fully inside availableBoardRect', () => {
        expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
        expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
          L.availableBoardRect.x + L.availableBoardRect.width + 0.5,
        );
      });

      it('table spans the full raw viewport width and always encloses the board bbox', () => {
        // table is the lower composition band (2026-07-14): full viewport width,
        // regardless of the gameplay column's cap/insets — so it's always >= the
        // column and trivially encloses the (narrower) board.
        expect(L.table.width).toBe(L.background.width);
        expect(L.table.width).toBeGreaterThanOrEqual(L.gameplayColumn.width);
        expect(L.table.x).toBeLessThanOrEqual(L.board.tileBounds.x + 1e-6);
        expect(L.table.x + L.table.width).toBeGreaterThanOrEqual(
          L.board.tileBounds.x + L.board.tileBounds.width - 1e-6,
        );
      });

      it('produces contiguous, ordered vertical bands', () => {
        const b = L.bands;
        const P = DEFAULT_BATTLE_LAYOUT_POLICY;
        expect(b.topHud.bottom).toBeCloseTo(b.monster.top, 9);
        expect(b.monster.bottom).toBeCloseTo(b.hero.top, 9);
        expect(b.hero.bottom).toBeCloseTo(b.board.top, 9);
        expect(b.board.bottom).toBeCloseTo(b.safeBottom.top, 9);
        // topHud no longer starts at the safeRect's top edge — it starts
        // policy.bands.topHud[0]% down, freeing a band above it (2026-07-14).
        expect(b.topHud.top).toBeCloseTo(L.safeRect.y + (P.bands.topHud[0] / 100) * L.safeRect.height, 9);
        expect(b.safeBottom.bottom).toBeCloseTo(L.safeRect.y + L.safeRect.height, 9);
      });

      it('table starts at the fixed tableYFraction of safeRect.height and reaches the viewport bottom', () => {
        expect(L.table.y).toBeCloseTo(
          L.safeRect.y + DEFAULT_BATTLE_LAYOUT_POLICY.tableYFraction * L.safeRect.height,
          9,
        );
        expect(L.table.y + L.table.height).toBeCloseTo(L.background.height, 9);
      });

      it('keeps the monster band taller than the hero band', () => {
        expect(L.bands.monster.height).toBeGreaterThan(L.bands.hero.height);
      });
    });
  }
});

describe('computeBattleLayout — DPR independence is structural', () => {
  it('takes no devicePixelRatio parameter (arity is exactly input + policy)', () => {
    expect(computeBattleLayout.length).toBe(2);
  });
  it('is a pure function of ViewportInput: identical inputs yield deep-equal layouts', () => {
    const input = { width: 390, height: 844, safeInsets: { top: 47, right: 0, bottom: 34, left: 0 } };
    const a = computeBattleLayout(input, DEFAULT_BATTLE_LAYOUT_POLICY);
    const b = computeBattleLayout({ ...input, safeInsets: { ...input.safeInsets } }, DEFAULT_BATTLE_LAYOUT_POLICY);
    // No DPR input exists to vary — layout depends only on the viewport model.
    expect(a).toEqual(b);
  });
});

const P = DEFAULT_BATTLE_LAYOUT_POLICY;
const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('M6 — vertical degradation order (board reduced last)', () => {
  const height = (b: [number, number]): number => b[1] - b[0];

  it('returns the exact baseline bands at/above the reference height (neutral at 720)', () => {
    expect(resolveBandRanges(P, 720)).toEqual(P.bands);
    expect(resolveBandRanges(P, 900)).toEqual(P.bands);
  });

  it('shrinks topHud and hero first and grows the board on a short viewport, staying contiguous', () => {
    const s = resolveBandRanges(P, 520); // below reference → compression active
    expect(height(s.topHud)).toBeLessThan(height(P.bands.topHud));
    expect(height(s.hero)).toBeLessThan(height(P.bands.hero));
    expect(height(s.board)).toBeGreaterThan(height(P.bands.board));
    // The monster band yields nothing — chrome bands cede first.
    expect(height(s.monster)).toBeCloseTo(height(P.bands.monster), 9);
    // Contiguous and still spanning [P.bands.topHud[0], 100] — the top anchor itself
    // (2026-07-14: 4, not 0) is fixed; compression only eats into band heights below it.
    expect(s.topHud[0]).toBe(P.bands.topHud[0]);
    expect(s.safeBottom[1]).toBe(100);
    expect(s.topHud[1]).toBeCloseTo(s.monster[0], 9);
    expect(s.monster[1]).toBeCloseTo(s.hero[0], 9);
    expect(s.hero[1]).toBeCloseTo(s.board[0], 9);
    expect(s.board[1]).toBeCloseTo(s.safeBottom[0], 9);
  });

  it("the board's vertical share of the safeRect grows as height shrinks (full layout)", () => {
    const tall = computeBattleLayout({ width: 390, height: 900, safeInsets: none }, P);
    const short = computeBattleLayout({ width: 390, height: 600, safeInsets: none }, P);
    const share = (L: ReturnType<typeof computeBattleLayout>): number => L.bands.board.height / L.safeRect.height;
    expect(share(short)).toBeGreaterThan(share(tall));
  });
});

describe('M6 — tablet / tall-screen invariants', () => {
  it('keeps the table full-bleed and the background spanning the full viewport (768x1024)', () => {
    const L = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    expect(L.table.width).toBe(L.background.width); // full-bleed, not column-capped
    expect(L.background).toEqual({ x: 0, y: 0, width: 768, height: 1024 });
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.availableBoardRect.x + L.availableBoardRect.width + 0.5,
    );
  });

  it('keeps heroes within the column and above the board across tablet/tall sizes', () => {
    for (const vp of [
      { width: 768, height: 1024 },
      { width: 430, height: 932 },
      { width: 412, height: 915 },
    ]) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      for (const h of L.heroes) {
        expect(h.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
        expect(h.x + h.width).toBeLessThanOrEqual(L.gameplayColumn.x + L.gameplayColumn.width + 0.5);
        expect(h.y + h.height).toBeLessThanOrEqual(L.board.tileBounds.y + 1e-6); // grounded above the board
      }
    }
  });
});

// 2026-07-18 — Lot 2 review fix regression coverage: heroes previously
// drifted from a ~12px gap below the boss at 360x640 to a ~116px gap at
// 768x1024 (grounded on the hero/table composition bands, which grow taller
// than the fixed-pixel boss/hero shapes as viewport height increases). Heroes
// are now anchored to the boss's own footprint instead — these tests assert
// the RELATIONSHIP holds at all three mandatory reference formats, not
// specific pixel values.
describe('2026-07-18 — boss/hero composition relationship (review fix)', () => {
  const REFERENCE_FORMATS = [
    { width: 360, height: 640 },
    { width: 480, height: 720 },
    { width: 768, height: 1024 },
  ];

  it('keeps the hero row directly below the boss, with a small and stable gap (not growing toward the table)', () => {
    const gaps = REFERENCE_FORMATS.map((vp) => {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      const gap = L.heroes[0].y - (L.boss.y + L.boss.height);
      expect(gap).toBeGreaterThan(0); // heroes sit below the boss
      return gap;
    });
    // The 360x640 gap is the untouched reference relationship the review
    // asked to preserve; every format's gap must stay within a small,
    // bounded band around it — not balloon toward the ~116px regression.
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(8);
      expect(gap).toBeLessThanOrEqual(20);
    }
  });

  it('keeps all four heroes fully inside the safe area and above the table at every reference format', () => {
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      for (const h of L.heroes) {
        expect(h.y).toBeGreaterThanOrEqual(L.safeRect.y - 1e-6);
        expect(h.y + h.height).toBeLessThanOrEqual(L.safeRect.y + L.safeRect.height + 1e-6);
        expect(h.y + h.height).toBeLessThan(L.table.y); // never reaches the lower background band
      }
    }
  });

  it('never lets the boss-anchored gap exceed the legacy band-grounded position (safety ceiling)', () => {
    // Regression guard for the extreme-landscape overflow this fix introduced
    // and then fixed: the boss anchor alone can push heroes below the safe
    // area on a very short/compressed viewport (e.g. 844x390), so the smaller
    // (higher-up) of {boss-anchored, legacy band-grounded} must always win.
    const L = computeBattleLayout({ width: 844, height: 390, safeInsets: none }, P);
    for (const h of L.heroes) {
      expect(h.y + h.height).toBeLessThanOrEqual(L.board.tileBounds.y + 1e-6);
      expect(h.y + h.height).toBeLessThanOrEqual(L.safeRect.y + L.safeRect.height + 1e-6);
    }
  });

  it('keeps composition order HUD -> boss -> heroes -> table with readable gaps at every reference format', () => {
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      const hudBarBottom = L.bossHud.bar.y + L.bossHud.bar.height;
      expect(hudBarBottom).toBeLessThan(L.boss.y); // no HUD/boss overlap
      expect(L.boss.y + L.boss.height).toBeLessThan(L.heroes[0].y); // no boss/hero overlap
      expect(L.heroes[0].y + L.heroes[0].height).toBeLessThan(L.table.y); // no hero/table overlap
    }
  });

  it('does not leave a large dead zone below the heroes on the large reference format', () => {
    // The 2026-07-19 review fix's downward-nudge target: at 768x1024 the gap
    // between the heroes' feet and table.y must shrink substantially relative
    // to what pure boss-anchoring (no nudge) alone would leave.
    const L = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    const heroBottom = L.heroes[0].y + L.heroes[0].height;
    const gap = L.table.y - heroBottom;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(120); // well below the ~123px pre-nudge regression this fix targets
  });
});

// 2026-07-19 — Lot 2 review fix: the boss/hero footprint now grows on larger
// viewports (previously pinned to the small-screen baseline size forever) via
// combatScale, resolved from the board's own isotropic scale and floored at 1.
describe('2026-07-19 — combatScale grows the boss/hero footprint on large formats', () => {
  const REFERENCE_FORMATS = [
    { width: 360, height: 640 },
    { width: 480, height: 720 },
    { width: 768, height: 1024 },
  ];

  it('never shrinks the boss/heroes below the 360x640 baseline footprint at any reference format', () => {
    const small = computeBattleLayout({ width: 360, height: 640, safeInsets: none }, P);
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.boss.width).toBeGreaterThanOrEqual(small.boss.width - 1e-6);
      expect(L.boss.height).toBeGreaterThanOrEqual(small.boss.height - 1e-6);
      expect(L.heroes[0].width).toBeGreaterThanOrEqual(small.heroes[0].width - 1e-6);
      expect(L.heroes[0].height).toBeGreaterThanOrEqual(small.heroes[0].height - 1e-6);
    }
  });

  it('makes the boss and heroes strictly bigger at 768x1024 than at 360x640', () => {
    const small = computeBattleLayout({ width: 360, height: 640, safeInsets: none }, P);
    const large = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    expect(large.boss.width).toBeGreaterThan(small.boss.width);
    expect(large.boss.height).toBeGreaterThan(small.boss.height);
    expect(large.heroes[0].width).toBeGreaterThan(small.heroes[0].width);
    expect(large.heroes[0].height).toBeGreaterThan(small.heroes[0].height);
  });

  it('preserves the boss and hero aspect ratios at every reference format', () => {
    const BOSS_RATIO = 180 / 140;
    const HERO_RATIO = 50 / 70;
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.boss.width / L.boss.height).toBeCloseTo(BOSS_RATIO, 9);
      expect(L.heroes[0].width / L.heroes[0].height).toBeCloseTo(HERO_RATIO, 9);
    }
  });

  it('keeps all four heroes exactly the same size as each other at every reference format', () => {
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      const [first, ...rest] = L.heroes;
      for (const h of rest) {
        expect(h.width).toBe(first.width);
        expect(h.height).toBe(first.height);
      }
    }
  });

  it('scales the boss and heroes by the exact same factor (group grows together)', () => {
    const small = computeBattleLayout({ width: 360, height: 640, safeInsets: none }, P);
    const large = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    const bossFactor = large.boss.width / small.boss.width;
    const heroFactor = large.heroes[0].width / small.heroes[0].width;
    expect(heroFactor).toBeCloseTo(bossFactor, 9);
  });

  it('bounds the growth by policy.maxBoardScale — never grows without limit', () => {
    const huge = computeBattleLayout({ width: 2000, height: 3000, safeInsets: none }, P);
    expect(huge.boss.width).toBeLessThanOrEqual(180 * P.maxBoardScale + 1e-6);
    expect(huge.boss.height).toBeLessThanOrEqual(140 * P.maxBoardScale + 1e-6);
  });

  it('never entered via a per-width branch — grows smoothly with a nearby format too', () => {
    // Guards against a hidden `if (width === 768)` special case: a format
    // close to but not equal to the reference tablet size must also grow.
    const near = computeBattleLayout({ width: 760, height: 1010, safeInsets: none }, P);
    const small = computeBattleLayout({ width: 360, height: 640, safeInsets: none }, P);
    expect(near.boss.width).toBeGreaterThan(small.boss.width);
  });
});

// 2026-07-19 — Lot 2 review fix: policy.tableYFraction was recalibrated
// (0.5486 -> 0.51) to give the lower background/cutting board meaningfully
// more of the viewport height. These tests lock the resulting ratio.
describe('2026-07-19 — table.y ratio stays constant and in the requested range', () => {
  it('keeps table.y / viewport height within [0.50, 0.53] at every reference format', () => {
    for (const vp of [
      { width: 360, height: 640 },
      { width: 480, height: 720 },
      { width: 768, height: 1024 },
    ]) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      const ratio = L.table.y / vp.height;
      expect(ratio).toBeGreaterThanOrEqual(0.5);
      expect(ratio).toBeLessThanOrEqual(0.53);
    }
  });

  it('is the exact same ratio at every viewport size (the absolute rule)', () => {
    const ratios = [
      { width: 360, height: 640 },
      { width: 480, height: 720 },
      { width: 768, height: 1024 },
      { width: 320, height: 568 },
      { width: 1000, height: 1500 },
    ].map((vp) => computeBattleLayout({ ...vp, safeInsets: none }, P).table.y / vp.height);
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 9);
  });

  it('reduces the upper share and grows the lower share versus the pre-2026-07-19 fraction', () => {
    const OLD_FRACTION = 395 / 720;
    for (const vp of [
      { width: 360, height: 640 },
      { width: 480, height: 720 },
      { width: 768, height: 1024 },
    ]) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, { ...P, tableYFraction: OLD_FRACTION });
      const now = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(now.table.y).toBeLessThan(L.table.y); // separation moved up
      expect(now.table.height).toBeGreaterThan(L.table.height); // lower band grew
    }
  });
});

// 2026-07-18 — Lot 2: the rendered board is fit to availableBoardRect (a
// modest inset of the full lower band), independent of gameplayColumn/
// legacyBoard. See docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md.
describe('2026-07-18 — Lot 2 gameplay-first lower board', () => {
  const REFERENCE_FORMATS = [
    { width: 360, height: 640 },
    { width: 480, height: 720 },
    { width: 768, height: 1024 },
  ];
  // Confinement/topology must also hold at these additional formats the
  // brief calls out explicitly (320x568, 430x932) plus a landscape format
  // already exercised elsewhere in this suite (844x390, matrix.spec.ts).
  const EXTRA_FORMATS = [
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ];
  const ALL_FORMATS = [...REFERENCE_FORMATS, ...EXTRA_FORMATS];

  it('matches computeResponsiveBoardGeometry(computeAvailableBoardRect(table, insets)) exactly, at every reference format', () => {
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      const avail = computeAvailableBoardRect(L.table, none);
      const expected = computeResponsiveBoardGeometry(avail, P.targetMinHitRadius);
      expect(L.availableBoardRect).toEqual(avail);
      expect(L.board.tileBounds).toEqual(expected.tileBounds);
    }
  });

  it('grows the board strictly across 360 -> 480 -> 768 (puzzle becomes visually dominant)', () => {
    const sizes = REFERENCE_FORMATS.map(
      (vp) => computeBattleLayout({ ...vp, safeInsets: none }, P).board.visualRadius,
    );
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
  });

  it('exceeds the old legacy cap (22 * maxBoardScale) at 768x1024 — the puzzle is no longer capped by legacyBoard', () => {
    const L = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    expect(L.board.visualRadius).toBeGreaterThan(22 * P.maxBoardScale);
  });

  it('is no longer confined to gameplayColumn on a large viewport (the intentional decoupling)', () => {
    // 1000x700's lower band isn't tall enough for the board's isotropic fit to
    // exceed the 560 column cap (availableBoardRect's aspect ratio binds on
    // height there) — a large tablet-portrait format is used instead, where
    // the lower band has enough height for the board to clearly outgrow
    // gameplayColumn's chrome cap.
    const L = computeBattleLayout({ width: 1024, height: 1366, safeInsets: none }, P);
    expect(L.board.tileBounds.width).toBeGreaterThan(L.gameplayColumn.width);
  });

  it('keeps availableBoardRect and boardFrame inside the lower band (table) at every format, including 320x568/430x932/844x390 landscape', () => {
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.availableBoardRect.x).toBeGreaterThanOrEqual(L.table.x - 1e-6);
      expect(L.availableBoardRect.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
      expect(L.availableBoardRect.x + L.availableBoardRect.width).toBeLessThanOrEqual(L.table.x + L.table.width + 1e-6);
      expect(L.availableBoardRect.y + L.availableBoardRect.height).toBeLessThanOrEqual(L.table.y + L.table.height + 1e-6);
      expect(L.boardFrame.x).toBeGreaterThanOrEqual(L.table.x - 1e-6);
      expect(L.boardFrame.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
      expect(L.boardFrame.x + L.boardFrame.width).toBeLessThanOrEqual(L.table.x + L.table.width + 1e-6);
      expect(L.boardFrame.y + L.boardFrame.height).toBeLessThanOrEqual(L.table.y + L.table.height + 1e-6);
    }
  });

  it('never lets the board rise above table.y at any format (the upper composition boundary)', () => {
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.board.tileBounds.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
    }
  });

  it('leaves the 32-cell honeycomb topology unchanged (7 columns, 5/4 alternation) at every format', () => {
    const COLUMN_ROW_COUNTS = [5, 4, 5, 4, 5, 4, 5];
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      let total = 0;
      for (let col = 0; col < 7; col++) {
        for (let row = 0; row < COLUMN_ROW_COUNTS[col]; row++) {
          const p = cellToPixel(L.board, row, col);
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
          total++;
        }
      }
      expect(total).toBe(32);
    }
  });

  it('keeps every pair of neighboring cells farther apart than 2*hitRadius (no visual/hit overlap) at every format', () => {
    const grid = new HexGrid();
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      for (const cell of getAllCells()) {
        const p0 = cellToPixel(L.board, cell.row, cell.col);
        for (const n of grid.getNeighbors(cell.row, cell.col)) {
          const p1 = cellToPixel(L.board, n.row, n.col);
          const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          expect(dist).toBeGreaterThanOrEqual(2 * L.board.hitRadius - 1e-6);
        }
      }
    }
  });
});

