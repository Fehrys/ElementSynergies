import { describe, it, expect } from 'vitest';
import { DEPTH } from '../../src/scenes/depth';

// Regression guard for the 2026-07-18/19 review fixes: the lower battle
// environment background (rendered in tableContainer, DEPTH.TABLE) is a full
// opaque painting across the whole prep band, not a thin table-edge lip — it
// must never be able to render in front of the heroes/boss/board even if a
// placeholder footprint temporarily extends into that band (2026-07-18), and
// it must render strictly BEHIND battleBackgroundUpper (DEPTH.BACKGROUND) so
// any sub-pixel mask-edge imprecision at the two backgrounds' shared seam
// falls harmlessly behind the upper painting rather than over it (2026-07-19).
describe('DEPTH — z-order invariants', () => {
  it('keeps the lower background strictly behind the heroes, the boss, and the board', () => {
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.HERO);
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.MONSTER);
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.BOARD);
  });

  it('keeps the lower background strictly behind the upper background', () => {
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.BACKGROUND);
  });

  it('keeps the upper background and its retired environment layer behind everything else', () => {
    expect(DEPTH.BACKGROUND).toBeLessThan(DEPTH.MONSTER);
    expect(DEPTH.ENVIRONMENT).toBeLessThan(DEPTH.MONSTER);
  });

  it('keeps the puzzle board above the lower background so tiles always draw over it', () => {
    expect(DEPTH.BOARD).toBeGreaterThan(DEPTH.TABLE);
  });

  it('has no duplicate depth values (every layer independently orderable)', () => {
    const values = Object.values(DEPTH);
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the Lot 2 temporary lower surface and frame behind the board but above the (hidden) real table sprite', () => {
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.LOWER_SURFACE);
    expect(DEPTH.LOWER_SURFACE).toBeLessThan(DEPTH.BOARD_FRAME);
    expect(DEPTH.BOARD_FRAME).toBeLessThan(DEPTH.BOARD);
  });
});
