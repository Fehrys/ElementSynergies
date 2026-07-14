import { test, expect, type Page } from '@playwright/test';
import { HexGrid, fillBoard, getAllCells } from '../../src/core/grid';
import type { CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';

// Client-space projection of a game-space point. Under Scale.RESIZE the canvas
// fills the viewport at the origin (canvasRect = {0,0,gameW,gameH}), so this is a
// numeric no-op; it stops being one the instant the canvas is offset or CSS-scaled.
function gameToClient(
  g: { x: number; y: number },
  canvasRect: { left: number; top: number; width: number; height: number },
  gameW: number,
  gameH: number,
): { x: number; y: number } {
  return {
    x: canvasRect.left + (g.x * canvasRect.width) / gameW,
    y: canvasRect.top + (g.y * canvasRect.height) / gameH,
  };
}

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

// Rebuild the CURRENT (possibly post-turn) board from the debug surface, so a
// chain can be found in the live grid rather than only the seeded initial fill.
async function readGrid(page: Page): Promise<HexGrid> {
  const cells = await page.evaluate(() => window.__debug!.getBoard());
  const grid = new HexGrid();
  for (const c of cells) grid.set(c.row, c.col, c.content);
  return grid;
}

// Play one scoring turn using the RUNTIME layout the scene is currently rendered
// with (so click coordinates match whatever viewport is live).
async function playTurn(page: Page): Promise<void> {
  const grid = await readGrid(page);
  const chain = findValidChain(grid);
  const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
  const pts = chain.map((c) => cellToPixel(layout.board, c.row, c.col));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
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

test('a real mid-session resize reflows on the next frame and keeps clicks accurate', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  // Baseline neutrality under the RESIZE transport: at 480x720 the board is still
  // pixel-for-pixel the realigned (2026-07-14) reference geometry.
  const l480 = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(l480.board.tileBounds).toEqual({ x: 59, y: 410, width: 362, height: 236 });

  // First scoring turn at 480x720.
  const startHp = Number(await page.getAttribute('body', 'data-monster-hp'));
  await playTurn(page);
  const hpAfterFirst = Number(await page.getAttribute('body', 'data-monster-hp'));
  expect(hpAfterFirst).toBeLessThan(startHp);

  // Real viewport resize → a reflow must be applied on the next frame.
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  // The layout actually changed (real responsiveness is live) but the board is
  // still fully inside the gameplay column.
  const l360 = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(l360.input.width).toBe(360);
  expect(l360.board.tileBounds.x).toBeGreaterThanOrEqual(l360.gameplayColumn.x - 0.5);

  // Second scoring turn driven from the REFLOWED runtime board — proves pointer
  // accuracy survives a real reflow.
  await playTurn(page);
  const hpAfterSecond = Number(await page.getAttribute('body', 'data-monster-hp'));
  expect(hpAfterSecond).toBeLessThan(hpAfterFirst);
});

test('synthetic insets via the forceReflow override flow into the layout (runtime path, no DOM)', async ({ page }) => {
  // (a) Runtime-layout only: bypasses the DOM by passing safeInsets directly.
  // Exercises computeBattleLayout + the scene wiring — NOT the browserViewport adapter.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const startHp = Number(await page.getAttribute('body', 'data-monster-hp'));
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => window.__debug!.forceReflow({ safeInsets: { top: 47, right: 0, bottom: 34, left: 0 } }));
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  const L = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(L.safeRect).toEqual({ x: 0, y: 47, width: 390, height: 844 - 47 - 34 });
  // A chain driven from the inset-adjusted board still scores.
  await playTurn(page);
  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBeLessThan(startHp);
});

