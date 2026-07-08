# Chain Uncolored-Tile Start + Special-Tile Length Counting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `validateChain` in `src/core/chain.ts` so (B) special tiles and a leading portal count toward the minimum chain length of 3, and (C) a chain may start on an uncolored tile (special or portal), with color decided by the first stone encountered.

**Architecture:** Single-function rewrite. Replace the current two-phase `validateChain` (validate `path[0]` is a stone, then walk from `i = 1`) with a single walk from `i = 0` that tracks `activeColor: ElementColor | null` (locked in by the first stone found, wherever it is) and distinguishes a *leading* portal (no color decided yet — colorless passthrough, counts toward length) from a *bridging* portal (color already decided — splits into two segments, excluded from both counts, unchanged from today).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `MIN_CHAIN_LENGTH` stays `3` — unchanged.
- A path may contain at most one portal — unchanged.
- A portal must be immediately followed by a stone — unchanged.
- `SubChain.stoneCells` continues to mean "colored stones that deal damage (count = stoneCells.length)" per its existing doc comment in `chain.ts` — do not add special/portal cells to `stoneCells`; they go in `specialTileCells` (or are excluded, for a bridging portal), matching the existing field split.
- No changes to `src/core/resolution.ts` or `src/core/specialTiles.ts` — they consume `ChainValidationResult` generically and require no changes.

---

### Task 1: Fix `validateChain` for uncolored-tile starts and special-tile length counting

**Files:**
- Modify: `src/core/chain.ts:41-124` (the `validateChain` function body — everything else in the file is unchanged)
- Test: `tests/core/chain.test.ts`

**Interfaces:**
- Consumes: `HexGrid.get`, `HexGrid.getNeighbors`, `CellCoord`, `ElementColor` from `./grid` — all unchanged.
- Produces: `validateChain(grid: HexGrid, path: CellCoord[]): ChainValidationResult` — same signature and same `ChainValidationResult`/`SubChain` shapes as today. No interface changes for callers (`resolution.ts`).

- [ ] **Step 1: Update the failing/changed tests in `tests/core/chain.test.ts`**

Replace the existing test named `'rejects when a special tile pickup leaves fewer than 3 stones'` (this is bug B itself — 2 stones + 1 special now meets the minimum) with:

```ts
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
```

Then add these four new tests immediately before the final closing `});` of the `describe('validateChain', ...)` block (after the existing `'splits a portal-bridged chain into two independently-scored sub-chains'` test):

```ts
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
```

The coordinate pattern `(0,0) → (0,1) → (1,1)` is reused from the existing tests in this file (e.g. `'accepts a valid same-color chain of length 3'`), which already confirm these three cells are mutually adjacent on the current grid — no new hex-adjacency math needed.

The existing test `'splits a portal-bridged chain into two independently-scored sub-chains'` (a portal bridging an already-established `red` color into `blue`) is left completely unmodified — it's the regression check that a bridging portal still excludes itself from both sides' length counts.

- [ ] **Step 2: Run the tests to verify the expected failures**

Run: `npm test -- chain.test.ts`

Expected: FAIL — the renamed/flipped test fails because the current code still rejects 2 stones + 1 special (`result.valid` is `false`, not `true`). The four new tests fail because the current code rejects any path where `path[0]` is not a stone (`'path must start on a stone'`), so `result.valid` is `false` in all four instead of the expected values.

- [ ] **Step 3: Replace `validateChain` in `src/core/chain.ts`**

Replace the entire body of `src/core/chain.ts` from the `validateChain` function's doc comment (currently starting at line 36, `// Validates a full dragged path...`) through its closing `}` (currently line 124) with:

