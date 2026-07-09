# Total-Length Portal Chain Minimum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `validateChain`'s minimum-length gate from "each portal-bridged color segment individually reaches `MIN_CHAIN_LENGTH`" to "the whole path's scoring cells, summed across every segment, reach `MIN_CHAIN_LENGTH`" — so `yellow×2, portal, red×2` (and even portal-chained singleton stones) validate and score, instead of being rejected outright.

**Architecture:** A single, self-contained change to the final segment-building loop in `validateChain` (`src/core/chain.ts`): stop filtering segments individually and instead accumulate every segment unconditionally, gating once on the sum. Everything upstream (adjacency, revisit, portal bookkeeping, `leadingPortalIndex`) is untouched, and every other consumer (`canExtendChain`, `resolution.ts`, `BattleScene.ts`) is untouched since none of them special-case segment size.

**Tech Stack:** TypeScript, Vitest (`tests/core/chain.test.ts`).

## Global Constraints

- Only `src/core/chain.ts`'s `validateChain` function changes — `canExtendChain`, `replayState`, `resolution.ts`, and `BattleScene.ts` are all explicitly out of scope (none of them special-case segment size; see the design spec's Architecture section).
- Test command for this plan: `npx vitest run tests/core/chain.test.ts` (full suite: `npm test`). Also re-run the e2e suite (`npx playwright test tests/e2e/battle.spec.ts`) as a final sanity check even though no e2e test exercises this path today.
- Design source of truth: `docs/superpowers/specs/2026-07-09-total-length-portal-chains-design.md`.

---

## Task 1: Gate the minimum length on the total, not per segment

**Files:**
- Modify: `src/core/chain.ts`
- Test: `tests/core/chain.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `validateChain(grid: HexGrid, path: CellCoord[]): ChainValidationResult` — same signature as today. Behavior change only: a portal-bridged chain where every individual segment is below `MIN_CHAIN_LENGTH` can now be `valid: true` (previously always `valid: false`), and every segment present in `segments` always produces a `SubChain` (previously only segments individually ≥ `MIN_CHAIN_LENGTH` did).

- [ ] **Step 1: Write the failing tests**

Open `tests/core/chain.test.ts`. Find this existing test (around line 141):

```ts
  it('rejects a portal chain where a side falls short of minimum length', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 3, color: 'blue' },
      { row: 1, col: 2, color: 'blue' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    // red side only has 2 stones (fails min 3); blue side has 2 (also fails via this path)
    // so this exact path is invalid — covered fully by the next, genuinely
    // portal-bridged passing case.
    expect(result.valid).toBe(false);
  });
```

Replace it entirely with:

```ts
  it('allows a portal chain where every side is individually short, as long as the total reaches the minimum', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 0, col: 0, color: 'red' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 3, color: 'blue' },
      { row: 1, col: 2, color: 'blue' },
      { row: 1, col: 1, color: 'blue' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    // red side has 2 stones and blue side has 2 stones — neither alone
    // reaches MIN_CHAIN_LENGTH, but the combined total (4) does, so both
    // sides now score.
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(2);

    const redSubChain = result.subChains.find((sub) => sub.color === 'red')!;
    const blueSubChain = result.subChains.find((sub) => sub.color === 'blue')!;
    expect(redSubChain.stoneCells).toHaveLength(2);
    expect(blueSubChain.stoneCells).toHaveLength(2);

    expect(result.portalCells).toEqual([{ row: 0, col: 2 }]);
  });
