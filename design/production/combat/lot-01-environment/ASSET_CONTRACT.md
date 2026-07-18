# Lot 1 — Environment Asset Contract

> **Supersedes the five-asset contract (2026-07-18).** The five-asset version
> (`battleBackgroundUpper` + `prepTableBase` + `cuttingBoard` + `leftHearth` +
> `rightLarder`) is replaced by a **two-background** contract: one opaque
> painting for the upper scene, one opaque painting for the lower
> preparation zone. The cooking station and food reserve are now baked into
> the upper background instead of being separate edge clusters; the table
> and cutting board are now baked into the lower background instead of being
> separate assets. See "Why two backgrounds" below for the rationale. The
> historical specs/plans (`docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`,
> `docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`,
> `docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`,
> `docs/superpowers/plans/2026-07-15-lot-01-contract-finalization.md`) describe
> the superseded six- and five-asset versions and are kept for history only.
> This document is the current, binding contract.

Binding production contract for the two combat-environment background assets
derived from the master reference
`design/references/combat-background-target.png`.

## Why two backgrounds

The five-asset contract composed the scene from independently placed layers
(architecture, table, cutting board, two edge prop clusters), each cut,
aligned and depth-sorted at runtime. Collapsing this into two full-band
paintings:

- gives one artist a single perspective and light pass per band instead of
  reconciling five separately-lit pieces — better artistic coherence;
- removes the seams between architecture and the prop clusters, and between
  the table and the cutting board — less of a "collage" look;
- removes almost all alpha-channel cutout work (both new assets are opaque
  WebP; only the old cutting board and two prop clusters ever needed true
  alpha);
- is simpler to produce (two exports instead of five) and simpler at runtime
  (two placements, two depths, two future `this.load.image()` calls instead
  of five);
- fits a scene that is, for Lot 1's purposes, mostly static — small animated
  overlays (flames, embers, smoke, steam, glow) can be layered on top later
  if needed, but are explicitly out of scope for these two background
  contracts.

## Shared rules for every asset in this lot

- **Source of truth for placement** is the runtime layout model
  (`src/scenes/battleLayout.ts` → `src/scenes/battleEnvironmentLayout.ts`).
  Every target rectangle below is a *formula over `BattleLayout`*, never a
  pixel coordinate measured on the master image. The reference frame the art
  team should proof against is 480×720 (the composition baseline), but the
  formulas are what bind.
- **Manifest**: keys/paths/anchors are mirrored 1:1 in
  `src/assets/battleEnvironmentAssets.ts`. If this contract and the manifest
  ever disagree, fix the discrepancy before producing art.
- **Availability**: both backgrounds are `status: 'pending'`. A draft file
  may already sit at a `pending` asset's path (e.g. the current
  `battle_bg_upper.webp`, produced under the superseded five-asset contract)
  — its presence does not promote the asset. Only a human editing the
  manifest's `status` to `'available'` (with the file's real measured
  `productionSize`) marks a background as final. See
  `tests/assets/environmentAssetFiles.test.ts`.
- **No gameplay content**: no asset may contain hexagon cells, stones,
  ingredients placed on the cutting area, characters, HUD, or text.
- **Uniform scaling only**: assets are never stretched anisotropically at
  runtime — both backgrounds cover-fit their full-width band with a single
  isotropic scale (`responsivePolicy: 'viewportCover'`), centered
  horizontally, cropping/extending laterally as needed.
- **Style**: follow `design/DESIGN_PRINCIPLES.md`, `design/COMBAT_SCREEN.md`,
  `design/VISUAL_COMPOSITION.md`, `design/references/ART_TARGET.md` — warm
  handcrafted fantasy kitchen, organic silhouettes, controlled asymmetry,
  aged materials. The master image defines the palette and lighting.
- **Validation** (both assets): once `available`, the export placed in the
  `assetSlots=1` review mode must fill its colored slot at 360×640, 480×720
  and 768×1024 without revealing gaps at the documented seam, and the three
  normal-mode visual baselines must remain untouched (assets are not loaded
  in Lot 1; this criterion binds the *future* integration lot).

Depth values reference `src/scenes/depth.ts`.

---

## Target dimensions

| Asset | Status | Target dimensions | Ratio |
|---|---|---:|---:|
| `battle_bg_upper.webp` | pending | 1536 × 1024 (target) | 1.500 |
| `battle_bg_lower.webp` | pending | 1536 × 1280 (target) | 1.200 |

Rules:

- For a `pending` asset, dimensions are recommendations for the
  `source/` → `exports/` pipeline, mirrored by the manifest's documentary
  `targetSize` field — never a runtime coordinate.
- Once an asset is produced and its status flips to `available`, its
  manifest entry switches from `targetSize` to a `productionSize` field
  holding the file's real, measured dimensions (read from its own WebP
  header), and `tests/assets/environmentAssetFiles.test.ts` validates the
  shipped file against it.
- Both final files must be opaque WebP — no anisotropic stretch at export
  time or at runtime.

---

