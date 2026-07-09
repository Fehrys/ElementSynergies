# Multi-Portal Chains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the one-portal-per-chain cap so a single drag can bridge through any number of portals, each time picking up a new color (e.g. `yellow×3 → portal → red×3 → portal → green×3` produces three independently-scored sub-chains).

**Architecture:** All the logic lives in `src/core/chain.ts`. `validateChain` (release-time) currently tracks a single portal index and rejects a second one outright; it needs to collect *every* portal index and correctly distinguish the one "leading" (colorless-passthrough) portal from any number of "bridging" portals when building each segment's scored cells. `canExtendChain`/`replayState` (live per-step drag validation) currently rejects a candidate portal once any portal has appeared in the path; that check is simply deleted. No other file changes — `resolution.ts` already loops generically over `subChains`/`portalCells` of any length, and `BattleScene.ts`'s trailing-portal-drop already operates on whichever cell is last, regardless of how many portals came before it.

**Tech Stack:** TypeScript, Vitest (unit tests), no Phaser dependency in the files touched here.

## Global Constraints

- `src/core/` is pure TypeScript with zero Phaser dependency — do not import anything Phaser-related into `chain.ts` (from `CLAUDE.md`).
- Every core function that needs randomness takes an injected `RandomFn` — not applicable to this plan (no new randomness).
- Test command for this plan: `npx vitest run tests/core/chain.test.ts` (full suite: `npm test`).
- Type-checking is implicit via Vite/Vitest with `strict: true` — there is no separate lint step.
- Design source of truth: `docs/superpowers/specs/2026-07-08-multi-portal-chains-design.md`.

---

## Task 1: Remove the portal cap in `validateChain`

**Files:**
- Modify: `src/core/chain.ts` (the `SubChain`/`ChainValidationResult` doc comments, and the body of `validateChain`)
- Test: `tests/core/chain.test.ts`

**Interfaces:**
- Consumes: nothing new — `HexGrid`, `CellCoord`, `ElementColor` from `./grid` (already imported).
- Produces: `validateChain(grid: HexGrid, path: CellCoord[]): ChainValidationResult` — same signature as today. `ChainValidationResult.portalCells` now holds 0-or-more entries (was documented as 0-or-1). This is consumed unchanged by `resolution.ts` (already loops over it generically) — no other task depends on new symbols from this one.

- [ ] **Step 1: Write the failing tests**

Open `tests/core/chain.test.ts`. Find this existing test (it ends around line 199):

```ts
    expect(result.portalCells).toEqual([{ row: 0, col: 2 }]);
  });
```

Immediately after that test's closing `});`, insert two new tests:

```ts
  it('splits a chain with two portals into three independently-scored sub-chains', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
      { row: 3, col: 4, color: 'green' },
      { row: 4, col: 4, color: 'green' },
      { row: 3, col: 5, color: 'green' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    grid.set(2, 4, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 3, col: 4 },
      { row: 4, col: 4 },
      { row: 3, col: 5 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(3);

    const colors = result.subChains.map((sub) => sub.color).sort();
    expect(colors).toEqual(['green', 'red', 'yellow']);

    const yellowSubChain = result.subChains.find((sub) => sub.color === 'yellow')!;
    const redSubChain = result.subChains.find((sub) => sub.color === 'red')!;
    const greenSubChain = result.subChains.find((sub) => sub.color === 'green')!;

    expect(yellowSubChain.stoneCells).toHaveLength(3);
    expect(redSubChain.stoneCells).toHaveLength(3);
    expect(greenSubChain.stoneCells).toHaveLength(3);

    expect(result.portalCells).toEqual([
      { row: 0, col: 2 },
      { row: 2, col: 4 },
    ]);
  });

  it('excludes a bridging portal from a segment that already contains a leading portal', () => {
    const grid = new HexGrid();
    grid.set(1, 0, { type: 'portal' });
    setStones(grid, [
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(2);

    const yellowSubChain = result.subChains.find((sub) => sub.color === 'yellow')!;
    const redSubChain = result.subChains.find((sub) => sub.color === 'red')!;

    // The leading portal (1,0) counts toward yellow's length like a special
    // tile; the bridging portal (0,2) must NOT also land in yellow's cells.
    expect(yellowSubChain.stoneCells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(yellowSubChain.specialTileCells).toEqual([{ row: 1, col: 0 }]);

    // The bridging portal must also be excluded from red's cells.
    expect(redSubChain.stoneCells).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
    expect(redSubChain.specialTileCells).toEqual([]);

    expect(result.portalCells).toEqual([
      { row: 1, col: 0 },
      { row: 0, col: 2 },
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/chain.test.ts -t "two portals"`
Expected: FAIL — `result.valid` is `false` because `validateChain` still rejects the second portal with `'path uses more than one portal'`.

