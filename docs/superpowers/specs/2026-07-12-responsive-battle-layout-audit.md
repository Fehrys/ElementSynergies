# Responsive Battle Layout — Audit & Architecture (Phaser 4.2.1)

**Date:** 2026-07-12
**Branch / worktree:** `feature/responsive-battle-layout` (isolated git worktree)
**Start commit:** `c47aed236a3d5d239fa89a4f72328605e21944d6` (== `origin/main`, verified 0 ahead / 0 behind)
**Phase:** audit + architecture design only. **No production code, config, test, or asset has
been modified** by this document. The only tracked file produced is this audit (and, later, its
companion plan, `docs/superpowers/plans/2026-07-12-responsive-battle-layout.md`).

**Companion plan:** `docs/superpowers/plans/2026-07-12-responsive-battle-layout.md` (not yet written).

> **Provenance note.** This is a *new* audit, written against the code actually present on
> `main` after the Phaser 4.2.1 migration. The earlier Phaser-3 responsive audit lives only on
> the unmerged branch `feature/responsive-design` (commit `f953d16`); it was **not** consulted,
> restored, or used as a technical source. Every Phaser behavior below was re-verified
> empirically under Phaser **4.2.1** in this worktree (§4).

---

## 1. Scope and constraints

**Goal of the responsive work (this audit designs it; the plan sequences it):** make the
BattleScene adapt to real viewports — phones, tall phones, tablets, desktop — with an accurate
pointer-to-cell mapping at every size, replacing the fixed 480×720 canvas that is clipped on any
viewport smaller than itself.

**Chosen architecture (decided with the maintainer, verified in §4):**
`Phaser.Scale.RESIZE` as the **viewport transport only**, driving a **pure-TypeScript
responsive layout** that computes a `safeRect` from the viewport and safe-area insets, caps and
centers a **gameplay column** *inside that `safeRect`*, and lets the decorative background span
the full viewport (extending under the safe areas). The gameplay column is **not** a uniformly-
scaled fixed-aspect 480×720 safe frame — board, boss, heroes, HUD, table, safe areas, and
vertical band allocation are all computed responsively. `Scale.RESIZE` is never treated as a
command to stretch the composition. **`Scale.NONE`, `Scale.FIT`, and `Scale.ENVELOP` are all
explicitly rejected as production architectures** (rationale in §5).

**Out of scope for the responsive plan** (deferred, not designed here): final art assets,
advanced/skeletal animation, particles, lighting, combat FX, and visual polish. The responsive
plan ends when the layout and coordinate architecture is stable and validated across the
viewport matrix (§8).

**Non-negotiable constraints preserved** (from `design/implementation/BATTLE_SCENE_BLUEPRINT.md`
"Non-Negotiable Constraints" and the core/scene separation in `CLAUDE.md`):

- The pure-TypeScript puzzle/combat core under `src/core/**` stays Phaser-free and untouched —
  it has **zero** coordinate or rendering coupling (verified by reading all seven core modules
  and their tests; none import any layout/pixel module). **No adjacency or chain rule in
  `src/core` changes** as part of this work.
- `BattleScene` stays a thin presentation + input layer; no gameplay rule moves into it.
- The 7-column, 32-cell honeycomb geometry, adjacency, drag/portal/special rules, seeded RNG
  (`?seed=N`), and `?debug=1` surface are unchanged.
- Selection continues to use **engine cell coordinates via the board geometry**, never rendered
  sprite bounds — the blueprint's "Input Safety" rule.
- The board is fitted around the calculated tile bounds; art adapts to the engine, never the
  reverse (blueprint "Board Geometry Rules").
- **No camera or Container transform** is used to reposition the board — positioning is baked
  into the geometry, and `boardLayer` stays at `(0,0)` scale 1 (protects pointer accuracy, §7.1).

---

## 2. Verified baseline (measured in this worktree, not assumed)

All commands run after `npm ci` in the isolated worktree, on the unmodified start commit.
**Nothing was changed to make the baseline green.**

| Check | Result |
|---|---|
| Worktree clean at start | ✅ `git status --porcelain` empty |
| Start commit | `c47aed2` (= `origin/main`) |
| `npm ci` | ✅ exit 0 (50 packages) |
| Locked Phaser version (`npm ls phaser`) | ✅ **`phaser@4.2.1`** (exact pin) |
| `npx tsc --noEmit` | ✅ exit 0, no diagnostics |
| `npm run build` | ✅ green (`dist/assets/index-*.js` ≈ 1,700 kB; pre-existing 500 kB chunk warning) |
| `npm test` (Vitest) | ✅ **76 passed** / 9 files |
| `npm run test:e2e` (Playwright) | ✅ **9 passed** (chromium) |
| Renderer under `Phaser.AUTO` | **WebGL** (context probe; `Phaser.VERSION === '4.2.1'`) |

**E2e stale-server caveat (important for anyone re-running the baseline).** On the first
`npm run test:e2e` in this worktree, all 9 specs timed out waiting for `[data-scene="battle"]`.
Root cause was **not** a Phaser 4 regression: `playwright.config.ts` sets
`reuseExistingServer: !process.env.CI`, and a **stale Vite dev server from a different worktree**
(`.claude/worktrees/chore+phaser-4-migration`) was already occupying port 5173, serving a broken
root document. After killing the stale server, Playwright started its own server and all 9 specs
passed (4.2s). This is an environment artifact; it is called out in §9 as a testing-hygiene risk
for the multi-viewport e2e work.

---

## 3. Current architecture — how coordinates flow today

`src/main.ts` (12 lines): `Phaser.AUTO`, `width: 480, height: 720`, `parent: 'app'`, single
`BattleScene`. **No `scale` block at all** ⇒ Scale Manager defaults to `Phaser.Scale.NONE`: the
canvas is a fixed 480×720 pixel surface at the parent's top-left, and does not react to the
viewport. `index.html` has `#app` with **no CSS sizing** and `body { overflow: hidden }`, and
**no `<meta name="viewport">`**.

### 3.1 The coordinate pipeline

```
compositionLayout.ts            boardLayout.ts                 BattleScene.ts
────────────────────            ──────────────                 ──────────────
computeLayoutRegions(w,h)  ──▶  ORIGIN_X / ORIGIN_Y      ──▶   drawBoard(): cellToPixel → circles
  (proportional bands)          (MODULE-LEVEL CONSTANTS,        cellAt(px): distance ≤ STONE_RADIUS
computeTableSpan / Bounds        frozen at import from          drawHp / drawTable / drawBackground /
computePlaceholderLayout         CANVAS_WIDTH=480,              drawEnvironment / drawCharacterPlaceholders
computeBossHudLayout             CANVAS_HEIGHT=720)             (each reads computeLayoutRegions(480,720))
```

