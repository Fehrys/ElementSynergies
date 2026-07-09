# Battle Lineup and Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recenter and bottom-align the hex grid in the 480×720 canvas (currently off-center and stranded in the upper-middle, leaving ~386px of dead space below it), then fill that now-freed band with a static wireframe "battle lineup" — 4 colored character boxes and an outlined monster box — between the HP bar and the grid.

**Architecture:** Two independent, sequential changes. Task 1 moves two pixel-origin constants in `src/scenes/boardLayout.ts` (`cellToPixel`'s math is untouched, so every consumer — `drawBoard`, `cellAt`, `drawTraceLine`, and every e2e test's click-coordinate calculation — picks up the new position automatically). Task 2 adds one new private method to `BattleScene.ts`, called once from `create()`, that draws flat rectangles + centered text for the roster and monster. No `src/core/` changes in either task.

**Tech Stack:** TypeScript, Phaser 3 (scene layer only). Verified via the existing Playwright e2e suite (`tests/e2e/battle.spec.ts`) plus one manual screenshot for the purely-visual Task 2.

## Global Constraints

- No changes to `src/core/` — this is pure rendering/layout, consistent with `CLAUDE.md`'s "scene only renders state" boundary.
- Canvas is fixed at 480×720 (`src/main.ts`) — not part of this plan to change.
- Grid math constants: `COLS = 7`, `COL_WIDTH = 56`, `ROW_HEIGHT = 48`, stone render radius `22`, tallest column has 5 rows (from `src/core/grid.ts` and `src/scenes/BattleScene.ts`'s `STONE_RADIUS`).
- Test command for this plan: `npx playwright test tests/e2e/battle.spec.ts` (full e2e suite: `npm run test:e2e`). The unit suite (`npm test`) is unaffected since no `src/core/` file changes.
- Design source of truth: `docs/superpowers/specs/2026-07-09-battle-lineup-and-layout-design.md`.

---

## Task 1: Recenter and bottom-align the grid

**Files:**
- Modify: `src/scenes/boardLayout.ts`
- Test: `tests/e2e/battle.spec.ts` (no edits — existing suite verifies this task)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ORIGIN_X` and `ORIGIN_Y` change value only — `cellToPixel`'s signature and every other export in this file is unchanged, so no other file needs edits. `src/scenes/BattleScene.ts` re-exports `ORIGIN_X, ORIGIN_Y, COL_WIDTH, ROW_HEIGHT, cellToPixel` from this module (line 17) — that re-export is untouched by this task since it doesn't name specific values.

- [ ] **Step 1: Change the origin constants**

In `src/scenes/boardLayout.ts`, replace:

```ts
export const ORIGIN_X = 40;
export const ORIGIN_Y = 120;
```

with:

```ts
// Recentered/bottom-aligned for the 480x720 canvas: the grid's bounding
// box (COLS=7 columns, tallest column 5 rows, COL_WIDTH=56, ROW_HEIGHT=48,
// stones rendered at 22px radius) is 380px wide and 236px tall including
// radius padding. ORIGIN_X centers that 380px block in the 480px-wide
// canvas (50px margin each side). ORIGIN_Y bottom-aligns it with a 20px
// margin from the 720px-tall canvas's bottom edge. See
// docs/superpowers/specs/2026-07-09-battle-lineup-and-layout-design.md
// for the full derivation.
export const ORIGIN_X = 72;
export const ORIGIN_Y = 486;
```

- [ ] **Step 2: Run the e2e suite to verify the move didn't break click targeting**

Run: `npx playwright test tests/e2e/battle.spec.ts`
Expected: all 8 tests PASS. (If the very first test times out on a cold dev-server start, that's a known flake — just re-run.) Every test computes its click coordinates by calling `cellToPixel` directly rather than hardcoding pixel numbers, so this suite is the regression check for this task — no new test needed.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/boardLayout.ts
git commit -m "fix: recenter and bottom-align the hex grid in the canvas"
```

---

## Task 2: Add the battle lineup wireframe

**Files:**
- Modify: `src/scenes/BattleScene.ts`

**Interfaces:**
- Consumes: `ROSTER` (already imported from `../core/combat`, an array of `Character { id, name, color, atk }`), `COLOR_HEX` (already defined in this file, `Record<ElementColor, number>`), `this.monster.name` (already set in `create()` before this method is called).
- Produces: a new private method `drawBattleLineup(): void`, called once from `create()`. No new exports, no new state fields — nothing else depends on this.

- [ ] **Step 1: Add the method**

In `src/scenes/BattleScene.ts`, add this new private method immediately after `drawHp()` (i.e., as the last method in the class, just before the closing `}` of `BattleScene` on line 292):

```ts

  // Static wireframe placeholder for the 4-character roster vs. the
  // monster, filling the band between the HP bar and the grid (y ~100-454).
  // Drawn once in create() since only HP changes turn-to-turn — that's
  // handled separately by drawHp() — not the roster/monster identity.
  private drawBattleLineup(): void {
    const graphics = this.add.graphics();

    ROSTER.forEach((character, i) => {
      const x = 40;
      const y = 147 + i * 70;
      const width = 100;
      const height = 50;
      graphics.fillStyle(COLOR_HEX[character.color], 1);
      graphics.fillRect(x, y, width, height);
      this.add
        .text(x + width / 2, y + height / 2, character.name, { fontSize: '14px', color: '#000000' })
        .setOrigin(0.5, 0.5);
    });

    const monsterX = 280;
    const monsterY = 177;
    const monsterWidth = 160;
    const monsterHeight = 200;
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.strokeRect(monsterX, monsterY, monsterWidth, monsterHeight);
    this.add
      .text(monsterX + monsterWidth / 2, monsterY + monsterHeight / 2, this.monster.name, {
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
  }
```

- [ ] **Step 2: Call it from `create()`**

The exact two-line sequence `this.drawBoard();` / `this.drawHp();` appears twice in the file (once in `create()`, once in `onPointerUp()`) — use the surrounding `pointerdown` line below to target the `create()` occurrence specifically. Replace:

```ts
    this.drawBoard();
    this.drawHp();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
```

with:

```ts
    this.drawBoard();
    this.drawHp();
    this.drawBattleLineup();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
```

- [ ] **Step 3: Run the e2e suite to confirm no regression**

Run: `npx playwright test tests/e2e/battle.spec.ts`
Expected: all 8 tests PASS. The lineup boxes are non-interactive decoration positioned in the y~100-454 band, which doesn't overlap any grid cell's click target (grid now starts at y~464 per Task 1), so no existing click-based test should be affected.

- [ ] **Step 4: Manually verify the layout with a screenshot**

Start the dev server in the background:

```bash
npm run dev &
```

Wait for it to be reachable, then capture a screenshot with Playwright's CLI (no test file needed):

```bash
npx playwright screenshot --viewport-size=480,720 "http://localhost:5173/?seed=1" battle-lineup-screenshot.png
```

Open `battle-lineup-screenshot.png` and confirm:
- The hex grid is horizontally centered and sits at the bottom of the canvas.
- 4 colored rectangles (red/green/yellow/blue, matching `COLOR_HEX`), each labeled with a character name, are stacked vertically on the left in the band above the grid.
- An outlined rectangle labeled with the monster's name sits on the right in that same band, not overlapping the character boxes or the grid.

Stop the dev server (`kill` the background process or `Ctrl+C` if run in the foreground) once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "feat: add wireframe battle lineup between the HP bar and the grid"
```
