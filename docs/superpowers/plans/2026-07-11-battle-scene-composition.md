# Battle Scene Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `BattleScene` from its stacked-rectangle HUD/lineup toward the
`BATTLE_SCENE_BLUEPRINT.md` composition, in three independently shippable milestones —
using a centralized composition-layout module and flat production-footprint placeholders —
without changing gameplay, puzzle input accuracy, debug mode, seeded board behavior, or the
pure-TS / Phaser boundary. Follows
`docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md`.

**Architecture:** A new Phaser-free `compositionLayout.ts` translates the blueprint's
percentage composition ranges into pixel regions and derives the flat placeholders'
footprints. `boardLayout.ts` re-derives `ORIGIN_X`/`ORIGIN_Y` from those regions (its
`cellToPixel` signature and Node-importability unchanged). `BattleScene` gains semantic
containers (one per depth group) and flat-shape monster/hero/table placeholders positioned
from the layout module, while staying a thin render/input layer.

**Tech Stack:** TypeScript, Phaser 3, Vitest (unit), Playwright (e2e). No new dependencies.

## Global Constraints

*(Every task's requirements implicitly include this section.)*

- **Fixed resolution:** the canvas stays **480×720**; no `Phaser.Scale` mode is added or
  changed.
- **Phaser-free coordinates:** `compositionLayout.ts` and `boardLayout.ts` import no Phaser.
  `cellToPixel(row, col)` keeps its exact signature and returns absolute stage-space
  coordinates callable from plain Node.
- **Untransformed puzzle:** the tile container (`boardLayer`) and every container stay at
  position `(0, 0)`, scale `1`. No repositioning is ever done via a container transform —
  only via `ORIGIN_X`/`ORIGIN_Y`.
- **Persistent vs. destructible layers:** `drawBoard()` rebuilds **only** `boardLayer`. It
  must never destroy the table, background, environment, or persistent feedback layers.
- **Debug API + DOM mirrors preserved:** `window.__debug` (lastTurn / spawnTile /
  spawnPortal / getBoard / setMonsterHp) and the `data-scene` / `data-monster-hp`
  attributes must keep firing at the same lifecycle points.
- **Seeded board preserved:** no change to `rng.ts`, `grid.ts`, `fillBoard`, or `?seed=N`
  behavior. `tests/e2e/battle.spec.ts` must pass **unmodified** after every rendering task.
- **No gameplay in the scene:** all new code is pure rendering/layout; nothing from
  `src/core/` moves or changes.

---

# MILESTONE A — Structural container migration (zero visual change)

Introduce named containers and re-parent every existing draw call into them, keeping every
pixel, color, and position identical to today. This milestone ships a scene that looks
byte-for-byte the same but is structurally ready for B/C.

---

### Task A1: Named depth constants

**Files:**
- Create: `src/scenes/depth.ts`

**Interfaces:**
- Produces: `DEPTH` — const object with numeric keys `BACKGROUND, ENVIRONMENT,
  MONSTER, HERO, TABLE, BOARD, PUZZLE_FEEDBACK, HUD, TRANSIENT_UI, DEBUG`. Task A2 consumes
  the subset it instantiates; B/C consume the rest.

- [ ] **Step 1: Write the file**

No unit test — this is a static constant table with no logic (its effect is verified by the
container stacking + the unchanged e2e suite in A2).

Create `src/scenes/depth.ts`:

```ts
// Named depth values for BattleScene's top-level containers, translating the
// "Phaser Display Hierarchy" section of
// design/implementation/BATTLE_SCENE_BLUEPRINT.md into constants. Higher
// values render on top. Not every entry is instantiated in every milestone;
// this is the canonical reference table so container order is never guessed.
export const DEPTH = {
  BACKGROUND: 0,
  ENVIRONMENT: 10,
  MONSTER: 21,
  HERO: 31,
  TABLE: 40,
  BOARD: 50,
  PUZZLE_FEEDBACK: 60,
  HUD: 80,
  TRANSIENT_UI: 90,
  DEBUG: 100,
} as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/depth.ts
git commit -m "feat: add named depth constants for battle scene containers"
```

---

### Task A2: Re-parent existing draws into semantic containers

**Files:**
- Modify: `src/scenes/BattleScene.ts` — class fields (currently lines 65–74), `create()`
  (currently lines 117–124), `checkVictory()` (currently lines 223–228), and
  `drawBattleLineup()` (currently lines 298–325).

**Interfaces:**
- Consumes: `DEPTH` from A1.
- Produces: private fields `monsterContainer, heroContainer, puzzleFeedbackContainer,
  hudContainer, transientUiContainer` (all `Phaser.GameObjects.Container`), plus
  `boardLayer` gaining `DEPTH.BOARD`. Milestone B adds `tableContainer` and replaces the
  lineup; milestone C adds `backgroundContainer`/`environmentContainer`.

This is a pure re-parenting refactor: **no position, size, color, or draw-order-visible
change.** Only the containers holding the objects change. Because today's HUD (y≈20–66),
lineup (y≈100–454), and board (y≈464–700) occupy non-overlapping vertical bands, assigning
them separate depths cannot alter what the player sees.

- [ ] **Step 1: Add the import**

In `src/scenes/BattleScene.ts`, after the existing `boardLayout` import (line 15), add:

```ts
import { DEPTH } from './depth';
```

- [ ] **Step 2: Replace the field block (lines 65–74)**

```ts
export class BattleScene extends Phaser.Scene {
  private grid!: HexGrid;
  private rng!: RandomFn;
  private monster!: Monster;
  private path: CellCoord[] = [];
  private dragging = false;
  private monsterContainer!: Phaser.GameObjects.Container;
  private heroContainer!: Phaser.GameObjects.Container;
  private boardLayer!: Phaser.GameObjects.Container;
  private puzzleFeedbackContainer!: Phaser.GameObjects.Container;
  private hudContainer!: Phaser.GameObjects.Container;
  private transientUiContainer!: Phaser.GameObjects.Container;
  private hpText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private traceGraphics!: Phaser.GameObjects.Graphics;
```

- [ ] **Step 3: Replace the object-creation block in `create()` (lines 117–124)**

```ts
    // Semantic containers, all at (0,0) scale 1 so absolute cellToPixel
    // coordinates render 1:1 in stage space (never reposition via transforms).
    this.monsterContainer = this.add.container(0, 0).setDepth(DEPTH.MONSTER);
    this.heroContainer = this.add.container(0, 0).setDepth(DEPTH.HERO);
    this.boardLayer = this.add.container(0, 0).setDepth(DEPTH.BOARD);
    this.puzzleFeedbackContainer = this.add.container(0, 0).setDepth(DEPTH.PUZZLE_FEEDBACK);
    this.hudContainer = this.add.container(0, 0).setDepth(DEPTH.HUD);
    this.transientUiContainer = this.add.container(0, 0).setDepth(DEPTH.TRANSIENT_UI);

    this.traceGraphics = this.add.graphics();
    this.puzzleFeedbackContainer.add(this.traceGraphics);
    this.hpText = this.add.text(20, 20, '', { fontSize: '20px', color: '#ffffff' });
    this.hpBar = this.add.graphics();
    this.hudContainer.add([this.hpBar, this.hpText]);

    this.drawBoard();
    this.drawHp();
    this.drawBattleLineup();
```

(`drawBattleLineup()` is still called and still draws the current rectangle cards — this
milestone only re-parents them, Step 5. `drawBoard()` still populates `this.boardLayer`
verbatim; no edit to `drawBoard()` is needed.)

- [ ] **Step 4: Re-parent the victory text in `checkVictory()` (lines 223–228)**

```ts
  private checkVictory(): void {
    if (isDefeated(this.monster)) {
      const victoryText = this.add.text(140, 400, 'Victory!', {
        fontSize: '32px',
        color: '#ffffff',
      });
      this.transientUiContainer.add(victoryText);
      document.body.setAttribute('data-scene', 'victory');
    }
  }
```

(Position `140, 400` is **unchanged** from today — repositioning happens in milestone C.
The `data-scene="victory"` attribute is preserved exactly.)

- [ ] **Step 5: Re-parent the lineup in `drawBattleLineup()` (lines 298–325)**

Split the single shared `graphics` into a hero graphics object (added to `heroContainer`)
and a monster graphics object (added to `monsterContainer`), and add each text to the
matching container. **All coordinates, sizes, colors, and the stroke stay identical to the
current method** — only the parent container changes:

```ts
  private drawBattleLineup(): void {
    const heroGraphics = this.add.graphics();
    this.heroContainer.add(heroGraphics);

    ROSTER.forEach((character, i) => {
      const x = 40;
      const y = 147 + i * 70;
      const width = 100;
      const height = 50;
      heroGraphics.fillStyle(COLOR_HEX[character.color], 1);
      heroGraphics.fillRect(x, y, width, height);
      const label = this.add
        .text(x + width / 2, y + height / 2, character.name, { fontSize: '14px', color: '#000000' })
        .setOrigin(0.5, 0.5);
      this.heroContainer.add(label);
    });

    const monsterGraphics = this.add.graphics();
    this.monsterContainer.add(monsterGraphics);

    const monsterX = 280;
    const monsterY = 177;
    const monsterWidth = 160;
    const monsterHeight = 200;
    monsterGraphics.lineStyle(2, 0xffffff, 1);
    monsterGraphics.strokeRect(monsterX, monsterY, monsterWidth, monsterHeight);
    const monsterLabel = this.add
      .text(monsterX + monsterWidth / 2, monsterY + monsterHeight / 2, this.monster.name, {
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
    this.monsterContainer.add(monsterLabel);
  }
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS (all existing `tests/core/**` tests — none touched).

- [ ] **Step 8: Run the e2e suite (pointer-accuracy + debug-API regression guard)**

Run: `npm run test:e2e`
Expected: PASS (8/8, unmodified). Confirms re-parenting shifted nothing the pointer
hit-tests against and that `data-scene` / `data-monster-hp` / `window.__debug` still fire.

- [ ] **Step 9: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "refactor: re-parent battle scene draws into semantic containers"
```

---

## ✅ CHECKPOINT A

Stop and verify before starting milestone B:

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm test` green.
- [ ] `npm run test:e2e` green (8/8, file unmodified).
- [ ] `npm run dev` → open `http://localhost:5173/?seed=1`: the scene is **visually
      equivalent** to before milestone A (same HP bar, same left-stacked hero cards, same
      monster outline box, same board position). Take a screenshot and compare against a
      pre-A screenshot captured under the **same browser, viewport, seed, and zoom**. Any
      layout/color/position difference is a bug in the re-parenting; do **not** reject the
      checkpoint solely for negligible rasterization or anti-aliasing differences.
- [ ] `http://localhost:5173/?debug=1` → browser console `window.__debug.setMonsterHp(1)`
      updates the HP bar and `__debug.spawnTile(0,0,'bomb')` redraws a tile — debug API
      intact.

Do not proceed until every box is checked.

---

# MILESTONE B — New composition (production-footprint placeholders)

Introduce the centralized composition layout, re-derive the board origin, add the
persistent table surface (separate from the tile layer), and replace the rectangle-card
lineup with flat monster/hero placeholders whose bounds/anchors/overlap already match the
intended final footprints.

---

### Task B1: `compositionLayout.ts` — regions + placeholder footprints

**Files:**
- Create: `src/scenes/compositionLayout.ts`
- Test: `tests/scenes/compositionLayout.test.ts`

**Interfaces:**
- Produces: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `Band`, `Rect`, `LayoutRegions`,
  `PlaceholderLayout`, `computeLayoutRegions(width, height)`,
  `computePlaceholderLayout(regions)`, `computeTableBounds(regions, tileBounds)`. Task B2
  consumes `computeLayoutRegions`/`CANVAS_*`; B3 consumes `computeTableBounds`; B4 consumes
  `computePlaceholderLayout`.

- [ ] **Step 1: Write the failing test**

Create `tests/scenes/compositionLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeLayoutRegions,
  computePlaceholderLayout,
  computeTableBounds,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../../src/scenes/compositionLayout';

describe('computeLayoutRegions', () => {
  const r = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);

  it('matches the blueprint percentage ranges for the fixed canvas', () => {
    expect(r.topHud).toEqual({ top: 0, bottom: 57.6, height: 57.6 });
    expect(r.monster).toEqual({ top: 57.6, bottom: 244.8, height: 187.2 });
    expect(r.hero).toEqual({ top: 244.8, bottom: 331.2, height: 86.4 });
    expect(r.board).toEqual({ top: 331.2, bottom: 669.6, height: 338.4 });
    expect(r.safeBottom).toEqual({ top: 669.6, bottom: 720, height: 50.4 });
  });

  it('produces contiguous, non-overlapping vertical bands', () => {
    expect(r.topHud.bottom).toBe(r.monster.top);
    expect(r.monster.bottom).toBe(r.hero.top);
    expect(r.hero.bottom).toBe(r.board.top);
    expect(r.board.bottom).toBe(r.safeBottom.top);
    expect(r.safeBottom.bottom).toBe(CANVAS_HEIGHT);
  });

  it('centers an 88%-wide board band on the canvas width', () => {
    expect(r.boardWidthBand.width).toBeCloseTo(422.4, 5);
    expect(r.boardWidthBand.left).toBeCloseTo(28.8, 5);
    expect(r.boardWidthBand.right).toBeCloseTo(451.2, 5);
  });

  it('scales proportionally for a different canvas size', () => {
    const big = computeLayoutRegions(960, 1440);
    expect(big.board.top).toBeCloseTo(1440 * 0.46, 5);
    expect(big.board.bottom).toBeCloseTo(1440 * 0.93, 5);
  });
});

describe('computePlaceholderLayout', () => {
  const p = computePlaceholderLayout(computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT));

  it('places a dominant monster centered in the monster band', () => {
    expect(p.monster).toEqual({ x: 150, y: 81.2, width: 180, height: 140 });
  });

  it('makes the monster ~2x a hero placeholder tall', () => {
    expect(p.monster.height / p.heroes[0].height).toBeCloseTo(2, 5);
  });

  it('spaces four hero capsules evenly across the board width band', () => {
    expect(p.heroes).toHaveLength(4);
    const centers = p.heroes.map((h) => h.x + h.width / 2);
    expect(centers).toEqual([81.6, 187.2, 292.8, 398.4]);
    p.heroes.forEach((h) => {
      expect(h.width).toBe(50);
      expect(h.height).toBe(70);
      expect(h.y + h.height / 2).toBe(288);
    });
  });
});

describe('computeTableBounds', () => {
  const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
  const tileBounds = { left: 50, right: 430, top: 426, bottom: 662 };
  const table = computeTableBounds(regions, tileBounds);

  it('matches the board width band horizontally', () => {
    expect(table.x).toBeCloseTo(28.8, 5);
    expect(table.width).toBeCloseTo(422.4, 5);
  });

  it('fully encloses the tile bounding box (art fits around tiles)', () => {
    expect(table.x).toBeLessThan(tileBounds.left);
    expect(table.x + table.width).toBeGreaterThan(tileBounds.right);
    expect(table.y).toBeLessThan(tileBounds.top);
    expect(table.y + table.height).toBeGreaterThan(tileBounds.bottom);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scenes/compositionLayout.test.ts`
Expected: FAIL — `Cannot find module '../../src/scenes/compositionLayout'`.

- [ ] **Step 3: Write the implementation**

Create `src/scenes/compositionLayout.ts`:

```ts
// Centralized composition layout, Phaser-free by the same convention as
// boardLayout.ts (importable from plain Node). Translates the percentage
// composition ranges in design/implementation/BATTLE_SCENE_BLUEPRINT.md into
// pixel regions for a fixed canvas, and derives the flat placeholders'
// footprints. This is NOT responsive-scaling support: the canvas stays a
// fixed 480x720; the function takes (width, height) only so the math is
// expressed proportionally in one place.

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 720;

export interface Band {
  top: number;
  bottom: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutRegions {
  topHud: Band;
  monster: Band;
  hero: Band;
  board: Band;
  safeBottom: Band;
  boardWidthBand: { left: number; right: number; width: number };
}

export interface PlaceholderLayout {
  monster: Rect;
  heroes: Rect[];
}

export function computeLayoutRegions(width: number, height: number): LayoutRegions {
  const band = (fromPct: number, toPct: number): Band => {
    const top = height * (fromPct / 100);
    const bottom = height * (toPct / 100);
    return { top, bottom, height: bottom - top };
  };

  // Blueprint: "the board should normally use at least 88% of the safe width."
  const boardWidth = width * 0.88;
  const left = (width - boardWidth) / 2;

  return {
    topHud: band(0, 8),
    monster: band(8, 34),
    hero: band(34, 46),
    board: band(46, 93),
    safeBottom: band(93, 100),
    boardWidthBand: { left, right: left + boardWidth, width: boardWidth },
  };
}

const MONSTER_WIDTH = 180;
const MONSTER_HEIGHT = 140; // ~2x hero height — blueprint's "1.5 to 2x taller than a hero"
const HERO_WIDTH = 50;
const HERO_HEIGHT = 70;
const HERO_COUNT = 4;

export function computePlaceholderLayout(regions: LayoutRegions): PlaceholderLayout {
  const monsterCenterX = (regions.boardWidthBand.left + regions.boardWidthBand.right) / 2;
  const monsterCenterY = regions.monster.top + regions.monster.height / 2;
  const monster: Rect = {
    x: monsterCenterX - MONSTER_WIDTH / 2,
    y: monsterCenterY - MONSTER_HEIGHT / 2,
    width: MONSTER_WIDTH,
    height: MONSTER_HEIGHT,
  };

  const heroCenterY = regions.hero.top + regions.hero.height / 2;
  const { left, width } = regions.boardWidthBand;
  const heroes: Rect[] = [];
  for (let i = 0; i < HERO_COUNT; i++) {
    const centerX = left + (width * (i + 0.5)) / HERO_COUNT;
    heroes.push({
      x: centerX - HERO_WIDTH / 2,
      y: heroCenterY - HERO_HEIGHT / 2,
      width: HERO_WIDTH,
      height: HERO_HEIGHT,
    });
  }

  return { monster, heroes };
}

const TABLE_TOP_PADDING = 20; // px above the tile bbox the table rear edge starts
const TABLE_BOTTOM_MARGIN = 8; // px from the safe-area bottom the table front edge ends

export function computeTableBounds(
  regions: LayoutRegions,
  tileBounds: { left: number; right: number; top: number; bottom: number },
): Rect {
  // Bottom edge derived from the safe-area band (an argument), not a module
  // constant — this function depends only on its arguments.
  const y = tileBounds.top - TABLE_TOP_PADDING;
  return {
    x: regions.boardWidthBand.left,
    y,
    width: regions.boardWidthBand.width,
    height: regions.safeBottom.bottom - TABLE_BOTTOM_MARGIN - y,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scenes/compositionLayout.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/compositionLayout.ts tests/scenes/compositionLayout.test.ts
git commit -m "feat: add centralized composition-layout module"
```

---

### Task B2: Re-derive board origin; export `STONE_RADIUS` + `tileBounds()`

**Files:**
- Modify: `src/scenes/boardLayout.ts` (whole file)
- Modify: `src/scenes/BattleScene.ts` (import `STONE_RADIUS` instead of the local const)
- Test: `tests/scenes/boardLayout.test.ts`

**Interfaces:**
- Consumes: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `computeLayoutRegions` from B1.
- Produces: `ORIGIN_X`, `ORIGIN_Y`, `COL_WIDTH`, `ROW_HEIGHT`, `STONE_RADIUS`,
  `cellToPixel(row, col)`, `tileBounds()`. `STONE_RADIUS` (22) moves here from
  `BattleScene`; `tileBounds()` returns `{ left, right, top, bottom }`. B3 consumes
  `tileBounds()`; `cellToPixel`'s signature is unchanged, so `tests/e2e/battle.spec.ts` and
  `cellAt()` keep working.

- [ ] **Step 1: Write the failing test**

Create `tests/scenes/boardLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ORIGIN_X, ORIGIN_Y, STONE_RADIUS, cellToPixel, tileBounds } from '../../src/scenes/boardLayout';
import { computeLayoutRegions, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/scenes/compositionLayout';

describe('boardLayout origin derivation', () => {
  it('pins the derived origin constants', () => {
    expect(ORIGIN_X).toBe(72);
    expect(ORIGIN_Y).toBe(448);
    expect(STONE_RADIUS).toBe(22);
  });

  it('reports a tile bounding box consistent with cellToPixel', () => {
    const b = tileBounds();
    expect(b).toEqual({ left: 50, right: 430, top: 426, bottom: 662 });
    // Lowest cell overall is col 0 (even, 5 rows) row 4.
    expect(b.bottom).toBe(cellToPixel(4, 0).y + STONE_RADIUS);
    expect(b.top).toBe(cellToPixel(0, 0).y - STONE_RADIUS);
  });

  it('keeps the tile bounding box inside the board composition band', () => {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const b = tileBounds();
    expect(b.top).toBeGreaterThanOrEqual(regions.board.top);
    expect(b.bottom).toBeLessThanOrEqual(regions.board.bottom);
  });

  it('keeps the tile bounding box centered on the canvas width', () => {
    const b = tileBounds();
    expect(b.left).toBeCloseTo(CANVAS_WIDTH - b.right, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scenes/boardLayout.test.ts`
Expected: FAIL — `tileBounds` / `STONE_RADIUS` are not exported and `ORIGIN_Y` is still 486.

- [ ] **Step 3: Rewrite `src/scenes/boardLayout.ts`**

```ts
// Pixel layout constants for the hex board. Deliberately has no Phaser
// import — the Playwright spec computes cellToPixel in a plain Node context
// (to know where to click), and Phaser touches `window`/`document` at import
// time, which would crash outside a browser page. Keeping this math
// Phaser-free lets both BattleScene (browser) and the e2e spec (Node) share
// one implementation.
import { CANVAS_WIDTH, CANVAS_HEIGHT, computeLayoutRegions } from './compositionLayout';

export const COL_WIDTH = 56;
export const ROW_HEIGHT = 48;
// Rendered stone radius; also the pointer hit-test tolerance in BattleScene.
// Lives here (not in the scene) because it is board-layout geometry: the
// tile bounding box below depends on it.
export const STONE_RADIUS = 22;

// Grid bounding box (COLS=7, tallest column 5 rows): 380px wide, 236px tall
// including radius padding. See
// docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md.
const BBOX_WIDTH = 6 * COL_WIDTH + 2 * STONE_RADIUS; // 380
const BBOX_HEIGHT = 4 * ROW_HEIGHT + 2 * STONE_RADIUS; // 236
const BOARD_BOTTOM_MARGIN = 8; // px above the 93% safe-area line

const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);

// Horizontal: center the tile bbox on the full canvas width.
export const ORIGIN_X = Math.round((CANVAS_WIDTH - BBOX_WIDTH) / 2 + STONE_RADIUS);
// Vertical: bottom-align the tile bbox inside the board band, leaving
// BOARD_BOTTOM_MARGIN px above the safe-area line.
export const ORIGIN_Y = Math.round(
  regions.board.bottom - BOARD_BOTTOM_MARGIN - (BBOX_HEIGHT - STONE_RADIUS),
);

// Converts a logical (row, col) cell into the ABSOLUTE stage-space position
// of its center. Columns render as straight vertical lines (x depends only
// on col); alternating columns shift down by half a cell so they interlock
// into a honeycomb.
export function cellToPixel(row: number, col: number): { x: number; y: number } {
  const shift = col % 2 === 1 ? ROW_HEIGHT / 2 : 0;
  return {
    x: ORIGIN_X + col * COL_WIDTH,
    y: ORIGIN_Y + row * ROW_HEIGHT + shift,
  };
}

// The axis-aligned bounding box of all rendered tiles, in stage space.
// Used by the composition layout to fit the table surface around the real
// tiles (the art adapts to the engine, not the reverse).
export function tileBounds(): { left: number; right: number; top: number; bottom: number } {
  return {
    left: ORIGIN_X - STONE_RADIUS,
    right: ORIGIN_X + 6 * COL_WIDTH + STONE_RADIUS,
    top: ORIGIN_Y - STONE_RADIUS,
    bottom: ORIGIN_Y + 4 * ROW_HEIGHT + STONE_RADIUS,
  };
}
```

- [ ] **Step 4: Point `BattleScene` at the moved `STONE_RADIUS`**

In `src/scenes/BattleScene.ts`, delete the local `const STONE_RADIUS = 22;` (line 19) and
add `STONE_RADIUS` to the existing `boardLayout` import (line 15):

```ts
import { cellToPixel, STONE_RADIUS } from './boardLayout';
```

Also update the re-export line (line 17) to keep the module's public surface intact:

```ts
export { ORIGIN_X, ORIGIN_Y, COL_WIDTH, ROW_HEIGHT, STONE_RADIUS, cellToPixel } from './boardLayout';
```

(No other change: `cellAt()` already references `STONE_RADIUS` and `drawBoard()`/
`drawTraceLine()` use `cellToPixel` — both now resolve to the imported symbols.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/scenes/boardLayout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and run the full unit suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS (core tests + the two new `tests/scenes/**` files).

- [ ] **Step 7: Run the e2e suite (new `ORIGIN_Y` regression)**

Run: `npm run test:e2e`
Expected: PASS (8/8, unmodified). The spec recomputes click points via `cellToPixel`, so
it must follow `ORIGIN_Y = 448` automatically — this proves pointer accuracy survived the
board move.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/boardLayout.ts src/scenes/BattleScene.ts tests/scenes/boardLayout.test.ts
git commit -m "feat: derive board origin from composition regions; export tile geometry"
```

---

### Task B3: Persistent preparation-table surface

**Files:**
- Modify: `src/scenes/BattleScene.ts` (new `tableContainer` field, `create()`, new
  `drawTable()` method)

**Interfaces:**
- Consumes: `computeLayoutRegions`, `computeTableBounds`, `CANVAS_WIDTH`, `CANVAS_HEIGHT`
  from B1; `tileBounds` from B2; `DEPTH` from A1.
- Produces: `tableContainer` field (`Phaser.GameObjects.Container` at `DEPTH.TABLE`,
  **below** `boardLayer`'s `DEPTH.BOARD`), populated once by `drawTable()`.

**Invariant (correction #4):** `drawTable()` is called once from `create()`; `drawBoard()`
never references `tableContainer`. The table is a persistent layer that a tile rebuild
cannot destroy.

- [ ] **Step 1: Add imports**

In `src/scenes/BattleScene.ts`, add:

```ts
import {
  computeLayoutRegions,
  computeTableBounds,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from './compositionLayout';
import { cellToPixel, STONE_RADIUS, tileBounds } from './boardLayout';
```

(Merge `tileBounds` into the existing `boardLayout` import line rather than duplicating it.)

- [ ] **Step 2: Add the field**

Add to the class fields:

```ts
  private tableContainer!: Phaser.GameObjects.Container;
```

- [ ] **Step 3: Create the container and draw the table in `create()`**

In `create()`, create `tableContainer` **before** `boardLayer` (creation order is
irrelevant since depths are explicit, but grouping reads clearly), and call `drawTable()`
after the containers exist:

```ts
    this.monsterContainer = this.add.container(0, 0).setDepth(DEPTH.MONSTER);
    this.heroContainer = this.add.container(0, 0).setDepth(DEPTH.HERO);
    this.tableContainer = this.add.container(0, 0).setDepth(DEPTH.TABLE);
    this.boardLayer = this.add.container(0, 0).setDepth(DEPTH.BOARD);
    this.puzzleFeedbackContainer = this.add.container(0, 0).setDepth(DEPTH.PUZZLE_FEEDBACK);
    this.hudContainer = this.add.container(0, 0).setDepth(DEPTH.HUD);
    this.transientUiContainer = this.add.container(0, 0).setDepth(DEPTH.TRANSIENT_UI);

    this.traceGraphics = this.add.graphics();
    this.puzzleFeedbackContainer.add(this.traceGraphics);
    this.hpText = this.add.text(20, 20, '', { fontSize: '20px', color: '#ffffff' });
    this.hpBar = this.add.graphics();
    this.hudContainer.add([this.hpBar, this.hpText]);

    this.drawTable();
    this.drawBoard();
    this.drawHp();
    this.drawBattleLineup();
```

- [ ] **Step 4: Write `drawTable()`**

Add the method (flat brown placeholder — a production-*footprint* stand-in for the future
`board_table_*` assets, sized around the real tile bounds):

```ts
  // Persistent preparation-table surface, drawn ONCE in create(). Lives in
  // its own container below the tile layer; drawBoard() never touches it, so
  // rebuilding tiles can never destroy the table (a persistent layer). The
  // footprint is derived from the real tile bounds — the art fits the engine,
  // not the reverse.
  private drawTable(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const t = computeTableBounds(regions, tileBounds());
    const g = this.add.graphics();
    g.fillStyle(0x6b4a30, 1);
    g.fillRoundedRect(t.x, t.y, t.width, t.height, 24);
    // A slightly darker rear-edge band to hint thickness/depth — still flat,
    // no gradient/asset.
    g.fillStyle(0x543a25, 1);
    g.fillRoundedRect(t.x, t.y, t.width, 18, 9);
    this.tableContainer.add(g);
  }
```

- [ ] **Step 5: Type-check, unit, and e2e**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → PASS.
Run: `npm run test:e2e` → PASS (8/8). The table is a non-interactive `Graphics` with no
`setInteractive()` call, so pointer hit-testing is unaffected.

- [ ] **Step 6: Manual invariant check (table survives a turn)**

Run: `npm run dev`, open `http://localhost:5173/?seed=1`. Confirm the brown table sits
**behind** the tiles. Drag a valid chain to resolve a turn (which calls `drawBoard()` →
`boardLayer.removeAll(true)`), and confirm the table is **still visible** afterward — proof
that the destructible tile rebuild does not touch the persistent table layer.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "feat: add persistent preparation-table surface behind the tiles"
```

---

### Task B4: Replace rectangle-card lineup with flat monster/hero placeholders

**Files:**
- Modify: `src/scenes/BattleScene.ts` — replace `drawBattleLineup()` with
  `drawCharacterPlaceholders()`; update the call in `create()`.

**Interfaces:**
- Consumes: `computePlaceholderLayout`, `computeLayoutRegions`, `CANVAS_WIDTH`,
  `CANVAS_HEIGHT` from B1; `ROSTER`, `COLOR_HEX` (in scope); `DEPTH` (already used).
- Produces: `drawCharacterPlaceholders()` — called once from `create()`, populating
  `monsterContainer` and `heroContainer` with flat shapes + shadows at region-derived
  positions.

- [ ] **Step 1: Swap the call in `create()`**

Replace `this.drawBattleLineup();` with `this.drawCharacterPlaceholders();`.

- [ ] **Step 2: Delete `drawBattleLineup()` and add `drawCharacterPlaceholders()`**

Remove the entire `drawBattleLineup()` method (the version from A2) and add:

```ts
  // Flat production-footprint placeholders for the monster and the 4-hero
  // brigade, positioned from the composition layout — replaces the old
  // rectangle-card lineup. Drawn once in create(): only HP changes
  // turn-to-turn (handled by drawHp()); identity does not. Shapes are flat
  // (no assets), but their bounds, anchors, shadows, and overlap already
  // match the intended final footprints. See
  // docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md.
  private drawCharacterPlaceholders(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const layout = computePlaceholderLayout(regions);

    // Monster: dominant silhouette + contact shadow, centered in the monster band.
    const m = layout.monster;
    const mCenterX = m.x + m.width / 2;
    const mShadow = this.add.graphics();
    mShadow.fillStyle(0x000000, 0.25);
    mShadow.fillEllipse(mCenterX, m.y + m.height - 6, m.width * 0.7, 24);
    const mShape = this.add.graphics();
    mShape.fillStyle(0x7a4fb5, 1);
    mShape.fillRoundedRect(m.x, m.y, m.width, m.height, 28);
    const mLabel = this.add
      .text(mCenterX, m.y + m.height / 2, this.monster.name, {
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
    this.monsterContainer.add([mShadow, mShape, mLabel]);

    // Heroes: one flat capsule per roster entry, evenly spaced across the
    // board width band (bottom-center anchored so future sprites can share
    // the footprint), each with a small contact shadow.
    ROSTER.forEach((character, i) => {
      const h = layout.heroes[i];
      const cx = h.x + h.width / 2;
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.25);
      shadow.fillEllipse(cx, h.y + h.height - 2, h.width * 0.8, 12);
      const shape = this.add.graphics();
      shape.fillStyle(COLOR_HEX[character.color], 1);
      shape.fillRoundedRect(h.x, h.y, h.width, h.height, 16);
      const label = this.add
        .text(cx, h.y + h.height + 12, character.name, { fontSize: '11px', color: '#ffffff' })
        .setOrigin(0.5, 0.5);
      this.heroContainer.add([shadow, shape, label]);
    });
  }
```

- [ ] **Step 3: Type-check, unit, and e2e**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → PASS.
Run: `npm run test:e2e` → PASS (8/8). Placeholders are non-interactive; no `setInteractive`.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, `http://localhost:5173/?seed=1`. Confirm: a dominant purple monster
silhouette centered in the upper band, four evenly-spaced colored hero capsules in a row
above the table, each with a soft shadow — no left-stacked rectangle cards, no monster
outline box. Confirm `?debug=1` still exposes `window.__debug` and `setMonsterHp` still
updates the HP bar.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "feat: replace rectangle-card lineup with flat monster/hero placeholders"
```

---

## ✅ CHECKPOINT B

Stop and verify before starting milestone C:

- [ ] `npx tsc --noEmit` clean; `npm test` green; `npm run test:e2e` green (8/8, file
      unmodified).
- [ ] `http://localhost:5173/?seed=1`: monster dominant and centered; four heroes in a row;
      persistent table behind the tiles; board occupies most of the width; **no** stacked
      rectangle cards.
- [ ] Resolve a turn and confirm the table persists across the tile rebuild (correction #4).
- [ ] **No conspicuous empty horizontal band** between the hero brigade and the
      preparation table: the heroes should visually connect to, touch, or slightly overlap
      the table's rear edge. If the result still reads as separate stacked layout bands,
      adjust the hero position, the table rear edge, or the board vertical alignment before
      starting Milestone C.
- [ ] `?debug=1`: `window.__debug.setMonsterHp(1)`, `spawnTile`, `spawnPortal`, `getBoard`
      all still work; `data-monster-hp` updates.
- [ ] Manually drag a chain to victory (or `setMonsterHp(0)`) → "Victory!" appears and
      `data-scene="victory"` is set.

Do not proceed until every box is checked.

---

# MILESTONE C — Panel-chrome removal + minimal environment/HUD placeholders

Remove the generic flat-panel look and add minimal background/environment placeholders and
a region-anchored HUD, completing the "not a stack of mobile-app cards" acceptance
criterion.

---

### Task C1: Background placeholder + drop the flat config color

**Files:**
- Modify: `src/scenes/BattleScene.ts` (new `backgroundContainer` field, `create()`, new
  `drawBackground()` method)
- Modify: `src/main.ts` (remove `backgroundColor`)

**Interfaces:**
- Consumes: `computeLayoutRegions`, `CANVAS_WIDTH`, `CANVAS_HEIGHT`; `DEPTH`.
- Produces: `backgroundContainer` (`DEPTH.BACKGROUND`), populated once by
  `drawBackground()`. Persistent — never touched by `drawBoard()`.

- [ ] **Step 1: Add the field and create the container first in `create()`**

Add field `private backgroundContainer!: Phaser.GameObjects.Container;` and, at the **top**
of the container-creation block (so it is the lowest child), add:

```ts
    this.backgroundContainer = this.add.container(0, 0).setDepth(DEPTH.BACKGROUND);
```

Call `this.drawBackground();` before `this.drawTable();`.

- [ ] **Step 2: Write `drawBackground()`**

```ts
  // Persistent two-tone flat background placeholder (stand-in for the future
  // battle_background_* asset stack), replacing the flat Phaser config color.
  // Covers the full canvas; never touched by drawBoard().
  private drawBackground(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const horizonY = regions.monster.top + regions.monster.height * 0.6;
    const g = this.add.graphics();
    g.fillStyle(0x2a2440, 1); // upper: dungeon wall
    g.fillRect(0, 0, CANVAS_WIDTH, horizonY);
    g.fillStyle(0x1b1b2f, 1); // lower: shadowed floor (matches the old config color)
    g.fillRect(0, horizonY, CANVAS_WIDTH, CANVAS_HEIGHT - horizonY);
    this.backgroundContainer.add(g);
  }
```

- [ ] **Step 3: Remove the flat color from `src/main.ts`**

Delete the `backgroundColor: '#1b1b2f',` line. The config becomes:

```ts
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 480,
  height: 720,
  parent: 'app',
  scene: [BattleScene],
};
```

- [ ] **Step 4: Type-check, unit, e2e**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → PASS.
Run: `npm run test:e2e` → PASS (8/8).

- [ ] **Step 5: Manual check**

`http://localhost:5173/?seed=1`: the flat single-color canvas is replaced by a two-tone
background; monster/heroes/table/board all still read clearly.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/BattleScene.ts src/main.ts
git commit -m "feat: add background placeholder and drop flat config background color"
```

---

### Task C2: Minimal environment placeholder

**Files:**
- Modify: `src/scenes/BattleScene.ts` (new `environmentContainer` field, `create()`, new
  `drawEnvironment()` method)

**Interfaces:**
- Consumes: `computeLayoutRegions`, `CANVAS_WIDTH`, `CANVAS_HEIGHT`; `DEPTH`.
- Produces: `environmentContainer` (`DEPTH.ENVIRONMENT`, between background and monster),
  populated once by `drawEnvironment()`. Persistent — never touched by `drawBoard()`, and
  strictly non-interactive (Input Safety).

Keep this deliberately minimal — a couple of flat silhouettes to break the empty
background, **not** a detailed scene. No prop may extend over the tile bounds.

- [ ] **Step 1: Add the field and container**

Field `private environmentContainer!: Phaser.GameObjects.Container;`; in `create()`, after
`backgroundContainer`:

```ts
    this.environmentContainer = this.add.container(0, 0).setDepth(DEPTH.ENVIRONMENT);
```

Call `this.drawEnvironment();` after `this.drawBackground();`.

- [ ] **Step 2: Write `drawEnvironment()`**

```ts
  // Minimal, persistent environmental back-prop placeholders (two shelf
  // silhouettes flanking the monster band). Flat shapes only, non-interactive,
  // kept clear of the tile bounds. Stand-in for future environment assets.
  private drawEnvironment(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const shelfY = regions.monster.top + 12;
    const shelfW = 70;
    const shelfH = 14;
    const g = this.add.graphics();
    g.fillStyle(0x3a2f22, 1);
    g.fillRect(8, shelfY, shelfW, shelfH); // left shelf
    g.fillRect(CANVAS_WIDTH - 8 - shelfW, shelfY, shelfW, shelfH); // right shelf
    g.fillRect(8, shelfY + 40, shelfW, shelfH);
    g.fillRect(CANVAS_WIDTH - 8 - shelfW, shelfY + 40, shelfW, shelfH);
    this.environmentContainer.add(g);
  }
```

- [ ] **Step 3: Type-check, unit, e2e**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → PASS.
Run: `npm run test:e2e` → PASS (8/8). Confirms the props don't intercept pointer input
(they are plain `Graphics`, sit in the monster band well above the board, and have no
`setInteractive`).

- [ ] **Step 4: Manual check**

`http://localhost:5173/?seed=1`: two flat shelf silhouettes flank the monster; none overlap
any tile; the scene reads as a place rather than a flat panel.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "feat: add minimal environment back-prop placeholders"
```

---

### Task C3: Region-anchored HUD + victory reposition

**Files:**
- Modify: `src/scenes/BattleScene.ts` (`drawHp()`, `checkVictory()`)

**Interfaces:**
- Consumes: `computeLayoutRegions`, `CANVAS_WIDTH`, `CANVAS_HEIGHT` (already imported).
- Produces: no new exports. `drawHp()` positions the HP text/bar in the `topHud` band at
  the board's width; `checkVictory()` centers the victory text on the canvas. **DOM mirror
  attributes (`data-monster-hp`, `data-scene`) are preserved and still set at the same
  points.**

- [ ] **Step 1: Reposition `drawHp()`**

Replace the body of `drawHp()`:

```ts
  private drawHp(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const left = regions.boardWidthBand.left;
    const width = regions.boardWidthBand.width;

    this.hpText.setText(`${this.monster.name}: ${this.monster.hp}/${this.monster.maxHp}`);
    this.hpText.setPosition(left, 8);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x333333, 1);
    this.hpBar.fillRect(left, 34, width, 14);
    this.hpBar.fillStyle(0xdd3333, 1);
    const ratio = this.monster.hp / this.monster.maxHp;
    this.hpBar.fillRect(left, 34, width * ratio, 14);
    // Preserved DOM mirror for Playwright — same attribute, same call site.
    document.body.setAttribute('data-monster-hp', String(this.monster.hp));
  }
```

- [ ] **Step 2: Recenter the victory text in `checkVictory()`**

```ts
  private checkVictory(): void {
    if (isDefeated(this.monster)) {
      const victoryText = this.add
        .text(CANVAS_WIDTH / 2, 360, 'Victory!', { fontSize: '32px', color: '#ffffff' })
        .setOrigin(0.5, 0.5);
      this.transientUiContainer.add(victoryText);
      // Preserved DOM mirror for Playwright — same attribute value.
      document.body.setAttribute('data-scene', 'victory');
    }
  }
```

- [ ] **Step 3: Type-check, unit, e2e**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → PASS.
Run: `npm run test:e2e` → PASS (8/8). The `data-monster-hp` and `data-scene="victory"`
assertions in the spec confirm the DOM mirrors still fire from their new call positions.

- [ ] **Step 4: Manual check against acceptance criteria**

`http://localhost:5173/?seed=1`, verify against
`design/implementation/BATTLE_SCENE_BLUEPRINT.md` "Acceptance Criteria":

- puzzle uses most of the width; real 7-column geometry intact;
- monster visually dominant; four heroes inhabit the scene;
- no decorative object obscures a selectable cell;
- screen no longer resembles a stack of mobile UI cards;
- HP bar sits in the top band tracking the board width (not a fixed 300px/x=20 bar);
- `?debug=1` and `?seed=1` still work; a manual chain drag still scores/refills; victory
  still triggers.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "feat: anchor HUD to composition regions and recenter victory text"
```

---

## ✅ CHECKPOINT C (final)

- [ ] `npx tsc --noEmit` clean; `npm test` green; `npm run test:e2e` green (8/8, still
      unmodified across the entire effort).
- [ ] Every blueprint acceptance-criteria bullet (Task C3 Step 4) holds.
- [ ] Debug API + DOM mirrors intact; seeded board (`?seed=1`) identical board contents to
      before the effort (only positions moved, via `ORIGIN_Y`).
- [ ] No gameplay logic moved into `BattleScene`; `src/core/` untouched.
- [ ] All containers still at `(0,0)` scale `1`; the puzzle was never transformed.
- [ ] The persistent table/background/environment/feedback layers survive `drawBoard()`.

---

## Self-Review Notes

- **Spec coverage:** design §Architecture maps 1:1 to tasks — `compositionLayout` → B1;
  `boardLayout` origin + `tileBounds`/`STONE_RADIUS` → B2; container structure → A2 (+ per
  container in B3/C1/C2); table separation → B3; placeholders → B4; background/environment/
  HUD chrome → C1/C2/C3. All four corrections have a dedicated home (fixed res: Global
  Constraints; Phaser-free/(0,0): B2 + Global Constraints; three milestones: A/B/C;
  table≠tiles: B3 invariant + checkpoint).
- **Placeholder scan:** no TBD/TODO; every code step is complete against the file contents
  read during planning.
- **Type consistency:** `computeLayoutRegions`, `computePlaceholderLayout`,
  `computeTableBounds`, `LayoutRegions`, `Band`, `Rect`, `PlaceholderLayout`, `tileBounds`,
  `STONE_RADIUS`, and `DEPTH` are used with identical names/shapes across every task.
- **Test coverage after each meaningful step:** geometry tasks (B1, B2) have real vitest
  assertions with exact numbers; every rendering task has `tsc` + full unit suite + the
  unchanged e2e suite as a regression guard, plus explicit manual checkpoint assertions
  where pixels can't be asserted in the current no-Phaser vitest setup.
