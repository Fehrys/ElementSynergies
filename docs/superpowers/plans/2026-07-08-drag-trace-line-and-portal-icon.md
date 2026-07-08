# Drag Trace Line + Portal Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live per-step legality check + white connecting trace line + single-step backtrack to the chain drag (the bulk of this plan), and give the portal tile a distinguishing 🌈 icon (small, independent).

**Architecture:** A new pure function `canExtendChain` in `src/core/chain.ts` mirrors `validateChain`'s color/special/portal legality rules for a single incremental step (no min-length/segmentation, since that's a completed-path concern). `BattleScene.ts`'s `onPointerMove` calls it live: legal candidates extend the path and redraw a white trace line; illegal candidates are ignored outright; dragging onto the second-to-last cell backtracks instead. `onPointerUp` is otherwise unchanged — it already only ever sees a path that's legal so far, so a chain that would have been valid is never cancelled by where the pointer happens to release. The portal icon is a one-line rendering addition to `drawBoard()`, unrelated to the above.

**Tech Stack:** TypeScript, Phaser 3, Vitest, Playwright.

## Global Constraints

- Only single-step backtrack is in scope (dragging back exactly one cell, onto the current second-to-last path entry) — dragging back further has no special handling beyond what falls out of that rule.
- A portal must be immediately followed by a stone of *any* color — this is enforced live by `canExtendChain` (not deferred to release), so a path that passes every live check can never be rejected at release for this reason.
- `validateChain`, `resolution.ts`, and `specialTiles.ts` are unchanged — `canExtendChain` is a new, separate export; the min-length/segment-splitting logic stays a completed-path-only concern.
- Trace line: white, at least 4px thick, straight cell-to-cell segments only (no fill/outline shape), redrawn from scratch on every accepted path change.
- Portal icon: 🌈, rendered with the same treatment as special-tile labels (`fontSize: '18px'`, `color: '#000000'`, offset `x - 10, y - 11` from the cell center).
- No new Playwright debug DOM hooks in this plan (separate `bugs.txt` item) — the trace line's on-screen rendering is verified by eye (Task 4), not by Playwright assertion.

---

### Task 1: Portal icon

**Files:**
- Modify: `src/scenes/BattleScene.ts:30-37` (add a `PORTAL_LABEL` constant after `TILE_LABEL`), `src/scenes/BattleScene.ts:159-162` (the `portal` branch of `drawBoard()`)

**Interfaces:** None — purely a local rendering change, no new exports or signatures.

- [ ] **Step 1: Add the portal label constant**

In `src/scenes/BattleScene.ts`, immediately after the closing `};` of the `TILE_LABEL` record (currently line 37), add:

```ts

// The portal's own icon — a rainbow bridge between colors, distinct
// from all six special-tile emoji above.
const PORTAL_LABEL = '🌈';
```

- [ ] **Step 2: Render the label in `drawBoard()`**

Find the `portal` branch of `drawBoard()`:

```ts
      } else if (content.type === 'portal') {
        graphics.fillStyle(0xaa66ff, 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
      }
```

Replace it with:

```ts
      } else if (content.type === 'portal') {
        graphics.fillStyle(0xaa66ff, 1);
        graphics.fillCircle(x, y, STONE_RADIUS);
        const label = this.add.text(x - 10, y - 11, PORTAL_LABEL, {
          fontSize: '18px',
          color: '#000000',
        });
        this.boardLayer.add(label);
      }
```

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: PASS (41/41) — this is a rendering-only change with no unit-testable behavior; visual verification happens in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "$(cat <<'EOF'
feat: add rainbow icon to the portal tile

