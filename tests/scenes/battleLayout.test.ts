import { describe, it, expect } from 'vitest';
import {
  computeBattleLayout,
  DEFAULT_BATTLE_LAYOUT_POLICY,
  sanitizeInsets,
  cssInsetsToGame,
  clampInsetsToViewport,
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
