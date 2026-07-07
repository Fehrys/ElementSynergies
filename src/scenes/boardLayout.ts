// Pixel layout constants for the hex board. Deliberately has no Phaser
// import — Task 10's Playwright test computes cellToPixel in a plain
// Node context (to know where to click), and Phaser's module touches
// `window`/`document` at import time, which would crash outside a
// browser page. Keeping this math Phaser-free lets both BattleScene
// (in the browser) and the e2e spec (in Node) share one implementation.
export const ORIGIN_X = 40;
export const ORIGIN_Y = 120;
export const COL_WIDTH = 56;
export const ROW_HEIGHT = 48;

// Converts a logical (row, col) cell into the screen position of its
// center. Columns render as straight vertical lines (x depends only on
// col); alternating columns shift down by half a cell so they interlock
// into a honeycomb, matching the reference screenshot's column stagger.
export function cellToPixel(row: number, col: number): { x: number; y: number } {
  const shift = col % 2 === 1 ? ROW_HEIGHT / 2 : 0;
  return {
    x: ORIGIN_X + col * COL_WIDTH,
    y: ORIGIN_Y + row * ROW_HEIGHT + shift,
  };
}
