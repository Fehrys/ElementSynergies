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
