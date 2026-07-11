import { describe, it, expect } from 'vitest';
import { ORIGIN_X, ORIGIN_Y, STONE_RADIUS, cellToPixel, tileBounds } from '../../src/scenes/boardLayout';
import { computeLayoutRegions, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/scenes/compositionLayout';

describe('boardLayout origin derivation', () => {
  it('pins the derived origin constants', () => {
    expect(ORIGIN_X).toBe(72);
    expect(ORIGIN_Y).toBe(448);
    expect(STONE_RADIUS).toBe(22);
  });

  it('reports a tile bounding box consistent with cellToPixel', () => {
    const b = tileBounds();
    expect(b).toEqual({ left: 50, right: 430, top: 426, bottom: 662 });
    // Lowest cell overall is col 0 (even, 5 rows) row 4.
    expect(b.bottom).toBe(cellToPixel(4, 0).y + STONE_RADIUS);
    expect(b.top).toBe(cellToPixel(0, 0).y - STONE_RADIUS);
  });

  it('keeps the tile bounding box inside the board composition band', () => {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const b = tileBounds();
    expect(b.top).toBeGreaterThanOrEqual(regions.board.top);
    expect(b.bottom).toBeLessThanOrEqual(regions.board.bottom);
  });

  it('keeps the tile bounding box centered on the canvas width', () => {
    const b = tileBounds();
    expect(b.left).toBeCloseTo(CANVAS_WIDTH - b.right, 5);
  });
});
