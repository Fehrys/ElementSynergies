import { test, expect } from '@playwright/test';
import { HexGrid, fillBoard, ElementColor, CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardLayout';

function findValidChain(grid: HexGrid): CellCoord[] {
  for (const cell of grid.getAllCells()) {
    const content = grid.get(cell.row, cell.col);
    if (content.type !== 'stone') continue;
    const color: ElementColor = content.color;
    const chain: CellCoord[] = [cell];
    const visited = new Set([`${cell.row},${cell.col}`]);
    let current = cell;
    while (chain.length < 3) {
      const next = grid.getNeighbors(current.row, current.col).find((n) => {
        const key = `${n.row},${n.col}`;
        if (visited.has(key)) return false;
        const c = grid.get(n.row, n.col);
        return c.type === 'stone' && c.color === color;
      });
      if (!next) break;
      chain.push(next);
      visited.add(`${next.row},${next.col}`);
      current = next;
    }
    if (chain.length >= 3) return chain;
  }
  throw new Error('no valid 3-chain found for this seed');
}

test('dragging a valid same-color chain damages the monster', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.map((c) => cellToPixel(c.row, c.col));

  const startHp = await page.getAttribute('body', 'data-monster-hp');

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();

  const endHp = await page.getAttribute('body', 'data-monster-hp');
  expect(Number(endHp)).toBeLessThan(Number(startHp));
});

test('a drag shorter than 3 cells does not damage the monster', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.slice(0, 2).map((c) => cellToPixel(c.row, c.col));

  const startHp = await page.getAttribute('body', 'data-monster-hp');

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y);
  await page.mouse.up();

  const endHp = await page.getAttribute('body', 'data-monster-hp');
  expect(Number(endHp)).toBe(Number(startHp));
});
