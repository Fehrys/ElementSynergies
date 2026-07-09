// Pixel layout constants for the hex board. Deliberately has no Phaser
// import — Task 10's Playwright test computes cellToPixel in a plain
// Node context (to know where to click), and Phaser's module touches
// `window`/`document` at import time, which would crash outside a
// browser page. Keeping this math Phaser-free lets both BattleScene
// (in the browser) and the e2e spec (in Node) share one implementation.

// Recentered/bottom-aligned for the 480x720 canvas: the grid's bounding
// box (COLS=7 columns, tallest column 5 rows, COL_WIDTH=56, ROW_HEIGHT=48,
// stones rendered at 22px radius) is 380px wide and 236px tall including
// radius padding. ORIGIN_X centers that 380px block in the 480px-wide
// canvas (50px margin each side). ORIGIN_Y bottom-aligns it with a 20px
// margin from the 720px-tall canvas's bottom edge. See
// docs/superpowers/specs/2026-07-09-battle-lineup-and-layout-design.md
// for the full derivation.
export const ORIGIN_X = 72;
export const ORIGIN_Y = 486;
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
