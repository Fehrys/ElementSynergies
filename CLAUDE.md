# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A vertical-slice prototype of a free-form, same-color chain-connect puzzle (from the mobile game *Spirit Stones*) wired to a minimal RPG combat outcome: drag chains of hex-adjacent same-color stones to damage a monster. Built with Phaser 3 + TypeScript + Vite. See `docs/superpowers/specs/2026-07-05-spirit-stones-puzzle-design.md` for the full design spec (mechanics, special tiles, rejected ideas).

## Commands

```bash
npm run dev          # start Vite dev server (localhost:5173)
npm run build        # production build
npm test             # run all Vitest unit tests (tests/core/**)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # run all Playwright e2e tests (tests/e2e/**), auto-starts dev server
```

Single test file / by name:
```bash
npx vitest run tests/core/chain.test.ts
npx vitest run -t "chain name substring"
npx playwright test tests/e2e/battle.spec.ts
npx playwright test -g "test name substring"
```

There is no lint script configured; `tsc` type-checking happens implicitly via Vite/Vitest (`tsconfig.json` has `strict: true`, `noEmit: true`).

## Architecture

The core rule of this codebase: **puzzle/combat logic is pure TypeScript with zero Phaser dependency**, and lives entirely under `src/core/`. `src/scenes/BattleScene.ts` is the only Phaser scene — it only renders state and turns pointer input into a `CellCoord[]` path, then hands the finished drag to `resolveTurn()`. All rules, math, and state mutation happen in `core/`. When adding a mechanic, put the logic in `core/` and keep the scene as a thin dispatcher.

`src/scenes/boardLayout.ts` (pixel math: `cellToPixel`, cell radius/spacing constants) is deliberately kept Phaser-free too, so `tests/e2e/*.spec.ts` can import it directly in plain Node to compute click coordinates without booting a browser-only module.

### Core module map (`src/core/`)

- **`grid.ts`** — `HexGrid` (sparse cell-content map), the honeycomb shape (`COLS = 7`, alternating 5/4-cell column heights), and the offset↔axial coordinate conversion. All hex adjacency (`getNeighbors`) goes through axial coordinates internally even though every other module speaks in the rendered `{row, col}` offset scheme — this is the one file that should know about that conversion.
- **`chain.ts`** — validates a full dragged path (`validateChain`) into one or more scored `SubChain`s, and separately exposes `canExtendChain` for live per-step validation during an in-progress drag (used by `BattleScene` so an invalid step is simply ignored rather than breaking the chain). Both share color/portal bookkeeping logic (see `replayState`) — keep them in sync if you change the color/portal rules.
- **`specialTiles.ts`** — `getAffectedCells(grid, origin, type, rng)` is the single entry point for what a special tile destroys (bomb/sword/bow/dynamite/doubleSword/doubleArrowBow). Sword picks whichever diagonal axis reaches further from its position; dynamite's "column" is the raw offset `col`, not an axial direction.
- **`combat.ts`** — 4-character roster (1:1 with the 4 colors), `calculateDamage = ATK × count`, monster HP (immutable updates).
- **`refill.ts`** — gravity (`applyGravity`) + refill (`fillEmpty`) after a clear; `randomStone()` (in `grid.ts`) rolls portal/special/plain-stone odds for every newly filled cell.
- **`resolution.ts`** — `resolveTurn` is the only entry point `BattleScene` calls per drag: validates the chain, scores/clears wave 1, refills, then loops resolving special-tile chain reactions (wave 2, 3, ...) until a wave triggers no more special tiles, tracking combo depth and the combo-depth-3 bonus tile spawn.
- **`rng.ts`** — every core function takes an injected `RandomFn` (never calls `Math.random()` directly) so behavior is reproducible. `mulberry32(seed)` is the deterministic PRNG used by tests and by `?seed=N` in the URL.

### Determinism & e2e testability conventions

- Pass `?seed=N` in the dev URL to get a reproducible board (`BattleScene.create` swaps `mulberry32(N)` in for `Math.random`). E2e specs rely on this to compute an expected board state (`fillBoard(new HexGrid(), mulberry32(seed))`) and derive real click coordinates via `cellToPixel`, rather than asserting against arbitrary UI.
- Since Phaser renders to `<canvas>` and isn't DOM-inspectable, `BattleScene` mirrors state Playwright needs into DOM attributes on `<body>` (`data-scene`, `data-monster-hp`). Add more of these rather than trying to read canvas pixels if a new e2e test needs to observe scene state.

## Workflow convention

Feature work in this repo follows a design-doc → plan → implementation pattern under `docs/superpowers/`: a dated design spec in `docs/superpowers/specs/`, then a dated implementation plan in `docs/superpowers/plans/`, then the actual commits. Check the latest files in both folders for the most current mechanic rules and rationale before changing puzzle/combat behavior — the spec files record design decisions (including explicitly rejected alternatives) that aren't otherwise visible in code.

## Design documentation

Before making visual, layout, animation, or UX changes, read `design/README.md`.

Then read only the design documents relevant to the requested task.

For BattleScene visual work, always read:

- `design/DESIGN_PRINCIPLES.md`
- `design/COMBAT_SCREEN.md`
- `design/VISUAL_COMPOSITION.md`

For animation or interaction feedback work, also read:

- `design/MOTION_LANGUAGE.md`

Creative documents describe intent. Do not silently alter core gameplay rules to satisfy visual direction.

For BattleScene art, layout, rendering, or presentation work, also read:

- `design/ART_TARGET.md`

Treat the reference image as a qualitative art target, not as an exact layout specification.