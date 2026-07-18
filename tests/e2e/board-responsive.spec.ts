import { test, expect, type Page } from '@playwright/test';
import { HexGrid, fillBoard, getAllCells } from '../../src/core/grid';
import type { CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

function findValidChain(grid: HexGrid): CellCoord[] {
  for (const cell of grid.getAllCells()) {
    const content = grid.get(cell.row, cell.col);
    if (content.type !== 'stone') continue;
    const color = content.color;
    const chain: CellCoord[] = [cell];
    const visited = new Set([`${cell.row},${cell.col}`]);
    let current = cell;
    while (chain.length < 3) {
      const next = grid.getNeighbors(current.row, current.col).find((n) => {
        if (visited.has(`${n.row},${n.col}`)) return false;
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

async function playTurnAndAssertScores(page: Page): Promise<void> {
  const startHp = Number(await page.getAttribute('body', 'data-monster-hp'));
  const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const pts = findValidChain(grid).map((c) => cellToPixel(layout.board, c.row, c.col));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBeLessThan(startHp);
}

for (const vp of FORMATS) {
  test(`the puzzle dominates the lower band, uncut, centered, and interactive (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    const L = await page.evaluate(() => window.__debug!.getBattleLayout());

    // Upper composition unaffected.
    expect(L.table.y).toBeGreaterThan(0);

    // No tile above table.y, none outside the lower band, none clipped by the canvas.
    const tb = L.board.tileBounds;
    expect(tb.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
    expect(tb.x).toBeGreaterThanOrEqual(0 - 1e-6);
    expect(tb.y + tb.height).toBeLessThanOrEqual(vp.height + 1e-6);
    expect(tb.x + tb.width).toBeLessThanOrEqual(vp.width + 1e-6);

    // Centered inside availableBoardRect.
    const avail = L.availableBoardRect;
    expect(tb.x + tb.width / 2).toBeCloseTo(avail.x + avail.width / 2, 3);
    expect(tb.y + tb.height / 2).toBeCloseTo(avail.y + avail.height / 2, 3);

    // Dominates the band: occupies almost all of the constraining axis.
    const wideEnough = tb.width / avail.width > 0.95;
    const tallEnough = tb.height / avail.height > 0.95;
    expect(wideEnough || tallEnough).toBe(true);

    // 32 cells, all inside tileBounds, hitboxes match visual centers exactly
    // (getTileGeometry reads the SAME activeLayout.board the renderer used).
    const tiles = await page.evaluate(() => window.__debug!.getTileGeometry());
    expect(tiles).toHaveLength(32);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(tb.x - 1e-6);
      expect(t.x).toBeLessThanOrEqual(tb.x + tb.width + 1e-6);
      expect(t.y).toBeGreaterThanOrEqual(tb.y - 1e-6);
      expect(t.y).toBeLessThanOrEqual(tb.y + tb.height + 1e-6);
    }

    // Real interaction still scores.
    await playTurnAndAssertScores(page);
  });
}

test('the puzzle grows strictly from 360x640 to 480x720 to 768x1024', async ({ page }) => {
  const radii: number[] = [];
  for (const vp of FORMATS) {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');
    const L = await page.evaluate(() => window.__debug!.getBattleLayout());
    radii.push(L.board.visualRadius);
  }
  expect(radii[1]).toBeGreaterThan(radii[0]);
  expect(radii[2]).toBeGreaterThan(radii[1]);
});

test('a resize regrows the board and hitboxes follow it, with no stale hit position', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const before = await page.evaluate(() => window.__debug!.getBattleLayout());
  const cellBefore = cellToPixel(before.board, 2, 2);

  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  const after = await page.evaluate(() => window.__debug!.getBattleLayout());
  const cellAfter = cellToPixel(after.board, 2, 2);
  expect(cellAfter.x).not.toBeCloseTo(cellBefore.x, 0);

  // The OLD position is no longer hit-testable; the NEW one is.
  await page.mouse.move(cellBefore.x, cellBefore.y);
  await page.mouse.down();
  const staleHit = await page.evaluate(() => window.__debug!.getSelectionLength());
  await page.mouse.up();

  await page.mouse.move(cellAfter.x, cellAfter.y);
  await page.mouse.down();
  const freshHit = await page.evaluate(() => window.__debug!.getSelectionLength());
  await page.mouse.up();

  // At 360x640 -> 768x1024 the board's hit radius and position shift by
  // enough (hundreds of px; hit radii ~20 vs ~42 game units, far smaller than
  // the shift) that the old and new hit circles for this cell cannot overlap
  // — so the stale position is deterministically no longer hit-testable.
  expect(staleHit).toBe(0);
  expect(freshHit).toBe(1);

  // A full turn still scores after the resize.
  await playTurnAndAssertScores(page);
});

for (let i = 0; i < 3; i++) {
  test(`reflow #${i + 1} never accumulates or duplicates board layers`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 720 });
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');
    const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
    const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(after).toEqual(before);
  });
}
