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
