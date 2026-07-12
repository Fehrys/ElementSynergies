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

### Task B0: Canvas-bounds invariant test (accepted-baseline guard)

**Files:**
- Create: `tests/e2e/canvas-bounds.spec.ts`

Locks the accepted Checkpoint-A baseline: the game canvas stays unscaled at viewport
origin, exactly 480×720. This is a **new** spec file — `tests/e2e/battle.spec.ts` is not
modified. It guards the invariant that every later positioning task relies on (absolute
`cellToPixel` coordinates map 1:1 to viewport pixels because the canvas is at 0,0, scale 1).

- [ ] **Step 1: Write the test**

Create `tests/e2e/canvas-bounds.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// The canvas must stay unscaled at the viewport origin so that absolute
// cellToPixel coordinates map 1:1 to viewport pixels. If this ever fails,
// pointer accuracy in battle.spec.ts is silently compromised.
test('the game canvas stays unscaled at viewport origin (480x720)', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');

  const box = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas element');
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(480);
  expect(box.height).toBe(720);
});
```

- [ ] **Step 2: Run it to verify it passes against the current build**

Run: `npx playwright test tests/e2e/canvas-bounds.spec.ts`
Expected: PASS (1 test) — the accepted `index.html` reset already puts the canvas at 0,0.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/canvas-bounds.spec.ts
git commit -m "test: assert canvas stays unscaled at viewport origin (480x720)"
```

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

  it('produces the expected connecting-surface bounds for 480x720', () => {
    expect(table.x).toBeCloseTo(28.8, 5);
    expect(table.y).toBeCloseTo(323.2, 5);
    expect(table.width).toBeCloseTo(422.4, 5);
    expect(table.height).toBeCloseTo(388.8, 5);
  });

  it('rises into the hero band so the surface connects heroes to the board', () => {
    expect(table.y).toBeLessThan(regions.hero.bottom);
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

const MIN_TILE_TOP_PADDING = 20; // min px of clearance above the tile bbox
const TABLE_REAR_OVERLAP = 8; // px the table rear edge rises into the hero band
const TABLE_BOTTOM_MARGIN = 8; // px from the safe-area bottom the table front edge ends

export function computeTableBounds(
  regions: LayoutRegions,
  tileBounds: { left: number; right: number; top: number; bottom: number },
): Rect {
  // The rear edge rises to whichever is HIGHER on screen: a minimum clearance
  // above the tiles, or just into the hero band — so the surface visually
  // connects the brigade to the board with no empty gap. Both the top and the
  // bottom are derived from the arguments (hero/safe-area bands), never a
  // canvas constant.
  const y = Math.min(
    tileBounds.top - MIN_TILE_TOP_PADDING,
    regions.hero.bottom - TABLE_REAR_OVERLAP,
  );
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

# MILESTONE B5 — Table, brigade, puzzle, and boss-HUD integration

An isolated composition-refinement pass (single commit) correcting the imbalance seen in the
Checkpoint B screenshot: the puzzle sat low in the table, the heroes barely touched it, the
hidden hero labels were dead weight, and the left-aligned 300px HP bar pulled the top-left.
All within the existing global constraints — no Milestone C work, no final art, no animation,
no responsive scaling, no gameplay. `src/core/` stays untouched.

### Task B5: refine table/brigade/puzzle/boss-HUD composition

**Files:**
- Modify: `src/scenes/compositionLayout.ts` — add `BossHudLayout`, `computeTableSpan()`,
  `computeBossHudLayout()`; ground heroes on the table span; refactor `computeTableBounds()`
  to reuse the span.
- Modify: `src/scenes/boardLayout.ts` — re-derive `ORIGIN_Y` to center the tile bbox in the
  table span.
- Modify: `src/scenes/BattleScene.ts` — remove hero-name labels; drive `drawHp()` (and the
  `hpText` origin/size) from `computeBossHudLayout()`.
- Test: `tests/scenes/compositionLayout.test.ts`, `tests/scenes/boardLayout.test.ts`.

**Interfaces:**
- Produces: `computeTableSpan(regions) → { top, bottom }` (consumed by `computeTableBounds`,
  `computePlaceholderLayout`, and `boardLayout`); `computeBossHudLayout(regions) →
  { text: {x,y}, bar: Rect }`; `BossHudLayout`.

**B5.1 — Center the puzzle in the table (`boardLayout.ts`):** derive
`ORIGIN_Y = round(span.top + (span.bottom − span.top − BBOX_HEIGHT)/2 + STONE_RADIUS)` where
`span = computeTableSpan(regions)`. Expected `ORIGIN_Y = 422`,
`tileBounds() = {left 50, right 430, top 400, bottom 636}`. `ORIGIN_X`, `COL_WIDTH`,
`ROW_HEIGHT`, `STONE_RADIUS`, and the table bounds are unchanged. Unit tests pin the new
values and assert the tile bbox is centered in the span within 1px of rounding.

**B5.2 — Ground the brigade (`compositionLayout.ts`):** `HERO_TABLE_OVERLAP = 8`;
`heroBottom = computeTableSpan(regions).top + HERO_TABLE_OVERLAP` (→ 331.2), `heroY =
heroBottom − HERO_HEIGHT`. Width/height/centers unchanged. Tests verify four heroes, unchanged
centers/dims, and `h.y + h.height ≈ span.top + 8`.

**B5.3 — Remove hero labels (`BattleScene.ts`):** delete the four hero-name `Text` objects
from `drawCharacterPlaceholders()` (add only `[shadow, shape]`). Monster label stays. No
replacements, no depth changes.

**B5.4 — Center + shrink the boss HUD:** `computeBossHudLayout(regions)` returns text at the
monster center-x with `y = topHud.top + 8` and a bar `{ x: centerX − barWidth/2, y:
topHud.top + 36, width: monster.width + 60 (=240), height: 12 }`. `drawHp()` consumes it;
`hpText` gets origin `(0.5, 0)` and ~18px. `hpBar`/`hpText` stay in `hudContainer`; the HP
ratio math, `hpBar.clear()`, `drawHp()` call sites, and `data-monster-hp` are unchanged.
Phaser-free tests pin the helper's output and that it stays inside `topHud` above the monster.

- [ ] **Step 1: Edit `compositionLayout.ts`** (span + hero grounding + boss HUD, above).
- [ ] **Step 2: Edit `boardLayout.ts`** (`ORIGIN_Y` from the span).
- [ ] **Step 3: Edit `BattleScene.ts`** (drop hero labels; boss-HUD-driven `drawHp()`).
- [ ] **Step 4: Update the two `tests/scenes/**` files** to the new pinned values + new tests.
- [ ] **Step 5: Verify.** `npx tsc --noEmit` clean; `npm test` green (76);
  `npx playwright test` green (9/9, `battle.spec.ts` + `canvas-bounds.spec.ts` unmodified);
  `?seed=1` screenshot; debug API + table-persistence-after-`drawBoard()` spot check.
- [ ] **Step 6: Commit** (single commit):

```bash
git add src/scenes/compositionLayout.ts src/scenes/boardLayout.ts src/scenes/BattleScene.ts \
  tests/scenes/compositionLayout.test.ts tests/scenes/boardLayout.test.ts \
  docs/superpowers/plans/2026-07-11-battle-scene-composition.md \
  docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md
git commit -m "fix: refine battle table, brigade, puzzle, and boss HUD composition"
```

## ✅ CHECKPOINT B5

- [ ] `tsc` clean; `npm test` green; `npx playwright test` green (9/9); canvas-bounds still
      exactly `x0 y0 480×720`; `battle.spec.ts` unmodified.
- [ ] `?seed=1`: puzzle vertically centered in the table (≈equal space above/below); heroes
      overlap the table rear edge and the lip masks their lower silhouettes; no hero labels;
      boss HP text + bar centered above the monster and visibly narrower; monster still
      dominant; a chain still drags/resolves; table survives `drawBoard()`; `?debug=1` API
      intact; `?seed=1` board contents unchanged from before B5.

Do not proceed to Milestone C until Checkpoint B5 is reviewed and approved.

---

# MILESTONE C — Minimal scene framing and chrome removal

Make the placeholder composition read as **one continuous scene** rather than isolated flat
elements: a persistent full-canvas background (C1), a few asymmetrical environment framing
silhouettes (C2), and chrome cleanup + a recentered victory banner (C3). Still not
art-production — primitive Phaser `Graphics` only; no assets, atlases, particles, animation,
detailed decoration, responsive scaling, or gameplay.

> **Supersession:** Milestone B5 already delivered the boss HUD. This milestone **must not**
> revert it. The original Task C3 "region-anchored / board-width HP bar" proposal is
> **cancelled**. The B5 boss HUD is frozen: centered text at `x=240`, origin `(0.5, 0)`,
> ~18px; bar `x=120 / width=240 / height=12`; unchanged HP-ratio math, `drawHp()` lifecycle,
> and `data-monster-hp` updates. C3 only removes obsolete chrome and recenters victory.

---

### Task C1: Persistent background placeholder

**Files:**
- Modify: `src/scenes/BattleScene.ts` (new `backgroundContainer` field, `create()`, new
  `drawBackground()` method)
- Modify: `src/main.ts` (remove `backgroundColor` — only after the placeholder covers the
  full canvas)

**Interfaces:**
- Consumes: `computeLayoutRegions`, `CANVAS_WIDTH`, `CANVAS_HEIGHT`; `DEPTH`.
- Produces: `backgroundContainer` (`DEPTH.BACKGROUND`, lowest), populated once by
  `drawBackground()`. Persistent — never touched by `drawBoard()`, non-interactive.

Two broad depth zones — a darker upper arena wall and a slightly deeper lower work area
behind the table — meeting on a **soft, curved horizon** (a wide overlapping ellipse plus
low-alpha transition bands), **not** a sharp UI-like divider. Full-canvas coverage; low
detail behind the puzzle; enough contrast behind boss/heroes.

- [ ] **Step 1: Add the field; create the container first in `create()`**

Field `private backgroundContainer!: Phaser.GameObjects.Container;`; add at the **top** of
the container block: `this.backgroundContainer = this.add.container(0, 0).setDepth(DEPTH.BACKGROUND);`
Call `this.drawBackground();` first, before `this.drawTable();`.

- [ ] **Step 2: Write `drawBackground()`**

```ts
  // Persistent full-canvas background placeholder (stand-in for a future
  // battle_background_* asset). Two broad value zones meeting on a soft curved
  // horizon — no hard divider. Never touched by drawBoard(); non-interactive.
  private drawBackground(): void {
    const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
    const g = this.add.graphics();
    const upper = 0x262042; // darker arena wall
    const lower = 0x2e2636; // slightly warmer/deeper work area behind the table
    g.fillStyle(upper, 1);
    g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // base value covers everything
    const horizonY = regions.hero.top; // behind/above the table rear edge
    g.fillStyle(lower, 1);
    g.fillRect(0, horizonY, CANVAS_WIDTH, CANVAS_HEIGHT - horizonY);
    // A wide ellipse overlapping upward turns the seam into a curved horizon.
    g.fillEllipse(CANVAS_WIDTH / 2, horizonY, CANVAS_WIDTH * 1.5, 150);
    // Low-alpha bands feather the meeting of the two zones (no UI divider).
    g.fillStyle(lower, 0.3);
    g.fillRect(0, horizonY - 70, CANVAS_WIDTH, 70);
    g.fillStyle(upper, 0.2);
    g.fillRect(0, horizonY, CANVAS_WIDTH, 50);
    this.backgroundContainer.add(g);
  }
```

- [ ] **Step 3: Remove the flat color from `src/main.ts`**

Delete `backgroundColor: '#1b1b2f',` (the canvas is now fully covered by the placeholder).

- [ ] **Step 4: `npx tsc --noEmit` clean; `npm test` green; `npx playwright test` green (9/9).**

- [ ] **Step 5: Manual check** — `?seed=1`: full-canvas two-zone background with a soft
      horizon; boss/heroes/table/board all still read; no hard divider line.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/BattleScene.ts src/main.ts \
  docs/superpowers/plans/2026-07-11-battle-scene-composition.md \
  docs/superpowers/specs/2026-07-11-battle-scene-composition-design.md
git commit -m "feat: add persistent battle background placeholder"
```

---

### Task C2: Minimal, asymmetrical environment framing

**Files:**
- Modify: `src/scenes/BattleScene.ts` (new `environmentContainer` field, `create()`, new
  `drawEnvironment()` method)

**Interfaces:**
- Consumes: `CANVAS_WIDTH`; `DEPTH`.
- Produces: `environmentContainer` (`DEPTH.ENVIRONMENT`, between background and monster),
  populated once by `drawEnvironment()`. Persistent, non-interactive (Input Safety).

A few large flat silhouettes that **frame** the boss with **controlled asymmetry** — NOT
four identical shelves (that would re-create a dashboard). One heavier cupboard on the left,
lighter hanging cookware on the right, one off-center arch behind the monster. Every shape
stays **behind** monster/heroes (lower depth) and **clear of the tile bounds**
`{left 50, right 430, top 400, bottom 636}` — all props sit at `y < 260`, well above the
tiles. Deliberately low shape count.

- [ ] **Step 1: Add the field and container**

Field `private environmentContainer!: Phaser.GameObjects.Container;`; in `create()`, after
`backgroundContainer`: `this.environmentContainer = this.add.container(0, 0).setDepth(DEPTH.ENVIRONMENT);`
Call `this.drawEnvironment();` after `this.drawBackground();`.

- [ ] **Step 2: Write `drawEnvironment()`**

```ts
  // Minimal, persistent environmental framing (stand-in for future props).
  // Controlled asymmetry — heavier left cupboard vs. lighter right hangings,
  // plus an off-center arch behind the boss. Flat Graphics only, non-interactive,
  // all above y=260 so nothing touches the tile bounds. Never touched by drawBoard().
  private drawEnvironment(): void {
    const g = this.add.graphics();
    // Off-center alcove arch behind the monster (slightly lighter than the wall).
    g.fillStyle(0x2f2950, 1);
    g.fillEllipse(230, 70, 300, 220);
    // Left: a heavier cupboard/shelf silhouette.
    g.fillStyle(0x231c14, 1);
    g.fillRoundedRect(4, 84, 66, 168, 10);
    g.fillStyle(0x2c2318, 1);
    g.fillRect(10, 150, 54, 8); // one shelf line
    // Right: lighter hanging cookware — deliberately NOT a mirror of the left.
    g.fillStyle(0x241d16, 1);
    g.fillRect(436, 56, 6, 86);      // hanging rod
    g.fillCircle(439, 150, 15);      // a pan/ladle head
    g.fillRect(452, 56, 6, 60);      // second, shorter rod
    g.fillRoundedRect(447, 116, 26, 16, 4); // a small hanging lantern/box
    this.environmentContainer.add(g);
  }
```

- [ ] **Step 3: `npx tsc --noEmit` clean; `npm test` green; `npx playwright test` green (9/9)**
      — confirms the props (plain `Graphics`, no `setInteractive`, above the board) don't
      intercept pointer input.

- [ ] **Step 4: Manual check** — `?seed=1`: framing is visibly asymmetric (heavier left,
      lighter right, off-center arch); nothing overlaps a tile; the scene reads as a place.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "feat: add asymmetrical environment framing placeholders"
```

---

### Task C3: Remove placeholder chrome; recenter victory (B5 HUD frozen)

**Files:**
- Modify: `src/scenes/BattleScene.ts` (`drawCharacterPlaceholders()`, `checkVictory()`)

**Interfaces:**
- Consumes: `computeLayoutRegions`, `computeTableSpan`, `CANVAS_WIDTH`, `CANVAS_HEIGHT`,
  `tileBounds` (all already imported).
- Produces: no new exports. **`drawHp()` is NOT touched** (B5 boss HUD frozen).
  `drawCharacterPlaceholders()` drops the internal monster-name label; `checkVictory()`
  centers the victory text. `data-monster-hp` / `data-scene` preserved.

- [ ] **Step 1: Remove the internal monster-name label**

In `drawCharacterPlaceholders()`, delete the `mLabel` Text and add only `[mShadow, mShape]`
to `monsterContainer` (the boss name still shows in the centered HP HUD). Do not add a
replacement label.

- [ ] **Step 2: Recenter the victory text in `checkVictory()`**

```ts
  private checkVictory(): void {
    if (isDefeated(this.monster)) {
      const regions = computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT);
      // Vertical center of the battle→table transition (table rear edge → tile
      // top), centered on the canvas, so the banner reads over both the scene
      // background and the table surface.
      const y = (computeTableSpan(regions).top + tileBounds().top) / 2;
      const victoryText = this.add
        .text(CANVAS_WIDTH / 2, y, 'Victory!', { fontSize: '32px', color: '#ffffff' })
        .setOrigin(0.5, 0.5);
      this.transientUiContainer.add(victoryText);
      document.body.setAttribute('data-scene', 'victory');
    }
  }
```

- [ ] **Step 3: `npx tsc --noEmit` clean; `npm test` green; `npx playwright test` green (9/9).**
      The `data-monster-hp` / `data-scene="victory"` assertions confirm the DOM mirrors still
      fire.

- [ ] **Step 4: Manual check** — `?seed=1`: no internal monster-name label (name only in the
      HP HUD); the boss reads as a silhouette, not a labeled button; B5 boss HUD unchanged;
      `setMonsterHp(0)` → centered "Victory!" readable over table + background.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts
git commit -m "fix: remove placeholder chrome and center victory presentation"
```

---

## ✅ CHECKPOINT C (final)

- [ ] `npx tsc --noEmit` clean; `npm test` green; `npx playwright test` green (9/9;
      `battle.spec.ts` + `canvas-bounds.spec.ts` unmodified); canvas box still `x0 y0 480×720`.
- [ ] `?seed=1`: full-canvas background; asymmetric environment framing clear of all tiles;
      no internal monster-name label; **B5 boss HUD unchanged** (centered, 240px bar);
      centered "Victory!"; monster/heroes/table/puzzle read as one continuous scene; the
      puzzle is the clearest interactive area.
- [ ] Background + environment survive multiple `drawBoard()` rebuilds (persistent layers).
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
