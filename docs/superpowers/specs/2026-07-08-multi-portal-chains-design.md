# Multi-Portal Chains — Design

**Date:** 2026-07-08
**Status:** Approved for planning

## Goal

Remove the one-portal-per-chain cap. A single drag should be able to bridge through any number of portals, each time picking up a new color, e.g. `yellow, yellow, yellow, portal, red, red, red, portal, green, green, green` should validate as three independently-scored sub-chains (one per color, each meeting the existing `MIN_CHAIN_LENGTH` of 3) sharing two portal cells. The existing per-side minimum-length rule is unchanged by this spec — a side that falls short still simply contributes no sub-chain, as today.

## Supersedes

This reverses a rule stated in three prior specs (each said "at most one portal per path"):
- `docs/superpowers/specs/2026-07-05-spirit-stones-puzzle-design.md`
- `docs/superpowers/specs/2026-07-08-chain-uncolored-start-design.md`
- `docs/superpowers/specs/2026-07-08-drag-trace-line-and-portal-icon-design.md`

Those documents are left as-is (historical record); this spec is the current source of truth per this repo's "latest spec wins" convention (`CLAUDE.md`).

## Rule Change

A portal is no longer limited to appearing once in a dragged path. Its existing per-occurrence rules are unchanged:
- A portal can never be the last cell of a path (`validateChain` rejects it; `BattleScene.onPointerUp` already drops a single trailing portal before submitting — this continues to apply regardless of how many portals came before it).
- The cell immediately after a portal must be a stone, which becomes the new active color (a "bridge"). This is enforced both live (`canExtendChain`) and at release (`validateChain`).
- A portal encountered before any color has been decided (a leading, colorless portal — same as a special tile) is a passthrough, not a bridge: it counts toward its enclosing segment's minimum length instead of splitting the chain.

These two rules together already make two portals adjacent to each other in a path impossible (the cell right after a portal must be a stone), so no new adjacency rule is needed.

## Architecture

### `src/core/chain.ts` — `validateChain`

- Remove the `portalIndex !== -1 → invalid('path uses more than one portal')` cap check.
- Replace the single `portalCountsTowardLength: boolean` with `leadingPortalIndex: number` (the path index of the leading portal, or `-1` if none). Only the very first portal encountered in a path can ever be "leading" — the cell right after *any* portal is forced to be a stone, which immediately decides a color, so every portal after the first is necessarily a bridge. Tracking the specific index (rather than a boolean) matters once multiple portals exist: without it, a later bridging portal that falls within an earlier segment's `[start, end]` range would be miscounted as the leading passthrough portal and wrongly added to that segment's cell list.
- When building each segment's `stoneCells`/`specialTileCells`, a portal cell counts toward the segment only when `i === leadingPortalIndex`; all other portal cells (every bridge) stay excluded from both sides, as today.
- Collect every portal index encountered into `portalIndices: number[]` instead of a single `portalIndex`. `portalCells` in the result becomes `portalIndices.map(i => path[i])` (0 or more entries; the doc comment on `ChainValidationResult.portalCells` updates accordingly).
- Everything else (adjacency, revisit, "portal cannot be last cell", "cell after portal must be a stone", per-segment `MIN_CHAIN_LENGTH`) is unchanged.

### `src/core/chain.ts` — `canExtendChain` / `replayState`

- Drop `portalUsed` from `replayState`'s return value and internal tracking entirely — its only consumer was the cap check being removed.
- In `canExtendChain`, a portal candidate becomes unconditionally legal (mirroring the special-tile branch): `if (content.type === 'portal') return true;`. This is still reached only after the earlier "last cell is a portal → candidate must be a stone" check, so the bridge rule stays enforced live.
- `awaitingPortalReset` (lets the stone immediately after a portal become the new decided color) already fires on every portal, not just the first — no change needed there.

### `src/core/resolution.ts`

No changes. `resolveTurn` already loops generically over `validation.subChains` (any length) and `validation.portalCells` (any length) rather than indexing into them, so N portals naturally produce N+1 scored sub-chains and N cleared portal cells.

### `src/scenes/BattleScene.ts`

No changes. The trailing-portal-drop in `onPointerUp` already operates on whatever the path's last cell is, regardless of how many portals appear earlier in the path.

## Testing

- `tests/core/chain.test.ts`:
  - Flip the existing "rejects a second portal" case for `canExtendChain` to assert a second (and third) portal is now accepted.
  - `validateChain`: add a case for `yellow, yellow, yellow, portal, red, red, red, portal, green, green, green` (3 stones per color, matching `MIN_CHAIN_LENGTH`) — expect three sub-chains (yellow/red/green) and two `portalCells`.
  - Add a case exercising the leading-portal-plus-later-bridging-portal subtlety: a path that starts with a leading (colorless) portal before any stone, then later has a second, bridging portal — assert the leading portal counts toward its segment's length and the bridging portal is excluded from both sides, i.e. the `leadingPortalIndex` fix is actually exercised.
- `tests/e2e/battle.spec.ts`: no new test required — this is release-time/live-validation logic already covered at the unit level; the existing portal e2e coverage (if any) is unaffected since single-portal chains remain valid.

## Out of Scope

- Any change to the "portal can't be the last cell" or "cell after portal must be a stone" rules.
- Any change to `resolution.ts` scoring/clearing logic.
- Any UI/rendering change (trace line, portal icon) — purely a validation-rule change.
- A configurable/tunable max-portal-count — explicitly rejected; the rule is simply removed, matching how special tiles already have no count cap.
