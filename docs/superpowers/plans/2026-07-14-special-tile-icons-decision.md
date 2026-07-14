# Special-Tile Icons — Deterministic Rendering Migration (Decision Record)

Date: 2026-07-14.

## What changed

Every special-tile and portal glyph was migrated from **platform-dependent emoji
rendered through a system font** (`this.add.text('💣' | '🗡️' | '🏹' | '🧨' | '⚔️' |
'🔫' | '🌈')`) to a **deterministic, project-owned vector icon family** drawn with
Phaser `Graphics` primitives.

- New module: `src/scenes/specialTileIcons.ts` — the single presentation-layer icon
  renderer. Exposes `drawSpecialTileIcon(scene, container, type, center, radius)`
  plus the pure, Phaser-free `buildSpecialTileIcon(type, center, radius)` (returns
  deterministic drawing primitives) and `paintPrimitive`.
- `BattleScene` no longer contains any icon-selection switch or emoji table; it calls
  `drawSpecialTileIcon` for `special` and `portal` cells. The grey/purple base discs
  are unchanged.
- Icon roster is exhaustive over `SpecialTileIconType = SpecialTileType | 'portal'`,
  enforced both by a `Record<SpecialTileIconType, true>` literal and a `never`
  exhaustiveness check, so adding a future `SpecialTileType` fails to compile until an
  icon is defined.

## Properties of the new icons

- Deterministic geometry and numeric colors; **no system font, emoji, external/remote
  asset, RNG, clock, tween, animation phase, or DPR-dependent layout.**
- Every coordinate and length is `center + radius · factor` — dimensions derive purely
  from the active tile `visualRadius`, so icons scale isotropically with the board and
  never extend outside their stone.
- All created Phaser objects are added to the board layer and destroyed by the existing
  `boardLayer.removeAll(true)` redraw; no camera or container scaling is introduced.
- Visual language (temporary, not final art): portal = concentric rainbow rings; bomb =
  dark body + fuse + spark; sword = blade + guard + handle; bow = arc + string + arrow;
  dynamite = three sticks + band + fuse; doubleSword = two crossed blades; doubleArrowBow
  = bow frame + two arrows. Double variants are deliberately distinct from singles.

## Why

The portal's rainbow emoji rasterized differently on Windows vs the GitHub Actions
`windows-2022` runner, producing visual-regression pixel diffs that were purely a
font/emoji-rendering artifact. Project-owned vector primitives rasterize consistently
across platforms, removing that class of false-positive visual diff.

## Classification (explicit)

- This is a **visual-stability change** (deterministic, cross-platform rendering).
- It is **not a responsive-layout change** — no viewport policy, band ranges, column
  cap, `BoardGeometry`, `visualRadius`/`hitRadius` math, or `tileBounds` were touched.
  `computeBattleLayout` / `getBattleLayout()` output is unchanged.
- It is **not a gameplay change** — `src/core/**`, `SpecialTileType` values, tile
  spawning, portal behavior, chain validation, destruction areas, combat, RNG, and the
  seeded board contents/distribution are all untouched. Gameplay identity is proven
  non-visually (core `specialTiles.test.ts` effects + e2e `getBoard()` content), not by
  screenshots.

## Verification

- `npx tsc --noEmit` clean; `npm run build` green; `npm test` 139 passed (+9 new
  `specialTileIcons` unit tests: exhaustive roster, determinism, no RNG/clock, radius
  derivation, in-stone containment, paint dispatch).
- e2e: all 43 non-visual tests pass. The three `visual-baseline` screenshots differ by
  651 / 874 / 1126 px (≈0.01 ratio) at 360×640 / 480×720 / 768×1024, and the diff is
  **confined to the two portal tiles** (seed=1 contains only portals) — no stone, table,
  HUD, character, monster, background, or coordinate moved.

## Baselines

This is an intentional visual-system replacement, so the three visual baselines are
expected to be regenerated on the canonical `windows-2022` runner (via the
`capture-visual-snapshots` PR label) **after human review** of the candidate images —
never auto-committed, and the screenshot tolerance stays `maxDiffPixelRatio: 0`. See
`2026-07-12-responsive-layout-decisions.md` for the canonical CI platform.
