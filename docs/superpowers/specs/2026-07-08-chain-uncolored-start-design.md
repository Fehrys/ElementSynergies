# Chain Validation: Uncolored-Tile Start + Special-Tile Length Counting — Design

**Date:** 2026-07-08
**Status:** Approved for planning

## Goal

Two related bugs in `src/core/chain.ts`'s `validateChain`, both surfaced from `bugs.txt`:

1. A drag cannot start on a special tile or portal — `sword → blue → blue` is rejected outright, even though the two blue stones alone would form a valid 3-chain if the sword weren't in the way.
2. Special tiles picked up mid-chain don't count toward the minimum chain length of 3 — `yellow → bomb → yellow` (2 stones + 1 special) is rejected as "too short," even though 3 cells were dragged.

These are interdependent: fixing only #2 still leaves `sword → blue → blue` rejected (drag can't start on the sword at all), and fixing only #1 still leaves `yellow → bomb → yellow` rejected (now allowed to start on stone as before, but the special still wouldn't count). Both are specified and planned together.

## Confirmed rules

- If a chain starts on an uncolored tile (a special tile *or* a portal), the chain's color is decided by the first colored stone encountered afterward — same rule for both tile types, no distinction between them.
- Special tiles (and, as today, portals) count toward the minimum chain length of 3, alongside stones.
- A chain made entirely of uncolored tiles with no stone anywhere (e.g. `sword → sword`) has no way to determine a color and is invalid.

## Design

### Bug B: special tiles count toward minimum length

In the segment-building step, change:
```
if (stoneCells.length >= MIN_CHAIN_LENGTH)
```
to:
```
if (stoneCells.length + specialTileCells.length >= MIN_CHAIN_LENGTH)
```

Portal cells are unaffected by this change and continue to be excluded from both `stoneCells` and `specialTileCells` — a portal is a bridge between two segments, already tracked separately via `portalCells`, not a "cell within" either segment for counting purposes. This matches today's behavior (a portal cell is already silently excluded from both lists).

### Bug C: chain can start on an uncolored tile

Replace the current two-phase structure (validate `path[0]` is a stone up front, then walk from `i = 1` tracking `activeColor: ElementColor`) with a single walk from `i = 0` that tracks `activeColor: ElementColor | null`, starting `null`:

- **stone:** if `activeColor` is still `null`, this stone locks it in (this is "the second tile decides the color" when the chain started on an uncolored tile — or simply "the first tile decides the color" when it started on a stone, the same mechanism handles both). Otherwise, enforce it matches `activeColor` (unchanged mismatch behavior).
- **special:** always a colorless passthrough, regardless of position in the path (unchanged behavior, now also legal at index 0).
- **portal:** at most one portal per path, must be immediately followed by a stone (unchanged rule). What happens next depends on whether a color has been decided yet:
  - **If `activeColor` is still `null`** (nothing before this portal has decided a color — it's leading the chain, possibly after some special tiles): this portal does **not** split the path into two segments. It behaves exactly like a special tile at this position — a colorless passthrough that counts toward the eventual single segment's minimum length (see Bug B). `activeColor` is then set to the following stone's color.
  - **If `activeColor` is already set** (this portal is bridging an established chain into a new color — today's normal case): unchanged existing behavior — close the current segment at this cell, start a new segment from this cell, and reset `activeColor` to the following stone's color. The portal cell is excluded from both segments' length counts, same as today.
- **anything else (empty cell):** invalid, unchanged.
- **end of path:** if `activeColor` is still `null` (the entire path was special/portal tiles with no stone ever encountered — note a portal always resolves to a color via its mandatory following stone, so this only happens with an all-special path like `sword → sword`), reject with reason `'chain contains no colored stone'`.

**Why the portal/length interaction needs this split:** a portal only ever bridges *two* real chains when it's splitting an already-decided color into a new one — that's the existing, unchanged case (`tests/core/chain.test.ts`'s two portal tests both have stones before the portal, so they exercise this path and are unaffected). But when nothing has decided a color yet, there is no "before" chain to bridge from — the portal is acting as a leading uncolored tile, no different from a special tile in that position, and must count toward length the same way a special tile would. Without this distinction, `portal → blue → blue` would silently fail to validate (the portal excluded from the count, leaving only 2 counted cells) while `sword → blue → blue` succeeds — breaking the "same rule as special tiles" requirement for portals leading a chain.

The existing segment-splitting logic (one segment if no portal or a non-splitting leading portal, two if the portal is a genuine bridge) is unchanged in spirit — it still works in terms of `activeColor` snapshots rather than assuming `path[0]` is a stone.

## Testing

- `tests/core/chain.test.ts`:
  - **"rejects when a special tile pickup leaves fewer than 3 stones"** (existing test, lines 85-99): this is bug B itself — 2 stones + 1 special = 3 total now meets the minimum. Expectation flips from `valid: false` to `valid: true`.
  - New test: chain starting on a special tile with two matching stones following (`sword → blue → blue`) — valid, color blue, `specialTileCells` includes the sword.
  - New test: chain starting on a portal with two matching stones following (`portal → blue → blue`) — valid, color decided by the first stone, portal counted toward the minimum length exactly like a special tile would (this is the case that needs the non-splitting portal behavior above — without it, the portal would be excluded from the count and this chain would wrongly fail).
  - New test: a portal that genuinely bridges an already-established color (existing pattern, e.g. `red → red → red → portal → blue → blue → blue`) still splits into two independently-scored sub-chains with the portal excluded from both counts — confirms the length-counting change doesn't regress the existing bridging behavior.
  - New test: chain of all special tiles with no stone anywhere — invalid, reason mentions no colored stone.
  - New test: chain starting on a special tile whose subsequent stones mismatch each other — invalid, color mismatch (confirms the deferred-color-lock still enforces consistency once locked).
  - Existing tests (portal mid-chain, color mismatch after a special, chain-too-short, revisits, non-adjacent) reviewed and unaffected — verified by reading each; the mechanism change preserves their exact observable behavior.
- No changes needed outside `chain.ts` and its test file — `resolution.ts` and `specialTiles.ts` consume `ChainValidationResult` generically and require no changes.

## Out of Scope

- Item 4 (rainbow/portal icon) and item 6 (Playwright debug info) from `bugs.txt` — separate specs.
- Item 1 (drag-trace-line) and item 5 (destroy animations) — separate specs / deferred.
- Any change to how special tiles' *effects* fire (still resolved entirely in `resolution.ts`/`specialTiles.ts`, untouched here) — this spec is chain-validation logic only.