The portal rendered as a plain purple circle with no label, unlike
every special tile. Matches the code's own "rainbow bridge orb"
description and reads distinctly from the six special-tile emoji.
EOF
)"
```

---

### Task 2: `canExtendChain` in `src/core/chain.ts`

**Files:**
- Modify: `src/core/chain.ts` (add a private `replayState` helper and an exported `canExtendChain`, appended after `validateChain`)
- Test: `tests/core/chain.test.ts`

**Interfaces:**
- Consumes: `HexGrid.get`, `HexGrid.getNeighbors`, `CellCoord`, `ElementColor` from `./grid` — already imported in `chain.ts`; `sameCell` and `isAdjacent`, already defined in `chain.ts` (lines 22-28).
- Produces: `canExtendChain(grid: HexGrid, path: CellCoord[], candidate: CellCoord): boolean` — consumed by Task 3's `BattleScene.ts` changes.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to `tests/core/chain.test.ts`, after the existing `describe('validateChain', ...)` block's closing `});` (and update the top import line to include `canExtendChain`):

Change:
```ts
import { validateChain } from '../../src/core/chain';
```
to:
```ts
import { validateChain, canExtendChain } from '../../src/core/chain';
```

Then append:

```ts

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

  it('rejects a second portal', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    setStones(grid, [{ row: 0, col: 1, color: 'blue' }]);
    grid.set(1, 1, { type: 'portal' });
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(false);
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
```

The `(0,0)`/`(0,1)`/`(1,1)` and `(0,0)`/`(0,3)` coordinate pairs are reused from existing tests in this file, which already confirm their adjacency (or non-adjacency, for the `(0,3)` case) on the current grid.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- chain.test.ts`
Expected: FAIL — `canExtendChain` doesn't exist yet, so the import and every test in the new `describe` block error out.

- [ ] **Step 3: Implement `replayState` and `canExtendChain`**

Append this to the end of `src/core/chain.ts` (after `validateChain`'s closing `}`):

```ts

// Replays a path (assumed already legal so far) to recover the state a
// live per-step check needs: the color decided so far (null if none
// yet) and whether the path's one allowed portal has already been
// used. Mirrors validateChain's own color/portal bookkeeping so the
// rule lives in one place; canExtendChain is the only other consumer.
function replayState(grid: HexGrid, path: CellCoord[]): { activeColor: ElementColor | null; portalUsed: boolean } {
  let activeColor: ElementColor | null = null;
  let portalUsed = false;
  let awaitingPortalReset = false;
  for (const cell of path) {
    const content = grid.get(cell.row, cell.col);
    if (content.type === 'stone') {
      if (activeColor === null || awaitingPortalReset) {
        activeColor = content.color;
        awaitingPortalReset = false;
      }
    } else if (content.type === 'portal') {
      portalUsed = true;
      awaitingPortalReset = true;
    }
  }
  return { activeColor, portalUsed };
}

// Whether `candidate` may legally extend `path` during an in-progress
// drag — the same color/special/portal rules validateChain enforces
// for a completed path, minus the minimum-length/segment-splitting
// concerns (irrelevant to a single step). Assumes `path` is non-empty
// and already legal so far. Used by BattleScene to decide, live,
// whether a newly touched cell extends the current drag or is ignored.
export function canExtendChain(grid: HexGrid, path: CellCoord[], candidate: CellCoord): boolean {
  if (path.some((cell) => sameCell(cell, candidate))) return false;

  const last = path[path.length - 1];
  if (!isAdjacent(grid, last, candidate)) return false;

  const lastContent = grid.get(last.row, last.col);
  const content = grid.get(candidate.row, candidate.col);

  // A portal must be immediately followed by a stone (matches
  // validateChain's release-time lookahead) — enforcing it live means a
  // path that passes every canExtendChain check can never be rejected
  // at release for this reason.
  if (lastContent.type === 'portal') {
    return content.type === 'stone';
  }

  if (content.type === 'stone') {
    const { activeColor } = replayState(grid, path);
    return activeColor === null || content.color === activeColor;
  }
  if (content.type === 'special') {
    return true;
  }
  if (content.type === 'portal') {
    const { portalUsed } = replayState(grid, path);
    return !portalUsed;
  }
  return false;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (51/51 — the 41 from before plus these 10 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/chain.ts tests/core/chain.test.ts
git commit -m "$(cat <<'EOF'
feat: add canExtendChain for live per-step drag validation

Mirrors validateChain's color/special/portal rules for a single
incremental step, so the scene can validate each cell as it's dragged
onto rather than only at release.
EOF
)"
```

---

### Task 3: Trace line + backtrack + live validation in `BattleScene.ts`

**Files:**
- Modify: `src/scenes/BattleScene.ts` (imports, field declarations, `create()`, `onPointerDown`, `onPointerMove`, `onPointerUp`, new `drawTraceLine()` method)
- Test: `tests/e2e/battle.spec.ts`

**Interfaces:**
- Consumes: `canExtendChain(grid: HexGrid, path: CellCoord[], candidate: CellCoord): boolean` from Task 2's `src/core/chain.ts`; `cellToPixel` from `./boardLayout` (already imported).
- Produces: no new exports — this task only changes `BattleScene`'s internal interaction/rendering behavior.

- [ ] **Step 1: Write the failing e2e tests**

Add this helper to `tests/e2e/battle.spec.ts`, right after the existing `findValidChain` function:

```ts

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
```

Then add these two tests, after the existing `'a drag shorter than 3 cells does not damage the monster'` test:

```ts

test('dragging a valid chain but backtracking before release does not damage the monster', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const points = chain.map((c) => cellToPixel(c.row, c.col));

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
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);
  const extra = findDifferentColorNeighbor(grid, chain);
  const points = [...chain, extra].map((c) => cellToPixel(c.row, c.col));

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
```

- [ ] **Step 2: Run the e2e tests to verify they fail**

Run: `npm run test:e2e -- -g "backtracking before release|still damages the monster for the valid prefix"`
Expected: FAIL on both.
- The backtrack test fails because today's `onPointerMove` has no backtrack support — dragging back onto the second tile is ignored by the existing "already visited" guard, so the path stays at all 3 originally-dragged cells (still a valid 3-chain), releasing deals damage, and `endHp` ends up less than `startHp`, not equal.
- The different-color test fails because today's `onPointerMove` unconditionally appends every dragged cell, so the released path is 4 cells with a color mismatch at the last index — `validateChain` rejects the *entire* path, no damage is dealt, and `endHp` equals `startHp` rather than being less.

- [ ] **Step 3: Add the `traceGraphics` field and `canExtendChain` import**

In `src/scenes/BattleScene.ts`, change the import from `../core/chain` (add this new import line right after the existing `../core/grid` import block, before the `../core/rng` import):

```ts
import { canExtendChain } from '../core/chain';
```

Add a new field alongside the existing ones (after `private hpBar!: Phaser.GameObjects.Graphics;`):

```ts
  private traceGraphics!: Phaser.GameObjects.Graphics;
```

- [ ] **Step 4: Create the trace graphics object in `create()`**

Find:

```ts
    this.boardLayer = this.add.container(0, 0);
    this.hpText = this.add.text(20, 20, '', { fontSize: '20px', color: '#ffffff' });
```

Replace it with:

```ts
    this.boardLayer = this.add.container(0, 0);
    this.traceGraphics = this.add.graphics();
    this.hpText = this.add.text(20, 20, '', { fontSize: '20px', color: '#ffffff' });
```

(Adding it right after `boardLayer` means it renders on top of the board tiles, since Phaser draws the display list in the order objects were added.)

- [ ] **Step 5: Add the `drawTraceLine()` method**

Add this new method, right after `drawBoard()`'s closing `}` and before `drawHp()`:

```ts
  // Draws the white connecting line for the current in-progress drag —
  // straight cell-to-cell segments only. Redrawn from scratch on every
  // accepted path change, matching drawBoard()'s "simple full redraw"
  // convention.
  private drawTraceLine(): void {
    this.traceGraphics.clear();
    if (this.path.length < 2) return;
    this.traceGraphics.lineStyle(4, 0xffffff, 1);
    this.traceGraphics.beginPath();
    const first = cellToPixel(this.path[0].row, this.path[0].col);
    this.traceGraphics.moveTo(first.x, first.y);
    for (let i = 1; i < this.path.length; i++) {
      const p = cellToPixel(this.path[i].row, this.path[i].col);
      this.traceGraphics.lineTo(p.x, p.y);
    }
    this.traceGraphics.strokePath();
  }
```

- [ ] **Step 6: Update `onPointerDown` to reset the trace line**

Find:

```ts
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    this.dragging = true;
    this.path = [cell];
  }
```

Replace it with:

```ts
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    this.dragging = true;
    this.path = [cell];
    this.drawTraceLine();
  }
```

- [ ] **Step 7: Rewrite `onPointerMove` with live validation and backtracking**

Find:

```ts
  // Extends the in-progress path whenever the pointer enters a new,
  // not-yet-visited cell. Full legality (adjacency/color/min-length) is
  // deferred to validateChain() at release time, not checked live here.
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    const last = this.path[this.path.length - 1];
    if (last.row === cell.row && last.col === cell.col) return;
    if (this.path.some((c) => c.row === cell.row && c.col === cell.col)) return;
    this.path.push(cell);
  }
```

Replace it with:

```ts
  // Extends the in-progress path only when canExtendChain accepts the
  // new cell — anything it rejects is simply ignored, so a chain that's
  // valid so far can never be broken by a bad step later in the drag.
  // Dragging back onto the second-to-last cell backtracks one step
  // instead of being legality-checked. Only min-length is still
  // deferred to release, via validateChain (a single-step check can't
  // know the eventual chain's total length).
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) return;
    const cell = this.cellAt(pointer.x, pointer.y);
    if (!cell) return;
    const last = this.path[this.path.length - 1];
    if (last.row === cell.row && last.col === cell.col) return;

    if (this.path.length >= 2) {
      const secondLast = this.path[this.path.length - 2];
      if (secondLast.row === cell.row && secondLast.col === cell.col) {
        this.path.pop();
        this.drawTraceLine();
        return;
      }
    }

    if (this.path.some((c) => c.row === cell.row && c.col === cell.col)) return;
    if (!canExtendChain(this.grid, this.path, cell)) return;

    this.path.push(cell);
    this.drawTraceLine();
  }
```

- [ ] **Step 8: Clear the trace line on release**

Find:

```ts
  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;

    const result = resolveTurn(this.grid, ROSTER, this.path, this.rng);
    this.path = [];
```

Replace it with:

```ts
  private onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;

    const result = resolveTurn(this.grid, ROSTER, this.path, this.rng);
    this.path = [];
    this.traceGraphics.clear();
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test && npm run test:e2e`
Expected: PASS — all 51 unit tests, and all e2e tests including the two new tests (backtrack, and release-after-invalid-tile) and the two pre-existing ones (which still drag straightforward valid/short chains with no invalid or backtracked steps, so `canExtendChain` accepts every cell exactly as the old unconditional-append code did).

- [ ] **Step 10: Commit**

```bash
git add src/scenes/BattleScene.ts tests/e2e/battle.spec.ts
git commit -m "$(cat <<'EOF'
feat: add live drag validation, trace line, and backtrack-to-shrink

Each dragged cell is now checked with canExtendChain as it's touched,
instead of validating the whole path only at release. A white line
traces the accepted path live; dragging back onto the second-to-last
cell removes the last one. Releasing over an invalid cell no longer
cancels an otherwise-valid chain, since the invalid cell was never
added to the path in the first place.
EOF
)"
```

---

### Task 4: Manual visual verification

**Files:** None (verification only, no code changes).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev -- --port 5183` (background)

- [ ] **Step 2: Load a seeded board and check the portal icon**

Using the Playwright browser tool, navigate to `http://localhost:5183/?seed=1`, take a screenshot, and confirm any portal tile visible on the board shows the 🌈 icon (not a blank purple circle).

- [ ] **Step 3: Manually drag a chain and confirm the trace line**

Using the Playwright browser tool, drag across 3+ adjacent same-color stones (compute pixel centers the same way `tests/e2e/battle.spec.ts`'s `findValidChain` does) with intermediate mouse-move steps, and take a screenshot mid-drag. Confirm:
- A white line, clearly at least a few pixels thick, connects the centers of the dragged tiles so far.
- No line appears connecting to any cell that wasn't actually dragged onto.

- [ ] **Step 4: Manually verify backtracking removes the last segment**

Continue the drag from Step 3, drag back onto the second-to-last tile, and screenshot again. Confirm the last segment has disappeared and the line now only connects the remaining (shorter) path.

- [ ] **Step 5: Manually verify the trace line itself skips an invalid mid-drag step**

The HP-delta behavior for this scenario already has automated e2e coverage (Task 3's "releasing after dragging onto a different-color tile" test) — this step is specifically about the *visual* line, which isn't Playwright-assertable. Drag across 3 same-color stones, then continue the drag onto an adjacent stone of a different color, and screenshot before releasing. Confirm no line segment was drawn connecting to that different-color tile (the line should stop at the 3rd, valid tile). Then release and confirm the monster's HP bar decreases.

No commit for this task — it's a verification checkpoint. If anything looks wrong, stop and re-open the relevant earlier task rather than proceeding.

## Out of Scope

- Any new Playwright debug hooks (damage breakdown, destroyed-tile counts, admin tile-spawn) — separate `bugs.txt` item.
- Destroy-tile animations — separate, deferred `bugs.txt` item.
- Multi-step backtrack (dragging back more than one cell at a time).
