# Lot 1 Two-Background Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Lot 1 combat-environment contract from five assets (`battleBackgroundUpper`, `prepTableBase`, `cuttingBoard`, `leftHearth`, `rightLarder`) to two full-band opaque backgrounds (`battleBackgroundUpper`, `battleBackgroundLower`) across the manifest, the placement model, the `assetSlots=1` review overlay, tests, and documentation — with zero change to gameplay and zero modification of any binary asset file.

**Architecture:** `src/assets/battleEnvironmentAssets.ts` becomes a two-entry, `status`-discriminated manifest (`'available'` → real `productionSize`, `'pending'` → recommended `targetSize`). `src/scenes/battleEnvironmentLayout.ts` derives exactly two `AssetPlacement`s from `layout.background` and `layout.table.y` only (no more tunable policy — the cluster/cutting-board fractions and `minimumBoardTopGap` clamp are deleted since nothing they served still exists). `BattleScene`'s `drawAssetSlots()` iterates the same two-entry manifest it always did, so its shape shrinks for free once the manifest and layout model change.

**Tech Stack:** Phaser 4 + TypeScript + Vite; Vitest (`tests/scenes/**`, `tests/assets/**`); Playwright (`tests/e2e/**`).

## Global Constraints

- Gameplay is never touched: `layout.table.y`, the combat/prep separation, boss/hero/HUD positions, the 32-cell grid, `tileBounds`, the 360×640 / 480×720 / 768×1024 responsive behavior.
- No binary file under `public/assets/battle/environment/` is created, resized, cropped, re-encoded, renamed, or deleted.
- No `this.load.image()` is added for either background — loading stays out of scope for Lot 1, exactly as before.
- No asset may be marked `status: 'available'` unless it is already true today (currently: neither is — both stay `'pending'`).
- Every placement in `computeBattleEnvironmentLayout` remains a pure function of the already-computed `BattleLayout` — no coordinate is hand-copied from the reference image, no mutation of the input `layout`.
- Do not delete or rewrite the four historical spec/plan docs from 2026-07-14/2026-07-15 — they already point at `ASSET_CONTRACT.md` as the current contract and need no edit.
- Do not delete `public/assets/battle/environment/preparation/*`, `props/left/`, `props/right/`, or the draft `background/battle_bg_upper.webp` — document them as deferred cleanup instead.
- The working tree has an unrelated pre-existing uncommitted binary change (`public/assets/battle/environment/preparation/battle_prep_table_base.webp`, modified but not committed by a previous session). Never stage or commit this file as part of this work — leave it exactly as found.

---

### Task 1: Rewrite the Lot 1 documentation for two backgrounds

**Files:**
- Modify: `design/production/combat/lot-01-environment/ASSET_CONTRACT.md` (full rewrite)
- Modify: `design/production/combat/lot-01-environment/README.md` (full rewrite)

**Interfaces:**
- Consumes: nothing (pure documentation, no code dependency).
- Produces: nothing code-facing; this is the prose contract Task 2/3's code must match (two roles, two target rects, `viewportCover` policy, `pending` status for both, deferred-cleanup list).

- [ ] **Step 1: Replace `ASSET_CONTRACT.md` in full**

```markdown
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
```

- [ ] **Step 2: Replace `README.md` in full**

```markdown
# Lot 1 — Combat Environment Production

This folder drives the production of the **two background assets** that will
replace the single master reference image
`design/references/combat-background-target.png` in the combat scene.

> **Five-to-two migration (2026-07-18).** The five-asset contract
> (`battleBackgroundUpper`, `prepTableBase`, `cuttingBoard`, `leftHearth`,
> `rightLarder`) is replaced by two full-band paintings: `battleBackgroundUpper`
> (now also baking in the cooking station and food reserve) and
> `battleBackgroundLower` (now also baking in the table and cutting board).
> `ASSET_CONTRACT.md` documents the current, binding two-background contract
> and its rationale; the linked specs/plans below describe the superseded
> six- and five-asset versions and are kept for history only.

The master image stays the qualitative art target (see
`design/references/ART_TARGET.md`); this lot decomposes its *environment* into
two integrable layers. Characters, tiles, HUD and effects are NOT part of
Lot 1.

## Status

**Zero of two backgrounds finalized.** Both `battleBackgroundUpper` and
`battleBackgroundLower` are `status: 'pending'` in
`src/assets/battleEnvironmentAssets.ts`. A draft `battle_bg_upper.webp`
already sits at its final path from the superseded five-asset contract, but
it does not yet integrate the left/right decor this contract requires, so it
is not marked `available`. `battle_bg_lower.webp` does not exist yet. See
`tests/assets/environmentAssetFiles.test.ts` for the automated check that
only validates `available` assets and never promotes a `pending` draft.
Loading these assets into Phaser (`this.load.image()`) is still out of scope
for Lot 1 — a later integration lot wires that up.

## Superseded intermediate sources

These files were produced under the earlier six-/five-asset contracts. They
are **not referenced by the active manifest** and are kept only as possible
source material for painting the two new backgrounds:

- `public/assets/battle/environment/preparation/battle_prep_table_base.webp`
- `public/assets/battle/environment/preparation/battle_prep_cutting_board.png`
- `public/assets/battle/environment/background/battle_bg_upper.webp` (draft —
  reusable as a starting point for the new `battleBackgroundUpper`, but needs
  the left/right decor integrated before it can be marked `available`)

`public/assets/battle/environment/props/left/` and
`public/assets/battle/environment/props/right/` hold only `.gitkeep` — the
`leftHearth`/`rightLarder` roles they were reserved for no longer exist.

## Deferred cleanup

Do not delete any of the above until both new backgrounds are produced,
deposited at their final paths, and validated. Once that happens:

- remove the superseded files listed above;
- remove the now-empty `props/left/`, `props/right/` and `preparation/`
  folders under `public/assets/battle/environment/`;
- remove this section and the "Superseded intermediate sources" section
  above.

## Documents

- `ASSET_CONTRACT.md` — the binding production contract for each of the two
  backgrounds (naming, transparency, anchor, depth, target rect, responsive
  and crop behavior, inclusion/exclusion lists, validation criteria).
- Spec (superseded, six-asset version, kept for history):
  `docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`
- Plan (superseded, six-asset version, kept for history):
  `docs/superpowers/plans/2026-07-14-lot-01-environment-production-setup.md`
- Finalization spec/plan (superseded, five-asset version, kept for history):
  `docs/superpowers/specs/2026-07-15-lot-01-contract-finalization-design.md`,
  `docs/superpowers/plans/2026-07-15-lot-01-contract-finalization.md`

## Folders

- `source/` — working files (layered PSD/Krita/etc.) used to paint the two
  backgrounds. Never referenced by the game.
- `exports/` — candidate exports awaiting validation. Never referenced by the
  game.
- `review/` — captured review images from the superseded five-asset contract,
  kept for history. `review/slots/` holds the slot-guide captures; the
  two-background overlay will need fresh captures once produced.
- Final validated files ship to `public/assets/battle/environment/…` at the
  exact paths listed in the contract (mirrored by the TypeScript manifest
  `src/assets/battleEnvironmentAssets.ts`).

## Reviewing the placements

The future placements are computed at runtime by
`src/scenes/battleEnvironmentLayout.ts` (pure, derived from the validated
`BattleLayout` — no coordinate is copied from the image). To see them
overlaid on the master image with real gameplay:

```
http://localhost:5173/?seed=1&artReview=combatBackground&assetSlots=1
```

Each of the two slots is drawn as a semi-transparent colored rectangle with
its Phaser key as label. The overlay recomputes on every resize. It is a
diagnostic mode only and does not exist in normal play.

## Workflow

1. Paint the asset in `source/`.
2. Export to `exports/` per the contract (format, opacity, bleed).
3. Compare against the live `assetSlots=1` mode.
4. Once validated, move the export to its final `public/assets/...` path,
   flip its manifest `status` to `'available'` with the file's real measured
   `productionSize`, and only then wire loading (a later lot — loading is out
   of scope for Lot 1).
```

