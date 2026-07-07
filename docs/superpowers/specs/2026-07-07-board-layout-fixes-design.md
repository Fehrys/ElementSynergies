# Board Layout Fixes — Design

**Date:** 2026-07-07
**Status:** Approved for planning

## Goal

Two board-legibility fixes surfaced from playtesting the Spirit Stones prototype against the reference screenshot (`spirit_stone.png`):

1. The hex grid's stagger axis is transposed compared to the reference — columns should render as straight vertical lines, but currently render as zigzags (and rows vice versa).
2. Special tiles are indistinguishable at a glance — all six types render as a uniform gray circle with a barely-legible single/double letter.

These are unrelated to each other and unrelated to the in-progress drag-trace-line feature (paused, to resume after this lands), but both were raised in the same session and are both "make the existing board correct/readable" fixes, so they're specified and planned together.

## Part 1: Grid Orientation Transpose

### Problem

`spirit_stone.png` shows flat-top hexagons arranged in straight vertical columns, with alternating columns offset vertically by half a cell (confirmed via pixel analysis: sampling gem centers shows constant x / varying y within a column). The current implementation renders pointy-top hexagons in straight horizontal rows, offsetting alternating rows horizontally instead. It's a 90°-transposed stagger axis, not a cosmetic difference.

This isn't just a rendering bug: `refill.ts`'s gravity groups cells by the raw `col` field and treats increasing `row` as "down" (its own comment calls this "a deliberate simplification of 'vertical'"), and `specialTiles.ts`'s dynamite clears `col ± 1` across all rows as its "column" blast. Both already assume `col` denotes a true vertical line — an assumption the current shape and rendering don't actually honor, since today's shape (`rowWidth`: 7 rows alternating 5/4 cells) means a given `col` value only exists on some rows, leaving gaps rather than a clean run of cells.

### Fix

**`src/core/grid.ts`:**
- Replace `ROWS` / `rowWidth(row)` with `COLS = 7` and `colHeight(col)`, using the same alternating pattern (even columns: 5 cells, odd columns: 4 cells) — same 32-cell total, just reassigned from rows to columns. This is a direct transpose of the existing numbers, not a redesign of the board's proportions (chosen over re-deriving new proportions since the reference screenshot is cropped and can't fully verify total board dimensions anyway).
- `isValidCell`, `getAllCells` update their bounds-checking/iteration to use `COLS`/`colHeight` instead of `ROWS`/`rowWidth`.
- `toAxial`/`toOffset` swap which coordinate absorbs the parity stagger: `toAxial(row, col) = { q: row - Math.floor(col / 2), r: col }`, `toOffset({q, r}) = { col: r, row: q + Math.floor(r / 2) }`. `AXIAL_DIRECTIONS` (the 6 abstract neighbor vectors) are unchanged — hex adjacency is orientation-agnostic; only the offset↔axial mapping flips.
- `ROW_AXIS_DIRECTION_INDICES` (exported but unused outside `grid.ts` itself) renamed to `COL_AXIS_DIRECTION_INDICES` — the `dr=0` pair now means "same column" instead of "same row". `DIAGONAL_AXIS_DIRECTION_INDICES` is unchanged, and sword/double-sword need no behavior change since they only ever use the diagonal pairs.

**`src/scenes/boardLayout.ts`:**
- `cellToPixel` flips which axis is straight: `x = ORIGIN_X + col * COL_WIDTH` (columns become constant-x straight lines), `y = ORIGIN_Y + row * ROW_HEIGHT + (col % 2 === 1 ? ROW_HEIGHT / 2 : 0)` (row position shifts by half a cell based on column parity).
- `CELL_WIDTH` renamed `COL_WIDTH` for clarity.
- The board's footprint flips from portrait (~310×335px) to landscape (~390×265px). `ORIGIN_X`/`ORIGIN_Y` get nudged during implementation to keep it reasonably centered in the existing 480×720 canvas — treated as an implementation tuning detail, not a design decision requiring sign-off.

### What doesn't change

`refill.ts` (gravity) and `specialTiles.ts`'s `dynamiteCells` need zero code changes — they already treat `col` as the vertical-line concept; the shape/axial fix makes that assumption true instead of aspirational. `chain.ts`, `resolution.ts`, `combat.ts` are untouched — they only consume `getNeighbors`/`getAllCells` generically.

### Testing

- `tests/core/grid.test.ts`: dimension test updates from `ROWS`/`rowWidth` to `COLS`/`colHeight`; neighbor-math fixtures need recomputing against the new offset↔axial formulas.
- `tests/core/specialTiles.test.ts`: dynamite test's comment/assertion ("columns 0,1,2 across all valid rows... col0/1/2 each valid in rows 0-6") assumed the old row-major shape; needs updating to the new column-major cell counts per column.
- `tests/core/refill.test.ts`: gravity test assumes column 0 spans rows 0–6 (7 cells); under the new shape, column 0 (even, tall) spans rows 0–4 (5 cells) — fixture needs adjusting.
- `tests/core/chain.test.ts` / `tests/core/resolution.test.ts`: reviewed, don't appear to hardcode shape-specific fixtures — verify during implementation but likely unchanged.
- `tests/e2e/battle.spec.ts`: computes chains generically off live grid state and imports `cellToPixel` rather than hardcoding pixel positions — expected to keep working unmodified.

## Part 2: Special Tile Icons

### Problem

All six special tile types render as a uniform gray circle (`0x888888`) with a single/double-letter label (`B`/`S`/`W`/`D`/`SS`/`WW`). The letters aren't self-explanatory without already knowing the mapping, and the uniform gray gives no visual distinction between types at a glance.

### Fix

In `src/scenes/BattleScene.ts`, replace the `TILE_LABEL` record's values with emoji:

| Tile | Icon |
|---|---|
| Bomb | 💣 |
| Sword | 🗡️ |
| Bow | 🏹 |
| Dynamite (improved bomb) | 🧨 |
| Double Sword (improved sword) | ⚔️ |
| Double Arrow Bow (improved bow) | 🔫 |

Dynamite and Double Sword get distinct, thematically-fitting glyphs rather than doubled text (a dynamite stick and crossed swords both read clearly on their own). Double Arrow Bow uses a gun instead of a doubled bow glyph, reading as "upgraded ranged weapon" without relying on repeated characters.

Font size for the label bumps up slightly from 14px since emoji need a bit more visual room than a single letter did; exact sizing verified against the 22px stone radius during implementation so labels don't crowd the circle.

No other rendering logic changes — this is a data-table swap (`TILE_LABEL` values) plus a font-size tweak.

### Testing

Purely visual — no unit-testable behavior change (the tile *type* → *effect* mapping in `specialTiles.ts` is untouched; only its on-screen label changes). No new automated test needed; verified by eye during implementation (e.g. via a seeded board that includes special tiles).

## Out of Scope

- The drag-trace-line feature (paused separately, to resume once this lands).
- Exact pixel tuning of `ORIGIN_X`/`ORIGIN_Y`/canvas size for the new landscape board footprint — handled as implementation-time polish, not specified precisely here.
- Any change to special-tile *effects*, spawn rates, or combo mechanics — this is rendering/legibility only.
