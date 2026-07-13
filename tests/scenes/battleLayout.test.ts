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
  it('reproduces the legacy board tile bounds', () => {
    expect(L.board.tileBounds).toEqual({ x: 50, y: 400, width: 380, height: 236 });
  });
  it('keeps distinct widths separate', () => {
    expect(L.gameplayColumn.width).toBe(480); // column
    expect(L.table.width).toBeCloseTo(422.4, 5); // 88%
    expect(L.board.tileBounds.width).toBe(380); // ~79.2%
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
    expect(L.board.colWidth / 56).toBeCloseTo(L.board.rowHeight / 48, 9);
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
    expect(L.board.tileBounds.x + L.board.tileBounds.width / 2).toBeCloseTo(c, 3);
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

      it('keeps the table within the column and enclosing the board bbox', () => {
        // The table always fits inside the column and always encloses the puzzle.
        // (On narrow viewports the board widens toward the table, so this is >=,
        // not strictly > — see the M6 horizontal width policy.)
        expect(L.gameplayColumn.width).toBeGreaterThan(L.table.width);
        expect(L.table.width).toBeGreaterThanOrEqual(L.board.tileBounds.width - 1e-6);
      });

      it('produces contiguous, ordered vertical bands', () => {
        const b = L.bands;
        expect(b.topHud.bottom).toBeCloseTo(b.monster.top, 9);
        expect(b.monster.bottom).toBeCloseTo(b.hero.top, 9);
        expect(b.hero.bottom).toBeCloseTo(b.board.top, 9);
        expect(b.board.bottom).toBeCloseTo(b.safeBottom.top, 9);
        expect(b.topHud.top).toBeCloseTo(L.safeRect.y, 9);
        expect(b.safeBottom.bottom).toBeCloseTo(L.safeRect.y + L.safeRect.height, 9);
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
    expect(L.board.tileBounds.width).toBe(380);
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
    // 22/56 and 22/48 recover the same isotropic scale from colWidth/rowHeight —
    // visualRadius is never floored or grown independently of them.
    expect(L.board.visualRadius).toBeCloseTo(L.board.colWidth * (22 / 56), 9);
    expect(L.board.visualRadius).toBeCloseTo(L.board.rowHeight * (22 / 48), 9);
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
    // Contiguous and still spanning [0, 100].
    expect(s.topHud[0]).toBe(0);
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
  it('keeps the table within the column and the background spanning the full viewport (768x1024)', () => {
    const L = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    expect(L.table.width).toBeLessThanOrEqual(L.gameplayColumn.width);
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
