# Board Layout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transpose the hex grid's stagger axis so columns render as straight vertical lines (matching the reference screenshot) instead of rows, and replace special tiles' illegible letter labels with recognizable emoji icons.

**Architecture:** `src/core/grid.ts`'s shape (`ROWS`/`rowWidth`) and offset↔axial conversion (`toAxial`/`toOffset`) are transposed from row-major to column-major, keeping the same 32-cell count and alternating 5/4 pattern. `src/scenes/boardLayout.ts`'s `cellToPixel` is updated to match (x depends only on `col`, y depends on `row` plus a column-parity shift). `refill.ts` and `specialTiles.ts` need no code changes since they already treat `col` as "the vertical line." `src/scenes/BattleScene.ts`'s `TILE_LABEL` map swaps letters for emoji.

**Tech Stack:** TypeScript, Vitest (unit tests), Playwright (e2e), Phaser 3 (rendering, untouched by these fixes beyond `BattleScene.ts`'s label map).

## Global Constraints

- Board stays 32 cells total, 7 groups alternating 5/4 cells — only the axis reassigns from rows to columns (per `docs/superpowers/specs/2026-07-07-board-layout-fixes-design.md`).
- `AXIAL_DIRECTIONS` (the 6 abstract neighbor vectors) must not change — only `toAxial`/`toOffset` (the offset↔axial mapping) change.
- `refill.ts` and `specialTiles.ts` must not need code changes — only `grid.ts` and `boardLayout.ts` (plus `BattleScene.ts`'s import rename) do.
- Special tile icons: Bomb 💣, Sword 🗡️, Bow 🏹, Dynamite 🧨, Double Sword ⚔️, Double Arrow Bow 🔫.

---

### Task 1: Transpose grid shape and axial math

**Files:**
- Modify: `src/core/grid.ts`
- Test: `tests/core/grid.test.ts`

**Interfaces:**
- Produces: `COLS: number`, `colHeight(col: number): number`, `isValidCell(row, col): boolean`, `getAllCells(): CellCoord[]`, `toAxial(row, col): AxialCoord`, `toOffset(axial): CellCoord`, `COL_AXIS_DIRECTION_INDICES: [number, number]`, `getNeighbors(row, col): CellCoord[]` — all replacing the old `ROWS`/`rowWidth`/`ROW_AXIS_DIRECTION_INDICES` row-major versions. `DIAGONAL_AXIS_DIRECTION_INDICES` and `AXIAL_DIRECTIONS` keep their existing names/values.
- Consumed by: `src/core/chain.ts`, `src/core/refill.ts`, `src/core/specialTiles.ts` (all call these functions generically — no changes needed there).

- [ ] **Step 1: Write the failing test**

Replace `tests/core/grid.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  COLS,
  colHeight,
  isValidCell,
  getAllCells,
  getNeighbors,
  HexGrid,
  fillBoard,
  ELEMENT_COLORS,
} from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';

describe('grid dimensions', () => {
  it('has 7 columns alternating height 5/4, 32 cells total', () => {
    expect(COLS).toBe(7);
    expect(colHeight(0)).toBe(5);
    expect(colHeight(1)).toBe(4);
    expect(getAllCells()).toHaveLength(32);
  });

  it('rejects out-of-range cells', () => {
    expect(isValidCell(5, 0)).toBe(false);
    expect(isValidCell(4, 1)).toBe(false);
    expect(isValidCell(-1, 0)).toBe(false);
    expect(isValidCell(0, 7)).toBe(false);
  });
});

describe('getNeighbors', () => {
  it('returns 4 neighbors for an edge cell', () => {
    const neighbors = getNeighbors(2, 0);
    expect(neighbors).toHaveLength(4);
    expect(neighbors).toEqual(
      expect.arrayContaining([
        { row: 3, col: 0 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 1 },
      ])
    );
  });

  it('returns 6 neighbors for an interior cell', () => {
    const neighbors = getNeighbors(2, 2);
    expect(neighbors).toHaveLength(6);
    expect(neighbors).toEqual(
      expect.arrayContaining([
        { row: 3, col: 2 },
        { row: 2, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: 1, col: 3 },
        { row: 2, col: 3 },
      ])
    );
  });
});

describe('HexGrid + fillBoard', () => {
  it('fills every cell with stone, special, or portal content using only the 4 element colors', () => {
    const grid = new HexGrid();
    fillBoard(grid, mulberry32(1));
    for (const cell of getAllCells()) {
      const content = grid.get(cell.row, cell.col);
      expect(['stone', 'special', 'portal']).toContain(content.type);
      if (content.type === 'stone') {
        expect(ELEMENT_COLORS).toContain(content.color);
      }
    }
  });

  it('empty cells report type empty', () => {
    const grid = new HexGrid();
    expect(grid.get(0, 0)).toEqual({ type: 'empty' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/grid.test.ts`
Expected: FAIL — `COLS`/`colHeight` don't exist yet (import error), or `ROWS`/`rowWidth` references are gone from the test but still in source.

- [ ] **Step 3: Write the implementation**

Replace `src/core/grid.ts` with:

```ts
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

export const PORTAL_SPAWN_CHANCE = 0.02;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/grid.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/grid.ts tests/core/grid.test.ts
git commit -m "$(cat <<'EOF'
refactor: transpose hex grid from row-major to column-major

Columns now render as straight vertical lines matching the reference
screenshot, instead of rows. Same 32-cell, 5/4-alternating shape and
the same 6 abstract neighbor directions — only which raw coordinate
(row vs col) absorbs the stagger offset changes.
EOF
)"
```

---

### Task 2: Update dependent unit test fixtures for the new shape

**Files:**
- Modify: `tests/core/specialTiles.test.ts`
- Modify: `tests/core/refill.test.ts`

**Interfaces:**
- Consumes: `COLS`/`colHeight`/`getNeighbors` from Task 1 (already implemented).
- No production code changes in this task — `src/core/specialTiles.ts` and `src/core/refill.ts` already treat `col` as the vertical-line concept and need zero changes.

- [ ] **Step 1: Update specialTiles.test.ts fixtures**

The old fixtures assumed row-major shape (e.g. `{row:3,col:1}` was an interior cell with 6 neighbors; under the new column-major shape it's a column-edge cell with only 5). Replace `tests/core/specialTiles.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { HexGrid } from '../../src/core/grid';
import { getAffectedCells } from '../../src/core/specialTiles';
import { mulberry32 } from '../../src/core/rng';

describe('getAffectedCells', () => {
  it('bomb destroys itself plus all hex-neighbors', () => {
    const grid = new HexGrid();
    const cells = getAffectedCells(grid, { row: 2, col: 2 }, 'bomb', mulberry32(1));
    expect(cells).toHaveLength(7); // interior cell: itself + 6 neighbors
    expect(cells).toEqual(expect.arrayContaining([{ row: 2, col: 2 }]));
  });

  it('bomb on an edge cell destroys itself plus fewer neighbors', () => {
    const grid = new HexGrid();
    const cells = getAffectedCells(grid, { row: 2, col: 0 }, 'bomb', mulberry32(1));
    expect(cells).toHaveLength(5); // edge cell: itself + 4 neighbors
  });

  it('sword clears a full line along one diagonal axis through its cell', () => {
    const grid = new HexGrid();
    const cells = getAffectedCells(grid, { row: 2, col: 2 }, 'sword', mulberry32(1));
    expect(cells).toEqual(expect.arrayContaining([{ row: 2, col: 2 }]));
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it('doubleSword clears both diagonal axes through its cell, superset of sword', () => {
    const grid = new HexGrid();
    const swordCells = getAffectedCells(grid, { row: 2, col: 2 }, 'sword', mulberry32(1));
    const doubleCells = getAffectedCells(grid, { row: 2, col: 2 }, 'doubleSword', mulberry32(1));
    expect(doubleCells.length).toBeGreaterThan(swordCells.length);
    for (const cell of swordCells) {
      expect(doubleCells).toEqual(expect.arrayContaining([cell]));
    }
  });

  it('dynamite destroys its column plus the two adjacent columns, all rows', () => {
    const grid = new HexGrid();
    const cells = getAffectedCells(grid, { row: 2, col: 1 }, 'dynamite', mulberry32(1));
    // columns 0,1,2: col 0 and col 2 are even (5 cells each), col 1 is odd (4 cells)
    expect(cells.length).toBe(5 + 4 + 5);
    expect(cells.every((c) => c.col >= 0 && c.col <= 2)).toBe(true);
  });

  it('bow destroys exactly 8 distinct cells anywhere on the board', () => {
    const grid = new HexGrid();
    const cells = getAffectedCells(grid, { row: 0, col: 0 }, 'bow', mulberry32(5));
    expect(cells).toHaveLength(8);
    const unique = new Set(cells.map((c) => `${c.row},${c.col}`));
    expect(unique.size).toBe(8);
  });

  it('doubleArrowBow destroys exactly 16 distinct cells anywhere on the board', () => {
    const grid = new HexGrid();
    const cells = getAffectedCells(grid, { row: 0, col: 0 }, 'doubleArrowBow', mulberry32(5));
    expect(cells).toHaveLength(16);
    const unique = new Set(cells.map((c) => `${c.row},${c.col}`));
    expect(unique.size).toBe(16);
  });
});
```

- [ ] **Step 2: Update refill.test.ts's gravity fixture**

The old fixture assumed column 0 spans 7 rows; under the new shape column 0 (even, tall) spans only 5 rows. Replace `tests/core/refill.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { HexGrid, getAllCells } from '../../src/core/grid';
import { applyGravity, refillBoard } from '../../src/core/refill';
import { mulberry32 } from '../../src/core/rng';

describe('applyGravity', () => {
  it('compacts non-empty cells to the bottom of each column, preserving order', () => {
    const grid = new HexGrid();
    // column 0 is an even (tall) column: 5 cells, rows 0-4
    grid.set(0, 0, { type: 'stone', color: 'red' });
    grid.set(1, 0, { type: 'empty' });
    grid.set(2, 0, { type: 'stone', color: 'blue' });
    grid.set(3, 0, { type: 'empty' });
    grid.set(4, 0, { type: 'empty' });

    applyGravity(grid);

    expect(grid.get(0, 0)).toEqual({ type: 'empty' });
    expect(grid.get(1, 0)).toEqual({ type: 'empty' });
    expect(grid.get(2, 0)).toEqual({ type: 'empty' });
    expect(grid.get(3, 0)).toEqual({ type: 'stone', color: 'red' });
    expect(grid.get(4, 0)).toEqual({ type: 'stone', color: 'blue' });
  });
});

describe('refillBoard', () => {
  it('leaves no empty cells after gravity + fill', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'stone', color: 'red' });
    // everything else defaults to empty
    refillBoard(grid, mulberry32(3));
    for (const cell of getAllCells()) {
      expect(grid.get(cell.row, cell.col).type).not.toBe('empty');
    }
  });
});
```

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — all test files pass, including `tests/core/chain.test.ts` and `tests/core/resolution.test.ts` **unmodified** (their fixtures use small local coordinate deltas that remain adjacent under the new column-major formula — verified by direct computation during planning; if any of these unexpectedly fail, that means a fixture pair that used to be adjacent no longer is, and the specific failing pair needs to be swapped for an adjacent one under the new scheme, not the underlying grid.ts logic changed).

- [ ] **Step 4: Commit**

```bash
git add tests/core/specialTiles.test.ts tests/core/refill.test.ts
git commit -m "$(cat <<'EOF'
test: update special-tile and gravity fixtures for column-major grid

Coordinates that were interior/edge cells under the old row-major
shape land differently under the transposed column-major one; chain
and resolution tests needed no changes since their small local
coordinate deltas remain adjacent either way.
EOF
)"
```

---

### Task 3: Fix rendering to match the column-major shape

**Files:**
- Modify: `src/scenes/boardLayout.ts`
- Modify: `src/scenes/BattleScene.ts:15` (re-export line only)

**Interfaces:**
- Produces: `ORIGIN_X`, `ORIGIN_Y`, `COL_WIDTH`, `ROW_HEIGHT`, `cellToPixel(row, col): {x, y}` — `COL_WIDTH` replaces the old `CELL_WIDTH` name.
- Consumed by: `src/scenes/BattleScene.ts` (re-exports these, uses `cellToPixel` in `cellAt`/`drawBoard`), `tests/e2e/battle.spec.ts` (imports `cellToPixel` directly).

- [ ] **Step 1: Update boardLayout.ts**

Replace `src/scenes/boardLayout.ts` with:

```ts
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
```

- [ ] **Step 2: Update BattleScene.ts's re-export**

In `src/scenes/BattleScene.ts`, change line 15 from:

```ts
export { ORIGIN_X, ORIGIN_Y, CELL_WIDTH, ROW_HEIGHT, cellToPixel } from './boardLayout';
```

to:

```ts
export { ORIGIN_X, ORIGIN_Y, COL_WIDTH, ROW_HEIGHT, cellToPixel } from './boardLayout';
```

- [ ] **Step 3: Run the full unit suite and typecheck**

Run: `npx vitest run`
Expected: PASS (no unit test imports `CELL_WIDTH`/`COL_WIDTH` directly, so this step is a regression check, not expected to change results)

Run: `npx tsc --noEmit`
Expected: PASS — no leftover references to the removed `CELL_WIDTH` name anywhere in `src/`

- [ ] **Step 4: Run the e2e suite**

Run: `npx playwright test`
Expected: PASS — `tests/e2e/battle.spec.ts` computes chains generically off live grid state via `cellToPixel`, so it should keep working against the new layout unmodified.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/boardLayout.ts src/scenes/BattleScene.ts
git commit -m "$(cat <<'EOF'
fix: render hex columns as straight vertical lines

cellToPixel now keys x purely off col (straight columns) and shifts y
by half a cell based on col parity, matching the reference
screenshot's honeycomb stagger instead of rendering it transposed.
EOF
)"
```

---

### Task 4: Special tile emoji icons

**Files:**
- Modify: `src/scenes/BattleScene.ts:28-35` (`TILE_LABEL` map and its usage in `drawBoard`)

**Interfaces:**
- No exported interface changes — `TILE_LABEL` is a private module-level constant.

- [ ] **Step 1: Update the TILE_LABEL map**

In `src/scenes/BattleScene.ts`, replace:

```ts
// Placeholder text labels standing in for real icons/art in this
// vertical-slice prototype.
const TILE_LABEL: Record<SpecialTileType, string> = {
  bomb: 'B',
  sword: 'S',
  bow: 'W',
  dynamite: 'D',
  doubleSword: 'SS',
  doubleArrowBow: 'WW',
};
```

with:

```ts
// Emoji standing in for real icons/art in this vertical-slice prototype.
// Dynamite and Double Sword get their own distinct glyph (a dynamite
// stick, crossed swords) rather than doubled text since good single
// glyphs exist; Double Arrow Bow uses a gun rather than a doubled bow.
const TILE_LABEL: Record<SpecialTileType, string> = {
  bomb: '💣',
  sword: '🗡️',
  bow: '🏹',
  dynamite: '🧨',
  doubleSword: '⚔️',
  doubleArrowBow: '🔫',
};
```

- [ ] **Step 2: Bump the label font size**

In `src/scenes/BattleScene.ts`'s `drawBoard()` method, find:

```ts
        const label = this.add.text(x - 8, y - 10, TILE_LABEL[content.tile], {
          fontSize: '14px',
          color: '#000000',
        });
```

and change it to:

```ts
        const label = this.add.text(x - 10, y - 11, TILE_LABEL[content.tile], {
          fontSize: '18px',
          color: '#000000',
        });
```

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — this is a rendering-only change with no unit-testable behavior (verified visually in Task 5, not by unit test).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "$(cat <<'EOF'
feat: replace special-tile letter labels with emoji icons

B/S/W/D/SS/WW weren't self-explanatory at a glance; distinct emoji
per tile type (with dedicated glyphs for the improved tiles rather
than doubled text) make each tile's identity legible without a legend.
EOF
)"
```

---

### Task 5: Manual visual verification against the reference screenshot

**Files:** None (verification only, no code changes).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev -- --port 5183` (background)

- [ ] **Step 2: Load a seeded board and screenshot it**

Using the Playwright browser tool, navigate to `http://localhost:5183/?seed=1` and take a screenshot, saving it to `.playwright-mcp/screenshots/board-after-fix.png` (the dedicated screenshots folder — see project conventions).

- [ ] **Step 3: Compare against the reference**

Open `.playwright-mcp/screenshots/board-after-fix.png` alongside `spirit_stone.png` (repo root) and confirm:
- Columns of gems form straight vertical lines (no horizontal zigzag within a column).
- Alternating columns are offset vertically by half a cell.
- Any special tiles visible on the seeded board show a recognizable emoji, not a letter.

- [ ] **Step 4: Manually drag a chain to confirm gameplay still works**

Using the Playwright browser tool, drag across 3+ adjacent same-color stones (compute their pixel centers via the seeded board's known layout, same approach as `tests/e2e/battle.spec.ts`'s `findValidChain` helper) and confirm the monster's HP bar decreases after releasing.

No commit for this task — it's a verification checkpoint. If anything looks wrong, stop and re-open the relevant earlier task rather than proceeding.
