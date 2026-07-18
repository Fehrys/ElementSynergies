# Battle Scene Design-to-Implementation Audit

**Date:** 2026-07-11

Companion to `BATTLE_SCENE_BLUEPRINT.md`. That document defines the target structure; this
document records what the current `BattleScene` actually does today, gap-by-gap, so the
migration plan can be sequenced safely.

---

## 1. Current display structure

`src/scenes/BattleScene.ts` has no `preload()` — every visual is drawn procedurally in
`create()`, nothing is loaded as an image asset. Display objects:

- `boardLayer` — the only `Phaser.GameObjects.Container` in the scene. Populated by
  `drawBoard()`, which does a full `removeAll(true)` + rebuild every call (one `Graphics`
  circle per cell, plus a `Text` glyph for special tiles/portals).
- `traceGraphics` — a top-level `Graphics` object for the in-progress drag line.
- `hpText` / `hpBar` — top-level `Text` + `Graphics` for the monster HP readout.
- `drawBattleLineup()` — adds 4 filled-rectangle hero boxes + 1 outlined-rectangle monster
  box + their text labels directly to the scene root (not into any container), once, in
  `create()`.
- Victory text — a one-off `Text` added directly to the scene root inside `checkVictory()`.

There are no named containers beyond `boardLayer`, no depth constants, no Phaser
`Scale` config (canvas is a fixed 480×720, set in `src/main.ts`), and no resize handling
of any kind. Render order is simply object-creation order: `boardLayer` (added early,
populated later) → `traceGraphics` → `hpText` → `hpBar` → lineup graphics/text (added
last, so they'd sit visually on top of everything if their regions ever overlapped).

## 2. What already satisfies the blueprint

- **Core/scene separation** — `BattleScene` only renders state and forwards a `CellCoord[]`
  path to `resolveTurn()`; no gameplay rule lives in the scene. This is the blueprint's
  top non-negotiable constraint and it already holds.
- **Board geometry direction** — `boardLayout.ts`'s `cellToPixel` computes pixel centers
  purely from grid constants (`ORIGIN_X/Y`, `COL_WIDTH`, `ROW_HEIGHT`); nothing paints a
  board image and then forces cells into it. This matches the blueprint's "Grid geometry →
  Tile centers → Board visual bounds" direction exactly.
- **Deterministic seeded RNG / `?seed=N`** — preserved, and is itself a listed
  non-negotiable constraint.
- **`?debug=1` mode** — `window.__debug` (spawnTile/spawnPortal/getBoard/setMonsterHp/
  lastTurn) and the DOM mirror attributes (`data-scene`, `data-monster-hp`) work today and
  are exercised by 3 Playwright tests.
- **Pointer hit-testing decoupled from visuals** — `cellAt()` hit-tests against
  `cellToPixel` output with a fixed radius, not against rendered sprite bounds, so it's
  already immune to purely-visual changes as long as new decoration doesn't intercept
  pointer events.

## 3. What creates a generic stacked-panel / mobile-app appearance

- **`drawBattleLineup()`'s hero boxes** are 4 stacked filled rectangles with centered name
  labels — literally the "rectangular status cards" the art target explicitly forbids
  ("heroes... not represented only by portraits or rectangular status cards").
- **The monster box** is an outlined rectangle the same visual weight as a hero box, not a
  dominant silhouette — contradicts "should be significantly larger than the heroes" /
  "1.5 to 2 times taller than a hero."
- **The HP bar** (`drawHp()`) is a flat gray-and-red rectangle pair with plain text,
  floating at a fixed top-left position — the definition of the "floating panels," "full-
  width card containers" the blueprint's UI Integration section says to avoid.
- **Solid flat background** (`backgroundColor: '#1b1b2f'` in `main.ts`) — no background,
  environment, or atmosphere layers exist at all, so there is zero depth even though
  `VISUAL_COMPOSITION.md`'s whole thesis is layered depth.
- **Disjoint horizontal bands** — HP (y 20–66), lineup (y ~100–454), board (y ~464–700)
  never overlap. The blueprint explicitly calls for regions that "intentionally overlap
  slightly to avoid a stacked mobile-app layout"; today's layout is the opposite by
  construction.

## 4. Current layout assumptions & hard-coded coordinates

Everything below assumes the fixed 480×720 canvas and is expressed in absolute pixels,
not viewport ratios:

- `src/main.ts` — `width: 480, height: 720`, no `Phaser.Scale` mode, no resize listener.
- `boardLayout.ts` — `ORIGIN_X = 72`, `ORIGIN_Y = 486`, `COL_WIDTH = 56`, `ROW_HEIGHT = 48`,
  hand-derived (see `docs/superpowers/specs/2026-07-09-battle-lineup-and-layout-design.md`)
  to center/bottom-align the grid in exactly this canvas size. `STONE_RADIUS = 22` lives
  separately in `BattleScene.ts` and is reused as the pointer hit-test radius — it must stay
  in sync with whatever the tile's actual rendered size becomes.
- `drawBattleLineup()` — hero boxes at `x=40, width=100, height=50`, `y = 147 + i*70`;
  monster box at `x=280, y=177, width=160, height=200`. All hand-fit to the old band
  y:100–454 with no relationship to `cellToPixel`'s coordinate system.
- `drawHp()` — bar at `x=20, y=50, width=300, height=16`; text at `x=20, y=20`.
- `checkVictory()` — "Victory!" text hard-coded at `x=140, y=400`.

None of this recalculates on resize because nothing currently resizes.

## 5. Existing input and test constraints that must be preserved

- **`cellAt()`** hit-tests every one of the 32 cells via `getAllCells()` + `cellToPixel`
  with a `STONE_RADIUS` (22px) tolerance. This must keep working unchanged: any
  repositioning has to flow through `cellToPixel`/`ORIGIN_X`/`ORIGIN_Y`, not a container
  transform layered on top (see Risks, §8).
- **Drag state machine** (`onPointerMove`'s backtrack-by-revisiting-second-last-cell,
  `canExtendChain` per-step validation, trailing-portal drop on release in `onPointerUp`)
  is pure input logic in the scene; it survives as long as no new decorative object
  intercepts pointer events ahead of the board.
- **`tests/e2e/battle.spec.ts`** imports `cellToPixel` directly from `boardLayout.ts` in
  plain Node (no Phaser import — that's why `boardLayout.ts` is kept Phaser-free) to
  compute every click coordinate itself. This means the *constants* (`ORIGIN_X` etc.) are
  free to change — tests automatically follow — but `cellToPixel`'s signature and its
  status as the sole, purely-constant-driven source of truth for on-screen cell centers
  must not change. No camera offset or transform may be applied only in the browser that
  the Node-side math can't replicate.
- **DOM mirror attributes** `data-scene` (`"battle"` / `"victory"`) and `data-monster-hp`
  on `<body>`, and the **`window.__debug` API** shape, are asserted on directly by every
  e2e test and must keep firing at the same lifecycle points (`create()`, `drawHp()`,
  `checkVictory()`, the debug hooks).
- **`?seed=N`** must keep producing the exact same `fillBoard` result the tests
  independently recompute via `fillBoard(new HexGrid(), mulberry32(seed))`.

## 6. Safest migration sequence

1. **Introduce named containers with zero visual change.** Add the blueprint's container
   scaffolding (or the subset this milestone needs) to `create()` and re-parent every
   existing draw call into the right container, without moving a single pixel. Run the
   full unit + e2e suite — this proves the container plumbing is inert before anything
   else changes.
2. **Introduce a responsive layout region calculator** (new module, percentage bands
   translated from the blueprint's 0/8/34/46/93/100% ranges) — but keep the canvas itself
   at a fixed internal resolution this milestone (see Risk on Phaser `Scale` modes, §8).
   This is the highest-blast-radius step because every subsequent placement reads from it,
   so it goes first among the "real" changes, immediately after containers are proven safe.
3. **Re-derive `ORIGIN_X`/`ORIGIN_Y`** from the new layout regions instead of hand-picked
   literals. `cellToPixel`'s signature stays identical, so the e2e suite (which always
   recomputes coordinates through it) needs no changes — this step is the cheapest to
   verify and validates the layout module before it's trusted for anything else.
4. **Replace the HP bar/HUD placement** with a layout-region-driven placeholder — visual
   only, `data-monster-hp` timing untouched.
5. **Replace `drawBattleLineup()`'s rectangle cards** with world-space hero placeholders
   positioned from the hero region, and enlarge/reposition the monster placeholder to
   dominate the upper region (1.5–2× hero height) per the blueprint.
6. **Add the preparation-table silhouette** behind the board region without touching
   `cellToPixel`.
7. **Remove now-unnecessary framing/padding** (flat background color, the monster's
   `strokeRect` outline chrome) — pure subtraction, lowest risk, done last since it can't
   affect input or test assertions.
8. **Final gate:** confirm `?debug=1` visuals (if any are added) are isolated in a
   `debugContainer`, then run the complete unit + Playwright suite once more.

## 7. Temporary placeholder assets/primitives needed for the first pass

Per the blueprint's Placeholder Strategy (footprint over meaning — anchors, bounds, and
layer order must already be correct even though the shapes are flat):

- A large colored silhouette (e.g. a rounded blob/polygon) for the **monster placeholder**,
  sized 1.5–2× hero height, centered in the monster region.
- Four smaller colored silhouettes (e.g. rounded capsules), one per `ROSTER` color, laid
  out in a row inside the hero region — not stacked cards.
- A wide rounded-rectangle or trapezoid **preparation-table silhouette** behind the board.
- Simple flat-ellipse **drop shadows** under the monster and each hero placeholder.
- A two-tone flat/gradient rectangle standing in for the background layer.
- **Keep the existing tile rendering as-is** (Graphics circle + emoji glyph for
  stones/specials/portals) — the task explicitly asks to preserve current puzzle visuals.
- Optional: a debug-only overlay (rectangle outlines + labels) showing composition-region
  bounds, gated behind `?debug=1` — the blueprint lists this as a useful debug overlay, not
  a requirement.

## 8. Risks

- **Pointer accuracy.** `cellToPixel` must keep returning true stage-space pixels. If board
  cells are placed inside a `Container` that itself gets a non-identity position/scale
  transform, `pointer.x/y` (which Phaser reports in stage space) will silently desync from
  the Node-side `cellToPixel` math the e2e suite relies on. Mitigation: bake any repositioning
  into `ORIGIN_X`/`ORIGIN_Y` themselves, or keep `boardContainer` at position (0,0) scale 1.
- **Responsive behavior vs. Playwright mouse coordinates.** `page.mouse.move` drives real
  browser pixel coordinates against the rendered `<canvas>`. Introducing a Phaser `Scale`
  mode (FIT/RESIZE/etc.) changes the relationship between CSS pixels and internal game
  coordinates. Given the milestone only requires *establishing* composition regions (not
  full multi-viewport support), the safest first pass keeps the canvas at a fixed internal
  resolution and expresses regions as ratios of that fixed size — deferring true
  CSS-responsive scaling to a later milestone.
- **Debug mode regressions.** `window.__debug.spawnTile/spawnPortal` call `drawBoard()`
  directly — `drawBoard()` must keep existing (whichever container it now populates).
- **Test timing.** DOM mirror attributes must keep being set synchronously inside
  `create()`/`drawHp()`/`checkVictory()`; Playwright does not wait for tweens or animation,
  so this milestone must not move any of that into an async/animated path.
- **Z-order regressions.** Moving from creation-order rendering to explicit containers
  risks getting the container add-order (or depth values) wrong, which could silently
  cause new decoration to occlude the board or HUD where the old disjoint-band layout
  never had to worry about overlap.
