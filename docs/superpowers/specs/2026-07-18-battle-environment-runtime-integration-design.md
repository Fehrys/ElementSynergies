# Lot 2 — Battle environment runtime integration — design

Date: 2026-07-18
Status: approved

## Goal

Load the two Lot 1 combat-environment backgrounds (`battle_bg_upper.webp`,
`battle_bg_lower.webp`) into the normal `BattleScene` and render them in place
of the current flat placeholders, with zero change to gameplay layout.

## Context

Lot 1 (merged on `main`) produced and validated the two final background
files and marked both `battleBackgroundUpper` / `battleBackgroundLower`
`status: 'available'` in `src/assets/battleEnvironmentAssets.ts`, with real
measured `productionSize`. `computeBattleEnvironmentLayout` already derives
their two placements (band `[0, table.y]` and `[table.y, viewport bottom]`)
from `BattleLayout`. Nothing in Lot 1 loaded these images into Phaser or
rendered them in normal play — `this.load.image()` was explicitly out of
scope. That is this lot's entire job.

Today, normal play instead renders three flat placeholders in `BattleScene.ts`:
- `drawBackground()` — a two-tone gradient full-canvas rect (`backgroundContainer`, `DEPTH.BACKGROUND`).
- `drawEnvironment()` — an asymmetric cupboard (left) / hanging cookware (right) / alcove arch silhouette (`environmentContainer`, `DEPTH.ENVIRONMENT`) — this is the placeholder stand-in for the cooking station and food reserve that Lot 1's `ASSET_CONTRACT.md` says are now baked directly into `battleBackgroundUpper`.
- `drawTable()` — a flat brown rect (`tableContainer`, `DEPTH.TABLE`).

All three already no-op under `?artReview=combatBackground` (masked in favor
of the opaque master reference image), a pattern this lot reuses unchanged.

## What changes

1. **Preload.** `BattleScene.preload()` loads both `available` entries of
   `BATTLE_ENVIRONMENT_ASSETS` via `this.load.image(def.key, def.path)`,
   unconditionally (not gated on `artReview` — only the temporary master
   reference image stays conditional).
2. **Two persistent renderers.** A single private helper,
   `drawEnvironmentBackground(role, container)`, lazily creates one
   `Phaser.GameObjects.Image` per role (origin `0.5, 0.5`) the first time it
   runs, adds it once to the role's existing container
   (`backgroundContainer` for `battleBackgroundUpper`, `tableContainer` for
   `battleBackgroundLower` — both containers already sit at the exact depths
   the Lot 1 contract specifies, `DEPTH.BACKGROUND` / `DEPTH.TABLE`), and on
   every call (including every reflow) only repositions/resizes it via the
   existing `computeCoverFit()` helper and updates its mask geometry — never
   destroys or recreates the sprite.
3. **Band-confinement via `GeometryMask`.** Each sprite gets its own
   persistent, never-added-to-the-display-list `Graphics` object
   (`this.make.graphics({}, false)`), turned into a `GeometryMask` once at
   creation (`shape.createGeometryMask()`). On every redraw the mask
   `Graphics` is cleared and re-filled with the current band rect (from
   `computeBattleEnvironmentLayout(activeLayout)` → `placementToRect`), so
   the mask geometry updates every reflow without ever recreating the
   `GeometryMask` wrapper. Both bands come from the exact same
   `layout.table.y` (no independently-computed seam), so the seam can never
   drift between the two masks.
4. **Cover fit.** Reuses `computeCoverFit()` from `combatBackgroundReview.ts`
   unchanged (already Phaser-free, role-agnostic, and already unit-tested) —
   source = the manifest's real `productionSize`, viewport = the band's
   `width`/`height`. The fit's returned center point is offset by the band's
   own `x`/`y` to place the sprite in global stage coordinates (all
   containers sit at `(0,0)` scale 1, per the existing convention).