Key observations:

- **`compositionLayout.ts` is already viewport-parameterized.** Every function takes
  `(width, height)` and computes proportionally. There is even a passing unit test, *"scales
  proportionally for a different canvas size"*, exercising `computeLayoutRegions(960, 1440)`.
  **But** its header comment states plainly: *"This is NOT responsive-scaling support: the canvas
  stays a fixed 480x720."* The math is ready; the **wiring** is not. It also knows nothing about
  safe-area insets.

- **`boardLayout.ts` is the frozen obstacle.** `ORIGIN_X`, `ORIGIN_Y` are **module-level
  constants** computed **once at import** from `computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT)`.
  `cellToPixel(row, col)` closes over those constants. `COL_WIDTH = 56`, `ROW_HEIGHT = 48`,
  `STONE_RADIUS = 22` are fixed literals — **the board never scales**, and there is a **single**
  `STONE_RADIUS` serving both drawing and the pointer hit test.

- **`BattleScene.ts` calls `computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT)` in six draw
  methods**, always with the fixed constants, and has **no resize handling**. The nine semantic
  containers are all at `(0,0)` scale 1 (comment: *"never reposition via transforms"*).

- **Persistent-"drawn-once" layers.** `drawBackground`, `drawEnvironment`, `drawTable`, and
  `drawCharacterPlaceholders` run **once** in `create()`; only `drawBoard` and `drawHp` re-run.

- **Input path.** `cellAt(x,y)` iterates the 32 cells, compares `pointer.x/y` to
  `cellToPixel(row,col)` within `STONE_RADIUS`, and **returns the first cell within tolerance in
  iteration order** — not necessarily the nearest (a subtle correctness gap addressed in §6.3).

- **DOM mirrors** (`data-scene`, `data-monster-hp`) and `window.__debug` are set synchronously in
  `create` / `drawHp` / `checkVictory` / debug hooks and are the e2e observation surface.

### 3.2 The measured widths (baseline 480×720) — three *different* widths, conflated today

The single most important correction this audit makes to naive "88%-of-width" thinking: there
are **several distinct widths**, and today's `88%` figure is the **table/board band**, not the
puzzle's tile footprint.