## Asset 1 — Battle background (upper)

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/background/battle_bg_upper.webp` |
| Status | **Pending** — a draft file exists at this path from the superseded five-asset contract but does not yet bake in the integrated left/right decor this contract requires |
| Phaser key | `battle-env-bg-upper` |
| File type | WebP |
| Transparency | **Opaque** — no alpha |
| Anchor | `(0.5, 0)` — top-center |
| Depth | `DEPTH.BACKGROUND` (0), drawn first |
| Responsive policy | `viewportCover` |

**Artistic role.** The entire upper scene in one painting: vault/ceiling,
central wall, arches, the boss alcove, the stone combat floor beneath the
boss and heroes, down to the stone/wood separation, **plus** the complete
cooking station (left) and complete food reserve (right) integrated directly
into the same painting. The cooking station and food reserve are no longer
separate assets.

**Logical target rect.** Full viewport width, from the viewport top down to
`layout.table.y` (the stone/wood separation). Formula: `x ∈ [0, viewport.width]`,
`y ∈ [0, table.y]`.

**Responsive behavior.** Cover-fitted into its band with a single isotropic
scale (`computeCoverFit`-style): scaled until both the band's width and
height are covered, centered horizontally. It may overflow the viewport; it
is never stretched non-uniformly.

**Crop behavior.** Lateral crop on narrow phones is expected and acceptable;
on tablets more of the lateral architecture (and more of the cooking
station/food reserve) becomes visible. Paint the composition
center-weighted; the cooking station and food reserve sit in the outer
thirds and should survive partial lateral cropping without losing their
silhouette.

**Must include.** Vault/ceiling, central wall, the boss alcove (a calm,
low-contrast zone directly behind the boss silhouette), the stone ground
plane under the boss and heroes, the complete cooking station on the left
(oven/hearth, fire glow, hanging cauldron, utensils), the complete food
reserve on the right (shelving, jars, sacks, produce), baked ambient
lighting consistent with the master, and the transition down to the
stone/wood separation with subtle contact shading.

**Must exclude.** Any table, any cutting board, any puzzle element,
characters, HUD, text. No small animated overlay (flames, embers, smoke,
steam, glow) is part of this contract — those may be layered on separately
later if needed.

**Layout relationship.** Sits behind the boss (`layout.boss`) and the boss
HUD; the alcove's calm center must align with `environment.archCenter` (the
gameplay column's center at the monster band's vertical middle) — which the
cover fit guarantees as long as the alcove is horizontally centered in the
painting. Its bottom edge is exactly `layout.table.y`, where
`battleBackgroundLower` (Asset 2) begins (shared edge, unit-tested).

**Technical validation.** Opaque; covers the `battleBackgroundUpper` slot at
all three review formats with no visible stretch; boss and HUD remain fully
readable over it; ends exactly where `battleBackgroundLower` begins.

---

## Asset 2 — Battle background (lower)

| Field | Value |
|---|---|
| File | `public/assets/battle/environment/background/battle_bg_lower.webp` |
| Status | **Pending — not yet produced** |
| Phaser key | `battle-env-bg-lower` |
| File type | WebP |
| Transparency | **Opaque** — no alpha |
| Anchor | `(0.5, 0)` — top-center |
| Depth | `DEPTH.TABLE` (40), drawn before the puzzle tiles (`DEPTH.BOARD`, 50) |
| Responsive policy | `viewportCover` |

**Artistic role.** The entire lower preparation zone in one painting: the
full wooden table surface and surround, **plus** the cutting board itself —
with its groove, contour, thickness and calm center where the 32 puzzle
tiles will render — integrated directly into the same painting. The table
and the cutting board are no longer separate assets.

**Logical target rect.** Full viewport width, from `layout.table.y` (the
stone/wood separation) to the viewport bottom. Formula:
`x ∈ [0, viewport.width]`, `y ∈ [table.y, viewport.height]`.

**Responsive behavior.** Cover-fitted into its band with the same single
isotropic scale used by Asset 1, centered horizontally.

**Crop behavior.** Lateral crop on phones acceptable; peripheral kitchen
accessories must survive cropping. Vertical excess crops toward the bottom
(least meaningful area). The cutting board must stay within the calm,
rarely-cropped center of the composition at every reference format.

**Must include.** Wood surface with grain/wear, peripheral kitchen
accessories kept out of the central cutting-board zone, the cutting board
with its groove/contour/thickness and a calm center for the 32 tiles,
knife marks/flour at the board's periphery only.

**Must exclude.** Any puzzle element (hexagon cells, stones, ingredients),
any hexagon guide, any text, the heroes (they stand on stone, above this
band). No small animated overlay is part of this contract.

**Layout relationship.** Follows the full `[table.y, viewport bottom]` band
1:1 (unit-tested). It does **not** define hero positions (heroes are
grounded by the layout's hero band, `tableTopGap` above this asset). Tiles
render over it at `DEPTH.BOARD`.

**Technical validation.** Opaque; `battleBackgroundLower` slot spans exactly
`[layout.table.y, viewport bottom]` at the three formats (unit-tested
equality); central zone calm enough for the 32 tiles to read clearly; hard
top seam aligned with `battleBackgroundUpper`'s bottom edge.
