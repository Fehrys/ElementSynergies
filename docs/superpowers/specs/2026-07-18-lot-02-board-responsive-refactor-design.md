# Lot 2 — Gameplay-First Lower Board (design)

## Decision

The puzzle board now defines the geometry of the lower battle band. The
previous direction — fitting the honeycomb to the drawn cutting board in
`battle_bg_lower.webp` — is abandoned: it placed the decor above the
gameplay. The lower band's only job now is to give the puzzle the largest
safe isotropic size the real viewport allows; a future decor pass will be
designed around the puzzle's resulting bounds, not the other way around.

## What changes

- The rendered board (`BattleLayout.board`) is fit to `availableBoardRect`,
  a modestly-inset sub-rect of `layout.table` (which is already the full
  `[0, viewport.width] x [table.y, viewport.height]` lower band — see
  `battleLayout.ts`'s `table` rect). It is no longer constrained by
  `gameplayColumn` (the 560px chrome cap) or by any alignment to the
  drawn cutting-board artwork.
- `battle_bg_lower.webp` is hidden (`setVisible(false)`) in normal
  gameplay. It stays loaded, stays a persistent masked sprite, and stays
  fully available to `?artReview=combatBackground` and
  `?artReview=combatBackground&assetSlots=1` — nothing about the Lot 1
  asset contract, manifest, or file changes.
- A temporary plain surface + a thin responsive frame (both persistent
  `Phaser.GameObjects.Graphics`) stand in for the hidden artwork so the
  band still reads clearly during this refactor.

## What does not change

- `layout.table.y` (the `tableYFraction` formula), `layout.boss`,
  `layout.heroes`, `layout.bossHud`, their depths, and
  `battleBackgroundUpper`'s behavior are untouched. `combatScale` (the
  boss/hero group's responsive scale) keeps deriving from the **old**
  column-constrained board geometry — kept alive internally as
  `legacyBoard` in `computeBattleLayout` — specifically so decoupling the
  rendered board from `gameplayColumn` cannot inflate the boss/hero
  footprint. See `tests/scenes/upperCompositionLock.test.ts`.
- The 32-cell / 7-column / 5-4-alternation honeycomb topology
  (`src/core/grid.ts`) and every puzzle/combat rule are untouched.

## `availableBoardRect` formula

```
minDim = min(lowerBand.width, lowerBand.height)
baseMargin = clamp(minDim * 0.04, 10, 28)
marginLeft = max(baseMargin, safeInsets.left)
marginRight = max(baseMargin, safeInsets.right)
marginBottom = max(baseMargin, safeInsets.bottom)
marginTop = baseMargin
availableBoardRect = {
  x: lowerBand.x + marginLeft,
  y: lowerBand.y + marginTop,
  width: lowerBand.width - marginLeft - marginRight,
  height: lowerBand.height - marginTop - marginBottom,
}
```

A single clamp-based rule, not three per-format constants — see
`src/scenes/boardArea.ts`. Incorporating `safeInsets` into the
left/right/bottom margins keeps `availableBoardRect` inside `safeRect`
even on notched devices; the top edge needs no inset term because
`table.y` is already derived from `safeRect.y`.

## Board-fit formula

```
normalizedBoardBounds = { width: 380, height: 236 }   // scale-1 honeycomb bbox (topology constant)
scale = min(availableBoardRect.width / 380, availableBoardRect.height / 236)
// isotropic; centered on availableBoardRect's full bounds (not just a point)
```

See `computeResponsiveBoardGeometry` in `src/scenes/boardGeometry.ts`. No
upper cap is applied beyond what `availableBoardRect` itself allows — the
old `maxBoardScale` (1.4) only still applies to `legacyBoard`.

## Re-introducing real lower decor later

A future artist pass should paint around `layout.boardFrame`/
`layout.board.tileBounds` at the reference formats, not the other way
around. `battle_bg_lower.webp` remains a valid, available Lot 1 asset —
only its normal-gameplay visibility is off; flipping it back on is a
one-line change in `drawEnvironmentBackground` once new art (or an
explicit decision to keep the plain surface) exists.

## Measured results (post-refactor)

Read directly from `computeBattleLayout` after Task 5 landed (zero safe-area insets):

| | 360x640 | 480x720 | 768x1024 |
|---|---|---|---|
| `lowerBand` (== `table`) | `{x:0, y:326.4, w:360, h:313.6}` | `{x:0, y:367.2, w:480, h:352.8}` | `{x:0, y:522.24, w:768, h:501.76}` |
| `availableBoardRect` | `{x:12.544, y:338.944, w:334.912, h:288.512}` | `{x:14.112, y:381.312, w:451.776, h:324.576}` | `{x:20.0704, y:542.3104, w:727.8592, h:461.6192}` |
| `board.tileBounds` | `{x:12.544, y:379.201, w:334.912, h:207.998}` | `{x:14.112, y:403.312, w:451.776, h:280.577}` | `{x:20.0704, y:547.101, w:727.8592, h:452.039}` |
| `board.visualRadius` | 19.39 | 26.16 | 42.14 |
| `boardFrame` | `{x:6.272, y:372.929, w:347.456, h:220.542}` | `{x:7.056, y:396.256, w:465.888, h:294.689}` | `{x:10.035, y:537.065, w:747.930, h:472.109}` |
| occupancy of the constraining axis (width, at every format) | 100.0% | 100.0% | 100.0% |
| occupancy of the non-constraining axis (height) | 72.1% | 86.4% | 97.9% |

`board.visualRadius` grows strictly 19.39 → 26.16 → 42.14 across the three
formats — at 768x1024 it already exceeds the old legacy cap
(`22 * maxBoardScale(1.4) = 30.8`) by 37%, confirming the puzzle is no
longer capped by the retired column-constrained geometry. The
constraining axis (width, at all three reference formats) is used
exactly 100% by construction; the other axis's growing occupancy
(72% → 86% → 98%) shows the puzzle approaching a square available rect
as the viewport gets taller relative to its lower band.

Phaser object counts before/after 3 forced reflows at 480x720:
`lowerSurface` 1/1, `boardFrame` 1/1, `table` 1/1 (unchanged idempotency
guarantee — see `tests/e2e/board-frame.spec.ts`).