- [ ] **Step 3: Commit**

```bash
git add design/production/combat/lot-01-environment/ASSET_CONTRACT.md design/production/combat/lot-01-environment/README.md docs/superpowers/specs/2026-07-18-lot-01-two-background-migration-design.md docs/superpowers/plans/2026-07-18-lot-01-two-background-migration.md
git commit -m "docs: reduce Lot 1 environment contract to two backgrounds"
```

---

### Task 2: Migrate the manifest and placement model to two backgrounds

**Files:**
- Modify: `src/assets/battleEnvironmentAssets.ts` (full rewrite)
- Modify: `src/scenes/battleEnvironmentLayout.ts` (full rewrite)
- Modify: `src/scenes/BattleScene.ts:22-26` (imports), `:37-43` (`ASSET_SLOT_COLORS`), `:47-53` (`ASSET_SLOT_LABEL_ANCHORS`), `:666-702` (`drawAssetSlots`)

**Interfaces:**
- Produces: `BattleEnvironmentRole = 'battleBackgroundUpper' | 'battleBackgroundLower'`; `BattleEnvironmentAssetDefinition` (discriminated union: `{status:'available', productionSize}` | `{status:'pending', targetSize}`); `BATTLE_ENVIRONMENT_ASSETS: readonly BattleEnvironmentAssetDefinition[]` (length 2); `environmentAssetByRole(role)`; `ENVIRONMENT_ROLES = ['battleBackgroundUpper', 'battleBackgroundLower'] as const`; `AssetPlacement` (unchanged shape: `{x,y,width,height,originX,originY}`); `BattleEnvironmentLayout = Record<(typeof ENVIRONMENT_ROLES)[number], AssetPlacement>`; `placementToRect(p)` (unchanged); `computeBattleEnvironmentLayout(layout: BattleLayout): BattleEnvironmentLayout` (now takes **no** policy parameter — `EnvironmentSlotPolicy` and `DEFAULT_ENVIRONMENT_SLOT_POLICY` are deleted).
- Consumed by: Task 3's tests, Task 4/5's e2e coverage, Task 6's file validator (via `BATTLE_ENVIRONMENT_ASSETS`/`environmentAssetByRole`).

This task intentionally leaves `tests/scenes/battleEnvironmentLayout.test.ts`, `tests/e2e/asset-slots.spec.ts`, and `tests/assets/environmentAssetFiles.test.ts` red/non-compiling — they still reference the five-role shape and `DEFAULT_ENVIRONMENT_SLOT_POLICY`. That is expected; Task 3 turns them green. Do not run the full test suite as a pass/fail gate at the end of this task — only confirm the production files below type-check in isolation reasoning (the compiler will still flag the stale test files, which is fine at this point).

- [ ] **Step 1: Replace `src/assets/battleEnvironmentAssets.ts` in full**

