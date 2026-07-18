import { describe, it, expect } from 'vitest';
import { DEPTH } from '../../src/scenes/depth';

// Regression guard for the 2026-07-18 Lot 2 review fix: the lower battle
// environment background (rendered in tableContainer, DEPTH.TABLE) is now a
// full opaque painting across the whole prep band, not a thin table-edge lip
// — it must never be able to render in front of the heroes/boss/board even if
// a placeholder footprint temporarily extends into that band.
describe('DEPTH — z-order invariants', () => {
  it('keeps the lower background strictly behind the heroes, the boss, and the board', () => {
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.HERO);
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.MONSTER);
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.BOARD);
  });

  it('keeps the upper background and its retired environment layer behind everything else', () => {
    expect(DEPTH.BACKGROUND).toBeLessThan(DEPTH.TABLE);
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
});