test('synthetic safe-area CSS flows through the real DOM adapter into the layout', async ({ page }) => {
  // (b) Full DOM chain: CSS override → readSafeInsetsCss → cssInsetsToGame → clamp →
  // buildViewportInput → computeBattleLayout → activeLayout. forceReflow takes NO arg
  // so buildViewportInput performs the real DOM read.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--test-safe-inset-top', '47px');
    document.documentElement.style.setProperty('--test-safe-inset-bottom', '34px');
    window.__debug!.forceReflow(); // no arg → real readSafeInsetsCss path
  });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  const L = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(L.safeRect).toEqual({ x: 0, y: 47, width: 390, height: 844 - 47 - 34 });
});

test('game→client projection is a numeric no-op under RESIZE (canvas not offset or CSS-scaled)', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
  const center = cellToPixel(layout.board, 2, 2); // a game-space cell center
  const measured = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const r = c.getBoundingClientRect();
    return { canvasRect: { left: r.left, top: r.top, width: r.width, height: r.height } };
  });
  // gameW/gameH from the runtime layout's own viewport model (the source of truth).
  const client = gameToClient(center, measured.canvasRect, layout.input.width, layout.input.height);
  expect(client.x).toBeCloseTo(center.x, 6); // identity ⇒ canvas is at origin, unscaled
  expect(client.y).toBeCloseTo(center.y, 6);
});

for (const vp of [
  { width: 480, height: 720 },
  { width: 360, height: 640 },
]) {
  test(`first and last board cells are hit-testable from the runtime layout (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    // The board's TRUE extremes, derived from getAllCells() (never hard-coded).
    const ordered = getAllCells()
      .slice()
      .sort((a, b) => a.col - b.col || a.row - b.row);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    expect(first).toEqual({ row: 0, col: 0 });
    expect(last).toEqual({ row: 4, col: 6 });

    const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
    for (const cell of [first, last]) {
      const p = cellToPixel(layout.board, cell.row, cell.col);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      expect(await page.evaluate(() => window.__debug!.getSelectionLength())).toBe(1); // the extreme cell was hit
      await page.mouse.up();
    }
  });
}

test('a full turn, a real resize, then another full turn — both score', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const hp0 = Number(await page.getAttribute('body', 'data-monster-hp'));
  await playTurn(page);
  const hp1 = Number(await page.getAttribute('body', 'data-monster-hp'));
  expect(hp1).toBeLessThan(hp0);

  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  await playTurn(page);
  const hp2 = Number(await page.getAttribute('body', 'data-monster-hp'));
  expect(hp2).toBeLessThan(hp1);
});

test('a real resize DURING a drag of a would-score chain cancels it without scoring', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
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
  await page.setViewportSize({ width: 360, height: 640 }); // REAL resize mid-drag (not forceReflow)
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  await page.mouse.up();

  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBe(Number(startHp)); // no score
  expect(await page.evaluate(() => window.__debug!.lastTurn)).toBeNull();
  expect(await page.evaluate(() => window.__debug!.getSelectionLength())).toBe(0);
  expect(await page.evaluate(() => window.__debug!.getTracePointCount())).toBe(0);
});

test.describe('high-DPR context (deviceScaleFactor 3)', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

  test('layout + canvas are DPR-independent and a runtime-driven click still hits', async ({ page }) => {
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    // Canvas CSS rect equals the DPR=1 case at the same CSS viewport.
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });

    // Runtime layout is deep-equal to the DPR-free Node model at this viewport.
    const L = await page.evaluate(() => window.__debug!.getBattleLayout());
    const expected = computeBattleLayout(
      { width: 390, height: 844, safeInsets: { top: 0, right: 0, bottom: 0, left: 0 } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect).toEqual(expected.safeRect);
    expect(L.gameplayColumn).toEqual(expected.gameplayColumn);
    expect(L.board.tileBounds).toEqual(expected.board.tileBounds);
    expect(L.board.hitRadius).toBeCloseTo(expected.board.hitRadius, 9);

    // A click computed from the runtime layout still selects a cell (pointer accuracy at DPR 3).
    const p = cellToPixel(L.board, 2, 2);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    expect(await page.evaluate(() => window.__debug!.getSelectionLength())).toBe(1);
    await page.mouse.up();
  });
});
