> **Superseded (2026-07-16).** This design described a **six-asset** contract
> (`upperArchitecture` + `stoneFloor` as two separate layers). The contract
> was subsequently migrated to **five assets**, merging those two into a
> single `battleBackgroundUpper` layer. The current, binding contract is
> `design/production/combat/lot-01-environment/ASSET_CONTRACT.md`; this file
> is kept for historical context only.

# Lot 1 — Environment Asset Production Setup — Design

**Date:** 2026-07-14
**Status:** Approved for planning
**Branch:** `design/lot-01-environment-production-setup` (from `main`, which contains the merged `design/align-layout-to-combat-background` work)

## Goal

`design/references/combat-background-target.png` is now the official art and
composition reference for the combat scene, and the responsive layout has been
realigned to it and validated at 360×640, 480×720 and 768×1024. The next step
is to turn that single master image into **six modular production assets** that
can actually be integrated into Phaser.

No final asset exists yet. This effort therefore prepares the **production
contract and the review tooling** needed to validate the future assets'
placements *before* any art is produced:

1. a production folder tree (`public/assets/battle/environment/` +
   `design/production/combat/lot-01-environment/`);
2. a TypeScript manifest describing the six future assets;
3. a documented contract per asset (`ASSET_CONTRACT.md`);
4. a pure, testable responsive placement model for the six slots;
5. a `&assetSlots=1` extension of the existing `?artReview=combatBackground`
   mode that overlays the six slots on the master image;
6. review captures at the three reference formats;
7. automated geometry validation (Vitest + Playwright).

It stops at that checkpoint. **No final visual integration, no image files.**

## The six assets

| # | Role | File (future) | Phaser key | Format | Alpha |
|---|------|---------------|------------|--------|-------|
| 1 | upperArchitecture | `architecture/battle_bg_arch_upper.webp` | `battle-env-arch-upper` | webp | no |
| 2 | stoneFloor | `floor/battle_floor_stone.webp` | `battle-env-floor-stone` | webp | no |
| 3 | leftHearth | `props/left/battle_left_hearth_cluster.png` | `battle-env-left-hearth` | png | yes |
| 4 | rightLarder | `props/right/battle_right_larder_cluster.png` | `battle-env-right-larder` | png | yes |
| 5 | prepTableBase | `preparation/battle_prep_table_base.webp` | `battle-env-prep-table-base` | webp | no |
| 6 | cuttingBoard | `preparation/battle_prep_cutting_board.png` | `battle-env-cutting-board` | png | yes |

All future paths live under `public/assets/battle/environment/`.

## Non-goals / immutable rules

Nothing in this lot may change, in any code path (including when the review
mode is inactive):

- puzzle rules, the 32 cells, the 7-column 5/4 honeycomb;
- the validated boss / hero / boss-HUD positions;
- the combat/preparation separation, the validated board vertical offset, the
   3-px column-spacing reduction;
- touch zones, combat system, resize/reflow behavior;
- the normal rendering path — it must stay pixel-identical to the committed
  `battle-360x640.png` / `battle-480x720.png` / `battle-768x1024.png`
  baselines, with **no snapshot regeneration**;
- the `?artReview=combatBackground` mode **without** `assetSlots=1`;
- `design/references/combat-background-target.png` (never modified);
- no fake/placeholder image is ever created at the future asset paths
  (`.gitkeep` only for empty dirs).

## Architecture

### Pure placement model — `src/scenes/battleEnvironmentLayout.ts`

Phaser-free and DOM-free (same convention as `battleLayout.ts` /
`boardGeometry.ts`). It consumes an **already-computed** `BattleLayout` and
returns six `AssetPlacement`s — it never feeds anything back into the gameplay
layout, and copies no coordinate from the reference image. Semantic sources:

- `layout.background` (viewport), `layout.gameplayColumn`;
- `layout.environment.horizonY` (`bands.hero.top` — where wall meets floor);
- `layout.table.y` (the stone/wood separation, already including
  `tableTopGap`) and `layout.table` itself;
- `layout.board.tileBounds` (+ configurable margins) for the cutting board;
- `layout.bands.monster.top` for the clusters' upper extent.

Geometry (all anchor-point + origin, Phaser-convention):

- **upperArchitecture** — viewport-centered band from the viewport top to
  `horizonY`; the future asset is cover-fitted (single isotropic scale, may
  overflow/crop laterally, never stretched).