```typescript
// Central manifest of the two Lot 1 combat-environment background assets
// (mirrored 1:1 by design/production/combat/lot-01-environment/ASSET_CONTRACT.md).
// Both are still `status: 'pending'` — see ASSET_CONTRACT.md for what "final"
// means for each — and MUST NOT be fed to this.load.image() until a human
// flips their status to 'available'. Never scatter these paths into
// BattleScene.ts.
//
// Placement geometry deliberately does NOT live here: it is computed at
// runtime from the validated BattleLayout by scenes/battleEnvironmentLayout.ts
// (whose placements' origins must match each definition's `anchor` — unit-
// tested in tests/scenes/battleEnvironmentLayout.test.ts).
import { DEPTH } from '../scenes/depth';

export type BattleEnvironmentRole = 'battleBackgroundUpper' | 'battleBackgroundLower';

// How the asset follows the viewport (see ASSET_CONTRACT.md for the prose):
// both backgrounds cover-fit their full-width band with a single isotropic
// scale, never stretched — the only responsive policy left once the
// separately-placed table, cutting board and two prop clusters were folded
// into these two full-band paintings.
export type EnvironmentResponsivePolicy = 'viewportCover';

export interface ProductionSize {
  width: number;
  height: number;
  aspectRatio: number;
}

interface BattleEnvironmentAssetBase {
  key: string; // future Phaser texture key
  path: string; // final public URL path the produced file ships at (or will ship at)
  role: BattleEnvironmentRole;
  format: 'webp';
  alphaRequired: false; // both backgrounds are opaque paintings
  anchor: { x: number; y: number }; // Phaser origin the future sprite will use
  responsivePolicy: EnvironmentResponsivePolicy;
  depth: number; // conceptual layer from scenes/depth.ts (ties within a depth: manifest order = draw order)
}

// A draft file may already sit at a 'pending' asset's `path` (see
// ASSET_CONTRACT.md) — that alone never promotes it. Only changing `status`
// to 'available' together with the file's real, measured `productionSize`
// marks a background as final; tests/assets/environmentAssetFiles.test.ts
// validates the shipped file against `productionSize` for 'available'
// entries only.
export interface AvailableBattleEnvironmentAsset extends BattleEnvironmentAssetBase {
  status: 'available';
  productionSize: ProductionSize; // real, measured dimensions
}

export interface PendingBattleEnvironmentAsset extends BattleEnvironmentAssetBase {
  status: 'pending';
  targetSize: ProductionSize; // recommended target — not yet measured or validated
}

export type BattleEnvironmentAssetDefinition = AvailableBattleEnvironmentAsset | PendingBattleEnvironmentAsset;

const ENVIRONMENT_ROOT = '/assets/battle/environment';

export const BATTLE_ENVIRONMENT_ASSETS: readonly BattleEnvironmentAssetDefinition[] = [
  {
    key: 'battle-env-bg-upper',
    path: `${ENVIRONMENT_ROOT}/background/battle_bg_upper.webp`,
    role: 'battleBackgroundUpper',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0.5, y: 0 },
    responsivePolicy: 'viewportCover',
    depth: DEPTH.BACKGROUND,
    status: 'pending',
    // Recommended target — a draft file already sits at `path` from the
    // superseded five-asset contract, but it does not yet bake in the
    // integrated left/right decor this contract requires, so it is not
    // promoted to 'available'. See ASSET_CONTRACT.md Asset 1.
    targetSize: { width: 1536, height: 1024, aspectRatio: 1.5 },
  },
  {
    key: 'battle-env-bg-lower',
    path: `${ENVIRONMENT_ROOT}/background/battle_bg_lower.webp`,
    role: 'battleBackgroundLower',
    format: 'webp',
    alphaRequired: false,
    anchor: { x: 0.5, y: 0 },
    responsivePolicy: 'viewportCover',
    depth: DEPTH.TABLE,
    status: 'pending',
    // Recommended target — not yet produced. See ASSET_CONTRACT.md Asset 2.
    targetSize: { width: 1536, height: 1280, aspectRatio: 1.2 },
  },
];

export function environmentAssetByRole(role: BattleEnvironmentRole): BattleEnvironmentAssetDefinition {
  const def = BATTLE_ENVIRONMENT_ASSETS.find((a) => a.role === role);
  if (!def) throw new Error(`No battle environment asset defined for role "${role}"`);
  return def;
}
```

- [ ] **Step 2: Replace `src/scenes/battleEnvironmentLayout.ts` in full**

```typescript
// Pure, Phaser-free and DOM-free placement model for the two Lot 1 combat
// environment background assets (see design/production/combat/lot-01-environment/
// ASSET_CONTRACT.md). It CONSUMES an already-computed BattleLayout and derives
// two placements from its only remaining semantic frontier — it never feeds
// anything back into battleLayout/boardGeometry/compositionLayout (gameplay
// math is strictly upstream of this module), and no coordinate here is
// copied from the reference image. Consumed today only by the &assetSlots=1
// diagnostic overlay in BattleScene; the future asset-integration lot will
// reuse the exact same placements.
import type { BattleLayout, Rect } from './battleLayout';

// Anchor-point convention (matches Phaser): `x`/`y` locate the point of the
// future sprite designated by (originX, originY). placementToRect() recovers
// the plain axis-aligned rect when needed (tests, guide drawing).
export interface AssetPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export const ENVIRONMENT_ROLES = ['battleBackgroundUpper', 'battleBackgroundLower'] as const;

export type BattleEnvironmentLayout = Record<(typeof ENVIRONMENT_ROLES)[number], AssetPlacement>;

export function placementToRect(p: AssetPlacement): Rect {
  return {
    x: p.x - p.width * p.originX,
    y: p.y - p.height * p.originY,
    width: p.width,
    height: p.height,
  };
}

// Derives the two full-viewport-width background slots from the layout's
// only remaining semantic frontier: the stone/wood seam (`layout.table.y`).
// - battleBackgroundUpper spans y ∈ [0, table.y]: vault, walls, arches, the
//   stone combat floor, and (now baked in) the cooking station and food
//   reserve that used to be separate edge clusters.
// - battleBackgroundLower spans y ∈ [table.y, viewport bottom]: the full
//   wooden preparation surface with the cutting board painted directly into
//   it, replacing the former separate table + cutting-board assets.
// Read-only over `layout`; deterministic (no RNG, no DOM, no time); no
// tunable policy remains once both placements are pure functions of
// layout.background and layout.table.y.
export function computeBattleEnvironmentLayout(layout: BattleLayout): BattleEnvironmentLayout {
  const viewport = layout.background;
  const seamY = layout.table.y;

  return {
    battleBackgroundUpper: {
      x: viewport.width / 2,
      y: 0,
      width: viewport.width,
      height: seamY,
      originX: 0.5,
      originY: 0,
    },
    battleBackgroundLower: {
      x: viewport.width / 2,
      y: seamY,
      width: viewport.width,
      height: viewport.height - seamY,
      originX: 0.5,
      originY: 0,
    },
  };
}
```

