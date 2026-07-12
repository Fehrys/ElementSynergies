# Battle Scene Composition — Design

**Date:** 2026-07-11
**Status:** Approved for planning (audit + 4 corrections)

## Goal

Move `BattleScene` off its stacked-rectangle HUD/lineup toward the composition defined in
`design/implementation/BATTLE_SCENE_BLUEPRINT.md`, using a **centralized composition
layout** and flat production-footprint placeholders — while changing nothing about
gameplay, puzzle input accuracy, debug mode, seeded board behavior, or the pure-TS /
Phaser boundary. See `design/implementation/BATTLE_SCENE_AUDIT.md` for the audit this
responds to.

## Corrections folded in (authoritative)

1. **No responsive canvas scaling this effort.** The internal game resolution stays a
   fixed **480×720** (no `Phaser.Scale` mode change). The layout module computes
   proportional composition regions, but it is a *centralized composition layout*, not
   responsive support.
2. **Coordinate modules stay Phaser-free.** `cellToPixel()` keeps returning absolute
   stage-space coordinates importable directly by Playwright in plain Node. The puzzle is
   **never** positioned or scaled through a transformed container: the tile container stays
   at position `(0, 0)`, scale `1`. All repositioning flows through `ORIGIN_X`/`ORIGIN_Y`.
3. **Three independently shippable milestones**, each with its own checkpoint:
   - **A — Structural container migration**, zero visual change.
   - **B — New composition** using production-footprint placeholders.
   - **C — Panel-chrome removal** plus minimal environment/HUD placeholders.
4. **Persistent table ≠ destructible tiles.** The preparation-table surface (and the
   background, environment, and persistent puzzle-feedback layers) live in their own
   containers. `drawBoard()` may rebuild the tile objects, but it must **never** destroy
   the table, environment, background, or feedback layers.

## Architecture

### Module map

- **`src/scenes/compositionLayout.ts`** (new, Phaser-free) — the centralized composition
  layout. Owns the percentage→pixel region math and the derived footprints of the flat
  placeholders (monster, four heroes, table). All pure functions of plain numbers, unit
  tested, no Phaser import.
- **`src/scenes/boardLayout.ts`** (modified, stays Phaser-free) — `cellToPixel` unchanged
  in signature; `ORIGIN_X`/`ORIGIN_Y` re-derived from the board region (milestone B).
  Gains an exported `STONE_RADIUS` (moved out of `BattleScene`) and a `tileBounds()`
  helper so the table footprint can be derived from real tile geometry.
- **`src/scenes/depth.ts`** (new) — named depth constants for the top-level containers.
- **`src/scenes/BattleScene.ts`** (modified) — gains semantic containers and flat-shape
  placeholders; stays a thin render/input layer with no gameplay rules.
- **`src/main.ts`** (modified, milestone C) — drops the flat `backgroundColor` once a
  background placeholder covers the canvas.

### Container structure (final, end of milestone C)

All are direct scene children at position `(0, 0)`, scale `1`, ordered by `DEPTH`:

```text
backgroundContainer     DEPTH.BACKGROUND   (C)  persistent
environmentContainer    DEPTH.ENVIRONMENT  (C)  persistent
monsterContainer        DEPTH.MONSTER      (A)  persistent (redrawn only on identity change)
heroContainer           DEPTH.HERO         (A)  persistent
tableContainer          DEPTH.TABLE        (B)  persistent  ← never touched by drawBoard()
boardLayer              DEPTH.BOARD         (A)  DESTRUCTIBLE ← the only thing drawBoard() rebuilds
puzzleFeedbackContainer DEPTH.PUZZLE_FEEDBACK (A) persistent (traceGraphics is cleared, not destroyed)
hudContainer            DEPTH.HUD          (A)  persistent
transientUiContainer    DEPTH.TRANSIENT_UI (A)  holds one-shot victory text
```