| Width | Baseline value @ 480 | Fraction of the 480 column |
|---|---|---|
| `safeRect.width` (no insets) | 480 | 100% |
| `gameplayColumn.width` | 480 (≤ `MAX_GAMEPLAY_COLUMN_WIDTH`) | 100% |
| `table.width` / `boardBand.width` (`computeLayoutRegions`'s `boardWidthBand`, `width*0.88`) | 422.4 | **88%** |
| `tileBounds.width` (`boardLayout` bbox, `6·56 + 2·22`) | 380 | **≈79.2%** |

Using `88%` **directly for `tileBounds`** would enlarge the puzzle on the 480 baseline (380 →
~422) and break the promise of a visually-neutral first refactor. These widths must stay
**separate** (§6.2).

### 3.3 The measured problem

At a 360×640 phone viewport, the real app (`?seed=1`) keeps the canvas at `{x:0, y:0, w:480,
h:720}`. It therefore **overflows the viewport by 120 px horizontally and 80 px vertically**, and
because `body { overflow: hidden }` the overflow is **silently clipped**
(`document.body.scrollWidth === 480`, no scroll): the right ~25% of the board and the bottom ~11%
are off-screen and **unreachable by touch**. This is the concrete defect the responsive work fixes.

---

## 4. Empirical Phaser 4.2.1 verification

All probes below were run in this worktree against Phaser **4.2.1** (renderer WebGL,
`devicePixelRatio === 1` in the headless browser), using throwaway experiments served by Vite and
driven by a real browser (the experiment files were untracked and deleted; the tree is clean).
Two experiments were used: a **Scale-mode probe** (§4.1) and a **reflow-architecture prototype**
that exercises the recommended design end-to-end with real pointer events (§4.2).

### 4.1 Scale Manager mode matrix

| Mode | `gameSize` (internal) | canvas geometry | `pointer.x/y` space | Reflow? | Verdict |
|---|---|---|---|---|---|
| **NONE** (today) | fixed 480×720 | fixed 480×720 at origin; clipped by viewport | game px (== CSS px) | none | reject — clips |
| **FIT** | **invariant 480×720** | uniformly scaled + optionally centered (letterbox) | stays 480×720 game px | none | reject — letterbox only |
| **ENVELOP** | invariant reference size | fills parent by **cropping** overflow | reference game px | none | reject — see below |
| **RESIZE** | **= viewport (CSS px)** | fills viewport at origin, scale 1 | **= viewport CSS px** | full — scene recomputes | **chosen** |

Measured specifics:

- **FIT @ 800×720, centered:** `displayScale = 1`, `canvasRect = {x:160, y:0, w:480, h:720}` —
  centered, no scaling. `gameSize` stayed 480×720.
- **FIT @ 360×640, centered:** `canvasRect = {x:0, y:50, w:360, h:540}` — scaled **down** (aspect
  preserved), letterboxed vertically. `gameSize`, backing store, and camera **all stayed
  480×720**; `displayScale = 1.333`.
- **`ScaleManager.transformX/transformY` is exact.** Under FIT it inverted the display transform
  perfectly (page `(0,50)`→game `(0,0)`, page bottom-right→game `(480,720)`). Under FIT
  `pointer.x/y` is game space — but FIT does not reflow.
- **RESIZE @ 820×660:** `gameSize == displaySize == parentSize == backing store == canvasRect ==
  820×660`, `displayScale = 1`, camera resized, and the `resize` event fired with the new
  `gameSize`. Game space **becomes** the viewport at 1:1.

**`Scale.ENVELOP` — analysis (not adopted).** ENVELOP keeps a reference resolution/aspect and
fills the parent by **scaling up until the parent is covered, cropping** whatever overflows. It
therefore: (a) provides **no true reflow** (the internal composition is fixed, only cropped);
(b) can **hide interactive elements** off the visible edges — unacceptable for a puzzle where
every one of 32 cells must be reachable; (c) **complicates the relationship** between visible
content, safe areas, and tests (what is on-screen depends on a crop that varies with aspect);
(d) does **not** answer the need for a responsive gameplay column. It is rejected alongside NONE
and FIT.

### 4.2 Reflow-architecture prototype (the recommended design, end-to-end)

A prototype scene under `Scale.RESIZE` computed a pure-TS layout — capped/centered column
(`MAX_GAMEPLAY_COLUMN_WIDTH = 560`), vertical bands proportional to viewport height, board scaled
to fit a fraction of the column width and the board-band height, background spanning the full
viewport — then redrew on `resize`. A **real** mouse (`page.mouse.move/down/up`, not a synthetic
event) clicked the computed on-screen center of several reflowed cells; the driver read back the
cell Phaser's actual input path resolved.

| Viewport | `canvasRect` | Column (left / width) | Board scale (radius) | All clicks correct? |
|---|---|---|---|---|
| 1000×700 (desktop) | `{0,0,1000,700}` | 220 / **560** (capped, centered) | 1.30× (28.5px) | ✅ |
| 768×1024 (tablet) | `{0,0,768,1024}` | 104 / **560** (capped, centered) | 1.30× (28.5px) | ✅ |
| 360×640 (phone) | `{0,0,360,640}` | 0 / 360 (full width) | **0.83× (18.3px)** | ✅ |
| 414×896 (tall phone) | `{0,0,414,896}` | 0 / 414 (full width) | 0.96× (21.1px) | ✅ |

At every viewport, `phaserPointer ≈ screenCenter` to within <1px (integer truncation only),
confirming **`pointer.x/y == CSS px` under RESIZE (scale 1)** and that a pure-TS reflow layout
keeps hit-testing exact through the *real* input path. The phone case shows the board scaling
**down** to fit — the whole board on-screen, the §3.3 clipping defect eliminated. The desktop/
tablet cases show the board **capped** (not stretched) and centered, with the background
extending into the revealed side regions.

> **Prototype width fraction — read this before trusting the numbers.** The prototype used a
> board-width fraction of `0.88` of the column as a quick stand-in, which is why its 480-derived
> scale would be >1. The **production policy uses the `tileBounds` fraction (~79.2%) so the 480
> baseline stays scale 1 / neutral** (§3.2, §6.2). The prototype was validating the *mechanism*
> — reflow + real-pointer accuracy + capped/centered column + full-viewport background — **not**
> the exact width fraction. The mechanism is what these results confirm.

**CSS / bootstrap requirement (verified at DPR=1):** `Scale.RESIZE` tracked the viewport only
with `html, body, #app { height: 100%; overflow: hidden }` and `scale: { mode: RESIZE, width:
'100%', height: '100%' }`. §6.1 hardens this for real mobile browsers (dynamic toolbars, `dvh`).

**Renderer / version:** every probe reported `Phaser.VERSION === '4.2.1'` and a WebGL renderer.
`roundPixels` stays unset (`false`); it is irrelevant to `Graphics` rendering and to this design,
and must not be added.

### 4.3 What §4 proves for the design

1. `Scale.RESIZE` makes game space == viewport (CSS px), so **there is no display transform to
   fight** at scale 1: `pointer.x/y`, board-geometry output, and `page.mouse` CSS coordinates are
   all the same numbers.
2. A pure-TS layout can cap+center a column *inside a safeRect* and scale the board per-viewport
   while keeping pointer hit-testing exact — validated with real input at four viewports spanning
   phone→desktop.
3. The background can span the full viewport independently of the capped column.
4. The concrete CSS/`main.ts` bootstrap that makes all of the above hold is known and minimal
   (hardened for mobile in §6.1).

**Conditions and limits of these experiments (read together with §10).** The probes ran at
`devicePixelRatio === 1`, with **null safe-area insets**, and the reflow prototype used a
**temporary prototype width fraction of `0.88`** (not the production ~79.2% — see §4.2 note).
They therefore **strongly reduce**, but do not by themselves fully retire, the corresponding
risks. They strongly validate: `Scale.RESIZE` as transport; the pointer ↔ game ↔ client mapping
at scale 1; the column cap and centering; and reflow with real input. They do **not** yet
empirically validate: **non-null insets**, **high DPR**, **real notch behaviour**, or the **final
puzzle-width policy**. Those must be covered by the permanent tests (§8/§8.1) and the real-device
gates (§10) — not treated as proven by these experiments.

---

## 5. Design decision and rationale

**Chosen: `Scale.RESIZE` (transport) + pure-TS responsive layout + `safeRect` → capped/centered
gameplay column + full-viewport background.**

- **NONE (today):** rejected — the fixed canvas is clipped on any sub-canvas viewport (§3.3).
- **FIT:** rejected as production — it can only *letterbox*: no side-environment reveal, no HUD
  compression, no band re-allocation, no minimum-interactive-size control; it pins the
  composition to one aspect ratio. The blueprint calls the fixed 480×720 a *temporary* baseline,
  "not the release layout." Not adopted even as an intermediate.
- **ENVELOP:** rejected — crops rather than reflows, can hide interactive cells, and complicates
  the visible-content / safe-area / test relationship (§4.1).
- **Uniformly-scaled fixed-aspect "safe frame":** rejected — that is just FIT applied to a
  sub-rectangle; it cannot re-allocate vertical bands, compress the HUD, or preserve a minimum
  interactive tile size independently of aspect ratio. We keep Option 3's *compositional* idea
  (cap + center the gameplay column; let the background crop/extend/reveal) but implement the
  column's internals responsively in pure TypeScript.

`Scale.RESIZE` is the dumb transport; all intelligence lives in pure TypeScript that a browser
and Node (the e2e specs) can both run identically.

**On `MAX_GAMEPLAY_COLUMN_WIDTH ≈ 560`:** this is an **initial policy value to validate**, not an
irrevocable artistic constant. During the tuning milestone it should be compared at roughly
**520 / 560 / 600** against real composition. It caps the column; it does **not** directly
determine tile width (§6.2/§6.3).

---

## 6. Target architecture

### 6.1 Viewport transport + mobile CSS (thin adapter, not policy)

- `main.ts`: keep `Phaser.AUTO`; add
  `scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }`. No `autoCenter`, no
  `roundPixels`, no `zoom`.
- `index.html`: add `<meta name="viewport" content="width=device-width, initial-scale=1,
  viewport-fit=cover">`. `viewport-fit=cover` enables `env(safe-area-inset-*)` (§7.3).
- **Mobile viewport-unit analysis.** `100vh` is unreliable on mobile: it counts the *largest*
  viewport (`lvh`) and does not shrink when the dynamic browser toolbar appears, so a
  `height:100vh` `#app` can be taller than the visible area and push content under the toolbar.
  The relevant units are `svh` (smallest), `lvh` (largest), and `dvh` (dynamic — tracks the
  toolbar). Recommended CSS, with a `dvh` progressive-enhancement fallback:

  ```css
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
  #app {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;   /* fallback for browsers without dvh */
    height: 100dvh;  /* dynamic viewport height on modern mobile */
  }
  ```

  Orientation changes and dynamic-toolbar show/hide fire viewport changes that must re-drive the
  reflow (§7.3). **The runtime source of truth for the layout stays `this.scale.gameSize`** — the
  size Phaser actually measured from the parent — **never** `window.innerWidth/innerHeight` or
  `visualViewport` read directly. The browser sizes the parent; Phaser measures the parent;
  `BattleScene` uses the size Phaser knows.

### 6.2 Pure responsive layout — `safeRect` first, then column, then bands, then board

A single pure function turns a `ViewportInput` (viewport size + safe insets) and a
`BattleLayoutPolicy` into a fully-resolved `BattleLayout` (interfaces in §6.6). Order of
computation:

**1. `safeRect` from viewport and insets** (all gameplay/interactive content lives here):

```ts
const safeRect: Rect = {
  x: safeInsets.left,
  y: safeInsets.top,
  width:  viewport.width  - safeInsets.left - safeInsets.right,
  height: viewport.height - safeInsets.top  - safeInsets.bottom,
};
```

**2. Gameplay column, centered inside the `safeRect`:**

```ts
const columnWidth = Math.min(safeRect.width, policy.maxGameplayColumnWidth);
const columnLeft  = safeRect.x + (safeRect.width - columnWidth) / 2;
```

**3. Vertical bands** — the blueprint's `topHud / monster / hero / board / safeBottom` ranges,
proportional to **`safeRect.height`** (offset by `safeRect.y`), with min/max clamps and the
blueprint's **degradation order** when height is scarce (shrink top HUD → crop/scale environment
→ reduce decorative gaps → reduce hero presentation → only then reduce the board).