Run: `npx vitest run tests/core/chain.test.ts -t "excludes a bridging portal"`
Expected: FAIL — same reason (the second, bridging portal trips the cap).

- [ ] **Step 3: Update the doc comments and implementation**

In `src/core/chain.ts`, find:

```ts
// One scored segment of a validated chain. Normally there's exactly one
// SubChain per drag; a portal splits a drag into two (one per color).
export interface SubChain {
```

Replace with:

```ts
// One scored segment of a validated chain. Normally there's exactly one
// SubChain per drag; each portal in the path splits it into one more (one
// sub-chain per color the drag passes through).
export interface SubChain {
```

Find:

```ts
  // The portal cell itself (0 or 1 entries) — shared by both sub-chains
  // when present, so it's tracked separately rather than inside either one.
  portalCells: CellCoord[];
```

Replace with:

```ts
  // Every portal cell the path passed through (0 or more entries) — each
  // one is shared between the two sub-chains it bridges, so portals are
  // tracked separately rather than inside either sub-chain's own cells.
  portalCells: CellCoord[];
```

Find:

```ts
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
```

Replace with:

```ts
  const segments: { color: ElementColor; start: number; end: number }[] = [];
  let activeColor: ElementColor | null = null;
  let segmentStart = 0;
  const portalIndices: number[] = [];
  // The index of the one portal (if any) that led the chain — encountered
  // before any color had been decided, so it's a colorless passthrough
  // like a special tile, not a bridge, and counts toward its segment's
  // minimum length. Only the very first portal in a path can ever be
  // "leading": the cell right after any portal is forced to be a stone,
  // which immediately decides a color, so every portal after the first is
  // necessarily a bridge. A bridging portal stays excluded from both
  // sides' counts, as today — tracking this by specific index (rather
  // than a plain boolean) is what keeps a later bridging portal from
  // being miscounted as the leading one when both fall inside the same
  // segment's cell range.
  let leadingPortalIndex = -1;

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
      const next = path[i + 1];
      if (!next) return invalid('portal cannot be the last cell');
      const nextContent = grid.get(next.row, next.col);
      if (nextContent.type !== 'stone') return invalid('cell after portal must be a stone');
      portalIndices.push(i);
      if (activeColor === null) {
        leadingPortalIndex = i;
      } else {
        segments.push({ color: activeColor, start: segmentStart, end: i });
        segmentStart = i;
      }
      activeColor = nextContent.color;
    } else {
      return invalid(`path touches empty cell at index ${i}`);
    }
  }
```

Find:

```ts
      if (content.type === 'stone') stoneCells.push(path[i]);
      else if (content.type === 'special') specialTileCells.push(path[i]);
      else if (content.type === 'portal' && portalCountsTowardLength) specialTileCells.push(path[i]);
```

Replace with:

```ts
      if (content.type === 'stone') stoneCells.push(path[i]);
      else if (content.type === 'special') specialTileCells.push(path[i]);
      else if (content.type === 'portal' && i === leadingPortalIndex) specialTileCells.push(path[i]);
```

Find:

```ts
  const portalCells = portalIndex === -1 ? [] : [path[portalIndex]];
```

Replace with:

```ts
  const portalCells = portalIndices.map((i) => path[i]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/chain.test.ts`
