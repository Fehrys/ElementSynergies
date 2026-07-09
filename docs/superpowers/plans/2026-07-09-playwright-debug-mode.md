# Playwright Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `window.__debug` surface to `BattleScene`, active only behind `?debug=1`, exposing last-turn damage/tile results, the ability to spawn a special tile or portal on demand, direct monster-HP control, and a full board-state read-back — closing the testability gaps listed in `bugs.txt`.

**Architecture:** A single `DebugApi` object is constructed once in `BattleScene.create()`, only when `?debug=1` is present, and assigned to `window.__debug` via a `declare global` TypeScript augmentation. Every mutating method on it reuses the scene's existing redraw/state helpers (`drawBoard`, `drawHp`, a new shared `checkVictory`) rather than introducing parallel code paths. All work is confined to `src/scenes/BattleScene.ts`; `src/core/` is untouched.

**Tech Stack:** TypeScript, Phaser 3 (scene layer only), Playwright (e2e tests in `tests/e2e/battle.spec.ts`).

## Global Constraints

- Debug surface must live entirely inside `src/scenes/BattleScene.ts` — no changes to `src/core/` (design spec's Out of Scope; also `CLAUDE.md`'s "puzzle/combat logic is pure TypeScript with zero Phaser dependency" boundary — this feature is scene-only tooling, not game logic).
- Debug hooks are active only when the URL has `?debug=1`, mirroring the existing `?seed=N` convention in `BattleScene.create()`.
- No visible on-screen UI — this is a Playwright-only surface (design spec decision).
- No stone-color spawning — only `spawnTile` (special tiles) and `spawnPortal` (design spec decision).
- Test command for this plan: `npx playwright test tests/e2e/battle.spec.ts` (full e2e suite: `npm run test:e2e`). The existing unit suite (`npm test`) is unaffected since no `src/core/` file changes.
- Design source of truth: `docs/superpowers/specs/2026-07-09-playwright-debug-mode-design.md`.

---

## Task 1: Debug gating + `lastTurn` turn-result mirroring

**Files:**
- Modify: `src/scenes/BattleScene.ts`
- Test: `tests/e2e/battle.spec.ts`

**Interfaces:**
- Consumes: `ResolutionResult` from `../core/resolution` (already defined: `{ valid, damageEvents, totalDamage, comboDepth, bonusTileSpawned, reason? }`).
- Produces: `export interface DebugApi { lastTurn: ResolutionResult | null; }` and a global `Window.__debug?: DebugApi` augmentation, both in `src/scenes/BattleScene.ts`. Tasks 2 and 3 extend `DebugApi` with more members and extend the same `window.__debug = {...}` object literal in `create()`.

- [ ] **Step 1: Write the failing test**

Open `tests/e2e/battle.spec.ts`. Add this test at the end of the file (after the last existing `test(...)` block, before EOF):

```ts
test('debug mode exposes lastTurn with damage info after a turn, and stays null before one', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const beforeTurn = await page.evaluate(() => (window as any).__debug.lastTurn);
  expect(beforeTurn).toBeNull();

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.map((c) => cellToPixel(c.row, c.col));

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
```

This reuses `HexGrid`, `fillBoard`, `mulberry32`, `cellToPixel`, and `findValidChain`, all already imported/defined earlier in `tests/e2e/battle.spec.ts` — no new imports needed for this test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/battle.spec.ts -g "debug mode exposes lastTurn"`
Expected: FAIL. `window.__debug` is `undefined`, so `(window as any).__debug.lastTurn` throws `Cannot read properties of undefined (reading 'lastTurn')` inside `page.evaluate`.

- [ ] **Step 3: Add the `DebugApi` type and global augmentation**

In `src/scenes/BattleScene.ts`, change the `resolveTurn` import (currently `import { resolveTurn } from '../core/resolution';`) to also bring in the result type:

```ts
import { resolveTurn, ResolutionResult } from '../core/resolution';
```

Immediately after the `PORTAL_LABEL` constant (before the `BattleScene` class declaration), add:

```ts
// Test-only surface for Playwright, active only behind `?debug=1` — never
// touched by real gameplay code. See
// docs/superpowers/specs/2026-07-09-playwright-debug-mode-design.md.
export interface DebugApi {
  lastTurn: ResolutionResult | null;
}

