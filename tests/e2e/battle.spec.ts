import { test, expect, type Page } from '@playwright/test';
import { HexGrid, fillBoard, ElementColor, CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';
import type { BoardGeometry } from '../../src/scenes/boardGeometry';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';

// Navigate, wait for the scene, and return the RUNTIME board geometry the scene
// actually rendered with (mirrored to DOM via the ?debug=1 layout surface). Every
// click coordinate is derived from this exact geometry through the SAME shared
// cellToPixel — no test-side copy of the coordinate math.
async function loadBoard(page: Page, url: string): Promise<BoardGeometry> {
  await page.goto(url);
  await page.waitForSelector('[data-scene="battle"]');
  const layout = await page.evaluate(() => (window as any).__debug.getBattleLayout());
  return layout.board as BoardGeometry;
}

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

// Given an already-found valid chain, returns a stone adjacent to its
// last cell with a *different* color than the chain's own — used to
// exercise "releasing after dragging onto an invalid cell still scores
// the valid prefix" without cancelling the whole chain.
function findDifferentColorNeighbor(grid: HexGrid, chain: CellCoord[]): CellCoord {
  const first = grid.get(chain[0].row, chain[0].col);
  if (first.type !== 'stone') throw new Error('chain must start on a stone');
  const chainColor = first.color;
  const last = chain[chain.length - 1];
  const visited = new Set(chain.map((c) => `${c.row},${c.col}`));
  const extra = grid.getNeighbors(last.row, last.col).find((n) => {
    if (visited.has(`${n.row},${n.col}`)) return false;
    const c = grid.get(n.row, n.col);
    return c.type === 'stone' && c.color !== chainColor;
  });
  if (!extra) throw new Error('no differently-colored neighbor found for this seed');
  return extra;
}

// Given an already-found valid chain, returns a portal cell adjacent to
// its last cell — used to exercise "releasing with a trailing portal
// still scores the valid prefix, rather than being cancelled outright."
function findAdjacentPortal(grid: HexGrid, chain: CellCoord[]): CellCoord {
  const last = chain[chain.length - 1];
  const visited = new Set(chain.map((c) => `${c.row},${c.col}`));
  const portal = grid.getNeighbors(last.row, last.col).find((n) => {
    if (visited.has(`${n.row},${n.col}`)) return false;
    return grid.get(n.row, n.col).type === 'portal';
  });
  if (!portal) throw new Error('no adjacent portal found for this seed');
  return portal;
}

test('dragging a valid same-color chain damages the monster', async ({ page }) => {
  const board = await loadBoard(page, '/?seed=1&debug=1');

  // Cross-check: the runtime layout equals the Node-computed layout at 480x720,
  // so the geometry driving these clicks is the SAME model, browser and Node.
  const expectedBoard = computeBattleLayout(
    { width: 480, height: 720, safeInsets: { top: 0, right: 0, bottom: 0, left: 0 } },
    DEFAULT_BATTLE_LAYOUT_POLICY,
  ).board;
  expect(board.originX).toBe(expectedBoard.originX);
  expect(board.originY).toBe(expectedBoard.originY);
  expect(board.tileBounds).toEqual(expectedBoard.tileBounds);

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.map((c) => cellToPixel(board, c.row, c.col));

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
  const board = await loadBoard(page, '/?seed=1&debug=1');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.slice(0, 2).map((c) => cellToPixel(board, c.row, c.col));

  const startHp = await page.getAttribute('body', 'data-monster-hp');

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y);
  await page.mouse.up();

  const endHp = await page.getAttribute('body', 'data-monster-hp');
  expect(Number(endHp)).toBe(Number(startHp));
});

test('dragging a valid chain but backtracking before release does not damage the monster', async ({ page }) => {
  const board = await loadBoard(page, '/?seed=1&debug=1');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.map((c) => cellToPixel(board, c.row, c.col));

  const startHp = await page.getAttribute('body', 'data-monster-hp');

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y);
  await page.mouse.move(points[2].x, points[2].y);
  await page.mouse.move(points[1].x, points[1].y); // backtrack onto the 2nd tile
  await page.mouse.up();

  const endHp = await page.getAttribute('body', 'data-monster-hp');
  expect(Number(endHp)).toBe(Number(startHp));
});

test('releasing after dragging onto a different-color tile still damages the monster for the valid prefix', async ({ page }) => {
  const board = await loadBoard(page, '/?seed=1&debug=1');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const extra = findDifferentColorNeighbor(grid, chain);
  const points = [...chain, extra].map((c) => cellToPixel(board, c.row, c.col));

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

test('releasing with a trailing portal still damages the monster for the valid prefix', async ({ page }) => {
  const board = await loadBoard(page, '/?seed=2&debug=1');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(2));
  const chain = findValidChain(grid);
  const portal = findAdjacentPortal(grid, chain);
  const points = [...chain, portal].map((c) => cellToPixel(board, c.row, c.col));

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

test('debug mode exposes lastTurn with damage info after a turn, and stays null before one', async ({ page }) => {
  const board = await loadBoard(page, '/?seed=1&debug=1');

  const beforeTurn = await page.evaluate(() => (window as any).__debug.lastTurn);
  expect(beforeTurn).toBeNull();

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.map((c) => cellToPixel(board, c.row, c.col));

  const startHp = Number(await page.getAttribute('body', 'data-monster-hp'));

  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();

  const endHp = Number(await page.getAttribute('body', 'data-monster-hp'));
  const lastTurn = await page.evaluate(() => (window as any).__debug.lastTurn);
  expect(lastTurn.valid).toBe(true);
  expect(lastTurn.damageEvents.length).toBeGreaterThan(0);
  expect(lastTurn.totalDamage).toBeGreaterThan(0);
  // lastTurn's reported damage must match the real HP delta exactly, not
  // just be "some positive number" — this is what makes the test actually
  // verify lastTurn reflects the real turn, not a disconnected value.
  expect(lastTurn.totalDamage).toBe(startHp - endHp);
});

test('debug mode can spawn a special tile and a portal, readable via getBoard', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  await page.evaluate(() => (window as any).__debug.spawnTile(0, 0, 'bomb'));
  await page.evaluate(() => (window as any).__debug.spawnPortal(0, 1));

  const board = await page.evaluate(() => (window as any).__debug.getBoard());
  const bombCell = board.find((c: any) => c.row === 0 && c.col === 0);
  const portalCell = board.find((c: any) => c.row === 0 && c.col === 1);

  expect(bombCell.content).toEqual({ type: 'special', tile: 'bomb' });
  expect(portalCell.content).toEqual({ type: 'portal' });
});

test('debug mode can set monster hp directly, including triggering victory at 0', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  await page.evaluate(() => (window as any).__debug.setMonsterHp(42));
  const midHp = await page.getAttribute('body', 'data-monster-hp');
  expect(midHp).toBe('42');
  await expect(page.locator('[data-scene="victory"]')).toHaveCount(0);

  await page.evaluate(() => (window as any).__debug.setMonsterHp(0));
  const endHp = await page.getAttribute('body', 'data-monster-hp');
  expect(endHp).toBe('0');
  await page.waitForSelector('[data-scene="victory"]');
});
