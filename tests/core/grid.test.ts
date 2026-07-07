import { describe, it, expect } from 'vitest';
import {
  ROWS,
  rowWidth,
  isValidCell,
  getAllCells,
  getNeighbors,
  HexGrid,
  fillBoard,
  ELEMENT_COLORS,
} from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';

describe('grid dimensions', () => {
  it('has 7 rows alternating width 5/4, 32 cells total', () => {
    expect(ROWS).toBe(7);
    expect(rowWidth(0)).toBe(5);
    expect(rowWidth(1)).toBe(4);
    expect(getAllCells()).toHaveLength(32);
  });

  it('rejects out-of-range cells', () => {
    expect(isValidCell(0, 5)).toBe(false);
    expect(isValidCell(1, 4)).toBe(false);
    expect(isValidCell(-1, 0)).toBe(false);
  });
});

describe('getNeighbors', () => {
  it('returns 4 neighbors for an edge cell', () => {
    const neighbors = getNeighbors(0, 2);
    expect(neighbors).toHaveLength(4);
    expect(neighbors).toEqual(
      expect.arrayContaining([
        { row: 0, col: 1 },
        { row: 0, col: 3 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ])
    );
  });

  it('returns 6 neighbors for an interior cell', () => {
    const neighbors = getNeighbors(3, 1);
    expect(neighbors).toHaveLength(6);
    expect(neighbors).toEqual(
      expect.arrayContaining([
        { row: 3, col: 0 },
        { row: 3, col: 2 },
        { row: 2, col: 1 },
        { row: 2, col: 2 },
        { row: 4, col: 1 },
        { row: 4, col: 2 },
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
