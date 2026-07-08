# Drag Trace Line + Portal Icon — Design

**Date:** 2026-07-08
**Status:** Approved for planning

## Goal

Two UX-feedback fixes from `bugs.txt`, of very different sizes:

1. **Drag trace line (the larger piece of this spec):** dragging a chain gives the player no visual feedback connecting the tiles they've touched, and no way to correct a wrong turn without releasing. This is not just a rendering addition — it requires three coordinated changes: (a) a new live per-step legality check during the drag (today, nothing is validated until release), (b) a white connecting line kept in sync with that live validation, and (c) backtrack-to-shrink support (dragging back onto the second-to-last cell removes the last cell and its line segment) — a genuine interaction-logic feature in its own right, not a visual afterthought, since it changes how `BattleScene` tracks and mutates the in-progress path.
2. **Portal icon (small):** the portal tile (`bugs.txt`'s "rainbow tile") renders as a plain purple circle with no icon at all, unlike every special tile, which already got a distinguishing emoji. A one-line rendering addition, no interaction-logic changes.

These are unrelated subsystems (drag interaction/rendering vs. a single tile's icon) of very different scope, but both are same-session visual-feedback fixes, so they're specified and planned together, following the precedent set by the board-layout-fixes spec. The bulk of this spec (and the implementation effort) is Part 1.

## Part 1: Drag Trace Line

### Problem

`BattleScene.onPointerMove` currently appends any new, not-yet-visited cell to the drag path unconditionally — no adjacency or color legality is checked until release, when `validateChain` runs once on the whole path. Nothing is drawn during the drag itself, so the player has no visual trace of what they've connected, and no way to correct a wrong step short of releasing (which abandons the whole drag) or dragging further (which the current code doesn't even reject, since it doesn't check legality mid-drag).

### Interaction Rules (confirmed)

- While dragging, each new candidate cell is checked against the same legality rules `validateChain` enforces for a completed chain: it must be hex-adjacent to the current last cell in the path, and it must respect the color rule established by the B+C chain-validation fix (`docs/superpowers/specs/2026-07-08-chain-uncolored-start-design.md`) — a stone must match the color already decided by an earlier stone in the path, or *become* the deciding stone if none has been set yet; a special tile is always a colorless passthrough; a portal is only legal if the path doesn't already contain one.
- **If the candidate fails this check, it is ignored entirely** — the path does not grow, no line is drawn, and the drag keeps waiting for a legal next cell from the current last cell. The player is free to keep moving the pointer around; only cells that pass the check ever extend the path.
- **Backtracking:** if the candidate is exactly the second-to-last cell already in the path, this is a backtrack, not a new extension — the last cell is popped off the path (and its line segment removed), rather than being legality-checked. Only single-step backtrack is in scope (dragging back further than one step simply has no special handling beyond what's described next).
- Dragging onto any other already-visited cell (not the second-to-last) is ignored, unchanged from today.
- Example (confirmed): `blue → blue → blue` draws two line segments (1–2, 2–3). Dragging back onto the second tile removes the third cell and its segment, leaving `blue, blue` and one segment. Releasing at that point does nothing — `validateChain` rejects a 2-cell path exactly as it does today, unchanged.
- **Example — invalid middle tile (confirmed):** dragging over `blue → blue → green → blue` stops growing after the second blue. The green tile fails the color check against the already-decided `blue` and is rejected — the path stays `[blue, blue]`, no third line segment is drawn, and critically the path's last cell for adjacency purposes is *still the second blue*, not the rejected green. Continuing the drag onto the fourth tile (blue) checks its adjacency against that second blue tile, not against the green tile the pointer physically passed over — so unless that fourth tile happens to be a direct hex-neighbor of the second blue tile (not merely "next in the line" past the skipped one), it's rejected too. The path never grows past `[blue, blue]` for this drag, and releasing does nothing (2 cells, below the minimum). A rejected candidate never becomes part of the path and never becomes the reference point for the next adjacency check — only accepted cells do.
- **Release behavior (confirmed) — releasing over an invalid tile no longer cancels an otherwise-valid chain.** `onPointerUp` does not perform any legality check of its own and does not care where the pointer currently is — it simply hands whatever `this.path` currently holds (already fully legal-so-far, by construction of the live check above) to `resolveTurn`/`validateChain`, exactly as it does today. This is a direct, structural consequence of live per-step validation, not a separate mechanism to build: since an invalid candidate is rejected the instant the pointer reaches it and never enters `this.path`, the *release position* is irrelevant to what gets submitted. Example: dragging `blue → blue → blue` and then continuing onto a green tile before releasing — the green tile is rejected live (per the rule above) and never joins the path, so `this.path` is already `[blue, blue, blue]` at release regardless of where the pointer physically ends up. Releasing resolves that 3-cell blue chain normally and deals damage — it is **not** cancelled, unlike today's behavior (where the whole path, including the trailing invalid cell, is appended unconditionally and `validateChain` rejects the entire thing on the color mismatch at the last index).

### Rendering

A single white line, at least 4px thick, connecting consecutive cell centers (`cellToPixel`) for the current path — cell-to-cell segments only, no fill/outline shape. Redrawn from scratch on every accepted path change (matching this codebase's existing "simple full redraw over incremental updates" convention already used by `drawBoard`), on its own dedicated `Graphics` object added after `boardLayer` so it renders on top of the tiles. Cleared whenever the drag ends (release already triggers a full `drawBoard()`; the trace graphics object needs its own explicit clear alongside that, since it isn't part of `boardLayer`).

### Architecture

The live per-step check needs the exact same color/special/portal legality rules as `validateChain`, minus two things that only make sense for a *complete* path: the minimum-length/segment-splitting logic, and the "portal must be immediately followed by a stone" lookahead (a portal can legally be the current *last* cell mid-drag; that lookahead is still enforced, unchanged, by `validateChain` at release).

New export in `src/core/chain.ts`:

```ts
canExtendChain(grid: HexGrid, path: CellCoord[], candidate: CellCoord): boolean
```

Returns whether `candidate` may legally extend `path` (assumed non-empty and already legal so far): adjacency to `path[path.length - 1]`, not already present in `path`, and the color rule above (replaying `path` to determine whether a color has been decided yet and whether a portal has already been used). This shares its rule logic with `validateChain`'s existing per-cell walk rather than duplicating a second copy of the color/special/portal rules — the exact refactor shape (e.g. a small internal shared step helper) is left to the implementation plan, since it's a mechanical extraction, not a design decision.

`validateChain` itself is otherwise unchanged — it remains the sole authority at release time, run exactly as before on whatever path the scene hands it.

`BattleScene.ts` changes:
- New field `traceGraphics: Phaser.GameObjects.Graphics`, created in `create()` after `boardLayer`.
- New method `drawTraceLine()`: clears `traceGraphics`; if `path.length >= 2`, strokes a 4px white polyline through `cellToPixel(cell)` for each cell in `path`, in order.
- `onPointerDown`: resets `path` to `[cell]` as today, then clears the trace line (no segments yet for a 1-cell path).
- `onPointerMove`: replace the current unconditional-append logic with: ignore if not on a cell or same as last cell; if the cell is the second-to-last path entry, pop the last cell (backtrack) and redraw the trace line; else if the cell is already elsewhere in the path, ignore (unchanged); else call `canExtendChain` — on `true`, push and redraw the trace line, on `false`, ignore.
- `onPointerUp`: clear the trace line alongside the existing full redraw.

### Testing

- `tests/core/chain.test.ts`: unit tests for `canExtendChain` — extending with a matching stone; rejecting a mismatched stone once a color is locked; always allowing a special tile; allowing a portal when none used yet; rejecting a second portal; rejecting a non-adjacent cell; rejecting a revisit. `canExtendChain` is a pure function over `HexGrid`/`CellCoord`, fully unit-testable without touching the Phaser scene.
- `tests/e2e/battle.spec.ts`: new test mirroring the confirmed example — drag a same-color 3-chain, then drag back onto the second cell before releasing, and assert HP is unchanged (exercises the full backtrack-then-release path through the real scene, the same way the existing "drag shorter than 3 cells does not damage" test exercises stopping early).
- The trace line's actual on-screen rendering is not independently verifiable via Playwright (Phaser draws to canvas; there's no debug DOM hook exposing the current path or line state, and adding one is out of scope here — see `bugs.txt`'s separate debug-info item). Verified by eye during implementation, same as the special-tile icon change was.

## Part 2: Portal Icon

### Fix

In `BattleScene.drawBoard()`'s `portal` branch, add a text label using the same treatment special tiles already get (`TILE_LABEL`-style: 18px font, black, centered on the circle) — 🌈, confirmed to fit the code's existing "rainbow bridge orb" description and to read distinctly from all six special-tile emoji. The circle itself (`0xaa66ff`) is unchanged.

### Testing

Purely visual — no unit-testable behavior change (the portal's game-mechanical behavior in `chain.ts`/`resolution.ts` is untouched; only its on-screen label changes). Verified by eye during implementation, matching the precedent set by the special-tile icon change.

## Out of Scope

- Any new Playwright debug hooks (damage breakdown, destroyed-tile counts, admin tile-spawn) — separate `bugs.txt` item, not touched here.
- Destroy-tile animations — separate, deferred `bugs.txt` item.
- Multi-step backtrack (dragging back more than one cell at a time) — only the single-step case was requested.
- Any change to `validateChain`'s release-time behavior, `resolution.ts`, or `specialTiles.ts`.
