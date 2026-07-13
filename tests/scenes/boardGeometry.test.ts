import { describe, it, expect } from 'vitest';
import { computeBoardGeometry, cellToPixel, cellAtPixel } from '../../src/scenes/boardGeometry';
import type { BoardGeometry } from '../../src/scenes/boardGeometry';
import { DEFAULT_BATTLE_LAYOUT_POLICY, resolveBoardGeometryInput } from '../../src/scenes/battleLayout';
import { HexGrid, fillBoard } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';

// At the 480 baseline the geometry must reproduce today's boardLayout.ts exactly.
const column = { x: 0, y: 0, width: 480, height: 720 };
const tableSpan = { top: 323.2, bottom: 712 };
// battleLayout resolves the policy into a plain BoardGeometryInput; boardGeometry sees no policy.
const baseInput = resolveBoardGeometryInput(column, tableSpan, DEFAULT_BATTLE_LAYOUT_POLICY);

describe('computeBoardGeometry — 480 baseline neutrality', () => {
  const g = computeBoardGeometry(baseInput);
  it('reproduces the legacy origin, radius, and tile bounds', () => {
    expect(g.originX).toBe(72);
    expect(g.originY).toBe(422);
    expect(g.visualRadius).toBe(22);
    expect(g.hitRadius).toBe(22);
    expect(g.colWidth).toBe(56);
    expect(g.rowHeight).toBe(48);
    expect(g.tileBounds).toEqual({ x: 50, y: 400, width: 380, height: 236 });
  });
});

describe('cellAtPixel — nearest admissible cell', () => {
  const g = computeBoardGeometry(baseInput); // resolved once above
  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const cells = grid.getAllCells(); // the real 32-cell honeycomb
  const ordered = [...cells].sort((p, q) => p.col - q.col || p.row - q.row);
  const firstCell = ordered[0]; // { row: 0, col: 0 }
  const lastCell = ordered[ordered.length - 1]; // { row: 4, col: 6 } (even cols hold 5 rows -> 32 cells)

  it('returns the exact cell when the point is its center (single admissible)', () => {
    expect(cellAtPixel(cellToPixel(g, 1, 0), cells, g)).toEqual({ row: 1, col: 0 });
  });

  it('returns null for a point outside every hitRadius', () => {
    expect(cellAtPixel({ x: -500, y: -500 }, cells, g)).toBeNull();
  });

  it('picks the nearer of two nearby centers', () => {
    const a = cellToPixel(g, 0, 0);
    const near = { x: a.x, y: a.y + 3 }; // nudged toward (1,0), still nearest (0,0)
    expect(cellAtPixel(near, cells, g)).toEqual({ row: 0, col: 0 });
  });

  it('breaks an exact tie by smaller col then smaller row, independent of input order', () => {
    // Synthetic geometry whose hitRadius is large enough that the MIDPOINT of two
    // centers is admissible for BOTH. (Production hitRadius is deliberately capped
    // below half the center distance, so a real tie point is never admissible for
    // two cells — that property is asserted separately below. A midpoint is, by
    // definition, equidistant from both endpoints, so this is a genuine tie.)
    const tie: BoardGeometry = {
      originX: 0,
      originY: 0,
      colWidth: 100,
      rowHeight: 100,
      visualRadius: 10,
      hitRadius: 80,
      tileBounds: { x: -10, y: -10, width: 220, height: 120 },
    };
    const a = { row: 0, col: 0 };
    const b = { row: 0, col: 1 };
    const pa = cellToPixel(tie, a.row, a.col);
    const pb = cellToPixel(tie, b.row, b.col);
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    expect(cellAtPixel(mid, [a, b], tie)).toEqual({ row: 0, col: 0 }); // smaller col wins the tie
    expect(cellAtPixel(mid, [b, a], tie)).toEqual({ row: 0, col: 0 }); // identical, regardless of order
  });

  it('resolves the first and last board cells at their centers', () => {
    expect(cellAtPixel(cellToPixel(g, firstCell.row, firstCell.col), cells, g)).toEqual(firstCell);
    expect(cellAtPixel(cellToPixel(g, lastCell.row, lastCell.col), cells, g)).toEqual(lastCell);
  });

  it('production geometry caps hitRadius strictly below half the minimum center distance', () => {
    expect(g.hitRadius).toBeLessThan(g.rowHeight / 2);
  });
});

describe('computeBoardGeometry — narrow-viewport widening stays isotropic and overflow-free', () => {
  // boardGeometry is policy-free (M6 tunes battleLayout only). Fed the saturated
  // widening fraction at a 320 column, it must keep visualRadius = STONE_RADIUS*scale
  // and never push tileBounds outside the column.
  it('keeps visualRadius isotropic and tileBounds inside the column at a widened 320 input', () => {
    const column = { x: 0, y: 0, width: 320, height: 568 };
    const tableSpan = { top: 260, bottom: 560 };
    const g = computeBoardGeometry({
      column,
      tableSpan,
      tileWidthFraction: 0.94, // the saturated widening fraction from resolveTileWidthFraction
      boardHeightFraction: 0.85,
      targetMinVisualRadius: 16,
      targetMinHitRadius: 20,
      maxBoardScale: 1.4,
    });
    expect(g.visualRadius).toBeCloseTo(g.colWidth * (22 / 56), 9); // never floored independently
    expect(g.tileBounds.x).toBeGreaterThanOrEqual(column.x - 1e-6);
    expect(g.tileBounds.x + g.tileBounds.width).toBeLessThanOrEqual(column.x + column.width + 1e-6);
    expect(g.hitRadius).toBeLessThan(g.rowHeight / 2);
  });
});
