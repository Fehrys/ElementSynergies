# Minimum Chain Length Applies to the Whole Path, Not Per Color — Design

**Date:** 2026-07-09
**Status:** Approved for planning

## Goal

`MIN_CHAIN_LENGTH = 3` currently gates each portal-bridged color segment independently: `yellow×2, portal, red×2` is rejected outright, because neither the yellow side (2 stones) nor the red side (2 stones) individually reaches 3 — even though the two sides combined total 4 scoring cells, above the minimum. Change the rule so the minimum applies to the **total** dragged chain (summed across every segment), not to any single color's segment. Once the total reaches 3, every segment scores for however many stones it actually has — a segment can be as small as 1 stone.

This does not change what makes a single drag *step* legal: `canExtendChain` still only accepts a same-color stone, a special tile, or a portal as the next cell, and the chain still stops the moment an invalid tile is touched. This spec only changes how the *completed* path's length is judged at release.

## Supersedes

This narrows a statement in the multi-portal spec (`docs/superpowers/specs/2026-07-08-multi-portal-chains-design.md`): "The existing per-side minimum-length rule is unchanged by this spec — a side that falls short still simply contributes no sub-chain, as today." That per-side framing is what this spec replaces. Per this repo's "latest spec wins" convention (`CLAUDE.md`), this document is now the source of truth for how the minimum length applies to portal-bridged chains.

## Rule Change

`validateChain` still splits a path into per-color segments exactly as before (leading portal counts toward its segment like a special tile; a bridging portal is excluded from both sides it connects — none of that changes). What changes is the gate:

- **Before:** each segment's own `stoneCells.length + specialTileCells.length` was checked against `MIN_CHAIN_LENGTH` individually. A segment below the minimum was silently dropped (contributed no sub-chain, and — as an existing side effect — its cells were never cleared even though they were dragged over). The whole chain was rejected only if *every* segment fell short.
- **After:** every segment's `stoneCells.length + specialTileCells.length` is summed into one total. That total is checked against `MIN_CHAIN_LENGTH` exactly once. If it meets the minimum, **every** segment becomes a scored sub-chain — including a segment with just 1 or 2 stones — and all of its cells clear. If the total falls short, the whole chain is invalid (unchanged: nothing clears, matching a plain too-short drag today).

Worked example: `yellow×2, portal, red×2` — total scoring cells = 2 (yellow) + 2 (red) = 4 ≥ 3 → valid. Both segments become sub-chains: yellow deals `ATK×2`, red deals `ATK×2`, both clear, the portal clears.

Accepted consequence (explicitly confirmed): a chain can link singleton stones of different colors through portals — e.g. `yellow×1, portal, red×1, portal, blue×1` (total 3) — and each color deals `ATK×1`. Portals bypassing the "3 same-color adjacent" constraint this way is intentional, not a bug to guard against; no additional per-side floor is introduced.

Side benefit: this also resolves an existing inconsistency where a too-short side's cells were dragged over but never cleared (since they belonged to no sub-chain) while a longer side on the same drag did clear. Under the new rule, every segment in a chain that passes the gate always becomes a sub-chain, so every cell the player dragged over is always accounted for — either the whole drag clears, or none of it does.

## Architecture

### `src/core/chain.ts` — `validateChain`

The only change is in the final segment-building loop. Instead of filtering segments by their own length and rejecting only when the filtered list is empty:

```ts
if (stoneCells.length + specialTileCells.length >= MIN_CHAIN_LENGTH) {
  subChains.push({ color: segment.color, stoneCells, specialTileCells });
}
```

accumulate every segment unconditionally, sum their lengths, and gate once after the loop:

```ts
totalScoringCells += stoneCells.length + specialTileCells.length;
subChains.push({ color: segment.color, stoneCells, specialTileCells });
```

then, after the loop:

```ts
if (totalScoringCells < MIN_CHAIN_LENGTH) return invalid('chain does not reach minimum chain length');
```

Everything upstream of this (adjacency, revisit, "portal cannot be last cell", "cell after portal must be a stone", leading-vs-bridging portal bookkeeping, `leadingPortalIndex`) is unchanged — this spec only touches how the built segments are judged and kept, not how they're built.

### `src/core/chain.ts` — `canExtendChain` / `replayState`

No changes. Both are explicitly deferred from minimum-length concerns already (`canExtendChain`'s doc comment: "minus the minimum-length/segment-splitting concerns (irrelevant to a single step)") — live per-step legality (same color / special / portal, chain stops on an invalid tile) is untouched by this spec.

### `src/core/resolution.ts`

No changes. `resolveTurn` already loops generically over `validation.subChains` and `validation.portalCells` — a sub-chain with 1 stone clears and scores exactly like one with 10, no special-casing needed.

### `src/scenes/BattleScene.ts`

No changes. Nothing here depends on segment size.

## Testing

- `tests/core/chain.test.ts`: flip `'rejects a portal chain where a side falls short of minimum length'` (currently asserts `result.valid === false` for a red×2 + portal + blue×2 path) to assert `valid: true` with both a red sub-chain (`stoneCells` length 2) and a blue sub-chain (`stoneCells` length 2) present, and `portalCells` containing the bridging portal.
- Add a case for the singleton-chaining consequence: `yellow×1, portal, red×1, portal, blue×1` (total 3) — expect `valid: true`, three sub-chains, each with exactly 1 stone.
- Add a case confirming the "previously-orphaned cells now clear" side benefit: `yellow×3, portal, red×1` (previously: yellow scored, red's single cell was dragged over but excluded from every sub-chain) — expect `valid: true`, two sub-chains (yellow length 3, red length 1), confirming red's cell is now included in a sub-chain's `stoneCells` rather than orphaned.
- All other existing portal tests (`'splits a portal-bridged chain into two independently-scored sub-chains'`, `'splits a chain with two portals into three independently-scored sub-chains'`, `'excludes a bridging portal from a segment that already contains a leading portal'`, `'allows a chain to start on a portal...'`) already have every segment individually ≥3 (or ≥3 in total for the single-segment cases) — unaffected, verified by inspection, no changes needed.
- `tests/e2e/battle.spec.ts`: no changes — this is release-time validation logic already covered at the unit level, and no existing e2e test exercises an unbalanced portal split.

## Out of Scope

- Any change to live per-step drag legality (`canExtendChain`) — a chain still only extends onto a same-color stone, a special tile, or a portal, and still stops on an invalid tile.
- Any per-side floor beyond "at least 1 stone" (already structurally guaranteed — a segment's color is always decided by a real stone).
- Any change to `resolution.ts` scoring/clearing logic or `BattleScene.ts`.
- Any change to the no-portal, single-segment case — a plain same-color chain still needs 3+ cells, exactly as today (the total-vs-segment distinction only matters once a portal splits a path into multiple segments).