- [ ] **Step 3: Update `src/scenes/BattleScene.ts` imports (around line 22-26)**

Replace:

```typescript
import { computeBattleEnvironmentLayout, placementToRect, DEFAULT_ENVIRONMENT_SLOT_POLICY } from './battleEnvironmentLayout';
import type { BattleEnvironmentRole } from '../assets/battleEnvironmentAssets';
import { BATTLE_ENVIRONMENT_ASSETS } from '../assets/battleEnvironmentAssets';
```

with:

```typescript
import { computeBattleEnvironmentLayout, placementToRect } from './battleEnvironmentLayout';
import type { BattleEnvironmentRole } from '../assets/battleEnvironmentAssets';
import { BATTLE_ENVIRONMENT_ASSETS } from '../assets/battleEnvironmentAssets';
```

- [ ] **Step 4: Update `ASSET_SLOT_COLORS` and `ASSET_SLOT_LABEL_ANCHORS` (around line 34-53)**

Replace:

```typescript
// Diagnostic colors for the &assetSlots=1 lot-01 slot overlay — one distinct
// color per environment role (presentation only; geometry comes exclusively
// from battleEnvironmentLayout).
const ASSET_SLOT_COLORS: Record<BattleEnvironmentRole, number> = {
  battleBackgroundUpper: 0x4d79ff,
  leftHearth: 0xff8c3a,
  rightLarder: 0x6fce44,
  prepTableBase: 0xd8a03c,
  cuttingBoard: 0xe85bd8,
};

// Where each slot's small technical label sits inside its rect, so labels of
// adjacent/nested slots never stack on the same corner.
const ASSET_SLOT_LABEL_ANCHORS: Record<BattleEnvironmentRole, { x: number; y: number }> = {
  battleBackgroundUpper: { x: 0, y: 0 },
  leftHearth: { x: 0, y: 0 },
  rightLarder: { x: 1, y: 0 },
  prepTableBase: { x: 0, y: 1 },
  cuttingBoard: { x: 0.5, y: 0 },
};
```

with:

```typescript
// Diagnostic colors for the &assetSlots=1 lot-01 slot overlay — one distinct
// color per environment role (presentation only; geometry comes exclusively
// from battleEnvironmentLayout).
const ASSET_SLOT_COLORS: Record<BattleEnvironmentRole, number> = {
  battleBackgroundUpper: 0x4d79ff,
  battleBackgroundLower: 0xd8a03c,
};

// Where each slot's small technical label sits inside its rect, so labels of
// adjacent/nested slots never stack on the same corner.
const ASSET_SLOT_LABEL_ANCHORS: Record<BattleEnvironmentRole, { x: number; y: number }> = {
  battleBackgroundUpper: { x: 0, y: 0 },
  battleBackgroundLower: { x: 0, y: 0 },
};
```

- [ ] **Step 5: Update `drawAssetSlots()` (around line 666-702)**

Replace:

```typescript
  // Lot-01 production overlay (&assetSlots=1, only inside the combatBackground
  // review mode). Draws the five FUTURE environment assets' placements as
  // semi-transparent role-colored rects + one small technical label each
  // (diagnostic only — no UI panel). Geometry comes exclusively from
  // computeBattleEnvironmentLayout(activeLayout) — no hand-copied coordinate —
  // so every reflow recomputes the slots for free through applyLayout(), and
  // the removeAll(true) keeps the redraw idempotent (no accumulation).
  private drawAssetSlots(): void {
    this.assetSlotsContainer.removeAll(true);
    if (this.artReviewMode !== 'combatBackground' || !this.assetSlotsEnabled) return;
    const env = computeBattleEnvironmentLayout(this.activeLayout);
    const g = this.add.graphics();
    this.assetSlotsContainer.add(g);
    for (const def of BATTLE_ENVIRONMENT_ASSETS) {
      const rect = placementToRect(env[def.role]);
      const color = ASSET_SLOT_COLORS[def.role];
      g.fillStyle(color, 0.18);
      g.fillRect(rect.x, rect.y, rect.width, rect.height);
      g.lineStyle(1, color, 0.9);
      g.strokeRect(rect.x, rect.y, rect.width, rect.height);

      const anchor = ASSET_SLOT_LABEL_ANCHORS[def.role];
      const label = this.add
        .text(rect.x + 4 + anchor.x * (rect.width - 8), rect.y + 4 + anchor.y * (rect.height - 8), def.key, {
          fontSize: '10px',
          color: `#${color.toString(16).padStart(6, '0')}`,
          backgroundColor: 'rgba(0,0,0,0.6)',
        })
        .setOrigin(anchor.x, anchor.y);
      this.assetSlotsContainer.add(label);
    }
    // Serialized six-slot layout + the active slot policy, observable without
    // canvas reads (and without ?debug=1): e2e cross-checks both against the
    // same pure module in Node.
    document.body.setAttribute('data-asset-slots-layout', JSON.stringify(env));
    document.body.setAttribute('data-asset-slots-policy', JSON.stringify(DEFAULT_ENVIRONMENT_SLOT_POLICY));
  }
