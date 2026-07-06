import { HexGrid, CellCoord, CellContent, getAllCells, randomStone } from './grid';
import { RandomFn } from './rng';

// Groups all 32 cells by their raw offset `col` field (not axial q), each
// list sorted top-to-bottom by row. This is a deliberate simplification
// of "vertical" for a staggered honeycomb — good enough for gravity and
// for dynamite's column-blast (specialTiles.ts), not a true hex axis.
function columns(): Map<number, CellCoord[]> {
  const cols = new Map<number, CellCoord[]>();
  for (const cell of getAllCells()) {
    const list = cols.get(cell.col) ?? [];
    list.push(cell);
    cols.set(cell.col, list);
  }
  for (const list of cols.values()) {
    list.sort((a, b) => a.row - b.row);
  }
  return cols;
}

// Per column, pushes every non-empty cell's content toward the bottom
// (preserving relative order) and backfills the top with empty markers —
// pure "gravity", no randomness, no matching. fillEmpty() (below) is what
// turns those empty markers into new content.
export function applyGravity(grid: HexGrid): void {
  for (const cells of columns().values()) {
    const contents: CellContent[] = cells.map((c) => grid.get(c.row, c.col));
    const nonEmpty = contents.filter((c) => c.type !== 'empty');
    const emptyCount = contents.length - nonEmpty.length;
    const compacted: CellContent[] = [
      ...Array.from({ length: emptyCount }, (): CellContent => ({ type: 'empty' })),
      ...nonEmpty,
    ];
    cells.forEach((cell, i) => grid.set(cell.row, cell.col, compacted[i]));
  }
}

// Rolls fresh content (via randomStone) for every cell still empty after
// gravity has compacted the board.
export function fillEmpty(grid: HexGrid, rng: RandomFn): void {
  for (const cell of getAllCells()) {
    if (grid.get(cell.row, cell.col).type === 'empty') {
      grid.set(cell.row, cell.col, randomStone(rng));
    }
  }
}

// The single call resolution.ts makes after every clear: fall, then fill.
// No auto-match scan happens here or anywhere else — chain reactions only
// come from special tiles (see resolution.ts's wave loop).
export function refillBoard(grid: HexGrid, rng: RandomFn): void {
  applyGravity(grid);
  fillEmpty(grid, rng);
}
