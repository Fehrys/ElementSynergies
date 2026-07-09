import { RandomFn } from './rng';

// The 4 element colors in this prototype (the real game's 5th color and
// dead-color mechanic were dropped — see the design spec).
export type ElementColor = 'red' | 'green' | 'yellow' | 'blue';

export const ELEMENT_COLORS: ElementColor[] = ['red', 'green', 'yellow', 'blue'];

// A cell's position using the board's rendered (row, col) offset scheme —
// this is what every other module and the scene pass around. Internally,
// getNeighbors() converts to axial coordinates to do the actual hex math.
export interface CellCoord {
  row: number;
  col: number;
}

export const COLS = 7;

// Honeycomb columns alternate height: even columns are the tall (5-cell)
// columns, odd columns are the short (4-cell), staggered columns.
export function colHeight(col: number): number {
  return col % 2 === 0 ? 5 : 4;
}

// True if (row, col) is a real cell on the 32-cell board.
export function isValidCell(row: number, col: number): boolean {
  if (col < 0 || col >= COLS) return false;
  return row >= 0 && row < colHeight(col);
}

// Every cell on the board, in column-major order. The canonical source of
// "all 32 cells" — refill.ts, specialTiles.ts, and BattleScene all iterate
// this instead of re-deriving row/col ranges themselves.
export function getAllCells(): CellCoord[] {
  const cells: CellCoord[] = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < colHeight(col); row++) {
      cells.push({ row, col });
    }
  }
  return cells;
}

// Axial hex coordinates (q, r). Unlike the offset (row, col) scheme, axial
// coordinates make "is this a neighbor" and "walk in a straight line"
// simple constant-offset math regardless of column-height staggering.
export interface AxialCoord {
  q: number;
  r: number;
}

// Convert rendered offset coordinates to axial. r is just the col; q
// removes the stagger offset so that hex adjacency becomes a fixed set
// of +/-1 deltas (see AXIAL_DIRECTIONS below).
export function toAxial(row: number, col: number): AxialCoord {
  return { q: row - Math.floor(col / 2), r: col };
}

// Inverse of toAxial — converts back to the rendered (row, col) scheme.
export function toOffset(axial: AxialCoord): CellCoord {
  const col = axial.r;
  const row = axial.q + Math.floor(col / 2);
  return { row, col };
}

/**
 * The 6 hex neighbor directions in axial space, as 3 opposite-direction
 * pairs. Index pair [0,3] has dr=0 (same column) — the "column axis". Pairs
 * [1,4] and [2,5] are the "diagonal axes" used by sword/double sword in
 * specialTiles.ts. Dynamite's "column" is a separate, simpler concept
 * (the raw offset `col` field — see refill.ts), not one of these axes.
 */
export const AXIAL_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

// Which AXIAL_DIRECTIONS index pair is the same-column axis vs. the two
// diagonal axes — named here once so specialTiles.ts doesn't hardcode
// magic indices when picking sword's line direction.
export const COL_AXIS_DIRECTION_INDICES: [number, number] = [0, 3];
export const DIAGONAL_AXIS_DIRECTION_INDICES: [number, number][] = [
  [1, 4],
  [2, 5],
];

// All in-bounds hex neighbors of (row, col) — up to 6 for interior cells,
// fewer at the board edges. This is the single source of truth for
// adjacency used by chain validation (chain.ts) and bomb's blast radius
// (specialTiles.ts).
export function getNeighbors(row: number, col: number): CellCoord[] {
  const axial = toAxial(row, col);
  const neighbors: CellCoord[] = [];
  for (const dir of AXIAL_DIRECTIONS) {
    const offset = toOffset({ q: axial.q + dir.q, r: axial.r + dir.r });
    if (isValidCell(offset.row, offset.col)) {
      neighbors.push(offset);
    }
  }
  return neighbors;
}

// The 6 special tiles: 3 base tiles (spawn via random refill chance) and
// their 3 "improved" upgrades (spawn only via a combo-depth-3 bonus).
export type SpecialTileType = 'bomb' | 'sword' | 'bow' | 'dynamite' | 'doubleSword' | 'doubleArrowBow';

// What a single board cell currently holds. `special` tiles are colorless
// (see chain.ts's pickup rule); `portal` is the rainbow bridge orb.
export type CellContent =
  | { type: 'stone'; color: ElementColor }
  | { type: 'special'; tile: SpecialTileType }
  | { type: 'portal' }
  | { type: 'empty' };

export const PORTAL_SPAWN_CHANCE = 0.05;
export const BASE_TILE_SPAWN_CHANCE = 0.03;
const BASE_TILE_TYPES: SpecialTileType[] = ['bomb', 'sword', 'bow'];

// Rolls what a freshly-filled cell becomes: small chance of a portal,
// small chance of a random base special tile, otherwise a plain stone of
// one of the 4 colors. Used both for the initial board fill and for every
// cell refill.ts tops up after a clear.
export function randomStone(rng: RandomFn): CellContent {
  const roll = rng();
  if (roll < PORTAL_SPAWN_CHANCE) {
    return { type: 'portal' };
  }
  if (roll < PORTAL_SPAWN_CHANCE + BASE_TILE_SPAWN_CHANCE) {
    const tile = BASE_TILE_TYPES[Math.floor(rng() * BASE_TILE_TYPES.length)];
    return { type: 'special', tile };
  }
  const color = ELEMENT_COLORS[Math.floor(rng() * ELEMENT_COLORS.length)];
  return { type: 'stone', color };
}

// Sparse board storage: only cells that have been explicitly set exist in
// the map; anything else reads back as `{ type: 'empty' }`. This is the
// single mutable piece of game state every core module operates on.
export class HexGrid {
  private cells = new Map<string, CellContent>();

  private key(row: number, col: number): string {
    return `${row},${col}`;
  }

  get(row: number, col: number): CellContent {
    return this.cells.get(this.key(row, col)) ?? { type: 'empty' };
  }

  set(row: number, col: number, content: CellContent): void {
    this.cells.set(this.key(row, col), content);
  }

  // Convenience passthrough so callers only need a HexGrid instance in
  // scope, not a separate import of the free getAllCells() function.
  getAllCells(): CellCoord[] {
    return getAllCells();
  }

  // Convenience passthrough, same reasoning as getAllCells() above.
  getNeighbors(row: number, col: number): CellCoord[] {
    return getNeighbors(row, col);
  }
}

// Fills every one of the 32 cells with a freshly-rolled stone/tile/portal.
// Used once at battle start; refill.ts handles topping up individual
// cells after that (it calls randomStone() directly, not this).
export function fillBoard(grid: HexGrid, rng: RandomFn): void {
  for (const { row, col } of getAllCells()) {
    grid.set(row, col, randomStone(rng));
  }
}