declare global {
  interface Window {
    __debug?: DebugApi;
  }
}
```

- [ ] **Step 4: Wire up gating and `lastTurn` in the scene**

In `create()`, replace:

```ts
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    this.rng = seedParam ? mulberry32(Number(seedParam)) : Math.random;
```

with:

```ts
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.rng = seedParam ? mulberry32(Number(seedParam)) : Math.random;

    if (params.get('debug') === '1') {
      window.__debug = { lastTurn: null };
    }
```

In `onPointerUp()`, after the line `const result = resolveTurn(this.grid, ROSTER, this.path, this.rng);`, add:

```ts
    if (window.__debug) {
      window.__debug.lastTurn = result;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/e2e/battle.spec.ts -g "debug mode exposes lastTurn"`
Expected: PASS.

- [ ] **Step 6: Run the full e2e suite to confirm no regressions**

Run: `npx playwright test tests/e2e/battle.spec.ts`
Expected: all tests PASS (the 5 pre-existing tests plus this new one).

- [ ] **Step 7: Commit**

```bash
git add src/scenes/BattleScene.ts tests/e2e/battle.spec.ts
git commit -m "feat: expose last-turn debug info via window.__debug behind ?debug=1"
```

---

## Task 2: `spawnTile`, `spawnPortal`, `getBoard`

**Files:**
- Modify: `src/scenes/BattleScene.ts`
- Test: `tests/e2e/battle.spec.ts`

**Interfaces:**
- Consumes: `DebugApi` and the `window.__debug` assignment from Task 1; `CellContent`, `SpecialTileType` from `../core/grid` (`SpecialTileType` already imported; `CellContent` is newly imported by this task).
- Produces: extends `DebugApi` with `spawnTile(row: number, col: number, tile: SpecialTileType): void`, `spawnPortal(row: number, col: number): void`, and `getBoard(): { row: number; col: number; content: CellContent }[]`. Task 3 extends the same interface and object literal further.

- [ ] **Step 1: Write the failing test**

Add this test at the end of `tests/e2e/battle.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/battle.spec.ts -g "spawn a special tile and a portal"`
Expected: FAIL. `(window as any).__debug.spawnTile` is not a function.

- [ ] **Step 3: Extend `DebugApi` and import `CellContent`**

In `src/scenes/BattleScene.ts`, change the grid import (currently `import { HexGrid, CellCoord, ElementColor, SpecialTileType, getAllCells, fillBoard } from '../core/grid';`) to:

```ts
import {
  HexGrid,
  CellCoord,
  CellContent,
  ElementColor,
  SpecialTileType,
  getAllCells,
  fillBoard,
} from '../core/grid';
```

Extend the `DebugApi` interface added in Task 1:

```ts
export interface DebugApi {
  lastTurn: ResolutionResult | null;
  spawnTile(row: number, col: number, tile: SpecialTileType): void;
  spawnPortal(row: number, col: number): void;
  getBoard(): { row: number; col: number; content: CellContent }[];
}
```

- [ ] **Step 4: Implement the three methods**

In `create()`, replace the block added in Task 1:

```ts
    if (params.get('debug') === '1') {
      window.__debug = { lastTurn: null };
    }
```

with:

```ts
    if (params.get('debug') === '1') {
      window.__debug = {
        lastTurn: null,
        spawnTile: (row, col, tile) => {
          this.grid.set(row, col, { type: 'special', tile });
          this.drawBoard();
        },
        spawnPortal: (row, col) => {
          this.grid.set(row, col, { type: 'portal' });
          this.drawBoard();
        },
        getBoard: () =>
          getAllCells().map((cell) => ({
            row: cell.row,
            col: cell.col,
            content: this.grid.get(cell.row, cell.col),
          })),
      };
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/e2e/battle.spec.ts -g "spawn a special tile and a portal"`
Expected: PASS.

- [ ] **Step 6: Run the full e2e suite to confirm no regressions**

Run: `npx playwright test tests/e2e/battle.spec.ts`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/BattleScene.ts tests/e2e/battle.spec.ts
git commit -m "feat: add spawnTile/spawnPortal/getBoard to window.__debug"
```

---

## Task 3: `setMonsterHp`

**Files:**
- Modify: `src/scenes/BattleScene.ts`
- Test: `tests/e2e/battle.spec.ts`

**Interfaces:**
- Consumes: `DebugApi` and the `window.__debug` object literal from Tasks 1-2; `Monster` shape `{ name: string; maxHp: number; hp: number }` and `isDefeated(monster: Monster): boolean` from `../core/combat` (already imported).
- Produces: extends `DebugApi` with `setMonsterHp(hp: number): void`; adds a private `checkVictory(): void` method to `BattleScene`, used by both `onPointerUp` and `setMonsterHp` so there is exactly one defeat-check code path.

- [ ] **Step 1: Write the failing test**

Add this test at the end of `tests/e2e/battle.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/battle.spec.ts -g "set monster hp directly"`
Expected: FAIL. `(window as any).__debug.setMonsterHp` is not a function.

- [ ] **Step 3: Extract `checkVictory` and extend `DebugApi`**

In `src/scenes/BattleScene.ts`, in `onPointerUp()`, replace:

```ts
    if (isDefeated(this.monster)) {
      this.add.text(140, 400, 'Victory!', { fontSize: '32px', color: '#ffffff' });
      document.body.setAttribute('data-scene', 'victory');
    }
```

with:

```ts
    this.checkVictory();
```

Add the new private method directly below `onPointerUp()` (before `drawBoard()`):

```ts
  // Shared by onPointerUp and the debug setMonsterHp hook so there is
  // exactly one defeat-check code path.
  private checkVictory(): void {
    if (isDefeated(this.monster)) {
      this.add.text(140, 400, 'Victory!', { fontSize: '32px', color: '#ffffff' });
      document.body.setAttribute('data-scene', 'victory');
    }
  }
```

Extend the `DebugApi` interface added in Task 1 and extended in Task 2:

```ts
export interface DebugApi {
  lastTurn: ResolutionResult | null;
  spawnTile(row: number, col: number, tile: SpecialTileType): void;
  spawnPortal(row: number, col: number): void;
  getBoard(): { row: number; col: number; content: CellContent }[];
  setMonsterHp(hp: number): void;
}
```

- [ ] **Step 4: Implement `setMonsterHp`**

In `create()`, add `setMonsterHp` to the `window.__debug = { ... }` object literal from Task 2 (add this member alongside `lastTurn`, `spawnTile`, `spawnPortal`, `getBoard`):

```ts
        setMonsterHp: (hp) => {
          this.monster = { ...this.monster, hp: Math.max(0, Math.min(hp, this.monster.maxHp)) };
          this.drawHp();
          this.checkVictory();
        },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/e2e/battle.spec.ts -g "set monster hp directly"`
Expected: PASS.

- [ ] **Step 6: Run the full e2e suite to confirm no regressions**

Run: `npx playwright test tests/e2e/battle.spec.ts`
Expected: all tests PASS (the 5 pre-existing tests plus the 3 new debug tests).

- [ ] **Step 7: Run the unit suite and build to confirm the whole project is still clean**

Run: `npm test`
Expected: all existing unit tests PASS (no `src/core/` files were touched by this plan).

Run: `npm run build`
Expected: builds cleanly with no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/BattleScene.ts tests/e2e/battle.spec.ts
git commit -m "feat: add setMonsterHp to window.__debug, sharing the real defeat-check path"
```