```

with:

```typescript
  // Lot-01 production overlay (&assetSlots=1, only inside the combatBackground
  // review mode). Draws the two FUTURE environment backgrounds' placements as
  // semi-transparent role-colored rects + one small technical label each
  // (diagnostic only — no UI panel). Geometry comes exclusively from
  // computeBattleEnvironmentLayout(activeLayout) — no hand-copied coordinate —
  // so every reflow recomputes the slots for free through applyLayout(), and
  // the removeAll(true) keeps the redraw idempotent (no accumulation).
  private drawAssetSlots(): void {
    this.assetSlotsContainer.removeAll(true);
    if (this.artReviewMode !== 'combatBackground' || !this.assetSlotsEnabled) return;
    const env = computeBattleEnvironmentLayout(this.activeLayout);
    const g = this.add.graphics();
    this.assetSlotsContainer.add(g);
    for (const def of BATTLE_ENVIRONMENT_ASSETS) {
      const rect = placementToRect(env[def.role]);
      const color = ASSET_SLOT_COLORS[def.role];
      g.fillStyle(color, 0.18);
      g.fillRect(rect.x, rect.y, rect.width, rect.height);
      g.lineStyle(1, color, 0.9);
      g.strokeRect(rect.x, rect.y, rect.width, rect.height);

      const anchor = ASSET_SLOT_LABEL_ANCHORS[def.role];
      const label = this.add
        .text(rect.x + 4 + anchor.x * (rect.width - 8), rect.y + 4 + anchor.y * (rect.height - 8), def.key, {
          fontSize: '10px',
          color: `#${color.toString(16).padStart(6, '0')}`,
          backgroundColor: 'rgba(0,0,0,0.6)',
        })
        .setOrigin(anchor.x, anchor.y);
      this.assetSlotsContainer.add(label);
    }
    // Serialized two-slot layout, observable without canvas reads (and
    // without ?debug=1): e2e cross-checks it against the same pure module in
    // Node. No slot policy is serialized anymore — computeBattleEnvironmentLayout
    // no longer takes one (see battleEnvironmentLayout.ts).
    document.body.setAttribute('data-asset-slots-layout', JSON.stringify(env));
  }
```

- [ ] **Step 6: Commit**

```bash
git add src/assets/battleEnvironmentAssets.ts src/scenes/battleEnvironmentLayout.ts src/scenes/BattleScene.ts
git commit -m "refactor: migrate battle environment layout to two backgrounds"
```

---

### Task 3: Update all Lot 1 tests for the two-background shape

**Files:**
- Modify: `tests/scenes/battleEnvironmentLayout.test.ts` (full rewrite)
- Modify: `tests/e2e/asset-slots.spec.ts` (full rewrite)
- Modify: `tests/assets/environmentAssetFiles.test.ts` (full rewrite)
- Delete: `tests/assets/pngHeader.ts` (confirmed used nowhere else in the repo — only by the PNG branch of `environmentAssetFiles.test.ts`, which is removed in this task since neither remaining asset is PNG)

**Interfaces:**
- Consumes: `ENVIRONMENT_ROLES`, `computeBattleEnvironmentLayout`, `placementToRect` from Task 2's `battleEnvironmentLayout.ts`; `BATTLE_ENVIRONMENT_ASSETS`, `environmentAssetByRole`, `AvailableBattleEnvironmentAsset` from Task 2's `battleEnvironmentAssets.ts`; `readWebpHeader` from `tests/assets/webpHeader.ts` (unchanged, not touched by this migration).
- Produces: nothing new — this task only asserts the two-background contract holds.

- [ ] **Step 1: Replace `tests/scenes/battleEnvironmentLayout.test.ts` in full**

```typescript
import { describe, it, expect } from 'vitest';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';
import type { BattleLayout } from '../../src/scenes/battleLayout';
import { computeBattleEnvironmentLayout, placementToRect, ENVIRONMENT_ROLES } from '../../src/scenes/battleEnvironmentLayout';
import { BATTLE_ENVIRONMENT_ASSETS, environmentAssetByRole } from '../../src/assets/battleEnvironmentAssets';
import { cellToPixel } from '../../src/scenes/boardGeometry';
import { getAllCells } from '../../src/core/grid';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// The three validated review formats (phone / composition baseline / tablet).
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
] as const;

