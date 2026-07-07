import { describe, it, expect } from 'vitest';
import { HexGrid, CellCoord } from '../../src/core/grid';
import { resolveTurn } from '../../src/core/resolution';
import { ROSTER } from '../../src/core/combat';
import { mulberry32 } from '../../src/core/rng';

function setStones(grid: HexGrid, cells: { row: number; col: number; color: 'red' | 'green' | 'yellow' | 'blue' }[]) {
  for (const cell of cells) grid.set(cell.row, cell.col, { type: 'stone', color: cell.color });
}

describe('resolveTurn', () => {
  it('returns valid:false and deals no damage for an invalid path', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
    ]);
    const path: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ];
    const result = resolveTurn(grid, ROSTER, path, mulberry32(1));
    expect(result.valid).toBe(false);
    expect(result.totalDamage).toBe(0);
  });

  it('deals full ATK*count damage for a manual chain and clears the cells', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 1, color: 'red' },
    ]);
    const path: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ];
    const result = resolveTurn(grid, ROSTER, path, mulberry32(1));
    expect(result.valid).toBe(true);
    expect(result.comboDepth).toBe(1);
    expect(result.totalDamage).toBe(50 * 3);
    expect(result.damageEvents).toEqual([{ color: 'red', count: 3, damage: 150 }]);
    // cleared cells were refilled, not left empty
    expect(grid.get(0, 0).type).not.toBe('empty');
  });

  it('triggers a wave-2 bomb picked up mid-chain and deals additional damage', () => {
    const grid = new HexGrid();
    // bomb's blast neighbors, pre-set to green stones so wave 2 has something to
    // damage. Set BEFORE the red path stones below: two of bomb (1,1)'s six
    // neighbors — (0,1) and (1,2) — are themselves part of the chain path, so
    // greening must happen first and let the path's setStones call win there,
    // otherwise the path's own red stones get overwritten back to green and
    // validateChain rejects the chain on a color mismatch.
    for (const n of grid.getNeighbors(1, 1)) {
      grid.set(n.row, n.col, { type: 'stone', color: 'green' });
    }
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 2, color: 'red' },
    ]);
    grid.set(1, 1, { type: 'special', tile: 'bomb' });
    const path: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ];
    // Seed 3 (not 1): with this corrected cell ordering, seed 1's RNG sequence
    // happens to make bomb A's wave-2 blast also catch a freshly-refilled
    // special tile, reaching combo depth 3 instead of the exact depth 2 this
    // test asserts. Seed 3 reliably stops at depth 2.
    const result = resolveTurn(grid, ROSTER, path, mulberry32(3));
    expect(result.valid).toBe(true);
    expect(result.comboDepth).toBe(2);
    expect(result.damageEvents.some((e) => e.color === 'green')).toBe(true);
    expect(result.totalDamage).toBeGreaterThan(50 * 3);
  });

  it('produces two independent damage events for a portal-bridged chain and clears the portal', () => {
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
    const path: CellCoord[] = [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ];
    const result = resolveTurn(grid, ROSTER, path, mulberry32(1));
    expect(result.valid).toBe(true);
    expect(result.damageEvents).toContainEqual({ color: 'red', count: 3, damage: 150 });
    expect(result.damageEvents).toContainEqual({ color: 'blue', count: 3, damage: 150 });
    // the portal cell itself was cleared and refilled to something else
    expect(grid.get(0, 2).type).not.toBe('portal');
  });

  it('spawns exactly one improved tile once combo depth reaches 3', () => {
    // Build a deliberate 3-wave chain reaction: chain picks up bomb A;
    // bomb A's blast hits bomb B; bomb B's blast hits a plain stone.
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 2, color: 'red' },
    ]);
    grid.set(1, 1, { type: 'special', tile: 'bomb' }); // bomb A, picked up by the chain
    grid.set(2, 1, { type: 'special', tile: 'bomb' }); // bomb B, a neighbor of bomb A
    grid.set(2, 2, { type: 'stone', color: 'blue' }); // neighbor of bomb B
    const path: CellCoord[] = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ];
    const result = resolveTurn(grid, ROSTER, path, mulberry32(1));
    expect(result.comboDepth).toBeGreaterThanOrEqual(3);
    expect(result.bonusTileSpawned).not.toBeNull();
    expect(['dynamite', 'doubleSword', 'doubleArrowBow']).toContain(result.bonusTileSpawned);
  });
});
