import { describe, it, expect } from 'vitest';
import { HexGrid, getAllCells } from '../../src/core/grid';
import { applyGravity, refillBoard } from '../../src/core/refill';
import { mulberry32 } from '../../src/core/rng';

describe('applyGravity', () => {
  it('compacts non-empty cells to the bottom of each column, preserving order', () => {
    const grid = new HexGrid();
    // column 0 exists in rows 0,1,2,3,4,5,6 (all rows have col 0)
    grid.set(0, 0, { type: 'stone', color: 'red' });
    grid.set(1, 0, { type: 'empty' });
    grid.set(2, 0, { type: 'stone', color: 'blue' });
    grid.set(3, 0, { type: 'empty' });
    for (let row = 4; row <= 6; row++) grid.set(row, 0, { type: 'empty' });

    applyGravity(grid);

    expect(grid.get(0, 0)).toEqual({ type: 'empty' });
    expect(grid.get(1, 0)).toEqual({ type: 'empty' });
    expect(grid.get(2, 0)).toEqual({ type: 'empty' });
    expect(grid.get(3, 0)).toEqual({ type: 'empty' });
    expect(grid.get(4, 0)).toEqual({ type: 'empty' });
    expect(grid.get(5, 0)).toEqual({ type: 'stone', color: 'red' });
    expect(grid.get(6, 0)).toEqual({ type: 'stone', color: 'blue' });
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
