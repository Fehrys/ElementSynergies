import { test, expect, type Page } from '@playwright/test';
import { HexGrid, fillBoard, getAllCells } from '../../src/core/grid';
import type { CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';

// Minimum-scoring (>= 3) adjacent same-color chain in the given grid.
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

async function getLayout(page: Page) {
  return page.evaluate(() => window.__debug!.getBattleLayout());
}

// Drive one scoring turn from the runtime layout the scene is rendered with.
async function playTurnAndAssertScores(page: Page): Promise<void> {
  const startHp = Number(await page.getAttribute('body', 'data-monster-hp'));
  const layout = await getLayout(page);
  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const pts = findValidChain(grid).map((c) => cellToPixel(layout.board, c.row, c.col));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBeLessThan(startHp);
}

const EPS = 1e-6;

const MATRIX = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
  { width: 1000, height: 700 },
];

for (const vp of MATRIX) {
  test(`geometry + consistency + no-clip + no-duplication + interaction (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    const runtime = await getLayout(page);

    // Browser↔Node consistency: the runtime layout equals the pure Node model for
    // the SAME measured input — one geometry source of truth, no browser/Node drift.
    const node = computeBattleLayout(runtime.input, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(runtime).toEqual(JSON.parse(JSON.stringify(node)));

    // No clipping: the tile bbox is fully inside the safeRect.
    const sr = runtime.safeRect;
    const tb = runtime.board.tileBounds;
    expect(tb.x).toBeGreaterThanOrEqual(sr.x - EPS);
    expect(tb.y).toBeGreaterThanOrEqual(sr.y - EPS);
    expect(tb.x + tb.width).toBeLessThanOrEqual(sr.x + sr.width + EPS);
    expect(tb.y + tb.height).toBeLessThanOrEqual(sr.y + sr.height + EPS);

    // No duplication: exactly one canvas element.
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);

    // Real interaction accuracy at this size.
    await playTurnAndAssertScores(page);
  });
}

test('lateral safe-area insets keep the board inside an offset column (via forceReflow)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => window.__debug!.forceReflow({ safeInsets: { top: 0, right: 24, bottom: 20, left: 16 } }));
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  const L = await getLayout(page);
  expect(L.safeRect).toEqual({ x: 16, y: 0, width: 390 - 16 - 24, height: 844 - 20 });
  expect(L.gameplayColumn.x).toBeGreaterThanOrEqual(L.safeRect.x - EPS);
  expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - EPS);
  await playTurnAndAssertScores(page);
});

test('top/bottom safe-area insets push the layout below the notch (via forceReflow)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => window.__debug!.forceReflow({ safeInsets: { top: 47, right: 0, bottom: 34, left: 0 } }));
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  const L = await getLayout(page);
  expect(L.safeRect).toEqual({ x: 0, y: 47, width: 390, height: 844 - 47 - 34 });
  expect(L.bands.topHud.top).toBeGreaterThanOrEqual(47 - EPS);
  expect(L.board.tileBounds.y).toBeGreaterThanOrEqual(47 - EPS);
});

test('seed/board is invariant across a resize (reflow re-lays-out, never re-rolls)', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const before = await page.evaluate(() => window.__debug!.getBoard());
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  const after = await page.evaluate(() => window.__debug!.getBoard());
  expect(after).toEqual(before);
});

test('mobile landscape 844x390: no clip, all cells reachable, precise drag, chrome compressed, radii met', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const L = await getLayout(page);

  // Runtime layout equals the Node model (consistency in landscape too).
  const node = computeBattleLayout(L.input, DEFAULT_BATTLE_LAYOUT_POLICY);
  expect(L).toEqual(JSON.parse(JSON.stringify(node)));

  // Canvas + tile bbox: no clipping.
  const box = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  expect(box).toEqual({ x: 0, y: 0, width: 844, height: 390 });
  const sr = L.safeRect;
  const tb = L.board.tileBounds;
  expect(tb.x).toBeGreaterThanOrEqual(sr.x - EPS);
  expect(tb.y).toBeGreaterThanOrEqual(sr.y - EPS);
  expect(tb.x + tb.width).toBeLessThanOrEqual(sr.x + sr.width + EPS);
  expect(tb.y + tb.height).toBeLessThanOrEqual(sr.y + sr.height + EPS);

  // Every cell center is inside the tile bbox (all cells reachable / on-surface).
  for (const cell of getAllCells()) {
    const p = cellToPixel(L.board, cell.row, cell.col);
    expect(p.x).toBeGreaterThanOrEqual(tb.x - EPS);
    expect(p.x).toBeLessThanOrEqual(tb.x + tb.width + EPS);
    expect(p.y).toBeGreaterThanOrEqual(tb.y - EPS);
    expect(p.y).toBeLessThanOrEqual(tb.y + tb.height + EPS);
  }

  // Chrome compression: topHud + hero bands shrink, board grows (board reduced last).
  const P = DEFAULT_BATTLE_LAYOUT_POLICY;
  const nominalHeight = (b: [number, number]): number => (b[1] - b[0]) / 100;
  expect(L.bands.topHud.height / sr.height).toBeLessThan(nominalHeight(P.bands.topHud));
  expect(L.bands.board.height / sr.height).toBeGreaterThan(nominalHeight(P.bands.board));

  // No critical overlap: heroes sit above the board; board inside the column.
  for (const h of L.heroes) expect(h.y + h.height).toBeLessThanOrEqual(tb.y + EPS);
  expect(tb.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - EPS);
  expect(tb.x + tb.width).toBeLessThanOrEqual(L.gameplayColumn.x + L.gameplayColumn.width + EPS);

  // Radii obtained: visualRadius isotropic (recovered from rowHeight — colWidth is
  // deliberately NOT isotropic with it since the column-pitch reduction, M#4),
  // hitRadius floored + capped.
  const scale = L.board.rowHeight / 48;
  expect(L.board.visualRadius).toBeCloseTo(22 * scale, 6);
  expect(L.board.colWidth).toBeCloseTo(56 * scale - P.columnSpacingReduction * scale, 6);
  expect(L.board.visualRadius).toBeGreaterThan(0);
  expect(L.board.hitRadius).toBeGreaterThan(0);
  expect(L.board.hitRadius).toBeLessThan(L.board.rowHeight / 2);

  // A precise valid drag still scores in landscape.
  await playTurnAndAssertScores(page);
});