**4. Board geometry** — scaled to fit the **column width** and the **board-band height**, with
the width fraction chosen to **preserve the 480 baseline** (§3.2):

```ts
// tileWidthFraction defaults so that at safeRect=480 the tileBounds width is the
// legacy 380 (scale 1). policy.legacyBoardWidthAt480 = 380 anchors this.
const targetTileWidth = columnWidth * tileWidthFraction;      // ~0.792·column initially
const scale = Math.min(
  targetTileWidth / BBOX_WIDTH,
  (boardBandHeight * boardHeightFraction) / BBOX_HEIGHT,
  policy.maxBoardScale,
);
```

`scale` multiplies `COL_WIDTH`, `ROW_HEIGHT`, `visualRadius`, and `hitRadius`; the board bbox is
then centered within the column and the board band. `scale` may be >1 (upscale, capped by
`maxBoardScale` and the column) or <1 (downscale on phones) — never anisotropic (one factor, no
stretch).

**Width separation is mandatory** (§3.2): `safeRect.width`, `gameplayColumn.width`,
`table.width` (~88% of column), `boardBand.width`, and `tileBounds.width` (~79.2% of column at
baseline) are distinct fields on `BattleLayout`. `maxGameplayColumnWidth` caps the **column**, not
the tiles.

**Baseline-neutrality policy (drives the milestones, §13):**
1. During the refactor and layout-threading milestones, **preserve the 480×720 baseline exactly**,
   including today's `tileBounds` (380) — the first refactor is visually neutral.
2. **Only** in the responsive-tuning milestone may the puzzle's share of the safe width be
   deliberately increased on small phones (e.g. raising `tileWidthFraction` at narrow viewports).
3. Document that increase as an explicit **composition decision**, never an implicit side effect
   of the technical refactor.

**5. Background / environment** — described as full-viewport rects/anchors (`0..viewport.width`,
`0..viewport.height`), explicitly allowed to extend beyond the column and under the safe areas.

**Width vs height conflict resolution (they are separate problems).** The degradation order in
step 3 reclaims space from the HUD/environment/hero bands — that resolves only **vertical**
conflicts. A **horizontal** conflict (the board too wide for the column, or the tiles too small at
a given width) is resolved by a *different*, explicit order. The algorithm must distinguish these
five quantities rather than collapsing them into one `scale`:

- `horizontalFitScale = (columnWidth · tileWidthFraction) / BBOX_WIDTH`
- `verticalFitScale   = (boardBandHeight · boardHeightFraction) / BBOX_HEIGHT`
- `compositionWidthPolicy` — how much of the `safeRect`/column the puzzle may claim
  (`tileWidthFraction`), **raisable on narrow viewports**;
- the **desired** `minVisualRadius`;
- the **actually-feasible** result (what the viewport can honour).

**Horizontal conflict resolution order** (narrow viewports, applied before shrinking below the
desired visual radius):

