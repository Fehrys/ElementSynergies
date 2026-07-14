# Plan: align battle layout to the combat background art target

See design doc: `2026-07-14-align-layout-to-combat-background-design.md`.

## Steps

1. **`boardGeometry.ts`**: add `boardVerticalBias` and `columnSpacingReduction` to
   `BoardGeometryInput`; apply the vertical bias in the `originY` formula and subtract
   the (scaled) spacing reduction from `colWidth` after scale selection, before building
   `scaledBboxW`. Keep scale-selection math (`horizontalFit`/`verticalFit`, `BBOX_WIDTH`)
   untouched.

2. **`compositionLayout.ts`**: delete `computeTableBounds` and `MIN_TILE_TOP_PADDING`
   (no longer consumed). Leave `computeTableSpan`, `computePlaceholderLayout`,
   `computeBossHudLayout`, `computeLayoutRegions` untouched.

3. **`battleLayout.ts`**:
   - shift `DEFAULT_BATTLE_LAYOUT_POLICY.bands` (`topHud`/`monster`/`hero` +4pts, `board`
     absorbs it, `safeBottom` unchanged);
   - add `boardVerticalBias: 0.58` and `columnSpacingReduction: 3` to the policy;
   - thread both through `resolveBoardGeometryInput`;
   - replace the `computeTableBounds(...)` call with the new full-width/separation-line
     formula for `table`; drop the now-unused `tileBoundsLocal` construction and the
     `computeTableBounds` import.

4. **`BattleScene.ts`**: update `drawTable()` to render the new full-bleed rectangle
   (flat rect + darker rear-edge band) instead of the old tile-hugging rounded rect. No
   other scene changes.

5. **Update existing unit tests** (`tests/scenes/compositionLayout.test.ts`,
   `tests/scenes/battleLayout.test.ts`) to the new baseline numbers — run the suite,
   read the actual computed values, and assert those (never hand-transcribed) — and
   **add new tests** for: table's new shape/position, board's downward shift, column
   pitch reduction (colWidth shrinks; rowHeight/visualRadius/hitRadius don't), hero/boss/
   HUD downward shift, no-rotation/no-deformation, and resize stability. Delete/replace
   the old `computeTableBounds` describe block and the "table keeps minimumTablePadding
   around the tiles" test (no longer meaningful now that table is always full-bleed) with
   an equivalent check against the padding-driven `boardWidthBand` widening it still
   protects.

6. **Manual visual check** via the dev server at 480×720 in normal mode, then
   `?seed=1&artReview=combatBackground` and `?seed=1&artReview=combatBackground&artGuides=1`,
   to confirm the composition reads better against the reference before locking in
   baselines. Also spot-check 360×640 and 768×1024 for gross regressions (nothing
   overflowing, board still inside the column, heroes still above the board).

7. **Run the full gate**: `npm test`, `npm run test:e2e`, `npm run build`.
   `visual-baseline.spec.ts` is EXPECTED to fail/diff at all three sizes (intentional
   composition change) — update those three baselines only after step 6 confirms the
   change matches the intended direction. Re-run the gate to confirm green.

8. **Export refreshed review captures** at 480×720 (`...-review-480x720-updated.png`,
   `...-guides-480x720-updated.png`) and, if useful, 360×640/768×1024 variants, via
   Playwright at the exact viewport sizes, gated on `[data-art-review-ready="true"]`.

9. **Commit** in two steps: `feat: realign battle layout to combat background target`
   (steps 1–4), `test: update layout coverage and visual baselines` (steps 5, 7's
   baseline regeneration, 8's exported PNGs). Do not merge.

10. Final report per the user's requested format; stop for review.
