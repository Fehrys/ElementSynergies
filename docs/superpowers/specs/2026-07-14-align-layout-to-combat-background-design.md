# Design: align battle layout to the combat background art target

## Purpose

`?artReview=combatBackground` (see `2026-07-14-combat-background-art-review-design.md`)
exposed a real gap between the responsive `BattleLayout` composition and the validated
master reference `design/references/combat-background-target.png`: the puzzle sits too
high in the cutting board, the boss/heroes float above the alcove/counters, the boss HUD
crowds the very top edge, and the placeholder "table" rectangle only ever tightly wrapped
the tiles instead of reading as a real lower composition band.

This step makes **the reference image the composition target** and re-tunes
`BattleLayoutPolicy` + `boardGeometry` so the computed layout sits closer to it — without
touching gameplay rules, cell count, adjacency, chains, combat, or the responsive
philosophy ("decor compresses before the puzzle").

## Non-goals / immutable rules

Unchanged, still enforced:

- puzzle rules, 32 cells, 7-column 5/4 alternation, adjacency, chain logic, portals,
  special tiles, combat math;
- gameplay-column-centered responsive philosophy and vertical degradation order (chrome
  bands cede height before the board);
- the board stays perfectly upright — no rotation, no perspective, no per-cell
  deformation;
- reasonable touch/hit-radius invariants (`hitRadius` stays the true nearest-neighbor
  half-distance, never ambiguous).

## What changes, and why it is "derived, not copied"

Every change below is expressed as a policy value or a small formula inside the existing
pure layout modules (`battleLayout.ts`, `boardGeometry.ts`, `compositionLayout.ts`) — no
pixel is read off the reference PNG and hard-coded. The reference is used only to judge,
by eye through the existing art-review mode, whether the *direction* (down, tighter,
lower HUD) is enough — never as a coordinate source.

### 1. Composition bands shift down 4 points

`DEFAULT_BATTLE_LAYOUT_POLICY.bands` moves `topHud`, `monster`, and `hero` down by 4
percentage points each (heights unchanged), letting `board`/`safeBottom` absorb it at
the bottom of the chrome stack:

| band     | before   | after    |
|----------|----------|----------|
| topHud   | [0, 8]   | [4, 12]  |
| monster  | [8, 34]  | [12, 38] |
| hero     | [34, 46] | [38, 50] |
| board    | [46, 93] | [50, 93] |
| safeBottom | [93, 100] | [93, 100] (unchanged) |

Effects, all automatic consequences of the existing formulas:

- the boss silhouette (centered in `monster` band) drops ~29px at the 480×720 baseline;
- the boss HUD (`computeBossHudLayout`, anchored to `topHud.top`) drops by the same
  amount, freeing a 0–4% band above it for future top UI;
- heroes (grounded on `hero.bottom`) drop the same amount;
- `tableSpan.top` (`hero.bottom - TABLE_REAR_OVERLAP`) drops too, which — combined with
  change #3 below — pushes the board down.

This is a straight, uniform re-anchoring of the existing percent-based band system; the
vertical-degradation compression logic (`resolveBandRanges`) is untouched and keeps
working the same way relative to the new baseline.

### 2. `layout.table` becomes the lower composition band

`layout.table` no longer "tightly encloses the tile bbox plus padding" (that job is now
implicit — the board always fits comfortably inside the much larger table). It becomes a
full-bleed anchor rectangle for the whole lower half of the scene, derived purely from
the band system already computed above it:

```
table = {
  x: background.x,
  y: bands.hero.bottom,                       // the combat/prep separation line
  width: background.width,                    // full viewport, not the gameplay column
  height: background.height - bands.hero.bottom,
}
```