1. deliberately **raise `tileWidthFraction`** on narrow viewports (`compositionWidthPolicy`);
2. **reduce the horizontal margins** between `table`, `boardBand`, and `tileBounds`;
3. allow the puzzle to use **almost the entire `safeRect` width`**;
4. use **`hitRadius > visualRadius`** for gesture comfort (§6.3);
5. if `minVisualRadius` is **still** unreachable, **escalate a product decision** (§11) — do not
   force it.

`minVisualRadius` must **never** be applied as a blind floor that pushes `tileBounds` outside the
`safeRect`. If honouring it would overflow the safe area, the **feasible** result wins and the
shortfall becomes a product decision (§11), not an overflow.

**Worked stress case — 320×568.** With the baseline-neutral fraction (~79.2%), a 320-wide safe
area yields `visualRadius ≈ 14.7 px` (diameter ≈ 29 px). **320×568 is the primary decision case**
that fixes `minVisualRadius`, `minHitRadius`, the maximum safe-width usage, and the real vertical
compression order (§8.2). Whether 320 is even officially supported is itself an open product
decision (§11).

### 6.3 Board geometry contract — `visualRadius` ≠ `hitRadius`, nearest-cell hit test

The current module-level `ORIGIN_X`/`ORIGIN_Y` exports, the zero-arg `cellToPixel(row,col)`, and
the single `STONE_RADIUS` **cannot survive** a per-viewport board. The replacement contract
(Phaser-free, Node-importable so the e2e specs recompute it identically):

```ts
interface BoardGeometry {
  originX: number;
  originY: number;
  colWidth: number;
  rowHeight: number;
  visualRadius: number;   // drawing only
  hitRadius: number;      // pointer acquisition only (touch + mouse)
  tileBounds: Rect;
}
```

- **`visualRadius`** controls only the drawn circle. **`hitRadius`** controls only pointer
  acquisition and may be **slightly more generous** than `visualRadius` to ease a continuous drag
  gesture (at 360 px the observed ~18 px visual radius is acceptable to render, while a marginally
  larger `hitRadius` improves the gesture).
- **`hitRadius` is capped** as a function of the **minimum distance between two cell centers**, so
  neighboring cells never develop excessively ambiguous overlapping hit zones.
- **Hit-testing selects the *nearest* admissible cell, not the first in iteration order.** The
  contract:

  ```ts
  function cellAtPixel(
    point: Pixel,
    cells: readonly CellCoord[],
    geometry: BoardGeometry,
  ): CellCoord | null;   // nearest center within hitRadius, else null
  ```

  This corrects the current `cellAt`'s first-match-wins behavior (§3.1) — important once
  `hitRadius > visualRadius` can make more than one cell admissible. **No adjacency or chain rule
  in `src/core` changes**; this is purely a scene-side input refinement.

`BattleScene.cellAt` becomes a thin adapter over `cellAtPixel` using the live `BoardGeometry`.

### 6.4 Module responsibilities (clear separation of pure vs DOM)

The target splits responsibilities so the layout model is pure and testable and the DOM lives in
one small adapter. (Exact filenames are the plan's to finalize; these responsibilities are the
contract. They map naturally onto today's `compositionLayout.ts` → `battleLayout.ts` and
`boardLayout.ts` → `boardGeometry.ts`, plus a new `browserViewport.ts`.)

| Module | Responsibility | May touch |
|---|---|---|
| `battleLayout.ts` | pure composition: `ViewportInput` + `BattleLayoutPolicy` → `BattleLayout` (safeRect, column, bands, table, boss, heroes, bossHud, background) | **pure, deterministic, Phaser-free, DOM-free** |
| `boardGeometry.ts` | pure board geometry: viewport/band inputs → `BoardGeometry`; `cellToPixel`, `cellAtPixel` | **pure, deterministic, Phaser-free** (DOM-free) |
| `browserViewport.ts` | DOM adapter: measure `env(safe-area-inset-*)` → `SafeInsets`; expose viewport-change signals | reads DOM/`getComputedStyle`; **contains no composition policy** |
| `BattleScene.ts` | read `this.scale.gameSize`; ask `browserViewport` for insets; build `ViewportInput`; call the pure functions; apply the `BattleLayout` to rendering + input | Phaser; no layout math of its own |

The pure layout model must **never** access `window`, `document`, or `getComputedStyle`. All DOM
measurement is confined to `browserViewport.ts`.

### 6.5 BattleScene resize lifecycle (explicit contracts)

- `create()`: read `this.scale.gameSize`, get insets from `browserViewport`, build the
  `ViewportInput`, compute `BattleLayout` + `BoardGeometry`, build containers, draw every layer,
  store an `activeLayout`, and wire `this.scale.on('resize', …)`.
- On `resize` (and on orientation / visual-viewport change surfaced via `browserViewport`), a
  reflow is **scheduled at most once for the next frame** — a burst of resize events collapses to a
  single relayout. The scheduled reflow then runs this exact sequence:

  ```
  resize received
    → reflow scheduled at most once for the next frame
    → re-read safe-area insets (browserViewport)
    → recompute and apply the layout (BattleLayout + BoardGeometry) to every layer
    → activeLayout updated
    → layoutRevision incremented
    → debug state marks the new layout as applied
  ```

**Lifecycle contracts the plan must honor:**
- Redraw methods are **idempotent**: each persistent container is cleared (or its objects
  repositioned) with **no duplication**; no `Graphics`/`Text` is leaked or doubled.
- The `resize` listener is **removed on scene `shutdown`/`destroy`**.
- **Reflow is scheduled on the next frame, not run synchronously inside the resize handler**
  (this is what coalesces a burst of events). Its completion is therefore an observable signal
  (`layoutRevision`), not an assumption of instant redraw.
- Under `?debug=1`, `window.__debug` exposes serializable **`getBattleLayout()`** and
  **`getLayoutRevision()`**. After a `setViewportSize`, Playwright must **wait** until the runtime
  layout reflects the new dimensions **or** `getLayoutRevision()` exceeds the value it captured
  before the resize — it must **not** assume a `setViewportSize` can be followed by a truly
  immediate assertion.
- Reflow creates **no new board logical state**, calls **no RNG**, and preserves HP, seed, tile
  contents, and combat state. It never triggers an attack, combo, refill, board mutation, or RNG
  consumption.
- The victory text is repositioned (or removed) correctly; the transient drag trace line is
  cleared.
- **Resize during an in-progress drag:** cancel the current selection and its visual trace
  **without resolving the turn**, then recompute the layout and redraw. (A mid-drag reflow must
  not score, backtrack-resolve, or drop a trailing portal.)
- DOM mirrors and `window.__debug` timing stay synchronous **within the reflow frame** (Playwright
  does not wait for tweens); the reflow itself completes in a single frame with **no animation**,
  and its completion is made observable via `layoutRevision` — tests gate on that signal (above),
  never on an assumed instant redraw after `setViewportSize`.

### 6.6 Target TypeScript contract (explicit interfaces)

Policy is **separate** from measured browser data. `BattleLayoutPolicy` is product/layout policy;
it must **not** be a field of `ViewportInput`.

```ts
interface Rect { x: number; y: number; width: number; height: number; }

interface SafeInsets { top: number; right: number; bottom: number; left: number; }

interface ViewportInput {
  width: number;
  height: number;
  safeInsets: SafeInsets;      // measured by browserViewport, in game units
}

interface BattleLayoutPolicy {
  maxGameplayColumnWidth: number;   // ~560 initial (validate 520/560/600)
  legacyBoardWidthAt480: number;    // 380 — anchors baseline-neutral tile width
  minVisualRadius: number;
  minHitRadius: number;
  maxBoardScale: number;
}

interface BoardGeometry {
  originX: number;
  originY: number;
  colWidth: number;
  rowHeight: number;
  visualRadius: number;
  hitRadius: number;
  tileBounds: Rect;
}

interface BattleLayout {
  input: ViewportInput;
  safeRect: Rect;
  gameplayColumn: Rect;
  background: Rect;          // full viewport
  bands: LayoutBands;        // topHud / monster / hero / board / safeBottom
  board: BoardGeometry;
  table: Rect;
  boss: Rect;
  heroes: Rect[];
  bossHud: BossHudLayout;
  environment: EnvironmentAnchors;
}
```

`LayoutBands`, `BossHudLayout`, and `EnvironmentAnchors` are the plan's to specify concretely
(the first two already exist in spirit in `compositionLayout.ts`).

### 6.7 Data flow summary

```
viewport / orientation / toolbar change
        │  (browser sizes the parent)
        ▼
