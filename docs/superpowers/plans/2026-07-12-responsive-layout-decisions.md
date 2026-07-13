# Responsive Battle Layout — Decisions of Record

> This document — **not** the audit spec — is the decision of record for the tunable
> `BattleLayoutPolicy` values and the responsive composition behavior. It is written
> in M6 and updated in M7 (the 320×568 support classification). Every value below is
> encoded in `src/scenes/battleLayout.ts` (`DEFAULT_BATTLE_LAYOUT_POLICY` + the
> `resolveTileWidthFraction` / `resolveBandRanges` resolvers). `boardGeometry.ts`
> stays policy-free.

Date: 2026-07-13. Milestone: M6 (responsive tuning).

## Baseline neutrality (non-negotiable)

At **480×720 with null insets** the composition is **pixel-identical** to the
pre-refactor scene: `tileBounds = {x:50, y:400, width:380, height:236}`,
`ORIGIN_X=72`, `ORIGIN_Y=422`, `visualRadius = hitRadius = 22`, `colWidth=56`,
`rowHeight=48`. This is enforced by the committed 480×720 Playwright screenshot
(captured in M0 from the starting commit) and by Vitest neutrality pins. Every
decision below leaves 480×720 untouched.

## Horizontal width policy (`resolveTileWidthFraction`)

- **Baseline tile-width fraction** = `legacyBoardWidthAt480 / LEGACY_VIEWPORT_WIDTH`
  = `380 / 480 ≈ 0.7917` (derived, never stored, so it can never drift).
- At/above `narrowWidthThreshold = 480` (column width): use the baseline fraction.
- Below it: interpolate **up** toward `maxTileWidthFraction = 0.94` linearly as the
  column narrows, **saturating at a 320 column** (`MAX_FRACTION_AT_WIDTH`).
- The puzzle is **overflow-safe by construction**: the fraction stays `< 1` and the
  scaled bbox is centered in the column (⊆ safeRect), so `tileBounds` can never
  leave the safeRect. Order applied (audit): raise fraction → reduce horizontal
  margins → use nearly the full safeRect width → rely on `hitRadius > visualRadius`
  → escalate to this doc if `targetMinVisualRadius` is still unreachable (feasible
  result wins; never a blind floor that overflows).
- **The table surface tracks the puzzle:** the effective table width fraction is
  `max(tableWidthFraction, resolveTileWidthFraction(column))`, so the preparation
  table always **encloses** the board bbox (tiles never overhang the table) while
  still fitting inside the column. At 480 the tile fraction is below `0.88`, so the
  table stays at its baseline `0.88` (neutral).

## Vertical degradation order (`resolveBandRanges`)

When vertical space is scarce, reclaim it in the audit order — the **board band is
reduced last**:

- At/above a **720** reference `safeRect` height (incl. 480×720): exact baseline
  band ranges (neutral).
- Below it (down to a **480** floor where it saturates): the chrome bands cede
  height to the board — `topHud` by up to **3** percentage points (8→5), `hero` by
  up to **4** (12→8); the **monster** band keeps its height; the **board** grows by
  the ceded total (47→54). Bands stay contiguous and span `[0, 100]`.
- Net effect: on short/landscape viewports the board keeps (and grows) its vertical
  share; `topHud`/`hero` shrink first.

## Radius targets vs. floors

- **`visualRadius` is always `STONE_RADIUS * scale`** (the same isotropic factor as
  `colWidth`/`rowHeight`) — **never** floored or grown independently. The only lever
  that raises it on narrow viewports is a larger `scale` from the width policy /
  vertical budget.
- **`targetMinVisualRadius = 16`** is a *target*, reported via
  `targetVisualRadiusSatisfied`. With the widening, a **320×720**-class viewport
  reaches `visualRadius ≈ 17.4` (target met). Without widening the bare 320 value
  would be `≈ 14.7`; that ~14.7 is the best-effort floor if a viewport is narrower
  than 320 (e.g. a 320 device with heavy lateral insets).
- **`targetMinHitRadius = 20`** is the one true floor, applied only to `hitRadius`
  and capped at `maximumHitRadius = minCenterDistance/2 − 1e-6` (so a real tie point
  is never admissible for two cells).

## Column cap (desktop / tablet)

- **`maxGameplayColumnWidth = 560`** (chosen over 520 / 600). 520 wastes usable
  tablet width; 600 starts to feel wide and thins the side environment on desktop.
  560 keeps a comfortable single-column play area, centered, with the decorative
  background spanning the full viewport on either side.

## Supported viewports

- **Fully supported (target radius met): 360×640 and up**, and **320×568** after the
  widening (`visualRadius ≈ 17.4 ≥ 16`). *(M7 confirms/finalizes the 320
  classification against the full matrix.)*
- **Best-effort (below the 16 target): columns narrower than 320** (e.g. 320 device
  with large lateral safe-area insets) — still overflow-free and playable via the
  hit-radius floor, but tiles are visibly small.

## Mobile-landscape policy

Same policy path; short heights trigger the vertical degradation (chrome compresses,
board reduced last). No separate landscape layout; the column cap + centering keep
the play area usable, with more environment revealed on the sides.

## Tablet / desktop policy

Column capped at 560 and centered in the safeRect; background spans the full
viewport; the table never stretches beyond the column; heroes stay grounded on the
table rear edge and above the board.

## HiDPI / DPR decision

**Layout is DPR-independent by construction** — `computeBattleLayout` takes no
`devicePixelRatio` input; DPR affects only the renderer backing store, never the
computed layout. No DPR cap is applied. Verified structurally (arity + deep-equal)
and end-to-end (a `deviceScaleFactor: 3` context yields a layout deep-equal to the
DPR-1 model, with pointer accuracy preserved).

## Open decisions (deferred to the device checklist / M7)

- Final "supported" vs "best-effort" wording for 320×568 is confirmed in M7 against
  the full matrix and cross-linked from the device checklist.
- True-notch inset behavior after rotation, high-DPR visual sharpness, and sustained
  frame rate across resize/rotation are **device-only** gates (not automatable) —
  see `2026-07-12-responsive-device-checklist.md` (created in M7).