function layoutAt(width: number, height: number): BattleLayout {
  return computeBattleLayout({ width, height, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
}

describe.each(VIEWPORTS)('computeBattleEnvironmentLayout at $width x $height', ({ width, height }) => {
  const layout = layoutAt(width, height);
  const env = computeBattleEnvironmentLayout(layout);

  it('computes exactly two placements', () => {
    for (const role of ENVIRONMENT_ROLES) {
      expect(env[role]).toBeDefined();
    }
    expect(Object.keys(env).sort()).toEqual([...ENVIRONMENT_ROLES].sort());
    expect(Object.keys(env)).toHaveLength(2);
  });

  it('no longer defines any of the five retired roles', () => {
    const retired = ['upperArchitecture', 'stoneFloor', 'prepTableBase', 'cuttingBoard', 'leftHearth', 'rightLarder'];
    for (const role of retired) {
      expect(ENVIRONMENT_ROLES as readonly string[]).not.toContain(role);
      expect(Object.keys(env)).not.toContain(role);
    }
    expect(ENVIRONMENT_ROLES).toContain('battleBackgroundUpper');
    expect(ENVIRONMENT_ROLES).toContain('battleBackgroundLower');
  });

  it('contains no NaN or Infinity anywhere', () => {
    for (const role of ENVIRONMENT_ROLES) {
      const p = env[role];
      for (const v of [p.x, p.y, p.width, p.height, p.originX, p.originY]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('has strictly positive sizes for every slot', () => {
    for (const role of ENVIRONMENT_ROLES) {
      expect(env[role].width).toBeGreaterThan(0);
      expect(env[role].height).toBeGreaterThan(0);
    }
  });

  it('covers the upper band from the viewport top down to layout.table.y, viewport-centered', () => {
    const bg = placementToRect(env.battleBackgroundUpper);
    expect(bg).toEqual({ x: 0, y: 0, width, height: layout.table.y });
    expect(env.battleBackgroundUpper.originX).toBe(0.5);
    expect(env.battleBackgroundUpper.originY).toBe(0);
    expect(env.battleBackgroundUpper.x).toBe(width / 2);
    expect(env.battleBackgroundUpper.width).toBe(layout.background.width);
    expect(env.battleBackgroundUpper.height).toBe(layout.table.y);
  });

  it('covers the lower band from layout.table.y down to the viewport bottom, viewport-centered', () => {
    const bg = placementToRect(env.battleBackgroundLower);
    expect(bg).toEqual({
      x: 0,
      y: layout.table.y,
      width,
      height: layout.background.height - layout.table.y,
    });
    expect(env.battleBackgroundLower.originX).toBe(0.5);
    expect(env.battleBackgroundLower.originY).toBe(0);
    expect(env.battleBackgroundLower.x).toBe(width / 2);
    expect(env.battleBackgroundLower.y).toBe(layout.table.y);
  });

  it('shares the exact seam: upper bottom edge === lower top edge === layout.table.y', () => {
    const upper = placementToRect(env.battleBackgroundUpper);
    const lower = placementToRect(env.battleBackgroundLower);
    expect(upper.y + upper.height).toBe(layout.table.y);
    expect(lower.y).toBe(layout.table.y);
    expect(upper.y + upper.height).toBe(lower.y);
  });

  it('leaves the 32 cell positions and tileBounds untouched', () => {
    const fresh = layoutAt(width, height);
    const cellsBefore = getAllCells().map((c) => cellToPixel(fresh.board, c.row, c.col));
    const tileBoundsBefore = { ...fresh.board.tileBounds };
    computeBattleEnvironmentLayout(fresh);
    const cellsAfter = getAllCells().map((c) => cellToPixel(fresh.board, c.row, c.col));
    expect(cellsAfter).toHaveLength(32);
    expect(cellsAfter).toEqual(cellsBefore);
    expect(fresh.board.tileBounds).toEqual(tileBoundsBefore);
  });

  it('never mutates the BattleLayout it reads (gameplay is untouched)', () => {
    const fresh = layoutAt(width, height);
    const snapshot = JSON.parse(JSON.stringify(fresh));
    computeBattleEnvironmentLayout(fresh);
    expect(fresh).toEqual(snapshot);
  });

  it('is deterministic across two identical computations', () => {
    const a = computeBattleEnvironmentLayout(layoutAt(width, height));
    const b = computeBattleEnvironmentLayout(layoutAt(width, height));
    expect(a).toEqual(b);
  });

  it('uses the exact origin each manifest entry declares as its anchor', () => {
    for (const role of ENVIRONMENT_ROLES) {
      const def = environmentAssetByRole(role);
      expect({ x: env[role].originX, y: env[role].originY }).toEqual(def.anchor);
    }
  });
});

describe('manifest consistency', () => {
  it('defines exactly two assets with unique keys, paths, and roles', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS).toHaveLength(2);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.key)).size).toBe(2);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.path)).size).toBe(2);
    expect(new Set(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role)).size).toBe(2);
    expect([...BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role)].sort()).toEqual([...ENVIRONMENT_ROLES].sort());
  });

  it('no longer declares any of the five retired roles', () => {
    const roles = BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role);
    const retired = ['upperArchitecture', 'stoneFloor', 'prepTableBase', 'cuttingBoard', 'leftHearth', 'rightLarder'];
    for (const role of retired) {
      expect(roles).not.toContain(role);
    }
    expect(roles).toContain('battleBackgroundUpper');
    expect(roles).toContain('battleBackgroundLower');
  });

  it('roots every path under the environment production tree with the .webp extension', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.path.startsWith('/assets/battle/environment/')).toBe(true);
      expect(a.path.endsWith('.webp')).toBe(true);
      expect(a.format).toBe('webp');
    }
  });

  it('uses the exact contract paths for each role', () => {
    expect(environmentAssetByRole('battleBackgroundUpper').path).toBe(
      '/assets/battle/environment/background/battle_bg_upper.webp',
    );
    expect(environmentAssetByRole('battleBackgroundLower').path).toBe(
      '/assets/battle/environment/background/battle_bg_lower.webp',
    );
  });

  it('never requires alpha for either opaque webp background', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.alphaRequired).toBe(false);
    }
  });

  it('marks both backgrounds as pending (neither final illustration exists yet)', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS.every((a) => a.status === 'pending')).toBe(true);
  });

  it('declares strictly positive target dimensions for both pending assets', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      expect(a.status).toBe('pending');
      if (a.status !== 'pending') continue; // narrows for TS
      expect(a.targetSize.width).toBeGreaterThan(0);
      expect(a.targetSize.height).toBeGreaterThan(0);
      expect(a.targetSize.aspectRatio).toBeGreaterThan(0);
      expect(Number.isInteger(a.targetSize.width)).toBe(true);
      expect(Number.isInteger(a.targetSize.height)).toBe(true);
    }
  });

  it('keeps each declared aspect ratio consistent with its target dimensions', () => {
    for (const a of BATTLE_ENVIRONMENT_ASSETS) {
      if (a.status !== 'pending') continue;
      const { width, height, aspectRatio } = a.targetSize;
      expect(Math.abs(aspectRatio - width / height)).toBeLessThan(0.005);
    }
  });
});
```

- [ ] **Step 2: Run the unit tests for this file and confirm they pass**

Run: `npx vitest run tests/scenes/battleEnvironmentLayout.test.ts`
Expected: all tests PASS (0 failures). If TypeScript complains about the narrowing in the "declares strictly positive target dimensions" test, keep the `if (a.status !== 'pending') continue;` guard exactly as written — it is what lets TS narrow `a` to the `PendingBattleEnvironmentAsset` branch before accessing `.targetSize`.

- [ ] **Step 3: Replace `tests/assets/environmentAssetFiles.test.ts` in full**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BATTLE_ENVIRONMENT_ASSETS } from '../../src/assets/battleEnvironmentAssets';
import type { AvailableBattleEnvironmentAsset } from '../../src/assets/battleEnvironmentAssets';
import { readWebpHeader } from './webpHeader';

// Validates the two Lot 1 environment background assets against the
// manifest: existence at the declared path, real WebP signature, and
// dimensions matching `productionSize` — but ONLY for entries whose `status`
// is 'available'. A 'pending' asset's draft file (if one happens to sit at
// its path, e.g. the current battle_bg_upper.webp) is never treated as a
// final, validated asset — only a human flipping the manifest's `status` to
// 'available' (with the file's real measured productionSize) does that. See
// design/production/combat/lot-01-environment/README.md.
const PUBLIC_ROOT = path.resolve(__dirname, '../../public');

const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');

function isWebp(buf: Buffer): boolean {
  return buf.subarray(0, 4).equals(RIFF_SIGNATURE);
}

function isAvailable(a: (typeof BATTLE_ENVIRONMENT_ASSETS)[number]): a is AvailableBattleEnvironmentAsset {
  return a.status === 'available';
}

describe('environment asset files', () => {
  it('defines exactly the two background roles', () => {
    expect(BATTLE_ENVIRONMENT_ASSETS.map((a) => a.role).sort()).toEqual(
      ['battleBackgroundLower', 'battleBackgroundUpper'].sort(),
    );
  });

  it('currently has zero available assets — both backgrounds are still pending', () => {
    // This assertion documents today's true state; it is expected to change
    // (and must be updated) the day a human marks a background 'available'.
    expect(BATTLE_ENVIRONMENT_ASSETS.filter(isAvailable)).toHaveLength(0);
  });

  for (const asset of BATTLE_ENVIRONMENT_ASSETS.filter(isAvailable)) {
    describe(`${asset.role} (${asset.path})`, () => {
      const filePath = path.join(PUBLIC_ROOT, asset.path.replace(/^\//, ''));

      it('exists on disk at the manifest path', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('is a real WebP file with the declared production dimensions', () => {
        const buf = fs.readFileSync(filePath);
        expect(isWebp(buf), `${asset.path} must be a real WebP file.`).toBe(true);
        const { width, height } = readWebpHeader(buf);
        expect(width).toBe(asset.productionSize.width);
        expect(height).toBe(asset.productionSize.height);
      });
    });
  }
});
```