- **stoneFloor** — full-width band from `horizonY` to `layout.table.y`
  (semantic frontiers only, never derived from the hero rects).
- **leftHearth / rightLarder** — bottom-anchored to `layout.table.y`, edge-
  anchored to the viewport's left/right edge, rising to
  `bands.monster.top`; width `min(clusterWidthFraction × viewportWidth,
  clusterMaxWidth)` so they compress/crop before ever touching the gameplay
  column's math.
- **prepTableBase** — exactly `layout.table` (full-bleed lower band).
- **cuttingBoard** — centered on the gameplay column; rect =
  `board.tileBounds` expanded by margins expressed as *fractions of
  tileBounds* (so it follows the board's own scale) — never the table/viewport
  width; uniform scaling only.

All tunables live in one `EnvironmentSlotPolicy` object (cluster width
fraction/cap, cutting-board margins), not scattered in code.

### Manifest — `src/assets/battleEnvironmentAssets.ts`

One `BATTLE_ENVIRONMENT_ASSETS` array of six
`BattleEnvironmentAssetDefinition`s: `key`, `path`, `role`, `format`,
`alphaRequired`, `anchor`, `responsivePolicy`
(`viewportCover | viewportBand | edgeCluster | gameplayColumnObject`), `depth`
(from `DEPTH`). **No `this.load.image()` call anywhere** while the files don't
exist; the manifest is inert data + the future single source for paths (never
scattered in `BattleScene.ts`).

### Review-mode extension — `&assetSlots=1`

- `parseAssetSlots(search)` added to `combatBackgroundReview.ts` (pure).
- `BattleScene` gains one always-created-but-usually-empty
  `assetSlotsContainer` at `DEPTH.DEBUG` and an idempotent `drawAssetSlots()`
  in the `applyLayout()` sequence (same pattern as `drawArtGuides()`):
  active **only** when `artReview=combatBackground` *and* `assetSlots=1`.
- Draws six semi-transparent role-colored rects + one small technical label
  per slot (the manifest key) — all rects from `computeBattleEnvironmentLayout`
  over `activeLayout`, recomputed on every reflow, no hand-copied coordinate,
  no generic UI panel.
- DOM surface (only when active): `data-asset-slots="true"`,
  `data-asset-slots-ready="true"` (set only after the first full layout), and
  `data-asset-slots-layout` (serialized six-slot layout, testable without
  canvas reads).

### Production tree

```
public/assets/battle/environment/{architecture,floor,props/left,props/right,preparation}/  (.gitkeep each)
design/production/combat/lot-01-environment/
├─ README.md            (production guide for the lot)
├─ ASSET_CONTRACT.md    (the six contracts)
├─ source/              (.gitkeep — future master/PSD exports)
├─ exports/             (.gitkeep — future validated exports before publish)
└─ review/slots/        (the three slot captures)
```

## Testing strategy

- **Vitest** — `tests/scenes/battleEnvironmentLayout.test.ts`: the 11 required
  geometry properties across 360×640 / 480×720 / 768×1024 (all six computed;
  finite; positive sizes; prepTableBase === layout.table; cutting board
  centered on the column and never viewport-wide on tablet; clusters edge-
  anchored and gameplay-inert; floor ends at the prep start; deterministic
  across two identical computations). Manifest completeness/consistency tests
  (six unique keys/roles, path prefix, png⇔alpha, anchors match placements).
  `parseAssetSlots` cases in `combatBackgroundReview.test.ts`.
- **Playwright** — new `tests/e2e/asset-slots.spec.ts`: activation with
  `assetSlots=1`; inert in normal mode, in review-without-param mode, and with
  `assetSlots=1` alone; resize recomputes the serialized slots (cross-checked
  against the pure functions in Node); no object accumulation across two
  forced reflows; normal rendering unchanged (via the untouched
  `visual-baseline.spec.ts`, no OCR anywhere).
- The three committed baselines stay green with **no** `--update-snapshots`.

## Captures

`design/production/combat/lot-01-environment/review/slots/environment-slots-{360x640,480x720,768x1024}.png`
from `/?seed=1&artReview=combatBackground&assetSlots=1`, gated on
`[data-asset-slots-ready="true"]`, exact viewports. Existing gameplay review
captures in `review/` are never replaced.

## Out of scope

Producing any image, cutting the master, transparent detouring, loading the
six assets, changing the normal render, merging the branch.