`(letter)` marks the milestone that first creates the container. `boardLayer` is the
existing tile container; it keeps its `(0,0)`/scale-1 identity so `cellToPixel`'s absolute
coordinates render 1:1 in stage space (correction #2). `tableContainer` is a **separate**
top-level container at a lower depth, so `drawBoard()`'s `boardLayer.removeAll(true)`
cannot touch it (correction #4).

### `compositionLayout.ts` contract

```ts
export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 720;

export interface Band { top: number; bottom: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

export interface LayoutRegions {
  topHud: Band; monster: Band; hero: Band; board: Band; safeBottom: Band;
  boardWidthBand: { left: number; right: number; width: number };
}
export interface PlaceholderLayout { monster: Rect; heroes: Rect[] }

export function computeLayoutRegions(width: number, height: number): LayoutRegions;
export function computePlaceholderLayout(regions: LayoutRegions): PlaceholderLayout;
export function computeTableBounds(
  regions: LayoutRegions,
  tileBounds: { left: number; right: number; top: number; bottom: number },
): Rect;
```

Region percentages from the blueprint: `topHud 0–8`, `monster 8–34`, `hero 34–46`,
`board 46–93`, `safeBottom 93–100`; `boardWidthBand` is the centered 88%-of-width band.

### Derived values for the fixed 480×720 canvas

- Regions: `monster {57.6, 244.8}`, `hero {244.8, 331.2}`, `board {331.2, 669.6}`,
  `boardWidthBand {left 28.8, width 422.4, right 451.2}`.
- **`ORIGIN_X = 72`** (unchanged: centers the 380px tile bbox in 480px).
- **`ORIGIN_Y = 448`** (was 486): bottom-aligns the 236px tile bbox inside the board band
  with an 8px margin above the 93% safe line → `669.6 − 8 − 214 ≈ 448`.
- `tileBounds()` = `{left 50, right 430, top 426, bottom 662}`.
- Monster placeholder: `{x 150, y 81.2, width 180, height 140}` (140px ≈ 2× hero height).
- Hero placeholders (width 50, height 70, centerY 288), centers evenly across the board
  band: `81.6, 187.2, 292.8, 398.4`.
- Table: `{x 28.8, y 323.2, width 422.4, height 388.8}` — rear edge rises into the hero
  band (`hero.bottom − 8`) so the surface connects the brigade to the board, while still
  enclosing the tile bbox on all sides.

### Milestone B5 amendment — table/brigade/puzzle/boss-HUD refinement

Composition-refinement pass over the placeholders (no new gameplay, art, or scaling). It
supersedes several derived values above:

- **Table span** is factored into `computeTableSpan(regions) → { top, bottom }`
  (`top = hero.bottom − TABLE_REAR_OVERLAP = 323.2`,
  `bottom = safeBottom.bottom − TABLE_BOTTOM_MARGIN = 712`). `computeTableBounds` now grows
  from this span to enclose the tiles; the table bounds are **unchanged**
  (`{28.8, 323.2, 422.4, 388.8}`).
- **`ORIGIN_Y = 422`** (was 448): the 236px tile bbox is now **vertically centered inside
  the table span** — `ORIGIN_Y = round(span.top + (span.bottom − span.top − BBOX_HEIGHT)/2 +
  STONE_RADIUS)` — leaving ≈77px of table above and ≈76px below the puzzle instead of the
  puzzle sitting low.
- **`tileBounds()` = `{left 50, right 430, top 400, bottom 636}`.**
- **Heroes grounded:** each hero's lower edge = `span.top + HERO_TABLE_OVERLAP (8)` = 331.2,
  so it sinks ≈8px behind the table's rear edge (masked by the higher-depth table lip).
  Width 50 / height 70 and the horizontal centers (`81.6, 187.2, 292.8, 398.4`) are
  unchanged; only `y` moves down ≈8px. Hero-name labels are removed (they were always hidden
  behind the table).
- **Boss HUD** is factored into `computeBossHudLayout(regions) → { text, bar }`: text centered
  at the monster center-x (240) with origin `(0.5, 0)` at `y 8`, ~18px; bar
  `{x 120, y 36, width 240 (= monster.width + 60), height 12}`. Both sit inside the `topHud`
  band, replacing the old left-aligned `x 20 / width 300` bar. `data-monster-hp`, the HP
  ratio math, and `drawHp()`'s lifecycle are unchanged.

## Testing strategy

- **Automated (vitest, Phaser-free):** `compositionLayout` region/placeholder/table math
  and `boardLayout`'s re-derived `ORIGIN_*` + `tileBounds()` are fully unit tested with the
  exact numbers above.
- **Regression (Playwright, unchanged):** `tests/e2e/battle.spec.ts` recomputes every click
  via the live `cellToPixel`, so it follows the new `ORIGIN_Y` automatically and must pass
  **unmodified** — it is the pointer-accuracy and debug-API guard for the whole effort.
- **Rendering steps** (containers, flat shapes) can't be pixel-asserted in the current
  vitest setup (no Phaser boot). Their verification is: `tsc --noEmit`, the full unit
  suite, the unchanged e2e suite as a regression guard, and explicit **manual checkpoint
  assertions** (including "table survives a turn's `drawBoard()`").

## Out of scope

- `Phaser.Scale` modes / true multi-viewport responsive scaling.
- Final art, asset generation, sprite atlases, skeletal or tween-based animation.
- New gameplay, combat, or puzzle rules.
- Debug-overlay *rendering* (the debug *API* and DOM mirrors are preserved unchanged; no
  new debug visuals are added).
