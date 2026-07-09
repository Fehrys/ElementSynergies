# Battle Lineup and Layout Fix — Design

**Date:** 2026-07-09
**Status:** Approved for planning

## Goal

Fix two layout problems with the current 480×720 canvas and add a wireframe "battle lineup" (4 characters vs. the monster) to fill the dead space between the HP bar and the hex grid:

1. The hex grid is currently off-center horizontally (occupies x:18–398 in a 480-wide canvas) and sits in the upper-middle of the canvas (y:98–334), leaving ~386px of unused space below it.
2. Nothing currently represents the 4-character roster or gives the monster a visual presence beyond its name/HP text — the fight is entirely abstract.

Visual fidelity is explicitly not a goal here — flat colored/outlined rectangles with text labels are the deliverable, not art.

## Architecture

### `src/scenes/boardLayout.ts` — recenter and bottom-align the grid

Change the two origin constants:

```ts
export const ORIGIN_X = 72;  // was 40
export const ORIGIN_Y = 486; // was 120
```

Derivation (canvas is 480×720, `COLS = 7`, `COL_WIDTH = 56`, `ROW_HEIGHT = 48`, stones render with a 22px radius, tallest column has 5 rows):

- **Horizontal centering:** grid spans `ORIGIN_X - 22` (left edge of col 0) to `ORIGIN_X + 6*COL_WIDTH + 22` (right edge of col 6) — a 380px-wide block. Centering 380px in a 480px canvas needs a 50px margin each side: `ORIGIN_X - 22 = 50` → `ORIGIN_X = 72`.
- **Bottom alignment:** the tallest column (5 rows, even `col`) reaches `ORIGIN_Y + 4*ROW_HEIGHT + 22` at its lowest edge. Targeting a 20px bottom margin in the 720-tall canvas: `ORIGIN_Y + 214 = 700` → `ORIGIN_Y = 486`.

Resulting grid bounding box: x ≈ 50–430, y ≈ 464–700.

`cellToPixel` itself is unchanged — only the two constants move. `tests/e2e/battle.spec.ts` computes every click coordinate by calling `cellToPixel` directly rather than hardcoding pixel numbers, so this needs no test changes; the suite automatically targets the new positions.

### `src/scenes/BattleScene.ts` — new `drawBattleLineup()` method

A new private method, called once from `create()` after `drawBoard()`/`drawHp()` (static: the roster and the monster's identity don't change turn-to-turn, only HP, which `drawHp()` already redraws separately — no need to redraw the lineup every turn).

Fills the band between the HP bar and the grid, y ≈ 100–454, full canvas width:

- **4 character boxes**, one per `ROSTER` entry, stacked vertically on the left:
  - Box: `x = 40, width = 100, height = 50`, filled with `COLOR_HEX[character.color]` (the same color-to-hex map `drawBoard()` already uses for stones).
  - Vertical positions (top edge), evenly spaced with a 20px gap, centered in the band: `y = 147, 217, 287, 357`.
  - `character.name` rendered on top of the box, positioned at the box's center point (`x + width/2, y + height/2`) with `setOrigin(0.5, 0.5)` so it's centered regardless of name length — unlike the fixed-offset trick `drawBoard()` uses for single-character tile emoji, this text is variable-length and needs real centering.
- **1 monster box**, larger, on the right:
  - Box: `x = 280, width = 160, y = 177, height = 200` — outlined only (`graphics.lineStyle(2, 0xffffff, 1)` + `strokeRect`), no fill, so it doesn't compete visually with the HP bar above it.
  - `this.monster.name` rendered the same way: centered at the box's midpoint via `setOrigin(0.5, 0.5)`.

No new state, no Phaser scene beyond the existing `BattleScene`, no changes to `src/core/` — this is pure rendering, consistent with the "scene only renders state" boundary in `CLAUDE.md`.

## Testing

- No new unit tests — nothing in `src/core/` changes.
- The existing `tests/e2e/battle.spec.ts` suite must still pass unmodified (verifying the `boardLayout.ts` constant change didn't break click targeting, since every existing test derives its click points from `cellToPixel`).
- No new e2e test is needed for the lineup itself (it's static, non-interactive decoration) — manual verification via a screenshot is sufficient to confirm the layout reads correctly.

## Out of Scope

- Any animation, sprite art, or real character/monster imagery — flat wireframe shapes only.
- Any change to combat logic, damage calculation, or `Character`/`Monster` data shapes in `src/core/combat.ts`.
- Any interactivity on the character/monster boxes (they are not clickable).
- Redrawing the lineup per turn or reflecting damage/state visually on the characters or monster box (HP changes remain solely reflected via the existing `drawHp()` text/bar).