```ts
// Validates a full dragged path and, if valid, splits it into scored
// sub-chains. Called once per completed drag (resolution.ts's wave 1);
// the caller is expected to already have stopped extending the path at
// the last legal cell, so any invalid path here fails the whole chain
// rather than being silently trimmed.
export function validateChain(grid: HexGrid, path: CellCoord[]): ChainValidationResult {
  if (path.length === 0) return invalid('empty path');

  // Rule: no revisiting/crossing a cell already in this drag.
  const seen = new Set<string>();
  for (const cell of path) {
    const key = `${cell.row},${cell.col}`;
    if (seen.has(key)) return invalid('path revisits a cell');
    seen.add(key);
  }

  // Rule: every consecutive pair of cells must be hex-adjacent.
  for (let i = 1; i < path.length; i++) {
    if (!isAdjacent(grid, path[i - 1], path[i])) return invalid('path is not contiguous');
  }

  // Walk the whole path from the start, deciding the active color from
  // whichever stone comes first. A chain may start on a stone (color
  // decided immediately) or on an uncolored tile — a special tile or a
  // portal — in which case the color stays undetermined until the first
  // stone is reached, same rule either way.
  const segments: { color: ElementColor; start: number; end: number }[] = [];
  let activeColor: ElementColor | null = null;
  let segmentStart = 0;
  let portalIndex = -1;
  // True only when the path's single portal led the chain (no color had
  // been decided yet when it was reached) — in that case it's a colorless
  // passthrough like a special tile, not a bridge, and counts toward the
  // segment's minimum length. A portal that bridges an already-decided
  // color into a new one stays excluded from both sides' counts, as today.
  let portalCountsTowardLength = false;

  for (let i = 0; i < path.length; i++) {
    const content = grid.get(path[i].row, path[i].col);
    if (content.type === 'stone') {
      if (activeColor === null) {
        activeColor = content.color;
      } else if (content.color !== activeColor) {
        return invalid(`color mismatch at index ${i}`);
      }
    } else if (content.type === 'special') {
      continue;
    } else if (content.type === 'portal') {
      if (portalIndex !== -1) return invalid('path uses more than one portal');
      const next = path[i + 1];
      if (!next) return invalid('portal cannot be the last cell');
      const nextContent = grid.get(next.row, next.col);
      if (nextContent.type !== 'stone') return invalid('cell after portal must be a stone');
      portalIndex = i;
      if (activeColor === null) {
        portalCountsTowardLength = true;
      } else {
        segments.push({ color: activeColor, start: segmentStart, end: i });
        segmentStart = i;
      }
      activeColor = nextContent.color;
    } else {
      return invalid(`path touches empty cell at index ${i}`);
    }
  }

  if (activeColor === null) return invalid('chain contains no colored stone');

  segments.push({ color: activeColor, start: segmentStart, end: path.length - 1 });

  // Build a SubChain per segment, but only keep segments that reach the
  // minimum length — a portal side that falls short simply contributes
  // no sub-chain (design decision: it doesn't invalidate the other side).
  // Special tiles (and a leading, non-bridging portal) count toward the
  // minimum alongside stones; a bridging portal does not.
  const subChains: SubChain[] = [];
  for (const segment of segments) {
    const stoneCells: CellCoord[] = [];
    const specialTileCells: CellCoord[] = [];
    for (let i = segment.start; i <= segment.end; i++) {
      const content = grid.get(path[i].row, path[i].col);
      if (content.type === 'stone') stoneCells.push(path[i]);
      else if (content.type === 'special') specialTileCells.push(path[i]);
      else if (content.type === 'portal' && portalCountsTowardLength) specialTileCells.push(path[i]);
    }
    if (stoneCells.length + specialTileCells.length >= MIN_CHAIN_LENGTH) {
      subChains.push({ color: segment.color, stoneCells, specialTileCells });
    }
  }

  if (subChains.length === 0) return invalid('no segment reaches minimum chain length');

  const portalCells = portalIndex === -1 ? [] : [path[portalIndex]];
  return { valid: true, subChains, portalCells };
}
```

`sameCell`, `isAdjacent`, `invalid`, `SubChain`, `ChainValidationResult`, and `MIN_CHAIN_LENGTH` above this function are unchanged — leave them exactly as they are.

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `npm test`

Expected: PASS — all tests in `tests/core/chain.test.ts` pass (including the 9 pre-existing, unmodified tests: length-3 rejection, valid same-color chain, color mismatch, revisit rejection, non-adjacency rejection, colorless mid-chain passthrough, no-bridging-after-special rejection, portal-side-too-short rejection, and portal-bridge splitting), plus the 1 flipped test and 4 new tests. The full suite (`grid.test.ts`, `refill.test.ts`, `resolution.test.ts`, `specialTiles.test.ts`, `chain.test.ts`) passes with no regressions, since no other file's behavior changed.

- [ ] **Step 5: Commit**

```bash
git add src/core/chain.ts tests/core/chain.test.ts
git commit -m "fix: allow chains to start on special/portal tiles, count toward min length"
```

---

## Out of Scope

(Same as the design spec's Out of Scope section — restated here for the implementer's awareness, not additional work for this plan.)

- Item 4 (rainbow/portal icon) and item 6 (Playwright debug info) from `bugs.txt` — separate specs.
- Item 1 (drag-trace-line) and item 5 (destroy animations) — separate specs / deferred.
- Any change to how special tiles' *effects* fire (`resolution.ts`, `specialTiles.ts`) — untouched by this plan.
