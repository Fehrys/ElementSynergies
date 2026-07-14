# Combat Background Art Review — Design

**Date:** 2026-07-14
**Status:** Approved for planning

## Goal

The responsive `BattleScene` composition (`docs/superpowers/plans/2026-07-12-responsive-battle-layout.md`)
is complete and merged. A new master reference image,
`design/references/combat-background-target.png`, has been validated as the
official visual target for the combat scene's kitchen-dungeon environment.

This effort adds a **temporary, query-param-gated art review mode** that overlays
the real, current gameplay (board, boss, heroes, HUD) on top of that reference
image at its exact Phaser coordinates. The purpose is purely diagnostic: let the
art director see whether the validated composition and geometry line up with the
target art before any real background asset is produced. It is **not** the final
background integration.

## Non-goals / immutable rules

This mode must not touch, in any code path (including when the mode is
inactive):

- gameplay coordinates, `battleLayout.ts` / `boardGeometry.ts` / `compositionLayout.ts` math
- the vertical bands, board size/position, touch/hit zones
- puzzle rules, grid generation, combat, `resolveTurn`
- resize/reflow behavior (`Scale.RESIZE`, `activeLayout`, `layoutRevision`)
- existing placeholders' shapes, colors, or draw order relative to each other
- production depth constants in `depth.ts`
- the normal (non-review) rendering path — it must stay pixel-identical to the
  committed `battle-360x640.png` / `battle-480x720.png` / `battle-768x1024.png`
  baselines, with **no snapshot regeneration**.

The reference PNG itself is never modified, moved, or renamed.

## Activation

```
?artReview=combatBackground
?artReview=combatBackground&artGuides=1
```

Absent or any other value ⇒ mode `'none'`, and the scene behaves exactly as
today. Both flags are parsed once, deterministically, from
`window.location.search`, before the first `applyLayout()` call (in Phaser's
`init()` scene lifecycle hook, which runs before `preload()`/`create()`).

## Architecture

New Phaser-free, DOM-free helper module `src/scenes/combatBackgroundReview.ts`:

- `parseArtReviewMode(search: string): ArtReviewMode` (`'none' | 'combatBackground'`)
- `parseArtGuides(search: string): boolean`
- `computeCoverFit(sourceWidth, sourceHeight, viewportWidth, viewportHeight): CoverFit`
  — the `cover` placement formula from the task brief:
  `scale = max(vw/sw, vh/sh)`, centered, uniform (never anisotropic).

These are pure functions over plain numbers/strings — unit-testable in Node,
matching the project's convention for `boardGeometry.ts`/`battleLayout.ts`.

`BattleScene` stays a thin adapter:

- `init()` parses the two query flags into instance fields
  (`artReviewMode`, `artGuidesEnabled`) — known before anything else runs.
- `preload()` queues `this.load.image('combat-background-target', <imported url>)`
  only when `artReviewMode === 'combatBackground'`. Phaser's scene lifecycle
  guarantees the load queue completes before `create()` runs, so no manual
  "loaded" promise/flag is needed — by the time `create()` executes, the
  texture is available.
- The PNG is loaded via an explicit Vite asset URL import
  (`import combatBackgroundTargetUrl from '../../design/references/combat-background-target.png?url'`),
  so the design reference file is consumed directly, never copied.
- Two new **always-created-but-usually-empty** containers, at depths chosen so
  they never disturb the depth table in `depth.ts`:
  - `artReviewBackgroundContainer` — same depth as `backgroundContainer`
    (`DEPTH.BACKGROUND`); holds one persistent `Image` game object, created once
    and thereafter only resized/repositioned (never destroyed/recreated) on each
    reflow — this is what makes the redraw idempotent (no duplicate sprites).
  - `artGuidesContainer` — `DEPTH.DEBUG` (already reserved in `depth.ts` for
    exactly this kind of technical overlay, unused until now), fully
    cleared+redrawn every reflow (cheap `Graphics`, no persistent identity
    needed).
