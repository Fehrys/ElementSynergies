// Pixel layout constants for the hex board. Deliberately has no Phaser
// import — the Playwright spec computes cellToPixel in a plain Node context
// (to know where to click), and Phaser touches `window`/`document` at import
// time, which would crash outside a browser page. Keeping this math
// Phaser-free lets both BattleScene (browser) and the e2e spec (Node) share
// one implementation.
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  computeLayoutRegions,
  computeTableSpan,
} from './compositionLayout';

export const COL_WIDTH = 56;
export const ROW_HEIGHT = 48;
// Rendered stone radius; also the pointer hit-test tolerance in BattleScene.
// Lives here (not in the scene) because it is board-layout geometry: the
// tile bounding box below depends on it.
export const STONE_RADIUS = 22;

// Grid bounding box (COLS=7, tallest column 5 rows): 380px wide, 236px tall
// including radius padding. See
// docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md.
const BBOX_WIDTH = 6 * COL_WIDTH + 2 * STONE_RADIUS; // 380
const BBOX_HEIGHT = 4 * ROW_HEIGHT + 2 * STONE_RADIUS; // 236

const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);

// Horizontal: center the tile bbox on the full canvas width.
export const ORIGIN_X = Math.round((CANVAS_WIDTH - BBOX_WIDTH) / 2 + STONE_RADIUS);
// Vertical: center the tile bbox inside the preparation-table span (the same
// span the table surface is drawn on), so there is roughly equal visible table
// above and below the puzzle instead of the puzzle sitting low in the table.
const tableSpan = computeTableSpan(regions);
const tileBoundsTop = tableSpan.top + (tableSpan.bottom - tableSpan.top - BBOX_HEIGHT) / 2;
export const ORIGIN_Y = Math.round(tileBoundsTop + STONE_RADIUS);

// Converts a logical (row, col) cell into the ABSOLUTE stage-space position
// of its center. Columns render as straight vertical lines (x depends only
// on col); alternating columns shift down by half a cell so they interlock
// into a honeycomb.
export function cellToPixel(row: number, col: number): { x: number; y: number } {
  const shift = col % 2 === 1 ? ROW_HEIGHT / 2 : 0;
  return {
    x: ORIGIN_X + col * COL_WIDTH,
    y: ORIGIN_Y + row * ROW_HEIGHT + shift,
  };
}

// The axis-aligned bounding box of all rendered tiles, in stage space.
// Used by the composition layout to fit the table surface around the real
// tiles (the art adapts to the engine, not the reverse).
export function tileBounds(): { left: number; right: number; top: number; bottom: number } {
  return {
    left: ORIGIN_X - STONE_RADIUS,
    right: ORIGIN_X + 6 * COL_WIDTH + STONE_RADIUS,
    top: ORIGIN_Y - STONE_RADIUS,
    bottom: ORIGIN_Y + 4 * ROW_HEIGHT + STONE_RADIUS,
  };
}