5. **Placeholder retirement.** `drawBackground()` and `drawTable()` are
   repointed to `drawEnvironmentBackground(...)` — their old flat-color/rect
   bodies are removed. `drawEnvironment()` becomes a permanent no-op
   (`removeAll` only): the cupboard/cookware placeholder it drew is exactly
   what `ASSET_CONTRACT.md` says is now baked into `battleBackgroundUpper`,
   so keeping it would double the cooking-station/food-reserve decoration.
   The `environmentContainer` itself is kept (future non-background props,
   and so `getLayerObjectCounts().environment` keeps existing as a stable
   key for e2e).
6. **Art review mode unchanged.** `drawEnvironmentBackground` no-ops (and
   clears its container) whenever `artReviewMode === 'combatBackground'`,
   exactly like the three placeholders did — so the opaque master reference
   image remains the only thing drawn in that mode; the two real backgrounds
   never fight it for the same pixels. `assetSlots=1`'s guide rects are
   unaffected (`drawAssetSlots()` is untouched — it already only draws
   diagnostic rects from the same `computeBattleEnvironmentLayout`, it never
   depended on whether the real textures were loaded).

## What does not change

- Gameplay layout: `layout.table.y`, the combat/prep separation, boss/hero/HUD
  positions, the 32-cell grid, `tileBounds`, the 360×640 / 480×720 / 768×1024
  responsive behavior.
- `computeBattleEnvironmentLayout`, `computeCoverFit`, the manifest — all
  reused as-is (already exactly fit for this purpose per the Lot 1 design).
- `src/scenes/depth.ts`.
- The two binary WebP files — not touched, resized, cropped, or re-encoded.
- `assetSlots=1` overlay geometry/behavior (still purely diagnostic rects).

## Depth / z-order

| Layer | Container | Depth | Content after Lot 2 |
|---|---|---:|---|
| Upper background | `backgroundContainer` | `DEPTH.BACKGROUND` (0) | `battleBackgroundUpper` sprite |
| (retired) | `environmentContainer` | `DEPTH.ENVIRONMENT` (10) | always empty |
| Lower background | `tableContainer` | `DEPTH.TABLE` (40) | `battleBackgroundLower` sprite |
| Board | `boardLayer` | `DEPTH.BOARD` (50) | tiles (unchanged, draws over the lower background) |

## Crop / seam risk

Cover-fit always scales up until both band dimensions are covered, so one
axis typically overflows: laterally on narrow phones (both images are wider
than tall relative to their bands), which is expected and acceptable per
`ASSET_CONTRACT.md`. The `GeometryMask` clips that overflow to the exact band
rect on every reflow, so no image can bleed into the other band's territory.
If a 1px seam appears from WebGL rasterization only (not present in the
Node-computed rect), it will be documented and fixed at the mask-geometry
level (e.g. a sub-pixel overlap on one mask only) rather than by moving
`layout.table.y`.

## Test plan

- Unit: extend `tests/scenes/battleEnvironmentLayout.test.ts` coverage is
  already sufficient for the placement math (Lot 1). Add
  `tests/scenes/combatBackgroundReview.test.ts` cases only if a new pure
  helper is introduced (not expected — `computeCoverFit` is reused as-is).
- E2E: extend `tests/e2e/asset-slots.spec.ts`'s neighborhood is about the
  diagnostic overlay, not the real textures — add a new
  `tests/e2e/environment-backgrounds.spec.ts` covering: normal-mode presence
  (texture keys loaded, no Phaser/network errors, exactly one sprite per
  container), reflow idempotency (no accumulation across repeated
  `forceReflow`), the three mandatory formats, and that `artReview` /
  `assetSlots` continue to behave exactly as before.
- Visual baselines: `tests/e2e/visual-baseline.spec.ts` will legitimately
  change (the flat placeholders are replaced by real art) — regenerate,
  inspect, and only then commit the three PNGs.