- Three existing draw methods gain a **minimal, additive branch** for masking,
  with zero behavior change when `artReviewMode === 'none'`:
  - `drawBackground()` — when in review mode, clears `backgroundContainer` and
    returns (skips the flat two-zone placeholder); the review background lives
    in its own container instead.
  - `drawEnvironment()` — clears `environmentContainer` and returns (skips the
    provisional arch/cupboard/cookware silhouettes).
  - `drawTable()` — clears `tableContainer` and returns (skips the brown table
    placeholder; the master image already shows the chopping board).
- `drawArtReviewBackground()` (new) — no-op (and clears its container) when
  mode is `'none'`; otherwise creates the sprite lazily once, then every call
  recomputes `computeCoverFit(textureWidth, textureHeight, activeLayout.background.width, activeLayout.background.height)`
  and applies `setDisplaySize`/`setPosition` — never re-imports or duplicates
  the sprite.
- `drawArtGuides()` (new) — no-op (and clears its container) unless both
  `artReviewMode === 'combatBackground'` and `artGuidesEnabled`. Draws thin,
  semi-transparent strokes sourced **exclusively** from `this.activeLayout`
  (`boss`, `heroes`, `table`, `board.tileBounds`, `gameplayColumn`, `bands`),
  plus optional very-low-alpha `hitRadius` circles per cell. No hand-copied
  coordinates.
- Both new draw calls are added to the existing `applyLayout()` sequence (which
  already runs on `create()` and every reflow), so they inherit the existing
  idempotency/no-duplication/no-leak guarantees for free — no new lifecycle
  code is needed.
- DOM surface (only set when `artReviewMode !== 'none'`, so normal-mode DOM is
  untouched): `data-art-review`, `data-art-guides`, `data-art-background-loaded`,
  `data-art-review-info` (serialized `CoverFit`, never hand-computed), and
  `data-art-review-ready="true"` set once at the end of `create()`, after the
  first `applyLayout()` — since `preload()` already blocked until the texture
  loaded, this single flag correctly gates "image loaded + placed + layout
  applied + gameplay drawn".

## Depth order in review mode

```
artReviewBackgroundContainer  DEPTH.BACKGROUND     (master image)
environmentContainer          DEPTH.ENVIRONMENT    (empty)
monsterContainer               DEPTH.MONSTER        (shadow + boss)
heroContainer                  DEPTH.HERO           (shadows + heroes)
tableContainer                 DEPTH.TABLE          (empty — board sits directly over the image's board)
boardLayer                     DEPTH.BOARD          (32 cells + special tiles/portals)
puzzleFeedbackContainer        DEPTH.PUZZLE_FEEDBACK
hudContainer                   DEPTH.HUD            (boss text + bar)
artGuidesContainer             DEPTH.DEBUG          (guides, only if artGuides=1)
```

This is exactly the existing production depth order with two containers
(`artReviewBackgroundContainer`, `artGuidesContainer`) filling previously-empty
depth slots' worth of space — no reordering of existing depths.

## Testing strategy

- **Vitest** (pure): `combatBackgroundReview.test.ts` — `parseArtReviewMode`,
  `parseArtGuides`, and `computeCoverFit` across the four ratio cases from the
  brief (3:4→480×720, 3:4→360×640, 3:4→768×1024, identical-ratio case).
- **Playwright**: a new `tests/e2e/art-review.spec.ts` covering activation,
  texture load, masking of provisional layers, presence of gameplay (boss,
  4 heroes, HUD, 32 cells), guides toggling, idempotency across two reflows
  (`getLayerObjectCounts()`-style counts via new debug-independent DOM/attr
  reads), a resize recomputing the cover fit, and confirmation that normal mode
  (`?seed=1` with no `artReview`) is untouched.
- The three committed visual baselines (`battle-360x640.png`, `battle-480x720.png`,
  `battle-768x1024.png`) must stay green with **no** `--update-snapshots` — the
  ultimate proof that the review mode is fully inert when not requested.
- Two new opaque 480×720 exports (composite, and composite+guides) captured by
  a small Playwright script/spec, gated on `[data-art-review-ready="true"]`,
  saved under `design/production/combat/lot-01-environment/review/`.

## Out of scope

Final background asset integration, any change to production depths, any new
gameplay/animation, any modification of `combat-background-target.png`.
