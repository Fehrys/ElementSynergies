import { describe, it, expect } from 'vitest';
import { HexGrid } from '../../src/core/grid';
import { validateChain, canExtendChain } from '../../src/core/chain';

function setStones(grid: HexGrid, cells: { row: number; col: number; color: 'red' | 'green' | 'yellow' | 'blue' }[]) {
  for (const cell of cells) {
    grid.set(cell.row, cell.col, { type: 'stone', color: cell.color });
  }
}

describe('validateChain', () => {
  it('rejects a chain shorter than 3', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(result.valid).toBe(false);
  });

  it('accepts a valid same-color chain of length 3', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 1, color: 'red' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(1);
    expect(result.subChains[0].color).toBe('red');
    expect(result.subChains[0].stoneCells).toHaveLength(3);
  });

  it('rejects a chain with a color mismatch', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(false);
  });

  it('rejects a chain that revisits a cell', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 0 },
    ]);
    expect(result.valid).toBe(false);
  });

  it('rejects non-adjacent cells in the path', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 3, color: 'red' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 3 },
    ]);
    expect(result.valid).toBe(false);
  });

  it('counts a special tile pickup toward the minimum chain length', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
    ]);
    grid.set(1, 1, { type: 'special', tile: 'bomb' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(1);
    expect(result.subChains[0].color).toBe('red');
    expect(result.subChains[0].stoneCells).toHaveLength(2);
    expect(result.subChains[0].specialTileCells).toEqual([{ row: 1, col: 1 }]);
  });

  it('collects a colorless special tile mid-chain without extending stoneCells', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 2, color: 'red' },
    ]);
    grid.set(1, 1, { type: 'special', tile: 'bomb' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains[0].stoneCells).toHaveLength(3);
    expect(result.subChains[0].specialTileCells).toEqual([{ row: 1, col: 1 }]);
  });

  it('rejects a chain touching a different color after a special tile (no bridging)', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 2, color: 'blue' },
    ]);
    grid.set(1, 1, { type: 'special', tile: 'sword' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/color mismatch/);
  });

  it('rejects a portal chain where a side falls short of minimum length', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 3, color: 'blue' },
      { row: 1, col: 2, color: 'blue' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    // red side only has 2 stones (fails min 3); blue side has 2 (also fails via this path)
    // so this exact path is invalid — covered fully by the next, genuinely
    // portal-bridged passing case.
    expect(result.valid).toBe(false);
  });

  it('splits a portal-bridged chain into two independently-scored sub-chains', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'red' },
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 2, color: 'blue' },
      { row: 1, col: 3, color: 'blue' },
      { row: 2, col: 3, color: 'blue' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(2);

    const redSubChain = result.subChains.find((sub) => sub.color === 'red');
    const blueSubChain = result.subChains.find((sub) => sub.color === 'blue');
    expect(redSubChain).toBeDefined();
    expect(blueSubChain).toBeDefined();

    const redCells = new Set(redSubChain!.stoneCells.map((c) => `${c.row},${c.col}`));
    expect(redCells).toEqual(new Set(['1,0', '0,0', '0,1']));

    const blueCells = new Set(blueSubChain!.stoneCells.map((c) => `${c.row},${c.col}`));
    expect(blueCells).toEqual(new Set(['1,2', '1,3', '2,3']));

    expect(result.portalCells).toEqual([{ row: 0, col: 2 }]);
  });

  it('splits a chain with two portals into three independently-scored sub-chains', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
      { row: 3, col: 4, color: 'green' },
      { row: 4, col: 4, color: 'green' },
      { row: 3, col: 5, color: 'green' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    grid.set(2, 4, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 3, col: 4 },
      { row: 4, col: 4 },
      { row: 3, col: 5 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(3);

    const colors = result.subChains.map((sub) => sub.color).sort();
    expect(colors).toEqual(['green', 'red', 'yellow']);

    const yellowSubChain = result.subChains.find((sub) => sub.color === 'yellow')!;
    const redSubChain = result.subChains.find((sub) => sub.color === 'red')!;
    const greenSubChain = result.subChains.find((sub) => sub.color === 'green')!;

    expect(yellowSubChain.stoneCells).toHaveLength(3);
    expect(redSubChain.stoneCells).toHaveLength(3);
    expect(greenSubChain.stoneCells).toHaveLength(3);

    expect(result.portalCells).toEqual([
      { row: 0, col: 2 },
      { row: 2, col: 4 },
    ]);
  });

  it('excludes a bridging portal from a segment that already contains a leading portal', () => {
    const grid = new HexGrid();
    grid.set(1, 0, { type: 'portal' });
    setStones(grid, [
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(2);

    const yellowSubChain = result.subChains.find((sub) => sub.color === 'yellow')!;
    const redSubChain = result.subChains.find((sub) => sub.color === 'red')!;

    // The leading portal (1,0) counts toward yellow's length like a special
    // tile; the bridging portal (0,2) must NOT also land in yellow's cells.
    expect(yellowSubChain.stoneCells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(yellowSubChain.specialTileCells).toEqual([{ row: 1, col: 0 }]);

    // The bridging portal must also be excluded from red's cells.
    expect(redSubChain.stoneCells).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
    expect(redSubChain.specialTileCells).toEqual([]);

    expect(result.portalCells).toEqual([
      { row: 1, col: 0 },
      { row: 0, col: 2 },
    ]);
  });

  it('allows a chain to start on a special tile, with color decided by the first stone', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'special', tile: 'sword' });
    setStones(grid, [
      { row: 0, col: 1, color: 'blue' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(1);
    expect(result.subChains[0].color).toBe('blue');
    expect(result.subChains[0].stoneCells).toHaveLength(2);
    expect(result.subChains[0].specialTileCells).toEqual([{ row: 0, col: 0 }]);
  });

  it('allows a chain to start on a portal, counting it toward the minimum length like a special tile', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    setStones(grid, [
      { row: 0, col: 1, color: 'blue' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(1);
    expect(result.subChains[0].color).toBe('blue');
    expect(result.subChains[0].stoneCells).toHaveLength(2);
    expect(result.subChains[0].specialTileCells).toEqual([{ row: 0, col: 0 }]);
    expect(result.portalCells).toEqual([{ row: 0, col: 0 }]);
  });

  it('rejects a chain made entirely of uncolored tiles with no stone at all', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'special', tile: 'sword' });
    grid.set(0, 1, { type: 'special', tile: 'bomb' });
    grid.set(1, 1, { type: 'special', tile: 'bow' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no colored stone/);
  });

  it('rejects a chain starting on a special tile whose stones mismatch', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'special', tile: 'sword' });
    setStones(grid, [
      { row: 0, col: 1, color: 'blue' },
      { row: 1, col: 1, color: 'red' },
    ]);
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/color mismatch/);
  });
});