- [ ] **Step 4: Delete the now-unused PNG header helper**

```bash
git rm tests/assets/pngHeader.ts
```

- [ ] **Step 5: Run the asset-file tests and confirm they pass**

Run: `npx vitest run tests/assets/environmentAssetFiles.test.ts`
Expected: all tests PASS (0 failures); the per-asset `describe` loop produces zero suites since both assets are `pending` today.

- [ ] **Step 6: Replace `tests/e2e/asset-slots.spec.ts` in full**

```typescript
import { test, expect } from '@playwright/test';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';
import { computeBattleEnvironmentLayout } from '../../src/scenes/battleEnvironmentLayout';

// Covers the lot-01 &assetSlots=1 extension of the combatBackground art review
// mode (see docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md
// and the 2026-07-18 five-to-two-background migration). The overlay must be
// fully inert outside `artReview=combatBackground&assetSlots=1`, and its two
// rects must come exclusively from the pure battleEnvironmentLayout model —
// which these tests recompute in plain Node and compare byte-for-byte against
// the serialized DOM surface. The untouched visual-baseline.spec.ts remains
// the ultimate guard that normal rendering is unchanged.

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// The slots container holds 1 Graphics + 2 labels when active.
const ACTIVE_SLOT_OBJECT_COUNT = 3;

function expectedEnvLayout(width: number, height: number) {
  return computeBattleEnvironmentLayout(
    computeBattleLayout({ width, height, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY),
  );
}

test('assetSlots=1 inside the review mode activates the two slot guides', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&assetSlots=1&debug=1');
  await page.waitForSelector('[data-asset-slots-ready="true"]');

  expect(await page.evaluate(() => document.body.getAttribute('data-asset-slots'))).toBe('true');
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.assetSlots).toBe(ACTIVE_SLOT_OBJECT_COUNT);

  // The serialized layout equals the pure model recomputed in Node (same math,
  // zero safe-area insets in the test browser, JSON round-trip is lossless).
  const serialized = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
  expect(serialized).toEqual(expectedEnvLayout(480, 720));
});

test('normal mode carries no asset-slot attributes or objects', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const attrs = await page.evaluate(() => ({
    slots: document.body.getAttribute('data-asset-slots'),
    ready: document.body.getAttribute('data-asset-slots-ready'),
    layout: document.body.getAttribute('data-asset-slots-layout'),
  }));
  expect(attrs).toEqual({ slots: null, ready: null, layout: null });
  expect(await page.evaluate(() => window.__debug!.getLayerObjectCounts().assetSlots)).toBe(0);
});

test('artReview=combatBackground without assetSlots draws no slot guides', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const attrs = await page.evaluate(() => ({
    slots: document.body.getAttribute('data-asset-slots'),
    ready: document.body.getAttribute('data-asset-slots-ready'),
    layout: document.body.getAttribute('data-asset-slots-layout'),
  }));
  expect(attrs).toEqual({ slots: null, ready: null, layout: null });
  expect(await page.evaluate(() => window.__debug!.getLayerObjectCounts().assetSlots)).toBe(0);
});

test('assetSlots=1 without artReview stays fully inert', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&assetSlots=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  expect(await page.evaluate(() => document.body.getAttribute('data-asset-slots'))).toBeNull();
  expect(await page.evaluate(() => document.body.getAttribute('data-asset-slots-ready'))).toBeNull();
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.assetSlots).toBe(0);
  expect(counts.artReviewBackground).toBe(0);
});

test('a resize recomputes the two slots from the new layout', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&assetSlots=1&debug=1');
  await page.waitForSelector('[data-asset-slots-ready="true"]');
  const before = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
  expect(before).toEqual(expectedEnvLayout(480, 720));

  const revBefore = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, revBefore);

  const after = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
  expect(after).toEqual(expectedEnvLayout(360, 640));
});

test('repeated reflows never accumulate slot guide objects', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&assetSlots=1&debug=1');
  await page.waitForSelector('[data-asset-slots-ready="true"]');
  const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(before.assetSlots).toBe(ACTIVE_SLOT_OBJECT_COUNT);

  for (let i = 0; i < 2; i++) {
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  }
  const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(after).toEqual(before);
});

test('formats 360x640, 480x720 and 768x1024 all place the upper/lower slots at the table seam', async ({ page }) => {
  for (const { width, height } of [
    { width: 360, height: 640 },
    { width: 480, height: 720 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/?seed=1&artReview=combatBackground&assetSlots=1&debug=1`);
    await page.waitForSelector('[data-asset-slots-ready="true"]');
    const layout = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
    expect(layout).toEqual(expectedEnvLayout(width, height));
    const bLayout = await page.evaluate(() => window.__debug!.getBattleLayout());
    expect(layout.battleBackgroundUpper.height).toBe(bLayout.table.y);
    expect(layout.battleBackgroundLower.y).toBe(bLayout.table.y);
  }
});
```

- [ ] **Step 7: Run the asset-slots e2e spec and confirm it passes**

Run: `npx playwright test tests/e2e/asset-slots.spec.ts`
Expected: all tests PASS. (This starts the dev server automatically per the project's Playwright config.)

- [ ] **Step 8: Commit**

```bash
git add tests/scenes/battleEnvironmentLayout.test.ts tests/e2e/asset-slots.spec.ts tests/assets/environmentAssetFiles.test.ts
git rm tests/assets/pngHeader.ts
git commit -m "test: update two-background asset slot coverage"
```

(If `git rm` was already staged in Step 4, the final `git rm` here is a no-op — just ensure the deletion is part of this commit, not left uncommitted.)

---

### Task 4: Global stale-reference sweep and final validation

**Files:** none modified (verification only), unless the sweep in Step 1 turns up a real leftover reference — in that case, fix it in the file it's found in and note the fix when reporting.

**Interfaces:** none (this task only runs commands and reads output).

- [ ] **Step 1: Search for any remaining reference to the retired roles or old asset counts**

Run:
```bash
grep -rn "prepTableBase\|cuttingBoard\|leftHearth\|rightLarder\|upperArchitecture\|stoneFloor" --include="*.ts" --include="*.md" src tests design docs
```
Expected: no matches under `src/` or `tests/`. Matches under `design/production/combat/lot-01-environment/ASSET_CONTRACT.md`'s or `README.md`'s own supersession notice (mentioning the retired role names for context) and under the four historical 2026-07-14/2026-07-15 spec/plan docs are expected and correct — those are the explicitly-preserved historical mentions, not active runtime references. If any match appears in a file not accounted for here, open it and fix the stale reference.

Run:
```bash
grep -rn "five assets\|five slots\|five backgrounds\|DEFAULT_ENVIRONMENT_SLOT_POLICY\|EnvironmentSlotPolicy\|minimumBoardTopGap" --include="*.ts" src tests
```
Expected: no matches anywhere under `src/` or `tests/` (the policy type and its fields are fully removed).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Full unit test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Full e2e suite**

Run: `npm run test:e2e`
Expected: all tests PASS, including `tests/e2e/visual-baseline.spec.ts` unchanged (this migration touches no gameplay pixel and loads no new image, so the existing baselines must still match with no `--update-snapshots`).

- [ ] **Step 6: Confirm no binary asset was touched and no stray file was added**

Run:
```bash
git status
git diff --stat
```
Expected: the only tracked changes are the files touched in Tasks 1-3 (docs, `src/assets/battleEnvironmentAssets.ts`, `src/scenes/battleEnvironmentLayout.ts`, `src/scenes/BattleScene.ts`, the three test files, the deleted `tests/assets/pngHeader.ts`, plus the two new plan/spec docs). The pre-existing uncommitted modification to `public/assets/battle/environment/preparation/battle_prep_table_base.webp` must still show as modified-but-uncommitted, untouched by this work (per the Global Constraints — never stage or commit it). No file under `public/assets/battle/environment/` should appear in any diff produced by this plan's commits.

- [ ] **Step 7: Report**

No further commit in this task. Summarize for the user: the new two-role runtime contract, the two placements, the two review slots, all test/build/typecheck results with their actual output, confirmation no binary asset changed, which old files are now documented as deferred-cleanup intermediate sources, and the three commit hashes from Tasks 1-3.
