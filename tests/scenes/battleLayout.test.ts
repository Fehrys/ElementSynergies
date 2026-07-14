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
  // 2026-07-14: no longer pixel-identical to the pre-realignment legacy values —
  // boardVerticalBias (0.58) nudges the board down inside tableSpan, then
  // boardVerticalOffset (14) nudges it back up to sit correctly inside the cutting
  // board art, and columnSpacingReduction (3 reference px) tightens colWidth (and
  // therefore tileBounds.width/x). See align-layout-to-combat-background-design.md.
  it('reproduces the realigned board tile bounds', () => {
    expect(L.board.tileBounds).toEqual({ x: 59, y: 410, width: 362, height: 236 });
  });
  it('keeps distinct widths separate', () => {
    expect(L.gameplayColumn.width).toBe(480); // column
    expect(L.table.width).toBe(480); // full-bleed composition band, == viewport width
    expect(L.board.tileBounds.width).toBe(362); // 6*(56-3) + 2*22
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
  it('never scales the board anisotropically (single scale factor)', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    // colWidth is deliberately tightened by columnSpacingReduction*scale (M#4), so the
    // isotropic scale itself is recovered from rowHeight, not directly from colWidth/56.
    const scale = L.board.rowHeight / 48;
    expect(L.board.colWidth).toBeCloseTo(56 * scale - DEFAULT_BATTLE_LAYOUT_POLICY.columnSpacingReduction * scale, 9);
    expect(L.board.visualRadius).toBeCloseTo(22 * scale, 9);
  });
  it('keeps the board fully inside the gameplay column', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.gameplayColumn.x + L.gameplayColumn.width + 0.5,
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
    // originX is Math.round()'ed, so the board's bbox center can land up to 0.5px off
    // true center — tighter precision than that would be asserting sub-pixel rounding
    // behavior, not the centering invariant itself.
    expect(Math.abs(L.board.tileBounds.x + L.board.tileBounds.width / 2 - c)).toBeLessThanOrEqual(0.5);
    expect(L.table.x + L.table.width / 2).toBeCloseTo(c, 3);
    expect(L.boss.x + L.boss.width / 2).toBeCloseTo(c, 3);
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
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
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

      it('keeps the board fully inside the gameplay column', () => {
        expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
        expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
          L.gameplayColumn.x + L.gameplayColumn.width + 0.5,
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

      it('table starts tableTopGap below the combat/prep separation line and reaches the viewport bottom', () => {
        expect(L.table.y).toBeCloseTo(L.bands.hero.bottom + DEFAULT_BATTLE_LAYOUT_POLICY.tableTopGap, 9);
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

describe('M6 — horizontal width policy (widening on narrow viewports)', () => {
  it('keeps the exact 480 baseline fraction and tileBounds width', () => {
    expect(resolveTileWidthFraction(480, P)).toBeCloseTo(baseTileWidthFraction(P), 12);
    const L = computeBattleLayout({ width: 480, height: 720, safeInsets: none }, P);
    expect(L.board.tileBounds.width).toBe(362); // 6*(56 - columnSpacingReduction) + 2*22
  });

  it('widens the puzzle on a 320-wide viewport without overflowing the safeRect', () => {
    expect(resolveTileWidthFraction(320, P)).toBeGreaterThan(baseTileWidthFraction(P));
    const L = computeBattleLayout({ width: 320, height: 568, safeInsets: none }, P);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.safeRect.x - 1e-6);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.safeRect.x + L.safeRect.width + 1e-6,
    );
    // Best-effort minimum visual radius (~14.7 floor) — the widening lifts it above
    // the bare-baseline 320 value.
    expect(L.board.visualRadius).toBeGreaterThanOrEqual(14.7);
  });

  it('saturates at maxTileWidthFraction at/below the saturation width', () => {
    expect(resolveTileWidthFraction(320, P)).toBeCloseTo(P.maxTileWidthFraction, 12);
    expect(resolveTileWidthFraction(280, P)).toBeCloseTo(P.maxTileWidthFraction, 12);
  });
});

describe('M6 — radius targets, never a clamp on visualRadius', () => {
  it('keeps visualRadius exactly STONE_RADIUS * scale (isotropic) at 320, and reports the target honestly', () => {
    const L = computeBattleLayout({ width: 320, height: 568, safeInsets: none }, P);
    // 22/48 recovers the isotropic scale from rowHeight (untouched by the column-pitch
    // reduction) — visualRadius is never floored or grown independently of it. colWidth
    // is deliberately NOT isotropic with visualRadius since 2026-07-14 (see M#4 above).
    expect(L.board.visualRadius).toBeCloseTo(L.board.rowHeight * (22 / 48), 9);
    const scale = L.board.rowHeight / 48;
    expect(L.board.colWidth).toBeCloseTo(56 * scale - P.columnSpacingReduction * scale, 9);
    expect(typeof L.board.targetVisualRadiusSatisfied).toBe('boolean');
    // hitRadius is the one true floor, capped below half the min center distance.
    expect(L.board.hitRadius).toBeLessThan(L.board.rowHeight / 2);
  });
});

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
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.gameplayColumn.x + L.gameplayColumn.width + 0.5,
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

describe('M7 — 320x568 support classification (on usable gameplayColumn width, not raw viewport)', () => {
  it('320x568 with null/moderate lateral insets is FULLY SUPPORTED (target radius met)', () => {
    const L = computeBattleLayout({ width: 320, height: 568, safeInsets: none }, P);
    expect(L.gameplayColumn.width).toBe(320); // usable width == viewport width here
    expect(L.board.visualRadius).toBeGreaterThanOrEqual(P.targetMinVisualRadius); // >= 16
    expect(L.board.targetVisualRadiusSatisfied).toBe(true);
  });

  it('the 16 target holds down to ~294 usable column width (22·w·0.94/380 = 16)', () => {
    // visualRadius is a function of USABLE column width, not the raw viewport.
    const at294 = computeBattleLayout({ width: 294, height: 568, safeInsets: none }, P);
    expect(at294.gameplayColumn.width).toBe(294);
    expect(at294.board.visualRadius).toBeGreaterThanOrEqual(P.targetMinVisualRadius - 0.1); // ≈ 16
  });

  it('below ~294 usable width it becomes best-effort (below target) but stays overflow-safe', () => {
    // Narrower USABLE width via lateral insets on a 320 device.
    const L = computeBattleLayout({ width: 320, height: 568, safeInsets: { top: 0, right: 20, bottom: 0, left: 20 } }, P);
    expect(L.gameplayColumn.width).toBe(280); // usable width = 320 − 40 insets
    expect(L.board.visualRadius).toBeLessThan(P.targetMinVisualRadius); // below the 16 target
    expect(L.board.targetVisualRadiusSatisfied).toBe(false);
    // Still overflow-safe: the tile bbox stays inside the safeRect.
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.safeRect.x - 1e-6);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(L.safeRect.x + L.safeRect.width + 1e-6);
  });

  it('the board keeps at least minimumTablePadding clearance within the gameplay column on the narrowest supported width', () => {
    // minimumTablePadding still drives the (internal) boardWidthBand heroes/monster
    // center on — table itself is full-bleed since 2026-07-14, so this checks the
    // still-meaningful invariant: the tiles never crowd the column's own edges.
    const L = computeBattleLayout({ width: 320, height: 568, safeInsets: none }, P);
    const margin = (L.gameplayColumn.width - L.board.tileBounds.width) / 2;
    expect(margin).toBeGreaterThanOrEqual(P.minimumTablePadding - 1e-6);
  });
});

// The pre-2026-07-14 baseline, reconstructed from the current policy rather than
// hand-copied pixel constants, so these tests prove the DIRECTION of each requested
// shift instead of asserting brittle magic numbers.
// See docs/superpowers/specs/2026-07-14-align-layout-to-combat-background-design.md.
const PRE_REALIGNMENT_POLICY = {
  ...P,
  boardVerticalBias: 0.5,
  columnSpacingReduction: 0,
  boardVerticalOffset: 0,
  tableTopGap: 0,
  bands: { topHud: [0, 8], monster: [8, 34], hero: [34, 46], board: [46, 93], safeBottom: [93, 100] },
} as typeof P;

describe('2026-07-14 — realignment to the combat background art target', () => {
  const input = { width: 480, height: 720, safeInsets: none };
  const before = computeBattleLayout(input, PRE_REALIGNMENT_POLICY);
  const after = computeBattleLayout(input, P);

  it('lowers the board inside its span', () => {
    expect(after.board.tileBounds.y).toBeGreaterThan(before.board.tileBounds.y);
  });

  it('lowers the boss and heroes, and drops the boss HUD to free a top band', () => {
    expect(after.boss.y).toBeGreaterThan(before.boss.y);
    after.heroes.forEach((h, i) => expect(h.y).toBeGreaterThan(before.heroes[i].y));
    expect(after.bossHud.text.y).toBeGreaterThan(before.bossHud.text.y);
    expect(after.bossHud.bar.y).toBeGreaterThan(before.bossHud.bar.y);
  });

  it('tightens the column pitch without touching tile size or hit radius', () => {
    expect(after.board.colWidth).toBeLessThan(before.board.colWidth);
    expect(after.board.rowHeight).toBe(before.board.rowHeight);
    expect(after.board.visualRadius).toBe(before.board.visualRadius);
    expect(after.board.hitRadius).toBe(before.board.hitRadius);
  });

  it('nudges the grid up by exactly boardVerticalOffset (at scale 1) to sit correctly in the cutting board art', () => {
    const withoutOffset = computeBattleLayout(input, { ...P, boardVerticalOffset: 0 });
    expect(after.board.tileBounds.y).toBeCloseTo(withoutOffset.board.tileBounds.y - P.boardVerticalOffset, 6);
    // Never affects tile size / scale selection.
    expect(after.board.visualRadius).toBe(withoutOffset.board.visualRadius);
    expect(after.board.tileBounds.width).toBe(withoutOffset.board.tileBounds.width);
  });

  it('clamps boardVerticalOffset so the grid never rises above the heroes on a short/compressed viewport (regression)', () => {
    // 844x390 landscape leaves very little vertical room — a naive unclamped nudge
    // (and a naive Math.round of the clamp itself) can push the tile bbox's top
    // above the heroes' feet. Both must be prevented.
    const L = computeBattleLayout({ width: 844, height: 390, safeInsets: none }, P);
    for (const h of L.heroes) {
      expect(h.y + h.height).toBeLessThanOrEqual(L.board.tileBounds.y + 1e-6);
    }
  });

  it('redefines table as the full-width lower composition band starting tableTopGap below the combat/prep separation', () => {
    expect(after.table.x).toBe(0);
    expect(after.table.width).toBe(after.background.width);
    expect(after.table.y).toBeCloseTo(after.bands.hero.bottom + P.tableTopGap, 9);
    expect(after.table.y + after.table.height).toBeCloseTo(after.background.height, 9);
  });

  it('keeps a visible gap between the heroes’ feet and the table’s top edge (two distinct concepts)', () => {
    // Heroes are grounded on bands.hero.bottom directly (unrelated, untouched
    // concept — see compositionLayout.ts); the table starts tableTopGap below
    // that same line, so the two never land on the exact same pixel.
    for (const h of after.heroes) {
      expect(h.y + h.height).toBeCloseTo(after.bands.hero.bottom, 6);
      expect(after.table.y - (h.y + h.height)).toBeCloseTo(P.tableTopGap, 6);
    }
  });

  it('keeps the board perfectly upright — no rotation, no skew, no per-cell deformation', () => {
    // A straight honeycomb: every column is a vertical line (x depends only on col),
    // and within a column consecutive rows step by exactly rowHeight vertically with
    // zero horizontal drift — i.e. a pure translation grid, never rotated or sheared.
    for (let col = 0; col < 7; col++) {
      const p0 = cellToPixel(after.board, 0, col);
      const p1 = cellToPixel(after.board, 1, col);
      const p2 = cellToPixel(after.board, 2, col);
      expect(p1.x).toBe(p0.x); // vertical column line
      expect(p2.x).toBe(p0.x);
      expect(p1.y - p0.y).toBeCloseTo(after.board.rowHeight, 9); // uniform row step
      expect(p2.y - p1.y).toBeCloseTo(after.board.rowHeight, 9);
    }
    // Adjacent columns differ only in x (plus the fixed honeycomb half-row shift) —
    // never in scale or angle.
    const a = cellToPixel(after.board, 0, 0);
    const b = cellToPixel(after.board, 0, 1);
    expect(b.x - a.x).toBeCloseTo(after.board.colWidth, 9);
  });

  it('stays stable and idempotent across repeated reflows at the new baseline', () => {
    const first = computeBattleLayout(input, P);
    const second = computeBattleLayout({ ...input }, P);
    expect(second).toEqual(first); // pure function: identical input -> identical layout
  });

  it('keeps every realigned invariant across a resize (360x640 and 768x1024)', () => {
    for (const vp of [
      { width: 360, height: 640 },
      { width: 768, height: 1024 },
    ]) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.table.width).toBe(L.background.width);
      expect(L.table.y).toBeCloseTo(L.bands.hero.bottom + P.tableTopGap, 9);
      expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
      expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
        L.gameplayColumn.x + L.gameplayColumn.width + 0.5,
      );
      for (const h of L.heroes) expect(h.y + h.height).toBeLessThanOrEqual(L.board.tileBounds.y + 1e-6);
    }
  });
});