this.scale 'resize'  → gameSize (CSS px)      browserViewport → SafeInsets (game units)
        └───────────────┬───────────────────────────────┘
                        ▼
        ViewportInput { width, height, safeInsets }   +   BattleLayoutPolicy
                        ▼
        computeBattleLayout(...)   [pure TS — also run by e2e in Node]
                        │
                        ├──▶ background (full viewport)
                        ├──▶ safeRect → gameplayColumn → table / boss / heroes / bossHud
                        └──▶ board: BoardGeometry { cellToPixel, visualRadius, hitRadius, tileBounds }
                                    │
                                    ├──▶ drawBoard()  (circles at cellToPixel, visualRadius)
                                    └──▶ cellAtPixel(pointer, cells, geometry)  (nearest within hitRadius)
```

---

## 7. Cross-cutting concerns

### 7.1 Pointer accuracy (the top risk, strongly reduced — not fully retired)

Under RESIZE, `pointer.x/y` equals CSS px, and the board geometry produces CSS px from the same
pure layout — so hit-testing stays exact **as long as** the scene's geometry and the geometry
implied by `pointer.x/y` come from the same `(viewport, insets)` input. §4.2 **strongly reduced**
this risk: real input hit the correct cell across four viewports — but only at DPR=1 and with null
insets (§4.3). It is not "retired"; it must remain covered by the **permanent** reflow e2e across
the viewport matrix (§8.2), the DPR-independence and inset tests (§8.1), and real-device
validation (§10). Invariant to protect: **never** put board cells inside a container with a
non-identity transform (keep `boardLayer` at `(0,0)` scale 1); bake all positioning into the
geometry.

### 7.2 E2e coordinate strategy (runtime layout is the source; Node recompute is the guard)

Not "Playwright recomputes the layout in Node" alone. The target strategy:

1. `BattleScene` keeps an **`activeLayout`** (the `BattleLayout` currently rendered).
2. Under `?debug=1`, `window.__debug` exposes a **serializable copy of the active layout** via
   e.g. `getBattleLayout()`.
3. Playwright drives its interactions from the **actual runtime layout** — the geometry really on
   screen — so clicks always match what is displayed.
4. Playwright **also** recomputes `computeBattleLayout(viewportInput, policy)` in Node and
   **compares it to the runtime layout** as a consistency guard.

This gives three properties at once: interactions use the displayed geometry; a browser↔Node
divergence is *detected*; and the formula stays centralized in the pure module.

Because a viewport change reflows on the **next frame** (§6.5), Playwright must gate on the
completion signal before reading the layout: after `setViewportSize`, wait until
`getLayoutRevision()` exceeds its pre-resize value (or the runtime `getBattleLayout()` reflects the
new dimensions), *then* compute click coordinates. Never assert immediately after the resize call.

Even though RESIZE yields an identity mapping, the Playwright helper converts **game → client**
coordinates via the canvas rect:

```
clientX = canvasRect.left + gameX * canvasRect.width  / gameWidth;
clientY = canvasRect.top  + gameY * canvasRect.height / gameHeight;
```

When the contract holds this is a numeric no-op, but it also serves as a **guard/diagnostic** if
the canvas is ever offset or CSS-scaled.

### 7.3 Safe-area insets — re-read on every relevant reflow (not once at startup)

The insets must be re-read whenever the viewport meaningfully changes:

```
Scale Manager resize  OR  orientation / visualViewport change
   → re-read env(safe-area-inset-*)   (browserViewport.ts, DOM)
   → convert to game units
   → build a new ViewportInput
   → recompute BattleLayout
   → redraw