describe('canExtendChain', () => {
  it('allows extending with a matching stone', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'blue' },
      { row: 0, col: 1, color: 'blue' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(true);
  });

  it('rejects a mismatched stone once a color is locked', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'blue' },
      { row: 0, col: 1, color: 'blue' },
      { row: 1, col: 1, color: 'red' },
    ]);
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(false);
  });

  it('always allows a special tile regardless of established color', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'blue' },
      { row: 0, col: 1, color: 'blue' },
    ]);
    grid.set(1, 1, { type: 'special', tile: 'bomb' });
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(true);
  });

  it('allows extending onto a portal when none used yet', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'blue' },
      { row: 0, col: 1, color: 'blue' },
    ]);
    grid.set(1, 1, { type: 'portal' });
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(true);
  });

  it('allows extending through a second portal now that the cap is removed', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    setStones(grid, [{ row: 0, col: 1, color: 'blue' }]);
    grid.set(1, 1, { type: 'portal' });
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(true);
  });

  it('allows extending a chain that already bridged one portal through a second portal', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    grid.set(2, 4, { type: 'portal' });
    const path = [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ];
    expect(canExtendChain(grid, path, { row: 2, col: 4 })).toBe(true);
  });

  it('allows a stone of a brand-new color right after a second portal', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
      { row: 3, col: 4, color: 'green' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    grid.set(2, 4, { type: 'portal' });
    const path = [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ];
    expect(canExtendChain(grid, path, { row: 3, col: 4 })).toBe(true);
  });

  it('requires the cell right after a portal to be a stone', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    grid.set(0, 1, { type: 'special', tile: 'sword' });
    const path = [{ row: 0, col: 0 }];
    expect(canExtendChain(grid, path, { row: 0, col: 1 })).toBe(false);
  });

  it('allows any stone color right after a portal', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    setStones(grid, [{ row: 0, col: 1, color: 'red' }]);
    const path = [{ row: 0, col: 0 }];
    expect(canExtendChain(grid, path, { row: 0, col: 1 })).toBe(true);
  });

  it('rejects a non-adjacent cell', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'blue' },
      { row: 0, col: 3, color: 'blue' },
    ]);
    const path = [{ row: 0, col: 0 }];
    expect(canExtendChain(grid, path, { row: 0, col: 3 })).toBe(false);
  });

  it('rejects revisiting a cell already in the path', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'blue' },
      { row: 0, col: 1, color: 'blue' },
    ]);
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 0, col: 0 })).toBe(false);
  });

  it('allows extending from a leading special tile onto the first stone', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'special', tile: 'sword' });
    setStones(grid, [{ row: 0, col: 1, color: 'blue' }]);
    const path = [{ row: 0, col: 0 }];
    expect(canExtendChain(grid, path, { row: 0, col: 1 })).toBe(true);
  });
});