Expected: all tests in the file PASS, including the two new ones (the whole file, not just the new tests — this task's edit touches shared logic every `validateChain` test exercises).

- [ ] **Step 5: Commit**

```bash
git add src/core/chain.ts tests/core/chain.test.ts
git commit -m "feat: allow validateChain to bridge through any number of portals"
```

---

## Task 2: Remove the portal cap in `canExtendChain`

**Files:**
- Modify: `src/core/chain.ts` (the `replayState` helper and `canExtendChain`'s portal branch)
- Test: `tests/core/chain.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `canExtendChain(grid: HexGrid, path: CellCoord[], candidate: CellCoord): boolean` — same signature as today, now permissive of any number of portals already in `path`. `replayState`'s return type narrows from `{ activeColor: ElementColor | null; portalUsed: boolean }` to `{ activeColor: ElementColor | null }` — it's a private (non-exported) helper, so this is safe to narrow with no other consumers.

- [ ] **Step 1: Write the failing tests**

In `tests/core/chain.test.ts`, find this existing test (in the `canExtendChain` describe block):

```ts
  it('rejects a second portal', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    setStones(grid, [{ row: 0, col: 1, color: 'blue' }]);
    grid.set(1, 1, { type: 'portal' });
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(false);
  });
```

Replace it with:

```ts
  it('allows extending through a second portal now that the cap is removed', () => {
    const grid = new HexGrid();
    grid.set(0, 0, { type: 'portal' });
    setStones(grid, [{ row: 0, col: 1, color: 'blue' }]);
    grid.set(1, 1, { type: 'portal' });
    const path = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
    expect(canExtendChain(grid, path, { row: 1, col: 1 })).toBe(true);
  });

  it('allows extending a chain that already bridged one portal through a second portal', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    grid.set(2, 4, { type: 'portal' });
    const path = [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ];
    expect(canExtendChain(grid, path, { row: 2, col: 4 })).toBe(true);
  });

  it('allows a stone of a brand-new color right after a second portal', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
      { row: 1, col: 3, color: 'red' },
      { row: 2, col: 3, color: 'red' },
      { row: 3, col: 4, color: 'green' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    grid.set(2, 4, { type: 'portal' });
    const path = [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ];
    expect(canExtendChain(grid, path, { row: 3, col: 4 })).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/chain.test.ts -t "second portal"`
Expected: FAIL on all three new/changed tests — `canExtendChain` still returns `false` for a candidate portal once `path` already contains one (via `replayState`'s `portalUsed` check).

- [ ] **Step 3: Implement**

In `src/core/chain.ts`, find:

```ts
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
```

Replace with:

```ts
function replayState(grid: HexGrid, path: CellCoord[]): { activeColor: ElementColor | null } {
  let activeColor: ElementColor | null = null;
  let awaitingPortalReset = false;
  for (const cell of path) {
    const content = grid.get(cell.row, cell.col);
    if (content.type === 'stone') {
      if (activeColor === null || awaitingPortalReset) {
        activeColor = content.color;
        awaitingPortalReset = false;
      }
    } else if (content.type === 'portal') {
      awaitingPortalReset = true;
    }
  }
  return { activeColor };
}
```

Find:

```ts
  if (content.type === 'portal') {
    const { portalUsed } = replayState(grid, path);
    return !portalUsed;
  }
```

Replace with:

```ts
  if (content.type === 'portal') {
    return true;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/chain.test.ts`
Expected: all tests in the file PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/chain.ts tests/core/chain.test.ts
git commit -m "feat: allow canExtendChain to accept any number of portals live"
```

---

## Task 3: Full regression check

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: PASS — every suite under `tests/core/**`, not just `chain.test.ts` (confirms nothing in `resolution.ts`/`combat.ts`/etc. relied on the old single-portal assumption).

- [ ] **Step 2: Type-check the project**

Run: `npm run build`
Expected: PASS with no TypeScript errors (this repo has no separate lint step; `tsc` runs implicitly as part of the Vite build).

No commit needed for this task — it makes no code changes, it only confirms Tasks 1 and 2 didn't regress anything elsewhere in the codebase.