```

The pure layout model never reads `env()`; only `browserViewport.ts` does. This keeps notch/
home-indicator handling correct after a device rotation, not just at first paint.

### 7.4 Redraw-on-resize hygiene

Moving background/table/environment from draw-once to resize-aware is a structural change with
z-order and leak risks. Mitigation: each layer owns a container; redraw = `container.removeAll(
true)` + repopulate (mirroring today's `drawBoard`); depth from `depth.ts` is unchanged; a debug
overlay (gated by `?debug=1`, isolated in a debug container) may render safeRect / column / band /
tile-bounds guides to make reflow visually auditable. See §6.5 for the idempotency/no-duplication
contracts.

### 7.5 Minimum interactive size

Pure downscaling on very small/short viewports could shrink tiles below a usable touch target.
`BoardGeometry.visualRadius` and `hitRadius` are floored by `policy.minVisualRadius` /
`policy.minHitRadius`; when a floor conflicts with available height, the degradation order (§6.2)
reclaims space from HUD/environment/hero bands **before** the board. The **320×568** case is the
explicit stress test that fixes these floors (§8).

---

## 8. Test strategy

All test changes belong to the **implementation** phase (this audit modifies no tests). The plan
sequences them per milestone; the shape:

**Vitest (pure, fast — the primary safety net for the layout math):**
- Rewrite `tests/scenes/compositionLayout.test.ts` and `tests/scenes/boardLayout.test.ts` to
  assert the pure functions across the viewport matrix (below) **and across synthetic safe-area
  insets** (§8.1). Assert invariants, not only fixed pins: `safeRect` correct for given insets;
  column capped at `maxGameplayColumnWidth` and centered **in the safeRect**; distinct widths
  (`safeRect`/`column`/`table`/`boardBand`/`tileBounds`) each correct; board isotropically scaled
  (no stretch); board fully inside the column and board band; `visualRadius`/`hitRadius` floors
  respected and `hitRadius` capped by min center distance; bands ordered/contiguous; monster
  dominant; heroes grounded on the table rear edge.
- Keep **480×720 value-pins** for continuity: the neutral-refactor milestones must reproduce the
  current `tileBounds` (380) exactly.
- `cellAtPixel` unit tests: nearest-cell selection (including the case where two cells are within
  `hitRadius`), and null outside `hitRadius`.

**Playwright (real input, real Scale.RESIZE):**
- `tests/e2e/canvas-bounds.spec.ts`: replace the "fixed 480×720 at origin" assertion with the
  RESIZE invariant — **canvas fills the viewport at the origin** (`{0,0,w,h}`) — at several sizes.
- `tests/e2e/battle.spec.ts`: drive clicks from the **runtime `getBattleLayout()`** and
  cross-check against the Node `computeBattleLayout` (§7.2), at explicit viewports (a phone and a
  desktop). Keep the existing drag→damage / min-length / backtrack / trailing-portal / debug
  assertions.
- **New** `tests/e2e/reflow.spec.ts`: pointer-accuracy across the matrix (the §4.2 check promoted
  to a permanent test) and a **mid-session resize** test (drag works after `setViewportSize`
  between turns; a resize *during* a drag cancels the selection without scoring, per §6.5).
- Testing hygiene: run the multi-viewport e2e with a clean 5173 (or `reuseExistingServer: false`
  under CI) so the §2 rogue-server flake never masks a real reflow regression.

### 8.1 Synthetic safe-area and DPR tests (largely automatable — device only for the rest)

Safe areas and DPR are **not** "entirely unverifiable without a device." A real device is still
required for **visual sharpness**, **GPU performance**, **true notch behavior**, and
**OS-specific system bars** — but the *architecture* is largely auto-testable:

- **Synthetic safe insets** (Vitest calls `computeBattleLayout` directly with each; Playwright
  injects them via a debug/test surface or controlled CSS variables set **before** the scene
  starts, then verifies the runtime layout):
  - `{ top: 0, right: 0, bottom: 0, left: 0 }`
  - `{ top: 47, right: 0, bottom: 34, left: 0 }` (notch + home indicator)
  - `{ top: 0, right: 22, bottom: 20, left: 14 }` (landscape-style lateral insets)
- **DPR:** Playwright runs a context with a high `deviceScaleFactor` and asserts: canvas rect
  (CSS) unchanged vs DPR=1 at the same CSS viewport; `gameSize` logically correct; **layout
  unchanged at equal CSS viewport**; click coordinates still correct; **no layout field depends on
  DPR**.

### 8.2 Mandatory viewport matrix (the plan must cover all of these)

`320×568`, `360×640`, `375×667`, `390×844`, `412×915`, `430×932`, `768×1024`, plus:
- `480×720` — regression baseline (must stay pixel-neutral through the refactor milestones);
- `1000×700` (or an equivalent wide viewport) — verifies the ~560 column **cap** and centering;
- null insets; a top/bottom-insets case; **at least one lateral-insets case**; and **one
  high-`deviceScaleFactor` case**.

The **`320×568`** case must explicitly determine: the minimum viable `visualRadius`; the minimum
viable `hitRadius`; the maximum usage of the safe width; and the real vertical compression order.

---

## 9. Risk register

| # | Risk | Likelihood | Detection | Mitigation |
|---|---|---|---|---|
| R1 | Pointer desync after reflow (geometry vs `pointer.x/y`) | Low — strongly reduced §4.2, not retired | permanent reflow e2e across matrix + DPR/inset tests + device check | `boardLayer` identity transform; one pure layout drives draw + hit-test |
| R2 | E2e/coordinate-contract churn (imports `ORIGIN_X`/`STONE_RADIUS`/zero-arg `cellToPixel`) | High (certain) | tsc + e2e | rewrite to the `BoardGeometry`/`getBattleLayout` contract; own milestone with a review stop |
| R3 | Draw-once → resize redraw z-order regressions / GameObject leaks | Medium | debug overlay + screenshot | per-layer container, `removeAll(true)` + repopulate, `depth.ts` unchanged, idempotency contracts (§6.5) |
| R4 | High-DPR crispness / GPU perf on real devices | Medium | **device test** (architecture auto-tested §8.1) | verify on a real high-DPR device; confirm no layout field depends on DPR |
| R5 | Notch safe-area insets wrong after rotation | Medium | synthetic insets (§8.1) + **device test** | re-read insets every reflow (§7.3); `viewport-fit=cover` + `env()` → `safeInsets` |
| R6 | Tiles below a usable touch target on small viewports | Medium | Vitest @ 320×568 | `visualRadius`/`hitRadius` floors + degradation order reclaiming non-board bands first |
| R7 | Resize made async/animated → Playwright races; or mid-drag reflow scores a turn | Low | e2e flakes / mid-drag test | synchronous reflow; mid-drag resize cancels selection without resolving (§6.5) |
| R8 | Mobile dynamic-toolbar / `vh` mismatch resizes the canvas unexpectedly | Medium | device + `dvh` fallback | `#app` `dvh` with `vh` fallback; source of truth is `this.scale.gameSize` (§6.1) |
| R9 | Vite 500 kB chunk warning / bundle size | Cosmetic | build | pre-existing; unrelated; no action |

**None of these touch `src/core/**` or gameplay rules** — the core is provably layout-independent.

---

## 10. Verification: what is auto-testable vs device-only

The headless browser used for §4 ran at `devicePixelRatio === 1` with no device insets.

- **Auto-testable now** (Vitest + Playwright, §8/§8.1): the whole layout model, `safeRect`/column/
  band math, `BoardGeometry` (including `visualRadius`≠`hitRadius` and nearest-cell hit-testing),
  reflow + real-pointer accuracy across the viewport matrix, synthetic safe-area insets, and DPR
  independence of the layout.
- **Device-only gates** (must be checked on real hardware before "done", not asserted here):
  high-DPR **visual sharpness**, **GPU performance**, **true notch/rounded-corner** behavior, and
  **OS-specific system bars**. These are R4/R5/R8's residual, non-automatable parts.

The reflow, coordinate, and pointer-accuracy claims (§4.2) are fully verified at DPR=1 across the
phone→desktop viewport matrix.

---

## 11. Open product decisions

These are **not yet fixed constants**. Each has a recommendation to start from; each must be
**confirmed during the tuning milestone (§13)** against real composition and (where noted) a real
device. The plan should carry them as tunable policy fields (`BattleLayoutPolicy`, §6.6), not bake
them in.

- **Officially supported minimum width (320 vs 360).** *Recommendation:* guarantee **360px** as
  the supported minimum; treat **320px** as best-effort (must never crash or clip, uses the
  320×568 stress case, §6.2/§8.2). Confirm during tuning.
- **Final `minVisualRadius`.** *Recommendation:* target ≈ **16 px** (diameter ≈ 32); accept a
  best-effort ≈ 14.7 px only at 320px width. Confirm during tuning.
- **Final `minHitRadius`.** *Recommendation:* slightly larger than `visualRadius` (≈ **18–20 px**),
  **capped at half the minimum distance between cell centers** so neighbours never overlap
  ambiguously (§6.3). Confirm during tuning.
- **Maximum share of `safeRect` usable by `tileBounds`.** *Recommendation:* from the ~79.2%
  baseline, allow up to ≈ **92–94%** on narrow viewports (via `tileWidthFraction`), **never
  overflowing the `safeRect`** (§6.2). Confirm during tuning.
