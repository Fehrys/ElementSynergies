// Pixel layout constants for the hex board. Deliberately has no Phaser
// import — Task 10's Playwright test computes cellToPixel in a plain
// Node context (to know where to click), and Phaser's module touches
// `window`/`document` at import time, which would crash outside a
// browser page. Keeping this math Phaser-free lets both BattleScene
// (in the browser) and the e2e spec (in Node) share one implementation.
export const ORIGIN_X = 60;
export const ORIGIN_Y = 100;
export const CELL_WIDTH = 56;
export const ROW_HEIGHT = 48;

// Converts a logical (row, col) cell into the screen position of its
// center, applying the honeycomb's half-cell-width shift on odd rows.
export function cellToPixel(row: number, col: number): { x: number; y: number } {
  const shift = row % 2 === 1 ? CELL_WIDTH / 2 : 0;
  return {
    x: ORIGIN_X + col * CELL_WIDTH + shift,
    y: ORIGIN_Y + row * ROW_HEIGHT,
  };
}
