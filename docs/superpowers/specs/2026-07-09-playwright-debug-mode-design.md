# Playwright Debug Mode — Design

**Date:** 2026-07-09
**Status:** Approved for planning

## Goal

`bugs.txt` lists testability gaps: no way for Playwright (or manual testing through Playwright) to see how many/which tiles a chain destroyed, the damage calculation/result, or to spawn a special tile/portal on demand to set up a scenario. Add a `window.__debug` surface, active only behind a `?debug=1` query flag, that closes these gaps without adding any visible UI — this is a testing tool, not a player-facing feature.

## Architecture

### Gating

`BattleScene.create()` checks `?debug=1` the same way it already checks `?seed=N` (`new URLSearchParams(window.location.search).get('debug') === '1'`). Only when present does it construct `window.__debug`. Everything below is conditional on this flag; normal play and the existing e2e tests (which don't pass `?debug=1`) are unaffected.

### `window.__debug` surface

All five members live in one object, assigned once in `create()`. All mutation methods call the scene's existing `drawBoard()`/`drawHp()` redraw helpers so the canvas stays in sync with the debug-mutated state (important for the "manual testing sandbox" use case, where a human is watching screenshots, not just asserting on DOM).

- **`lastTurn: ResolutionResult | null`**
  Starts `null`. After every `resolveTurn()` call in `onPointerUp` (when debug mode is on), set to that call's full return value verbatim — `damageEvents` (per-color count + damage), `totalDamage`, `comboDepth`, `bonusTileSpawned`, `valid`, `reason`. This is a read-only snapshot; `BattleScene` already computes all of it, debug mode just stops throwing it away.

- **`spawnTile(row: number, col: number, tile: SpecialTileType): void`**
  Sets the cell to `{ type: 'special', tile }`, then redraws the board. No new bounds-checking is introduced: `HexGrid.set`/`.get` already perform none, and an out-of-bounds write is simply invisible to `getAllCells()` (and therefore to `getBoard()` and `drawBoard()`) — consistent with how the rest of the codebase already treats grid coordinates.

- **`spawnPortal(row: number, col: number): void`**
  Sets the cell to `{ type: 'portal' }`, then redraws the board.

- **`setMonsterHp(hp: number): void`**
  Clamps `hp` to `[0, this.monster.maxHp]`, assigns it, calls `drawHp()` (which also mirrors `data-monster-hp`), then re-runs the same post-turn defeat check `onPointerUp` already does: if `isDefeated(this.monster)`, show the "Victory!" text and set `data-scene="victory"`. This reuses the real defeat path instead of introducing a second one.

- **`getBoard(): { row: number; col: number; content: CellContent }[]`**
  Returns every cell from `grid.getAllCells()` paired with `grid.get(row, col)`. Lets a test read back actual board state after debug mutations or several turns of refills, instead of only being able to derive expected state by replaying `mulberry32(seed)` locally (which stops matching reality the moment any debug action or turn has mutated the live grid).

### Out of scope

- No visible on-screen debug panel — this is a Playwright-only surface, per user decision.
- No stone-color spawning — debug board setup is limited to special tiles and portals (per user decision); plain stones are already fully controllable by picking a seed where a desired stone lands where you want it.
- No no-reload "reset the encounter" hook, no RNG-peeking hook, no live `validateChain`/`canExtendChain` hook — all considered and rejected: a fresh `page.goto('/?seed=N&debug=1')` already resets cheaply, and chain-validation logic is already directly importable as pure functions in e2e test files (see `tests/e2e/battle.spec.ts`), so a live hook would just duplicate that.
- No changes to `src/core/`. This is entirely test scaffolding inside `src/scenes/BattleScene.ts` — no game-logic changes.

## Testing

- `tests/e2e/battle.spec.ts` (or a new debug-focused spec file): navigate with `?debug=1` in addition to `?seed=N`, assert `window.__debug` is present via `page.evaluate`.
- Cover each hook: `spawnTile` + `getBoard` round-trip (spawn a bomb, read it back), `spawnPortal` + `getBoard` round-trip, `setMonsterHp` down to a value that leaves the monster still alive vs. down to 0 (asserting the victory DOM state fires), and `lastTurn` populated correctly after a real drag (cross-check its `damageEvents`/`totalDamage` against the DOM-mirrored `data-monster-hp` delta).
- No new `tests/core/*` unit tests — nothing in `src/core/` changes.