- **Final `gameplayColumn` cap.** *Recommendation:* **560** initial; compare **520 / 560 / 600**
  during tuning. Confirm during tuning.
- **Mobile landscape policy.** *Recommendation:* portrait-first; in landscape, reflow the **same
  centered column** with the board scaled to the available height and environment revealed on the
  sides (no stretch). A "rotate for the best experience" hint is an option, not a requirement.
  Confirm during tuning.
- **Desktop/tablet policy.** *Recommendation:* capped, centered column with revealed side
  environment; never stretch the grid or spread heroes excessively (blueprint wide-screen rule).
  Confirm during tuning.
- **HiDPI strategy / optional DPR cap.** *Recommendation:* rely on Phaser RESIZE's DPR handling;
  keep the **layout DPR-independent** (§8.1); consider **capping the backing-store DPR** (e.g. ≤ 2
  or ≤ 3) if GPU cost on high-DPR devices warrants it. Confirm on a real device.
- **Real-device validation criteria.** *Recommendation:* on at least one notched high-DPR phone
  **and** one tablet, verify visual sharpness, correct notch insets **after rotation**, pointer
  accuracy, stable frame rate across a resize/rotation, and no clipping. These are the §10
  device-only gates; confirm before declaring the responsive work done.

---

## 12. Asset specifications depending on responsive layout

The responsive contracts above constrain how future art must be authored. **No final asset should
be produced before these contracts stabilize** (end of the tuning milestone, §13). Placeholders
stay flat until then (blueprint "Placeholder Strategy").

- **Background — full-viewport, crop-safe and extensible.** Keep all essential content within a
  central safe region; edges may be **cropped** (short/wide screens) or **extended** (revealed
  sides). No critical detail near the outer edges. Authored to sit under the safe areas.
- **Table — layered or horizontally adaptable.** Separable rear-edge / surface / front-edge pieces
  (or a stretch-tolerant middle) so the surface fits a **variable column width** without distorting
  painted marks. The table art must **never** dictate cell centers (blueprint "Board Geometry
  Rules").
- **Hero & boss pivots/anchors.** Heroes use a **bottom-center** anchor grounded on the table rear
  edge; the boss is centered in the monster band. Pivots documented so sprites drop into the
  computed rects (`heroes[]`, `boss`).
- **HUD — variable-bounds compatible.** No fixed-width panel art; the boss HP bar/text derive from
  the monster footprint and the column (§ `bossHud`). Diegetic per the blueprint; must stay
  readable at every band size.
- **Stone / tile resolution.** Author tiles from the **minimum and maximum** on-screen sizes (the
  `minVisualRadius` floor up to the desktop-capped upscale, `maxBoardScale`) so they stay crisp
  across the whole scale range.
- **Decorative props — anchored and disable-able.** Props attach to `EnvironmentAnchors` and are
  **individually removable** when space is scarce (the degradation order, §6.2). They must never
  intercept pointer input or cover a selectable cell (blueprint "Input Safety").
- **Asset-production gate.** Final assets are produced only **after** these contracts are stable
  and validated across the viewport matrix.

---

## 13. Migration strategy (overview — the plan sequences the milestones)

Staged so risk is introduced in reviewable increments; each milestone in the companion plan is
independently testable with an explicit scope, files-changed list, produced/consumed interfaces,
validation commands, tests, a commit boundary, and a review stop-point (no single large
milestone):

1. **Behavior-preserving layout refactor.** Introduce the pure `battleLayout.ts` /
   `boardGeometry.ts` contracts (`ViewportInput`, `BattleLayoutPolicy`, `BattleLayout`,
   `BoardGeometry` with `visualRadius`/`hitRadius`, `cellAtPixel`), defaulting to 480×720 and
   **reproducing today's `tileBounds` (380) exactly**. No scene/Scale change. Existing Vitest
   suites stay green (adapted to the new contract, same values).
2. **Thread the layout + geometry through `BattleScene`** at a fixed 480×720, add `activeLayout`
   + `getBattleLayout()` under `?debug=1`, and switch `cellAt`→`cellAtPixel`. Screenshot + e2e
   parity; e2e coordinate rewrites validated behind an unchanged viewport.
3. **Flip the transport:** `Scale.RESIZE` + `index.html` CSS/meta (`dvh` fallback) + resize
   handler + redraw-on-resize + `browserViewport.ts` inset adapter. Rewrite `canvas-bounds`; add
   the reflow + mid-session-resize specs. Validate across the viewport matrix.
4. **Reflow tuning:** band/degradation clamps, `visualRadius`/`hitRadius` floors (fixed against
   the 320×568 case), safe-area insets end-to-end, the **deliberate** small-phone puzzle-width
   increase (§6.2, documented as a composition decision), and `MAX_GAMEPLAY_COLUMN_WIDTH`
   validation at 520/560/600. Validate the full matrix + document the device-test gates (R4/R5/R8).

The responsive plan **ends** when the layout and coordinate architecture is stable and validated
across the viewport matrix. Final assets, animation, particles, lighting, and polish are out of
scope.

---

## 14. Conclusion

The Phaser 4.2.1 baseline is green and measured. The current fixed-480×720 canvas is clipped on
sub-canvas viewports (quantified: 120×80 px lost at 360×640). `compositionLayout.ts` is already
proportional but knows nothing of safe areas; the frozen obstacles are `boardLayout.ts`'s
module-level origin constants, the fixed board geometry, the single `STONE_RADIUS`, and the
absent Scale/viewport bootstrap.

**Recommended architecture:**

- `Phaser.Scale.RESIZE` (viewport transport only),
- **plus** a pure-TypeScript layout,
- **plus** a gameplay column capped around **560** (initial — validate 520/560/600),
- **plus** gameplay centered inside the `safeRect`,
- **plus** a full-viewport decorative background,
- **plus** a `boardLayer` with no transform,
- **plus** a single geometry source of truth shared by rendering, input, Vitest, and Playwright.

It was verified end-to-end under Phaser 4.2.1 with real pointer input across a phone→desktop
viewport matrix (all clicks correct). The one large ripple is the board coordinate contract
(retiring `ORIGIN_X/Y`/`STONE_RADIUS` for a `BoardGeometry` with separate `visualRadius`/
`hitRadius` and a nearest-cell `cellAtPixel`), which drives the Vitest and Playwright rewrites.
Safe areas and DPR are largely auto-testable (§8.1); only visual sharpness, GPU performance, true
notch behavior, and OS system bars remain device-only gates.
