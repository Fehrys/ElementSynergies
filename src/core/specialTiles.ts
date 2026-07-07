import {
  CellCoord,
  HexGrid,
  SpecialTileType,
  AXIAL_DIRECTIONS,
  DIAGONAL_AXIS_DIRECTION_INDICES,
  isValidCell,
  getAllCells,
  toAxial,
  toOffset,
} from './grid';
import { RandomFn } from './rng';

// Walks outward from `origin` in both directions of one axis pair until
// falling off the board, collecting every cell crossed (including the
// origin itself). Used for sword (one axis) and double sword (both axes).
function lineAlongAxis(origin: CellCoord, axisIndices: [number, number]): CellCoord[] {
  const cells: CellCoord[] = [origin];
  for (const dirIndex of axisIndices) {
    const dir = AXIAL_DIRECTIONS[dirIndex];
    let axial = toAxial(origin.row, origin.col);
    for (;;) {
      axial = { q: axial.q + dir.q, r: axial.r + dir.r };
      const cell = toOffset(axial);
      if (!isValidCell(cell.row, cell.col)) break;
      cells.push(cell);
    }
  }
  return cells;
}

// Removes duplicate coordinates while preserving first-seen order — needed
// because double sword's two lines both include `origin`.
function dedupeCells(cells: CellCoord[]): CellCoord[] {
  const seen = new Set<string>();
  const result: CellCoord[] = [];
  for (const cell of cells) {
    const key = `${cell.row},${cell.col}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cell);
    }
  }
  return result;
}

// Sword only clears one diagonal axis — whichever of the two reaches
// further from this position (more cells destroyed), per the design
// decision to make the tile's value depend on where it lands.
function favorableSwordAxis(origin: CellCoord): [number, number] {
  const [axisA, axisB] = DIAGONAL_AXIS_DIRECTION_INDICES;
  const lineA = lineAlongAxis(origin, axisA);
  const lineB = lineAlongAxis(origin, axisB);
  return lineA.length >= lineB.length ? axisA : axisB;
}

// Bomb: itself plus every hex-adjacent neighbor (radius 1).
function bombCells(grid: HexGrid, origin: CellCoord): CellCoord[] {
  return [origin, ...grid.getNeighbors(origin.row, origin.col)];
}

// Base sword: one full diagonal line (the favorable axis) through origin.
function swordCells(origin: CellCoord): CellCoord[] {
  return lineAlongAxis(origin, favorableSwordAxis(origin));
}

// Improved sword: both diagonal lines through origin (superset of swordCells).
function doubleSwordCells(origin: CellCoord): CellCoord[] {
  const [axisA, axisB] = DIAGONAL_AXIS_DIRECTION_INDICES;
  return dedupeCells([...lineAlongAxis(origin, axisA), ...lineAlongAxis(origin, axisB)]);
}

// Dynamite: every cell in the tile's raw offset column plus the two
// neighboring columns, across all rows — a simple, deliberately non-hex-
// axial notion of "column" shared with refill.ts's gravity grouping.
function dynamiteCells(origin: CellCoord): CellCoord[] {
  const cells: CellCoord[] = [];
  for (const col of [origin.col - 1, origin.col, origin.col + 1]) {
    for (const cell of getAllCells()) {
      if (cell.col === col) cells.push(cell);
    }
  }
  return cells;
}

// Shuffles all 32 cells (Fisher-Yates, driven by the injected rng so it's
// reproducible) and takes the first `count` — used by bow (8) and double
// arrow bow (16) to hit random distinct cells anywhere on the board.
function randomDistinctCells(rng: RandomFn, count: number): CellCoord[] {
  const all = getAllCells();
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

// Single entry point resolution.ts calls for any special tile: given
// where the tile sits and what type it is, returns every cell its effect
// destroys. `grid` is only needed for bomb's neighbor lookup; `rng` is
// only consumed by the two bow variants.
export function getAffectedCells(
  grid: HexGrid,
  origin: CellCoord,
  type: SpecialTileType,
  rng: RandomFn
): CellCoord[] {
  switch (type) {
    case 'bomb':
      return bombCells(grid, origin);
    case 'sword':
      return swordCells(origin);
    case 'doubleSword':
      return doubleSwordCells(origin);
    case 'dynamite':
      return dynamiteCells(origin);
    case 'bow':
      return randomDistinctCells(rng, 8);
    case 'doubleArrowBow':
      return randomDistinctCells(rng, 16);
  }
}
