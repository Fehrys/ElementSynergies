# Responsive Battle Layout — Decisions of Record

> This document — **not** the audit spec — is the decision of record for the tunable
> `BattleLayoutPolicy` values and the responsive composition behavior. It is written
> in M6 and updated in M7 (the 320×568 support classification). Every value below is
> encoded in `src/scenes/battleLayout.ts` (`DEFAULT_BATTLE_LAYOUT_POLICY` + the
> `resolveTileWidthFraction` / `resolveBandRanges` resolvers). `boardGeometry.ts`
> stays policy-free.

Date: 2026-07-13. Milestones: M6 (responsive tuning) + M7 updates (usable-width
support classification, `minimumTablePadding`, radius-wording correction, DPR
decision split). Policy values live in `DEFAULT_BATTLE_LAYOUT_POLICY`:
`maxGameplayColumnWidth 560`, `legacyBoardWidthAt480 380`, `maxTileWidthFraction
0.94`, `narrowWidthThreshold 480`, `boardHeightFraction 0.85`, `tableWidthFraction
0.88`, `minimumTablePadding 8`, `targetMinVisualRadius 16`, `targetMinHitRadius 20`,
`maxBoardScale 1.4`.

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
- **The table surface encloses the puzzle with a real margin:** the effective table
  width is `clamp(tileBounds.width + 2·minimumTablePadding, 0.88·column, column)`, so
  the preparation table always wraps the board bbox with **≥ `minimumTablePadding = 8`
  game units** on each side (tiles never sit flush with, or overhang, the table edge),
  while never exceeding the column. This was confirmed necessary from the M7
  narrow-viewport screenshots (320×568 / 360×640), where the earlier
  `max(fraction, tileFraction)` rule left ~0 px of margin. At 480 the padding
  requirement is already satisfied by the `0.88` baseline, so the table stays at
  `0.88` (**neutral**). On very narrow columns the padding is best-effort (the table
  is capped at the full column width).

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
  `colWidth`/`rowHeight`) — **never** floored or grown independently. It has **no
  independent floor**: it decreases continuously with the usable width. The only
  lever that raises it on narrow viewports is a larger `scale` from the width policy /
  vertical budget. On narrow viewports where the horizontal fit binds at the
  saturated fraction, `visualRadius = 22 · gameplayColumn.width · 0.94 / 380`.
- **`targetMinVisualRadius = 16`** is a *target*, reported via
  `targetVisualRadiusSatisfied`, and it is a function of the **usable
  `gameplayColumn` width** (not the raw CSS viewport width). Solving the formula
  above, the target is met at a usable column width of **≈ 294** game units and
  above; below that the radius is simply smaller.
- **On the 14.7 figure:** `≈ 14.7 px` is **not a floor**. It is only an *indicative /
  observed* value — the approximate `visualRadius` of a bare 320 px column **without**
  the widening policy, and equivalently the value observed around **≈ 270** usable
  units **with** the `0.94` fraction. `visualRadius` keeps decreasing below it as the
  usable width shrinks further; there is no clamp.
- **`targetMinHitRadius = 20`** is the one true floor, applied only to `hitRadius`
  and capped at `maximumHitRadius = minCenterDistance/2 − 1e-6` (so a real tie point
  is never admissible for two cells).

## Column cap (desktop / tablet)

- **`maxGameplayColumnWidth = 560`** (chosen over 520 / 600). 520 wastes usable
  tablet width; 600 starts to feel wide and thins the side environment on desktop.
  560 keeps a comfortable single-column play area, centered, with the decorative
  background spanning the full viewport on either side.

## Supported viewports (classified on USABLE width, M7-final)

Support is a function of the **usable play width** — `safeRect` / `gameplayColumn`
width in game units — **not** the raw CSS viewport width. A device advertised as
"320 px" with lateral safe-area insets has *less* usable width than 320, so the
classification is stated in usable-width terms:

- **Fully supported (target radius met): usable `gameplayColumn` width ≥ ≈ 294 game
  units.** This includes **320×568 with null or moderate lateral insets**
  (usable ≈ 320 → `visualRadius ≈ 17.4 ≥ 16`) and every larger portrait/tablet
  viewport, plus mobile landscape (vertical fit binds but the wide column keeps the
  radius comfortable).