`bands.hero.bottom` is exactly "the separation between the combat zone (topHud + monster
+ hero) and the prep zone (board + safeBottom)" — already a first-class value, not a
number read off the picture. `computeTableBounds` (the old tile-enclosing helper) is
removed from `compositionLayout.ts`; nothing else consumed it. `computeTableSpan` is
unchanged and keeps driving hero grounding + the board's vertical fit — it is a distinct
concept (the *board's* vertical span) from the new `table` composition rectangle.

### 3. Board gets an explicit vertical bias inside its span

Previously the board was dead-centered in `tableSpan` (`(tableSpanHeight -
scaledBboxH) / 2`). A new `BattleLayoutPolicy.boardVerticalBias` (0 = hugs the span's
top, 1 = hugs its bottom, default composition value `0.58`) generalizes that formula to
`(tableSpanHeight - scaledBboxH) * boardVerticalBias`, nudging the board down inside its
available span — more headroom above the tiles inside the cutting board, better
top/bottom symmetry against the picture's board. `0.5` reproduces today's exact centered
behavior, so the knob is purely additive.

Combined with #1, the board drops roughly 24px at the 480×720 baseline. Tile size and
scale-selection (`horizontalFit`/`verticalFit`/`maxBoardScale`) are untouched by this —
it only shifts where the already-sized bbox sits inside its span.

### 4. Column pitch tightens by a few reference pixels

A new `BattleLayoutPolicy.columnSpacingReduction` (game units at the 480 reference,
scaled by the same isotropic `scale` everywhere else — 3px at baseline) is subtracted
from `colWidth` **after** the isotropic scale has already been chosen from the original,
unmodified `COL_WIDTH`/`BBOX_WIDTH` constants. This means:

- scale selection (`horizontalFit`, `verticalFit`, `maxBoardScale`, the 320px widening
  policy, the `targetMinVisualRadius`/`targetMinHitRadius` targets) is byte-for-byte
  unchanged;
- `rowHeight` and `visualRadius` (tile size) are byte-for-byte unchanged;
- only `colWidth` (and therefore `tileBounds.width`, `originX` centering, and
  `cellToPixel`'s horizontal step) shrinks slightly, tightening the honeycomb
  horizontally without touching legibility or hit-radius;
- `hitRadius`'s governing constraint stays the same-column vertical distance
  (`rowHeight`), which is untouched — a 3px (reference) column-pitch reduction is far
  below the margin needed to make a diagonal neighbor pair tighter than that, so no new
  ambiguous-tap risk is introduced (checked analytically: diagonal spacing stays
  ≈58px vs. the governing 48px `rowHeight`).

### 5. `drawTable()` follows the new rectangle

The placeholder rendering (masked entirely in art-review mode) switches from a tightly
tile-hugging rounded rect to a full-bleed flat rect with a darker rear-edge band, matching
what `layout.table` now represents. Purely cosmetic; not gameplay.

## Architecture

No new modules. Changes land in the existing three pure files:

- `battleLayout.ts` — `DEFAULT_BATTLE_LAYOUT_POLICY.bands` values, new
  `boardVerticalBias`/`columnSpacingReduction` policy fields threaded through
  `resolveBoardGeometryInput`, and the `table` rectangle formula in
  `computeBattleLayout`.
- `boardGeometry.ts` — `BoardGeometryInput` gains `boardVerticalBias` and
  `columnSpacingReduction`; `computeBoardGeometry` applies them after scale selection.
- `compositionLayout.ts` — removes the now-unused `computeTableBounds` +
  `MIN_TILE_TOP_PADDING`.
- `BattleScene.ts` — only `drawTable()`'s rendering changes; no new state, no new
  containers, no change to the art-review wiring (it keeps reading `activeLayout.table`
  for guides, which now shows the correct new rectangle for free).

`BattleScene` stays a thin adapter throughout.

## Testing strategy

- Update `tests/scenes/compositionLayout.test.ts` and `tests/scenes/battleLayout.test.ts`
  hard-coded band/table/board numbers to the new baseline (values captured from the
  actual implementation, not hand-derived, to avoid transcription drift).
- Add coverage for: the new `table` full-width/separation-line definition, the board's
  downward shift via `boardVerticalBias`, the hero/boss/HUD downward shift via the new
  bands, the column-pitch reduction (colWidth shrinks, rowHeight/visualRadius/hitRadius
  do not), no-rotation/no-deformation (grid stays axis-aligned — `cellToPixel` output for
  a fixed geometry is a pure translation grid, verified via a spacing/collinearity
  assertion), and resize stability (existing invariants — board inside column, table
  inside/around it — re-asserted at the new baseline).
- Visual baselines (`battle-360x640.png`, `battle-480x720.png`, `battle-768x1024.png`)
  are expected to change and will be regenerated after visually confirming the new
  composition through `?artReview=combatBackground[&artGuides=1]`.
