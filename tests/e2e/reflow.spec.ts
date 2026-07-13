import { test, expect } from '@playwright/test';
import { HexGrid, fillBoard } from '../../src/core/grid';
import type { CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';

// Same rule as battle.spec.ts's findValidChain: an adjacent same-color path of the
// minimum SCORING length (>= 3). A 2-stone pair would not score even without a reflow,
// so it could never detect a missing cancel — the chain here WOULD damage the monster.
// (Extract to a shared tests/e2e helper when convenient; kept inline for clarity.)
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

test('coalesced reflows bump layoutRevision once and never duplicate layers or mutate state', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const before = await page.evaluate(() => ({
    rev: window.__debug!.getLayoutRevision(),
    hp: document.body.getAttribute('data-monster-hp'),
    board: window.__debug!.getBoard(),
    counts: window.__debug!.getLayerObjectCounts(),
  }));

  // three calls in ONE frame must collapse to a single applied reflow
  await page.evaluate(() => {
    window.__debug!.forceReflow();
    window.__debug!.forceReflow();
    window.__debug!.forceReflow();
  });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, before.rev);

  const after = await page.evaluate(() => ({
    rev: window.__debug!.getLayoutRevision(),
    hp: document.body.getAttribute('data-monster-hp'),
    board: window.__debug!.getBoard(),
    counts: window.__debug!.getLayerObjectCounts(),
  }));
  expect(after.rev).toBe(before.rev + 1); // coalesced: exactly one applied reflow
  expect(after.counts).toEqual(before.counts); // per-layer object counts identical (true idempotency)
  expect(after.hp).toBe(before.hp); // no RNG, no combat, no mutation
  expect(after.board).toEqual(before.board);
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);

  // a second, separate burst keeps counts stable across repeated reflows
  await page.evaluate(() => {
    window.__debug!.forceReflow();
    window.__debug!.forceReflow();
  });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, after.rev);
  expect(await page.evaluate(() => window.__debug!.getLayerObjectCounts())).toEqual(before.counts);
});

test('a reflow during a drag of a WOULD-SCORE chain cancels it without resolving a turn', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid); // >= 3 → would damage the monster
  const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
  const pts = chain.map((c) => cellToPixel(layout.board, c.row, c.col));

  const startHp = await page.getAttribute('body', 'data-monster-hp');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());

  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y); // drag the WHOLE valid chain
  await page.evaluate(() => window.__debug!.forceReflow()); // resize mid-drag
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  await page.mouse.up(); // release AFTER the reflow

  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBe(Number(startHp)); // no score
  expect(await page.evaluate(() => window.__debug!.lastTurn)).toBeNull(); // nothing resolved
  expect(await page.evaluate(() => window.__debug!.getSelectionLength())).toBe(0); // selection cleared
  expect(await page.evaluate(() => window.__debug!.getTracePointCount())).toBe(0); // trace cleared
});

test('reflows do not advance the RNG (a scoring turn is identical with or without reflows)', async ({ browser, baseURL }) => {
  // Behavioural proof (no internal generator state exposed): run the SAME seeded scoring
  // turn on a control page (no reflow) and a test page (several reflows first). If a reflow
  // consumed the RNG, the refill after the clear — or the turn result — would differ.
  // Each page comes from an explicitly-configured context (own baseURL) and is torn down in finally.
  async function playSeededTurn(reflowsBefore: number) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.goto('/?seed=1&debug=1'); // resolves against the context baseURL
      await page.waitForSelector('[data-scene="battle"]');
      for (let i = 0; i < reflowsBefore; i++) {
        const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
        await page.evaluate(() => window.__debug!.forceReflow());
        await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
      }
      const grid = new HexGrid();
      fillBoard(grid, mulberry32(1));
      const chain = findValidChain(grid);
      const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
      const pts = chain.map((c) => cellToPixel(layout.board, c.row, c.col));
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
      await page.mouse.up();
      return await page.evaluate(() => ({
        lastTurn: window.__debug!.lastTurn, // damage/combo of the resolved turn
        board: window.__debug!.getBoard(), // AFTER gravity + RNG refill
      }));
    } finally {
      await context.close(); // always torn down, even on failure
    }
  }
  const control = await playSeededTurn(0);
  const withReflows = await playSeededTurn(5);
  expect(withReflows.lastTurn).toEqual(control.lastTurn); // identical turn → RNG not advanced
  expect(withReflows.board).toEqual(control.board); // identical refill → RNG not advanced
});