```

Immediately after that test's closing `});`, insert two new tests:

```ts
  it('scores three portal-chained singleton stones once their combined total meets the minimum', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'red' },
      { row: 1, col: 2, color: 'blue' },
    ]);
    grid.set(0, 0, { type: 'portal' });
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(3);

    const colors = result.subChains.map((sub) => sub.color).sort();
    expect(colors).toEqual(['blue', 'red', 'yellow']);
    for (const sub of result.subChains) {
      expect(sub.stoneCells).toHaveLength(1);
    }

    expect(result.portalCells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 2 },
    ]);
  });

  it('clears a short trailing side instead of leaving it orphaned on the board', () => {
    const grid = new HexGrid();
    setStones(grid, [
      { row: 1, col: 0, color: 'yellow' },
      { row: 0, col: 0, color: 'yellow' },
      { row: 0, col: 1, color: 'yellow' },
      { row: 1, col: 2, color: 'red' },
    ]);
    grid.set(0, 2, { type: 'portal' });
    const result = validateChain(grid, [
      { row: 1, col: 0 },
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.subChains).toHaveLength(2);

    const yellowSubChain = result.subChains.find((sub) => sub.color === 'yellow')!;
    const redSubChain = result.subChains.find((sub) => sub.color === 'red')!;
    expect(yellowSubChain.stoneCells).toHaveLength(3);
    // Before this change, a 1-stone side was dropped entirely and its
    // cell never appeared in any sub-chain — it stayed on the board even
    // though it was dragged over. Now it's included and will clear.
    expect(redSubChain.stoneCells).toEqual([{ row: 1, col: 2 }]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/chain.test.ts`
Expected: the renamed test (`'allows a portal chain where every side is individually short...'`) FAILS — `result.valid` is `false`, not `true` (old behavior still in place). The two new tests FAIL similarly (`result.valid` is `false`).

- [ ] **Step 3: Implement the total-length gate**

In `src/core/chain.ts`, replace:

```ts
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
      else if (content.type === 'portal' && i === leadingPortalIndex) specialTileCells.push(path[i]);
    }
    if (stoneCells.length + specialTileCells.length >= MIN_CHAIN_LENGTH) {
      subChains.push({ color: segment.color, stoneCells, specialTileCells });
    }
  }

  if (subChains.length === 0) return invalid('no segment reaches minimum chain length');
```

with:

```ts
  // Build a SubChain per segment. The minimum length applies to the whole
  // chain (summed across every segment), not to any single color's
  // segment — a portal-bridged side can be as small as 1 stone and still
  // score, as long as the total meets MIN_CHAIN_LENGTH. Special tiles
  // (and a leading, non-bridging portal) count toward the total alongside
  // stones; a bridging portal does not.
  const subChains: SubChain[] = [];
  let totalScoringCells = 0;
  for (const segment of segments) {
    const stoneCells: CellCoord[] = [];
    const specialTileCells: CellCoord[] = [];
    for (let i = segment.start; i <= segment.end; i++) {
      const content = grid.get(path[i].row, path[i].col);
      if (content.type === 'stone') stoneCells.push(path[i]);
      else if (content.type === 'special') specialTileCells.push(path[i]);
      else if (content.type === 'portal' && i === leadingPortalIndex) specialTileCells.push(path[i]);
    }
    totalScoringCells += stoneCells.length + specialTileCells.length;
    subChains.push({ color: segment.color, stoneCells, specialTileCells });
  }

  if (totalScoringCells < MIN_CHAIN_LENGTH) return invalid('chain does not reach minimum chain length');
```

(The line below this block, `const portalCells = portalIndices.map((i) => path[i]);` and the final `return`, are unchanged — leave them as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/chain.test.ts`
Expected: all tests in the file PASS, including the 3 touched by this task.

- [ ] **Step 5: Run the full regression suite**

Run: `npm test`
Expected: all unit tests PASS (this change is confined to `chain.ts`, but `resolution.test.ts` and any other consumer test should be unaffected — confirm).

Run: `npx playwright test tests/e2e/battle.spec.ts`
Expected: all e2e tests PASS (no existing e2e test exercises an unbalanced portal split, per the design spec, so this should be a clean pass with no changes needed).

- [ ] **Step 6: Commit**

```bash
git add src/core/chain.ts tests/core/chain.test.ts
git commit -m "feat: gate portal chain minimum length on the total, not per color segment"
```