- **Best-effort (below the 16 target): usable width < ≈ 294 game units** (e.g. a
  320 device with heavy lateral safe-area insets). The layout stays **overflow-safe
  and playable** — `tileBounds ⊆ safeRect`, `hitRadius` floored up to
  `maximumHitRadius` — but the tiles are visibly small and the `visualRadius` target
  is reported unmet (`targetVisualRadiusSatisfied === false`).

Concretely, **320×568 is fully supported** at null/moderate lateral insets; it drops
to best-effort only once insets pull the usable column below ≈ 294. This is asserted
in `battleLayout.test.ts` ("M7 — 320x568 support classification") and cross-linked
from the device checklist.

## Mobile-landscape policy

Same policy path; short heights trigger the vertical degradation (chrome compresses,
board reduced last). No separate landscape layout; the column cap + centering keep
the play area usable, with more environment revealed on the sides.

## Tablet / desktop policy

Column capped at 560 and centered in the safeRect; background spans the full
viewport; the table never stretches beyond the column; heroes stay grounded on the
table rear edge and above the board.

## Canonical visual-regression CI platform (DEFINITIVE)

There is no pre-existing CI reference platform; it is **defined here**:

- **Canonical visual CI platform: GitHub Actions, `runs-on: windows-2022`** (see
  `.github/workflows/ci.yml`). This is the single source of truth for the visual
  baselines — WebGL/font rasterization varies by OS/GPU, so exactly one platform is
  canonical.
- **Resolved Playwright version: `1.61.1`** (from `package-lock.json`; `^1.48.0` in
  `package.json` is only the floor), with Playwright-managed Chromium.
- **The `-win32` snapshot family is canonical.** The three committed snapshots
  (`battle-480x720-win32.png`, `battle-360x640-win32.png`,
  `battle-768x1024-win32.png`) are the candidate baselines until validated on the
  actual GitHub-hosted `windows-2022` runner; a local win32 capture may regenerate
  *locally* but must not overwrite the committed baseline without that validation.
- **No Linux snapshots are currently maintained.** Linux is *not* the assumed or
  natural reference platform. An optional Linux **non-visual** job (tsc/build/unit,
  or headless e2e without screenshot comparison) may be added later, but it is out of
  scope for the current snapshot-portability resolution.
- Baseline (re)capture is a manual, reviewed step: `workflow_dispatch` with
  `update_visual_snapshots=true` recaptures on the windows-2022 runner and uploads the
  result as the `windows-2022-visual-snapshots` artifact; the workflow never
  auto-commits generated snapshots.

## HiDPI / DPR decision

Two distinct decisions, with different statuses:

- **Layout is DPR-independent — DEFINITIVE.** `computeBattleLayout` takes no
  `devicePixelRatio` input; DPR affects only the renderer backing store, never the
  computed layout. Verified structurally (arity + deep-equal) and end-to-end (a
  `deviceScaleFactor: 3` context yields a layout deep-equal to the DPR-1 model, with
  pointer accuracy preserved). This will not change.
- **No cap on the renderer backing-store resolution — PROVISIONAL.** We currently let
  Phaser render at the device's native DPR (no downscale cap). This is acceptable as
  the current state but is **subject to real-device performance validation** — if a
  very high-DPR device shows frame-rate/GPU-memory problems, a backing-store cap may
  be introduced later. That is a rendering decision only; it would **not** affect the
  DPR-independent layout above. Tracked in the device checklist (R4/R5/R8).

## Open decisions (deferred to real-device sign-off)

Closed in M7: the 320×568 classification (now stated in usable-width terms above),
the radius wording, and `minimumTablePadding`. Remaining open items are **device-only**
(not automatable):

- Whether to introduce a **backing-store DPR cap** (see the provisional decision
  above) — depends on real-device frame-rate/GPU-memory measurements.
- True-notch safe-area insets **after rotation**, high-DPR visual sharpness, pointer
  accuracy on a physical touchscreen, and sustained frame rate across resize/rotation
  — all in `2026-07-12-responsive-device-checklist.md`.
