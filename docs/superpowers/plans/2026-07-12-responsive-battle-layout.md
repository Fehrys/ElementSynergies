# Responsive Battle Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `BattleScene` adapt to real viewports (phones → tablets → desktop) with an accurate pointer-to-cell mapping at every size, replacing the fixed, silently-clipped 480×720 canvas — without changing any gameplay rule.

**Architecture:** `Phaser.Scale.RESIZE` is used **only** as the viewport transport (never a stretch command). All layout is computed by a pure-TypeScript model (`battleLayout.ts` + `boardGeometry.ts`) that derives a `safeRect` from viewport + safe-area insets, caps and centers a gameplay column inside it, and lets the decorative background span the full viewport. The `boardLayer` stays at `(0,0)` scale 1 with no camera/Container transform; the **same** geometry drives rendering, input, Vitest, and Playwright. See the companion audit `docs/superpowers/specs/2026-07-12-responsive-battle-layout-audit.md` for the full rationale and empirical Phaser 4.2.1 verification.

**Tech Stack:** Phaser 4.2.1, TypeScript (strict, `noEmit`), Vite 5, Vitest 2, Playwright 1.48.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the audit/spec.

- **No change to `src/core/**`** — the puzzle/combat core stays Phaser-free and layout-free. **No adjacency, chain, portal, special-tile, RNG, or combat rule changes**, anywhere (including in `BattleScene`).
- **No camera or Container transform** to position the board. `boardLayer` stays at `(0,0)` scale 1. All positioning is baked into `BoardGeometry`.
- **One geometry source of truth**, pure and Node-importable, shared by rendering, input, Vitest, and Playwright. **No layout formula is duplicated between the browser and Node.**
- **No layout field may depend on `devicePixelRatio`.** DPR affects only the backing store, never the computed layout.
- **`visualRadius` is always `STONE_RADIUS * scale`** — the same isotropic factor as the spacings — and is **never** floored or grown independently. `targetMinVisualRadius`/`targetMinHitRadius` are policy *targets*: when infeasible, the feasible result wins (`tileBounds` never leaves `safeRect`), the shortfall is reported (`targetVisualRadiusSatisfied`) and becomes an open product decision. `hitRadius` is the only separately-floored quantity, capped at `minCenterDistance/2 − EPSILON`.
- **Reflow is deferred + coalesced to the next frame**, applied fully in that frame, with **no tween/animation**, and its completion is observable via `getLayoutRevision()`. **A resize never resolves a turn** (a mid-drag resize cancels the selection without scoring).
- **The pure layout model never reads `window`/`document`/`getComputedStyle`.** All DOM measurement lives in `browserViewport.ts`.
- **Runtime source of truth for viewport size is `this.scale.gameSize`** (what Phaser measured), never `window.innerWidth`/`visualViewport` read directly.
- **Baseline neutrality:** through M1–M5 the 480×720 composition stays **pixel-identical** to today (`tileBounds` width 380, `ORIGIN_X=72`, `ORIGIN_Y=422`, `STONE_RADIUS=22`, all band/table/HUD/hero/boss values unchanged). This is enforced **automatically** by a committed 480×720 Playwright screenshot baseline captured in **M0 from the starting commit's unmodified code** and kept green through M1–M6 (M7 only adds responsive sizes, never regenerates the 480 one). `--update-snapshots` is authorized only for that initial M0 capture or after an explicitly validated deliberate visual change. The **only** deliberate composition change — widening the puzzle's share on small phones — happens **exclusively** in M6 and is documented as a composition decision.
- **Out of scope (do not touch):** final art assets, advanced/skeletal animation, particles, lighting, combat FX, visual polish. The plan ends when the layout + coordinate architecture is stable and validated across the viewport matrix.

**Mandatory viewport matrix (M7 must cover all):** `320×568`, `360×640`, `375×667`, `390×844`, `412×915`, `430×932`, `480×720` (regression baseline), `768×1024`, and one wide viewport (`1000×700`); plus null insets, a top/bottom-inset case, a lateral-inset case, and one high-`deviceScaleFactor` case.

**Per-milestone validation gate.** Every milestone ends with all four green:

```bash
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
```

Where a full suite is unnecessary after a tiny intermediate step, the step names the minimal check and why — but the milestone as a whole is not complete until the four commands above pass.

---

## Target module map (locked for the whole plan)

| Module | Kind | Responsibility |
|---|---|---|
| `src/scenes/battleLayout.ts` | **new, pure** | Owns the policy: `computeBattleLayout(input, policy): BattleLayout`; `DEFAULT_BATTLE_LAYOUT_POLICY`; `resolveTileWidthFraction` + `resolveBoardGeometryInput` (turns the policy into a plain `BoardGeometryInput`); pure inset helpers (`cssInsetsToGame`, `sanitizeInsets`, `clampInsetsToViewport`). Evolves the math currently in `compositionLayout.ts`. Phaser-free, DOM-free. |
| `src/scenes/boardGeometry.ts` | **new, pure** | `computeBoardGeometry(input): BoardGeometry` (takes a fully-resolved `BoardGeometryInput`, no policy); `cellToPixel(geometry, row, col)`; `cellAtPixel(point, cells, geometry)`. Evolves `boardLayout.ts`. Phaser-free, DOM-free, no `480`/`380` magic. |
| `src/scenes/compositionLayout.ts` | modified | Low-level band/placeholder/table/HUD math that `battleLayout.ts` composes over, in **local** coordinates. Takes band ranges, `tableWidthFraction`, `boardHeightFraction` (and Rects) as **parameters**. M1 keeps the current constants as temporary defaults so BattleScene still compiles; **after M2** it holds **no** copy of any policy value — `BattleLayoutPolicy` is then the sole permanent source. No DOM, no responsive decision, and it imports nothing from `battleLayout.ts`. |
| `src/scenes/boardLayout.ts` | modified → retired | Its module-level `ORIGIN_X`/`ORIGIN_Y`/`STONE_RADIUS` exports and zero-arg `cellToPixel` are removed once all consumers move to `boardGeometry.ts` (M2). |
| `src/scenes/browserViewport.ts` | **new, DOM adapter** | Measure `env(safe-area-inset-*)` → `SafeInsets` (CSS px); read `this.scale.gameSize` + canvas rect; expose viewport-change signals. No composition policy. |
| `src/scenes/BattleScene.ts` | modified | Builds `ViewportInput`, calls the pure functions, applies `BattleLayout`, owns the reflow lifecycle + `?debug=1` surface. No layout math of its own. |
| `src/main.ts` | modified (M4) | Add `scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }`. |
| `index.html` | modified (M4) | Add `<meta name="viewport" … viewport-fit=cover>` and `dvh`/`vh` CSS. |
| `playwright.config.ts` | modified (M0) | Harden the dev-server contract (stale-server safety). |

---

## Locked TypeScript contract (referenced by every milestone)

Defined in M1; reproduced here so tasks read out of order stay consistent.

```ts
// battleLayout.ts
import type { BoardGeometry, BoardGeometryInput } from './boardGeometry';   // type-only → no runtime import cycle

export interface Rect { x: number; y: number; width: number; height: number; }
export interface Band { top: number; bottom: number; height: number; }
export interface SafeInsets { top: number; right: number; bottom: number; left: number; }

export interface ViewportInput {
  width: number;              // game units (== CSS px under RESIZE, scale 1)
  height: number;
  safeInsets: SafeInsets;     // measured by browserViewport, already in game units
}

export interface BattleLayoutPolicy {
  // BattleLayoutPolicy is the SINGLE source of truth for every responsive value below.
  // compositionLayout.ts holds no copy of any of these — it receives them (or already-
  // resolved Rect/Band values) as parameters.
  maxGameplayColumnWidth: number;   // 560 (initial; compare 520/560/600 in M6)
  legacyBoardWidthAt480: number;    // 380 — the ONE canonical anchor for baseline tile width;
  //                                   baseTileWidthFraction is DERIVED from it, never stored.
  maxTileWidthFraction: number;     // 0.94 — upper cap when widening on narrow viewports (M6)
  narrowWidthThreshold: number;     // 480 — at/below this safeRect width, widening is allowed (M6)
  boardHeightFraction: number;      // fraction of the table span the board bbox may fill (single source)
  tableWidthFraction: number;       // 0.88 — table/board band as a share of the column (single source)
  targetMinVisualRadius: number;    // 16 (best-effort ~14.7 only at 320px) — a policy TARGET, not a floor
  targetMinHitRadius: number;       // 20
  maxBoardScale: number;            // 1.4 — cap on upscale (desktop); baseline still binds at 1
  bands: {                          // vertical composition ranges (percent of safeRect height) — single source
    topHud: [number, number];       // [0, 8]
    monster: [number, number];      // [8, 34]
    hero: [number, number];         // [34, 46]
    board: [number, number];        // [46, 93]
    safeBottom: [number, number];   // [93, 100]
  };
}

export interface LayoutBands {
  topHud: Band; monster: Band; hero: Band; board: Band; safeBottom: Band;
}
export interface BossHudLayout { text: { x: number; y: number }; bar: Rect; }
export interface EnvironmentAnchors {
  viewport: Rect;         // full viewport (background/env may span this)
  horizonY: number;       // hero-band top, where the background zones meet
  archCenter: { x: number; y: number };
}

export interface BattleLayout {
  input: ViewportInput;
  safeRect: Rect;
  gameplayColumn: Rect;
  background: Rect;       // full viewport
  bands: LayoutBands;     // proportional to safeRect.height, offset by safeRect.y
  board: BoardGeometry;
  table: Rect;
  boss: Rect;             // monster placeholder footprint
  heroes: Rect[];
  bossHud: BossHudLayout;
  environment: EnvironmentAnchors;
}

export const DEFAULT_BATTLE_LAYOUT_POLICY: BattleLayoutPolicy;

// Structural constant describing the legacy baseline — NOT tunable policy.
export const LEGACY_VIEWPORT_WIDTH = 480;

// baseTileWidthFraction is DERIVED, so it can never drift from legacyBoardWidthAt480:
//   baseTileWidthFraction(policy) === policy.legacyBoardWidthAt480 / LEGACY_VIEWPORT_WIDTH  // 380/480
export function baseTileWidthFraction(policy: BattleLayoutPolicy): number;

// The ONLY place a column width becomes a tile-width fraction. M6 tunes just this resolver;
// M1 returns baseTileWidthFraction(policy) unconditionally.
export function resolveTileWidthFraction(columnWidth: number, policy: BattleLayoutPolicy): number;

// battleLayout owns the policy and resolves it into the plain, already-computed values that
// boardGeometry consumes — so boardGeometry imports NO runtime symbol from battleLayout.
export function resolveBoardGeometryInput(
  column: Rect,
  tableSpan: { top: number; bottom: number },
  policy: BattleLayoutPolicy,
): BoardGeometryInput;

export function computeBattleLayout(input: ViewportInput, policy: BattleLayoutPolicy): BattleLayout;

// pure inset helpers (used by BattleScene's thin adapter; battleLayout stays DOM-free)
export function sanitizeInsets(raw: SafeInsets): SafeInsets;
export function cssInsetsToGame(
  css: SafeInsets,
  gameSize: { width: number; height: number },
  canvasRect: { width: number; height: number },
): SafeInsets;
// Minimum safeRect span kept per axis when the viewport allows it.
export const MIN_SAFE_DIMENSION = 1;   // game units
// Guarantees a non-negative safeRect: if left+right would leave < MIN_SAFE_DIMENSION on an axis,
// both insets on that axis are scaled down proportionally (deterministic). If width (or height)
// is 0 / negative / non-finite, that axis's insets clamp to 0, so safeRect becomes the degenerate
// viewport itself — never negative, never NaN.
export function clampInsetsToViewport(insets: SafeInsets, width: number, height: number): SafeInsets;
```

```ts
// boardGeometry.ts
// Depends on battleLayout for TYPES ONLY (Rect); imports no runtime symbol from it, so the
// single runtime edge stays battleLayout.ts → boardGeometry.ts. No 480/380 magic lives here.
import type { CellCoord } from '../core/grid';
import type { Rect } from './battleLayout';

export interface BoardGeometry {
  originX: number;
  originY: number;
  colWidth: number;
  rowHeight: number;
  visualRadius: number;   // drawing only — ALWAYS STONE_RADIUS * scale (never floored independently)
  hitRadius: number;      // pointer acquisition only (separate; may exceed visualRadius, capped)
  tileBounds: Rect;
  // Optional diagnostics (never fed back into geometry; useful for tests + M6 tuning):
  horizontalFitScale?: number;            // targetTileWidth / BBOX_WIDTH
  verticalFitScale?: number;              // (tableSpanHeight * boardHeightFraction) / BBOX_HEIGHT
  targetVisualRadiusSatisfied?: boolean;  // visualRadius >= input.targetMinVisualRadius
}

// Fully-resolved input — battleLayout has already turned the policy into plain numbers.
export interface BoardGeometryInput {
  column: Rect;
  tableSpan: { top: number; bottom: number };
  tileWidthFraction: number;   // resolved by battleLayout.resolveTileWidthFraction (M6 tunes it there)
  boardHeightFraction: number;
  targetMinVisualRadius: number;
  targetMinHitRadius: number;
  maxBoardScale: number;
}

export function computeBoardGeometry(input: BoardGeometryInput): BoardGeometry;

export function cellToPixel(geometry: BoardGeometry, row: number, col: number): { x: number; y: number };

// nearest admissible center within hitRadius, else null; deterministic tie-break
export function cellAtPixel(
  point: { x: number; y: number },
  cells: readonly CellCoord[],
  geometry: BoardGeometry,
): CellCoord | null;
```

**Import graph (no runtime cycle).** `battleLayout.ts` owns the policy: it resolves `tileWidthFraction` (`resolveTileWidthFraction`) and builds a fully-resolved `BoardGeometryInput` (`resolveBoardGeometryInput`), then calls `computeBoardGeometry(input)` — the **only** runtime edge, `battleLayout.ts → boardGeometry.ts`. `boardGeometry.ts` therefore imports **no runtime symbol** from `battleLayout.ts`; it imports only the `Rect` type with `import type` (and `battleLayout.ts` imports `BoardGeometry`/`BoardGeometryInput` with `import type`). Type-only imports are erased at compile time, so no runtime cycle can form, and no `480`/`380` magic number appears in `boardGeometry.ts`. (If preferred, `Rect` may instead live in a tiny pure `layoutTypes.ts` both modules import — behaviour identical.) M6 changes only `resolveTileWidthFraction`.

**Board geometry algorithm (locked; reproduces the 480 baseline exactly).** Constants `BBOX_WIDTH = 380`, `BBOX_HEIGHT = 236`, and the base tile metrics (`COL_WIDTH = 56`, `ROW_HEIGHT = 48`, `STONE_RADIUS = 22`) come from today's `boardLayout.ts`.

```
// every value below reads from the already-resolved `input` — boardGeometry never sees the policy
targetTileWidth   = input.column.width * input.tileWidthFraction   // fraction pre-resolved by battleLayout
horizontalFit     = targetTileWidth / BBOX_WIDTH
tableSpanHeight   = input.tableSpan.bottom - input.tableSpan.top
verticalFit       = (tableSpanHeight * input.boardHeightFraction) / BBOX_HEIGHT
scale             = min(horizontalFit, verticalFit, input.maxBoardScale)   // never anisotropic

colWidth          = COL_WIDTH   * scale
rowHeight         = ROW_HEIGHT  * scale
visualRadius      = STONE_RADIUS * scale     // SAME isotropic factor as colWidth/rowHeight — NEVER floored independently
scaledBboxW       = 6 * colWidth + 2 * visualRadius
scaledBboxH       = 4 * rowHeight + 2 * visualRadius

originX           = round(input.column.x + (input.column.width - scaledBboxW) / 2 + visualRadius)
originY           = round(input.tableSpan.top + (tableSpanHeight - scaledBboxH) / 2 + visualRadius)

minCenterDistance = rowHeight                                // proven min for this honeycomb (vertical same-column)
maximumHitRadius  = minCenterDistance / 2 - EPSILON          // EPSILON = 1e-6
hitRadius         = min(maximumHitRadius, max(visualRadius, input.targetMinHitRadius))
tileBounds        = { x: originX - visualRadius, y: originY - visualRadius,
                      width: scaledBboxW, height: scaledBboxH }

// diagnostics (do not feed back into geometry)
horizontalFitScale          = horizontalFit
verticalFitScale            = verticalFit
targetVisualRadiusSatisfied = visualRadius >= input.targetMinVisualRadius
```

**Feasibility ordering (locked).** `visualRadius` is *only ever* `STONE_RADIUS * scale`, so it can never grow independently of `colWidth`/`rowHeight` — doing so would break isotropy and could push `scaledBboxW` past `targetTileWidth`, overflowing a `horizontalFit` that was valid. The order is: (1) policy resolves `tileWidthFraction`; (2) `horizontalFit`/`verticalFit` fix the single feasible `scale`; (3) `colWidth`, `rowHeight`, and `visualRadius` all use that one `scale`; (4) `targetVisualRadiusSatisfied` reports whether `targetMinVisualRadius` was met; (5) if not, the feasible (smaller) radius is accepted with **no** overflow and the shortfall is escalated to M6 tuning — never repaired by inflating the radius. `hitRadius` is the one separately-floored quantity, and only upward, capped at `maximumHitRadius`. **M1 already produces an overflow-free result; M6 tunes policy values, it does not finish an incomplete feasibility algorithm.**

At `480×720`, null insets, `tileWidthFraction = baseTileWidthFraction(policy) = 380/480`, `boardHeightFraction ≥ 0.607`, `targetMinHitRadius ≤ 22`, `maxBoardScale ≥ 1`: `scale = 1`, `visualRadius = hitRadius = 22`, `originX = 72`, `originY = 422`, `tileBounds = {x:50, y:400, width:380, height:236}`. This is the neutrality anchor every refactor milestone asserts.

**`cellAtPixel` tie-break (locked, order-independent):** among cells with `distance ≤ hitRadius`, pick strictly smallest distance; on a tie within `EPSILON`, pick the cell with the smaller `col`, then smaller `row`. Never depends on the iteration order of a collection.

**Coordinate spaces (locked).** `compositionLayout.ts` computes in **local** coordinates from a supplied width/height (or inside a supplied `Rect`) and knows nothing about insets or the column offset. `computeBattleLayout` is the **sole** place that lifts locals into global game coordinates — horizontally by `+ gameplayColumn.x`, vertically by `+ safeRect.y`. Every `Rect`, text anchor, hero, boss, HUD, table, board origin, and environment anchor returned in `BattleLayout` is therefore already **global**. `BattleScene` applies **no** further translation and adds no camera/Container offset. This holds whenever `gameplayColumn.x`, `safeRect.x`, or `safeRect.y` is non-zero (capped column, lateral/top insets).

---

## M0 — Harden the E2E dev-server contract

**Objective:** Eliminate the stale-Vite-server hazard (a dev server from another worktree on port 5173 being silently reused) **before** the viewport matrix multiplies E2E runs. No production or responsive change.

**Scope:** `playwright.config.ts` hardening **and** capturing the deterministic 480×720 visual baseline **from the starting commit's unmodified production code** — before any `src/` change lands, so a later regression can never be baked into the reference. The 9 current specs stay green and semantically unchanged.

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/visual-baseline.spec.ts` (+ its committed 480×720 snapshot, generated here against unmodified `src/`)
- Out of scope: all `src/**` (stays byte-for-byte unchanged this milestone), `index.html`, `vite.config.ts`, all Vitest, all `src/core/**`.

**Interfaces:**
- Consumes: nothing new.
- Produces: a reliable, worktree-isolated `webServer` contract **and** the committed 480×720 screenshot baseline that M1–M6 compare against and never regenerate.

**Chosen strategy (decided; alternatives in the audit §2/§8):** two guarantees together, since neither suffices alone. `reuseExistingServer: false` stops Playwright from *adopting* a foreign server, but does not stop Vite from *starting* on a different port; `--strictPort` (with an explicit `--host`/`--port`) makes Vite fail immediately when 5173 is occupied instead of silently sliding to 5174. `webServer.url` and `use.baseURL` share the exact same host+port. This avoids masking real failures behind longer global timeouts. (`reuseExistingServer: false` on its own is **not** full worktree isolation — `--strictPort` is what closes the silent-port-switch gap.)

- [ ] **Step 1: Pin Playwright to its own server, on a strict port.** Edit `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    // Two independent guarantees:
    //  1. --strictPort makes Vite FAIL (not silently jump to 5174) if 5173 is taken.
    //  2. reuseExistingServer:false makes Playwright always own its server and never
    //     adopt a stray dev server from another worktree holding 5173 (audit §2).
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    reuseExistingServer: false,
    url: 'http://127.0.0.1:5173/?seed=1',
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
});
```

- [ ] **Step 2: Run the existing E2E suite to confirm the contract still passes.**

Run: `npm run test:e2e`
Expected: **9 passed** (chromium). If 5173 is occupied by another worktree's `vite`, `--strictPort` makes this fail fast on server start — Vite never falls back to 5174, and Playwright never adopts the foreign server.

- [ ] **Step 3: Capture the 480×720 visual baseline from the unmodified starting code.** Create `tests/e2e/visual-baseline.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Locks the 480×720 composition pixel-for-pixel for the whole refactor. Captured in M0
// against the STARTING commit's production code so no later regression can define the
// reference. M1–M6 only compare; only M7 adds (never regenerates) responsive sizes.
test('battle composition at 480x720 matches the committed baseline', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');
  await expect(page).toHaveScreenshot('battle-480x720.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0,   // renderer + Phaser are pinned during this work → zero-tolerance target
  });
});
```

Generate the reference on the **CI reference platform** (the pinned CI runner / Playwright Docker image is the single source of truth, because WebGL anti-aliasing varies by GPU/OS):

```bash
npx playwright test tests/e2e/visual-baseline.spec.ts --update-snapshots
```

`--update-snapshots` is authorized **only** here (initial capture) or, later, after an explicitly validated deliberate visual change — never to silence a diff. **Snapshot contract:** name `battle-480x720.png`; location `tests/e2e/visual-baseline.spec.ts-snapshots/`; reference platform = the CI runner (a local run on another GPU may regenerate *locally* but MUST NOT overwrite the committed CI baseline); tolerance `maxDiffPixelRatio: 0` (if the CI GPU proves noisy, raise to a bounded ≤ 0.002 and still fail on any structural/positional shift); acceptable diff = none; forbidden = any layout/position/size change. Confirm `git status` shows **no `src/` change** — only `playwright.config.ts`, the new spec, and the snapshot.

- [ ] **Step 4: Verify tsc + build unaffected (config + test only, no `src/` change).**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0. (`npm test` is a Vitest-only change-free run here; still run it to close the milestone gate.)

- [ ] **Step 5: Full gate.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: tsc 0, build green, **76 passed** Vitest, **10 passed** Playwright (9 existing + the 480×720 baseline).

- [ ] **Step 6: Commit.**

```bash
git add playwright.config.ts tests/e2e/visual-baseline.spec.ts tests/e2e/visual-baseline.spec.ts-snapshots
git commit -m "test(e2e): own port 5173 (strictPort) + capture 480x720 visual baseline from start"
```

**Acceptance criteria:** free port → Playwright starts and owns its server; occupied port → explicit immediate failure on startup (Vite never switches to 5174, no foreign server adopted); the 480×720 baseline is captured from unmodified `src/` and committed; **10** specs pass; no source/timeout inflation.

**Specific risks:** `reuseExistingServer: false` slightly slows local iteration (fresh server each run) — acceptable and intended; it is the safety property. `--strictPort` is what makes an occupied port a hard failure rather than a silent 5174 fallback.

**Review stop-point:** Confirm the four commands are green and the diff is limited to `playwright.config.ts`, `tests/e2e/visual-baseline.spec.ts`, and its snapshot under `tests/e2e/visual-baseline.spec.ts-snapshots/` — with **no change under `src/`**.

---

## M1 — Pure `battleLayout.ts` + `boardGeometry.ts` contracts (fixed 480×720, behavior-neutral)

**Objective:** Introduce the full pure layout + geometry contract, producing values **identical** to today at 480×720. No scene, Scale, `main.ts`, or `index.html` change; the canvas stays `Scale.NONE` fixed 480×720.

**Scope:** New pure modules and their unit tests; the existing scene keeps importing the old `boardLayout.ts` (untouched behavior) until M2.

**Files:**
- Create: `src/scenes/battleLayout.ts`
- Create: `src/scenes/boardGeometry.ts`
- Create: `tests/scenes/battleLayout.test.ts`
- Create: `tests/scenes/boardGeometry.test.ts`
- Runs (does not create) the M0 `tests/e2e/visual-baseline.spec.ts` — comparison only, **never** `--update-snapshots`
- Modify (additively): `src/scenes/compositionLayout.ts` — **add** parameterized band ranges / `tableWidthFraction` / `boardHeightFraction` arguments (as **optional** params defaulting to today's constants) so `battleLayout.ts` can pass policy-derived values while **BattleScene's existing calls compile and behave identically**. The current constants stay in place as those defaults (a temporary second copy) and are **removed in M2** once BattleScene stops calling. `compositionLayout.ts` imports **nothing** from `battleLayout.ts` (no runtime cycle).
- Modify: `tests/scenes/compositionLayout.test.ts` (unchanged calls still pass via defaults; add coverage for the explicit-param path)
- Out of scope: `BattleScene.ts` (must keep compiling on the legacy calls until M2), `main.ts`, `index.html`, `boardLayout.ts` (retired in M2), all `src/core/**`.

**Interfaces:**
- Consumes: `computeLayoutRegions`, `computePlaceholderLayout`, `computeTableSpan`, `computeTableBounds`, `computeBossHudLayout` from `compositionLayout.ts` — battleLayout calls the **new explicit-param** signatures in local coords; BattleScene keeps calling the **legacy (default-param) shape** until M2.
- Legacy signatures retained temporarily: the zero-extra-arg forms of the five composition functions (unchanged behaviour), consumed only by BattleScene, **deleted in M2**.
- New signatures produced: the same five functions accepting explicit band ranges / `tableWidthFraction` / `boardHeightFraction`; plus the **locked TypeScript contract** above (`ViewportInput`, `BattleLayoutPolicy`, `BattleLayout`, `computeBattleLayout`, `DEFAULT_BATTLE_LAYOUT_POLICY`, `resolveTileWidthFraction`, `resolveBoardGeometryInput`, inset helpers; `BoardGeometry`, `BoardGeometryInput`, `computeBoardGeometry`, `cellToPixel`, `cellAtPixel`).

- [ ] **Step 1: Write the failing baseline test for `computeBoardGeometry`.** In `tests/scenes/boardGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBoardGeometry } from '../../src/scenes/boardGeometry';
import { DEFAULT_BATTLE_LAYOUT_POLICY, resolveBoardGeometryInput } from '../../src/scenes/battleLayout';

// At the 480 baseline the geometry must reproduce today's boardLayout.ts exactly.
const column = { x: 0, y: 0, width: 480, height: 720 };
const tableSpan = { top: 323.2, bottom: 712 };
// battleLayout resolves the policy into a plain BoardGeometryInput; boardGeometry sees no policy.
const baseInput = resolveBoardGeometryInput(column, tableSpan, DEFAULT_BATTLE_LAYOUT_POLICY);

describe('computeBoardGeometry — 480 baseline neutrality', () => {
  const g = computeBoardGeometry(baseInput);
  it('reproduces the legacy origin, radius, and tile bounds', () => {
    expect(g.originX).toBe(72);
    expect(g.originY).toBe(422);
    expect(g.visualRadius).toBe(22);
    expect(g.hitRadius).toBe(22);
    expect(g.colWidth).toBe(56);
    expect(g.rowHeight).toBe(48);
    expect(g.tileBounds).toEqual({ x: 50, y: 400, width: 380, height: 236 });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails (module not implemented).**

Run: `npx vitest run tests/scenes/boardGeometry.test.ts`
Expected: FAIL — cannot resolve `../../src/scenes/boardGeometry`.

- [ ] **Step 3: Implement `battleLayout.ts` policy + interfaces.** Create `src/scenes/battleLayout.ts` exporting the locked interfaces and:

```ts
export const DEFAULT_BATTLE_LAYOUT_POLICY: BattleLayoutPolicy = {
  maxGameplayColumnWidth: 560,
  legacyBoardWidthAt480: 380,         // baseTileWidthFraction is derived: 380/480 (see baseTileWidthFraction())
  maxTileWidthFraction: 0.94,
  narrowWidthThreshold: 480,
  boardHeightFraction: 0.85,          // > 0.607 so horizontal binds at 480 → scale 1
  tableWidthFraction: 0.88,
  targetMinVisualRadius: 16,
  targetMinHitRadius: 20,
  maxBoardScale: 1.4,
  bands: {
    topHud: [0, 8], monster: [8, 34], hero: [34, 46], board: [46, 93], safeBottom: [93, 100],
  },
};
```

- [ ] **Step 4: Implement `boardGeometry.ts` per the locked algorithm.** Create `src/scenes/boardGeometry.ts` operating **only** on `BoardGeometryInput` (no policy import). `visualRadius` is exactly `STONE_RADIUS * scale` — never floored. Implement `computeBoardGeometry(input)`, `cellToPixel` (honeycomb: odd columns shift down `rowHeight/2` — mirror `boardLayout.ts:42-48`), and `cellAtPixel` with the locked tie-break and `EPSILON = 1e-6`. Import only the `Rect`/`CellCoord` types (`import type`). In `battleLayout.ts`, implement `resolveTileWidthFraction` (returns `baseTileWidthFraction(policy)` in M1; M6 tunes it) and `resolveBoardGeometryInput` (builds the `BoardGeometryInput` from the policy).

- [ ] **Step 5: Run the baseline geometry test — expect PASS.**

Run: `npx vitest run tests/scenes/boardGeometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `cellAtPixel` behavior tests (the audit-mandated cases).** Append to `tests/scenes/boardGeometry.test.ts`:

```ts
import { cellToPixel, cellAtPixel } from '../../src/scenes/boardGeometry';
import type { BoardGeometry } from '../../src/scenes/boardGeometry';
import { HexGrid, fillBoard } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';

describe('cellAtPixel — nearest admissible cell', () => {
  const g = computeBoardGeometry(baseInput);          // resolved once above
  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const cells = grid.getAllCells();                 // the real 32-cell honeycomb
  const ordered = [...cells].sort((p, q) => p.col - q.col || p.row - q.row);
  const firstCell = ordered[0];                     // { row: 0, col: 0 }
  const lastCell = ordered[ordered.length - 1];     // { row: 4, col: 6 } (even cols hold 5 rows → 32 cells)

  it('returns the exact cell when the point is its center (single admissible)', () => {
    expect(cellAtPixel(cellToPixel(g, 1, 0), cells, g)).toEqual({ row: 1, col: 0 });
  });

  it('returns null for a point outside every hitRadius', () => {
    expect(cellAtPixel({ x: -500, y: -500 }, cells, g)).toBeNull();
  });

  it('picks the nearer of two nearby centers', () => {
    const a = cellToPixel(g, 0, 0);
    const near = { x: a.x, y: a.y + 3 };            // nudged toward (1,0), still nearest (0,0)
    expect(cellAtPixel(near, cells, g)).toEqual({ row: 0, col: 0 });
  });

  it('breaks an exact tie by smaller col then smaller row, independent of input order', () => {
    // Synthetic geometry whose hitRadius is large enough that the MIDPOINT of two
    // centers is admissible for BOTH. (Production hitRadius is deliberately capped
    // below half the center distance, so a real tie point is never admissible for
    // two cells — that property is asserted separately below. A midpoint is, by
    // definition, equidistant from both endpoints, so this is a genuine tie.)
    const tie: BoardGeometry = {
      originX: 0, originY: 0, colWidth: 100, rowHeight: 100,
      visualRadius: 10, hitRadius: 80,
      tileBounds: { x: -10, y: -10, width: 220, height: 120 },
    };
    const a = { row: 0, col: 0 };
    const b = { row: 0, col: 1 };
    const pa = cellToPixel(tie, a.row, a.col);
    const pb = cellToPixel(tie, b.row, b.col);
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    expect(cellAtPixel(mid, [a, b], tie)).toEqual({ row: 0, col: 0 });   // smaller col wins the tie
    expect(cellAtPixel(mid, [b, a], tie)).toEqual({ row: 0, col: 0 });   // identical, regardless of order
  });

  it('resolves the first and last board cells at their centers', () => {
    expect(cellAtPixel(cellToPixel(g, firstCell.row, firstCell.col), cells, g)).toEqual(firstCell);
    expect(cellAtPixel(cellToPixel(g, lastCell.row, lastCell.col), cells, g)).toEqual(lastCell);
  });

  it('production geometry caps hitRadius strictly below half the minimum center distance', () => {
    expect(g.hitRadius).toBeLessThan(g.rowHeight / 2);
  });
});
```

Run: `npx vitest run tests/scenes/boardGeometry.test.ts` → all PASS.

- [ ] **Step 7: Implement `computeBattleLayout` + inset helpers.** In `battleLayout.ts`, implement `safeRect` (locked formula, audit §6.2), `gameplayColumn` centered **in the safeRect** (`width = min(safeRect.width, maxGameplayColumnWidth)`, `x = safeRect.x + (safeRect.width − width) / 2`), the vertical `bands` (proportional to `safeRect.height`, offset by `+ safeRect.y`), and `table`/`boss`/`heroes`/`bossHud`/`environment` by calling the `compositionLayout` functions in **local** coordinates over the column's width, then lifting every returned coordinate into global space (`+ gameplayColumn.x` horizontally, `+ safeRect.y` vertically) — this is the *only* place offsets are applied. `board` comes from `computeBoardGeometry(resolveBoardGeometryInput(gameplayColumn, tableSpan, policy))` (already global). Implement `sanitizeInsets` (non-finite/negative → 0), `cssInsetsToGame` (`cssInsetX * gameSize.width / canvasRect.width`, height analogously; identity when `gameSize == canvasRect`; guards `canvasRect` 0/non-finite), and `clampInsetsToViewport` (never allow `left+right ≥ width` or `top+bottom ≥ height`; scale the offending pair down so `safeRect` stays ≥ `MIN_SAFE_DIMENSION` (1 game unit) per axis, deterministically; when `width`/`height` is `0`/negative/non-finite, that axis's insets clamp to `0` so `safeRect` is the degenerate viewport — never negative, never `NaN`).

- [ ] **Step 8: Write `battleLayout.test.ts` — baseline neutrality + invariants.** Create `tests/scenes/battleLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY,
  sanitizeInsets, cssInsetsToGame, clampInsetsToViewport,
} from '../../src/scenes/battleLayout';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeBattleLayout — 480×720 baseline neutrality', () => {
  const L = computeBattleLayout({ width: 480, height: 720, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
  it('safeRect equals the full viewport with no insets', () => {
    expect(L.safeRect).toEqual({ x: 0, y: 0, width: 480, height: 720 });
  });
  it('gameplay column is the full width (≤ cap) and centered', () => {
    expect(L.gameplayColumn.width).toBe(480);
    expect(L.gameplayColumn.x).toBe(0);
  });
  it('reproduces the legacy board tile bounds', () => {
    expect(L.board.tileBounds).toEqual({ x: 50, y: 400, width: 380, height: 236 });
  });
  it('keeps distinct widths separate', () => {
    expect(L.gameplayColumn.width).toBe(480);      // column
    expect(L.table.width).toBeCloseTo(422.4, 5);    // 88%
    expect(L.board.tileBounds.width).toBe(380);     // ~79.2%
  });
});

describe('computeBattleLayout — invariants across sizes', () => {
  it('caps and centers the column on a wide viewport', () => {
    const L = computeBattleLayout({ width: 1000, height: 700, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.gameplayColumn.width).toBe(560);
    expect(L.gameplayColumn.x).toBe(220); // (1000-560)/2
    expect(L.background).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
  });
  it('derives safeRect from insets', () => {
    const L = computeBattleLayout(
      { width: 390, height: 844, safeInsets: { top: 47, right: 0, bottom: 34, left: 0 } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect).toEqual({ x: 0, y: 47, width: 390, height: 844 - 47 - 34 });
  });
  it('never scales the board anisotropically (single scale factor)', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.colWidth / 56).toBeCloseTo(L.board.rowHeight / 48, 9);
  });
  it('keeps the board fully inside the gameplay column', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width)
      .toBeLessThanOrEqual(L.gameplayColumn.x + L.gameplayColumn.width + 0.5);
  });
});

describe('inset helpers', () => {
  it('sanitizes non-finite/negative insets to 0', () => {
    expect(sanitizeInsets({ top: NaN, right: -5, bottom: Infinity, left: 10 }))
      .toEqual({ top: 0, right: 0, bottom: 0, left: 10 });
  });
  it('cssInsetsToGame is a no-op when gameSize equals canvasRect', () => {
    const css = { top: 47, right: 0, bottom: 34, left: 0 };
    expect(cssInsetsToGame(css, { width: 390, height: 844 }, { width: 390, height: 844 })).toEqual(css);
  });
  it('never produces a negative safeRect from oversized insets', () => {
    const clamped = clampInsetsToViewport({ top: 500, right: 0, bottom: 500, left: 0 }, 390, 844);
    expect(clamped.top + clamped.bottom).toBeLessThan(844);
    const L = computeBattleLayout({ width: 390, height: 844, safeInsets: clamped }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.safeRect.height).toBeGreaterThan(0);
  });
  it('cssInsetsToGame scales CSS px when canvasRect differs from gameSize', () => {
    // 780px canvas presenting a 390-unit game → factor 0.5 (pure function; RESIZE normally makes this a no-op)
    const game = cssInsetsToGame(
      { top: 20, right: 0, bottom: 40, left: 10 },
      { width: 390, height: 844 }, { width: 780, height: 1688 },
    );
    expect(game.top).toBeCloseTo(10, 6);
    expect(game.bottom).toBeCloseTo(20, 6);
    expect(game.left).toBeCloseTo(5, 6);
  });
  it('clampInsetsToViewport stays non-negative and finite even when width/height is 0', () => {
    const c = clampInsetsToViewport({ top: 10, right: 10, bottom: 10, left: 10 }, 0, 0);
    expect(c).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });   // degenerate viewport → insets 0
    const L = computeBattleLayout({ width: 0, height: 0, safeInsets: c }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(Number.isFinite(L.safeRect.width)).toBe(true);
    expect(L.safeRect.width).toBeGreaterThanOrEqual(0);
    expect(L.safeRect.height).toBeGreaterThanOrEqual(0);
  });
});

describe('computeBattleLayout — global coordinate spaces (offsets applied)', () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  it('centers board/table/boss about a horizontally-offset column center', () => {
    const L = computeBattleLayout({ width: 900, height: 800, safeInsets: none }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.gameplayColumn.x).toBeGreaterThan(0);                 // wide → capped, offset column
    const c = L.gameplayColumn.x + L.gameplayColumn.width / 2;
    expect(L.board.tileBounds.x + L.board.tileBounds.width / 2).toBeCloseTo(c, 3);
    expect(L.table.x + L.table.width / 2).toBeCloseTo(c, 3);
    expect(L.boss.x + L.boss.width / 2).toBeCloseTo(c, 3);
  });
  it('offsets bands and board by safeRect.y under a top inset', () => {
    const top = 60;
    const L = computeBattleLayout(
      { width: 390, height: 844, safeInsets: { top, right: 0, bottom: 0, left: 0 } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect.y).toBe(top);
    expect(L.bands.topHud.top).toBeGreaterThanOrEqual(top);         // bands start below the inset
    expect(L.board.tileBounds.y).toBeGreaterThanOrEqual(top);        // board pushed down by the inset
  });
  it('keeps heroes and board inside a left-inset, offset column', () => {
    const left = 40;
    const L = computeBattleLayout(
      { width: 500, height: 800, safeInsets: { top: 0, right: 0, bottom: 0, left } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect.x).toBe(left);
    expect(L.gameplayColumn.x).toBeGreaterThanOrEqual(left);
    for (const h of L.heroes) expect(h.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
  });
});
```

Run: `npx vitest run tests/scenes/battleLayout.test.ts` → all PASS.

- [ ] **Step 9: Confirm the M0 480×720 visual baseline still matches (compare only).** The `tests/e2e/visual-baseline.spec.ts` from M0 runs inside `npm run test:e2e`. It must stay green with **no** `--update-snapshots`: M1 adds pure modules only and does not change BattleScene, so the composition is byte-identical. Any pixel diff means M1 regressed the 480 baseline and blocks the milestone (investigate; do **not** regenerate the snapshot).

- [ ] **Step 10: Full gate.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: tsc 0; build green; Vitest **> 76** (old 76 + the two new files) all passing; Playwright **10 passed** (unchanged from M0 — the scene still uses the old path and the baseline still matches).

- [ ] **Step 11: Commit.**

```bash
git add src/scenes/battleLayout.ts src/scenes/boardGeometry.ts src/scenes/compositionLayout.ts tests/scenes/battleLayout.test.ts tests/scenes/boardGeometry.test.ts tests/scenes/compositionLayout.test.ts
git commit -m "feat(layout): pure battleLayout + boardGeometry contracts (480 baseline neutral)"
```

**Acceptance criteria:** New pure modules produce pixel-identical 480 values (and the M0 480×720 baseline still matches, never regenerated); `cellAtPixel` passes all mandated cases incl. the synthetic exact-tie; `computeBattleLayout` caps/centers the column, derives `safeRect` from insets, and lifts all locals into global coords under offset columns/insets; `visualRadius === STONE_RADIUS * scale` always; existing suites green.

**Specific risks:** Baseline drift (a wrong policy default). Detection: the neutrality pins in Steps 1/8 and the M0 480×720 screenshot fail loudly. `boardHeightFraction` must keep the vertical fit ≥ 1 at 480 so horizontal binds at scale 1.

**Review stop-point:** Confirm the neutrality pins match today's `boardLayout.test.ts` values and no consumer changed yet.

---

## M2 — `BattleScene` consumes `activeLayout` at fixed 480×720

**Objective:** Replace the module-level coordinate constants with a scene-held `activeLayout`; route rendering **and** input through `BoardGeometry`/`cellAtPixel`; expose `getBattleLayout()`/`getLayoutRevision()` under `?debug=1`; migrate E2E to the runtime layout + Node cross-check. **Still fixed 480×720, `Scale.NONE`** — no visible responsive behavior; the screenshot stays identical to baseline.

**Scope:** `BattleScene.ts` rewiring; retire `boardLayout.ts`'s obsolete exports; rewrite the two scene Vitest files and adapt E2E to the debug layout. Viewport stays fixed.

**Files:**
- Modify: `src/scenes/BattleScene.ts`
- Modify: `src/scenes/compositionLayout.ts` (make the M1 optional params **required**; delete their temporary default constants so the policy is the sole source)
- Modify → retire: `src/scenes/boardLayout.ts` (remove `ORIGIN_X`/`ORIGIN_Y`/`STONE_RADIUS`/zero-arg `cellToPixel`; delete the file if nothing else imports it)
- Rewrite: `tests/scenes/boardLayout.test.ts` → fold into `tests/scenes/boardGeometry.test.ts` (delete the obsolete file), `tests/scenes/compositionLayout.test.ts` (retarget to `battleLayout` where it asserted canvas-level values; keep `computeLayoutRegions` low-level tests)
- Modify: `tests/e2e/battle.spec.ts` (drive from runtime layout + Node cross-check)
- Out of scope: `main.ts`, `index.html`, Scale mode, `src/core/**`, `canvas-bounds.spec.ts` (M4).

**Interfaces:**
- Consumes: `computeBattleLayout`, `DEFAULT_BATTLE_LAYOUT_POLICY`, `BattleLayout` (M1); `cellToPixel`, `cellAtPixel`, `BoardGeometry` (M1).
- Produces: `window.__debug.getBattleLayout(): BattleLayout` (serializable), `window.__debug.getLayoutRevision(): number`; scene-internal `activeLayout: BattleLayout`, `layoutRevision: number`, and a private `buildViewportInput()` returning `{ width: 480, height: 720, safeInsets: {0,0,0,0} }` for now.

- [ ] **Step 1: Add `activeLayout`, `layoutRevision`, and a fixed `buildViewportInput()`.** In `BattleScene.ts`, in `create()` compute `this.activeLayout = computeBattleLayout(this.buildViewportInput(), DEFAULT_BATTLE_LAYOUT_POLICY)` and set `this.layoutRevision = 0` **before** the first draw. `buildViewportInput()` returns the fixed 480×720 / null-insets input in this milestone (M4 makes it read `this.scale.gameSize` + `browserViewport`).

- [ ] **Step 2: Point every draw method at `activeLayout`.** Replace the six `computeLayoutRegions(CANVAS_WIDTH, CANVAS_HEIGHT)` calls and all `cellToPixel`/`STONE_RADIUS`/`tileBounds()` uses with reads from `this.activeLayout` (`.bands`, `.board`, `.table`, `.boss`, `.heroes`, `.bossHud`, `.environment`, `.background`). `drawBoard`/`drawTraceLine` call `cellToPixel(this.activeLayout.board, row, col)` and draw with `this.activeLayout.board.visualRadius`. `checkVictory` uses `this.activeLayout` (`table`/`board.tileBounds`/`safeRect`) for the banner position and `this.activeLayout.background.width/2` for centering. **All `activeLayout` coordinates are already global**: containers stay at `(0,0)` scale 1, and `BattleScene` adds no translation, camera, or Container offset of its own.

- [ ] **Step 3: Replace `cellAt` with a `cellAtPixel` adapter.** Rewrite `BattleScene.cellAt(x, y)` to `return cellAtPixel({ x, y }, getAllCells(), this.activeLayout.board)`. Remove the old first-match loop and the `STONE_RADIUS` import.

- [ ] **Step 4: Retire the legacy coordinate exports + the temporary `compositionLayout` defaults.** Remove the `export { ORIGIN_X, ORIGIN_Y, COL_WIDTH, ROW_HEIGHT, STONE_RADIUS, cellToPixel } …` re-export line (`BattleScene.ts:27`) and delete `src/scenes/boardLayout.ts` once no import remains. Now that BattleScene reads `activeLayout` (Step 2) and no longer calls `compositionLayout` directly, make the M1 optional params **required** and delete their default constants, so `BattleLayoutPolicy` is the sole source of band ranges / `tableWidthFraction` / `boardHeightFraction`. Run `npx tsc --noEmit`, then a grep guard proving no legacy usage survives — **targeting the old module, not the legitimate internal `STONE_RADIUS` constant that stays inside `boardGeometry.ts`**:

```bash
# 1. no import of / reference to the retired boardLayout module
grep -rEn "['\"][^'\"]*scenes/boardLayout['\"]" src tests && echo "FAIL: boardLayout import remains" || echo "OK"
# 2. no leftover public exports of the old module's coordinate API (ORIGIN_X/ORIGIN_Y are exclusive to it;
#    match STONE_RADIUS only as an export/import, never its internal definition in boardGeometry.ts)
grep -rEn "\bORIGIN_X\b|\bORIGIN_Y\b|(export|import)[^;]*\bSTONE_RADIUS\b" src tests && echo "FAIL: legacy coordinate export remains" || echo "OK"
# 3. the file itself is gone
test ! -e src/scenes/boardLayout.ts && echo "OK: boardLayout.ts deleted" || echo "FAIL: boardLayout.ts still exists"
```

Any `FAIL` fails the milestone. (`STONE_RADIUS` defined and used internally by `boardGeometry.ts` is expected and must **not** trip the guard.)

- [ ] **Step 5: Expose the debug layout surface.** Extend the `DebugApi` interface and the `?debug=1` block:

```ts
export interface DebugApi {
  lastTurn: ResolutionResult | null;
  spawnTile(row: number, col: number, tile: SpecialTileType): void;
  spawnPortal(row: number, col: number): void;
  getBoard(): { row: number; col: number; content: CellContent }[];
  setMonsterHp(hp: number): void;
  getBattleLayout(): BattleLayout;   // serializable copy of the active layout
  getLayoutRevision(): number;       // increments once per applied reflow
}
```

Implement `getBattleLayout: () => JSON.parse(JSON.stringify(this.activeLayout))` and `getLayoutRevision: () => this.layoutRevision`.

- [ ] **Step 6: Rewrite the scene Vitest suites to the new contract.** Delete `tests/scenes/boardLayout.test.ts` (its pins now live in `boardGeometry.test.ts`). In `tests/scenes/compositionLayout.test.ts`, keep the low-level `computeLayoutRegions`/`computeTableBounds`/`computePlaceholderLayout`/`computeBossHudLayout` tests (they still describe the composition math `battleLayout` composes), and remove any assertion that presumed canvas-level origins now owned by `battleLayout`.

Run: `npm test` → all PASS (count adjusts; no 480 value changes).

- [ ] **Step 7: Migrate `battle.spec.ts` to the runtime layout + Node cross-check.** Replace `import { cellToPixel } from '../../src/scenes/boardLayout'` with the runtime helper: after `?debug=1` load and waiting for `[data-scene="battle"]`, read `const layout = await page.evaluate(() => window.__debug!.getBattleLayout())`, and compute click points with `cellToPixel(layout.board, row, col)` imported from `boardGeometry.ts`. Add a consistency guard that recomputes `computeBattleLayout({width:480,height:720,safeInsets:{0,0,0,0}}, DEFAULT_BATTLE_LAYOUT_POLICY)` in Node and asserts `board.tileBounds`/`originX`/`originY` equal the runtime layout's. All existing gameplay assertions (valid chain, min-length, backtrack, different-color prefix, trailing portal, debug `lastTurn`, spawn, victory) stay.

Run: `npm run test:e2e` → all specs PASS (still at 480×720).

- [ ] **Step 8: Confirm the M0 480×720 visual baseline still matches (automated, compare only).** The coordinate-contract rewrite is the highest-risk change, so the M0 `visual-baseline.spec.ts` is the gate: it runs inside `npm run test:e2e` and must stay green with **no** `--update-snapshots`. Any pixel diff means the rewrite shifted the 480 composition — fix the code, never regenerate the snapshot.

- [ ] **Step 9: Full gate.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: all green; Vitest count reflects the deleted `boardLayout.test.ts`; Playwright **10 passed** (incl. the M0 baseline).

- [ ] **Step 10: Commit.**

```bash
git add src/scenes/BattleScene.ts src/scenes/compositionLayout.ts tests/scenes/ tests/e2e/battle.spec.ts
git rm src/scenes/boardLayout.ts tests/scenes/boardLayout.test.ts
git commit -m "refactor(scene): consume activeLayout + BoardGeometry; retire module-level board constants"
```

**Acceptance criteria:** No behavior change at 480×720 (E2E + the committed 480×720 visual baseline from M0 stays green); input flows through `cellAtPixel`; `getBattleLayout()`/`getLayoutRevision()` present under `?debug=1`; `ORIGIN_X`/`STONE_RADIUS`/zero-arg `cellToPixel` gone from the codebase.

**Specific risks (R2, audit §9):** the coordinate-contract churn is the largest ripple. Detection: `tsc` + E2E. Mitigation: this is its own milestone with a review stop; `getLayoutRevision()` starts at 0 (no reflow yet).

**Review stop-point:** Confirm E2E still green with runtime-layout-driven clicks and the Node cross-check passing, and that no responsive behavior is yet observable.

---

## M3 — Make every layer redraw-safe (idempotent) and the reflow path safe (no transport change yet)

**Objective:** Convert the draw-once layers to idempotent redraws and add the coalesced-next-frame reflow **mechanism** and mid-drag cancellation — while the transport stays fixed 480×720. This isolates the redraw/leak risk from the Scale change.

**Scope:** `BattleScene.ts` redraw hygiene + reflow scheduler + listener cleanup + a `?debug=1` reflow trigger; a Vitest-independent E2E that drives a synthetic reflow via the debug API.

**Files:**
- Modify: `src/scenes/BattleScene.ts`
- Modify: `tests/e2e/battle.spec.ts` (add a debug-triggered reflow idempotency check) **or** add `tests/e2e/reflow.spec.ts` (created here, expanded in M4).
- Out of scope: `main.ts`, `index.html`, Scale mode, `src/core/**`.

**Interfaces:**
- Consumes: M2's `activeLayout`, `layoutRevision`, draw methods.
- Produces: `private applyLayout(layout: BattleLayout): void` (idempotent full redraw of every layer), `private scheduleReflow(): void`, `private reflow(): void`, a `?debug=1`-only **one-shot** `window.__debug.forceReflow(input?: Partial<ViewportInput>): void`, and `?debug=1`-only `window.__debug.getLayerObjectCounts(): Record<string, number>` (per-layer child counts — the real idempotency probe), `getSelectionLength(): number`, and `getTracePointCount(): number` (to prove a mid-drag reflow cleared the selection + trace).

- [ ] **Step 1: Make each persistent layer idempotent.** Prefix `drawBackground`/`drawEnvironment`/`drawTable`/`drawCharacterPlaceholders` with a clear of their own container (`this.backgroundContainer.removeAll(true)` etc.), mirroring `drawBoard`'s existing `this.boardLayer.removeAll(true)`. `drawHp` already clears its `Graphics`; ensure `hpText`/`hpBar` are repositioned (not re-added). `checkVictory` must not stack banners — clear/relayout `transientUiContainer` when re-run.

- [ ] **Step 2: Add `applyLayout`.** 

```ts
private applyLayout(layout: BattleLayout): void {
  this.activeLayout = layout;
  this.drawBackground();
  this.drawEnvironment();
  this.drawTable();
  this.drawBoard();
  this.drawHp();
  this.drawCharacterPlaceholders();
  this.drawTraceLine();          // keeps an in-progress trace consistent if not cancelled
  if (isDefeated(this.monster)) this.checkVictory();
}
```

Refactor `create()` to build containers once, then call `applyLayout(this.activeLayout)`.

- [ ] **Step 3: Add the coalesced next-frame reflow scheduler.** 

```ts
private reflowScheduled = false;
private pendingDebugInput?: ViewportInput;       // one-shot ?debug=1 override (see Step 4)

private scheduleReflow(): void { this.reflowScheduled = true; }  // collapses a burst to one

update(): void {                                                 // Phaser calls this each frame
  if (!this.reflowScheduled) return;
  this.reflowScheduled = false;
  this.reflow();
}

private reflow(): void {
  if (this.dragging) {          // mid-drag resize cancels selection WITHOUT resolving a turn
    this.dragging = false;
    this.path = [];
    this.traceGraphics.clear();
    this.tracePointCount = 0;   // keep the scene-owned diagnostic in sync with the cleared trace
  }
  const input = this.pendingDebugInput ?? this.buildViewportInput();  // real measure, or one-shot override
  this.pendingDebugInput = undefined;            // consumed → cleared; never pollutes a later real resize
  const layout = computeBattleLayout(input, DEFAULT_BATTLE_LAYOUT_POLICY);
  this.applyLayout(layout);                      // recompute + apply to every layer
  this.layoutRevision += 1;                      // completion signal (observable under ?debug=1)
}
```

This matches the audit §6.5 sequence exactly: *resize received → scheduled at most once for next frame → re-read insets (M4) → recompute + apply → activeLayout updated → layoutRevision incremented*. It is **not** synchronous inside a resize handler, has **no tween**, and consumes **no RNG** / mutates **no board state**.

- [ ] **Step 4: Add the `?debug=1` one-shot reflow trigger + the idempotency probe.** In the debug block:

```ts
forceReflow: (partial) => {
  // One-shot, last-writer-wins: overwrites any un-consumed override, is consumed by
  // the VERY NEXT reflow, and is cleared there (see reflow()). With no argument it
  // snapshots the real measured input, so it still exercises the real measure path.
  this.pendingDebugInput = { ...this.buildViewportInput(), ...(partial ?? {}) };
  this.scheduleReflow();
},
getLayerObjectCounts: () => ({
  background: this.backgroundContainer.length,
  environment: this.environmentContainer.length,
  table: this.tableContainer.length,
  board: this.boardLayer.length,
  hud: this.hudContainer.length,
  heroes: this.heroContainer.length,
  boss: this.bossContainer.length,
  transientUi: this.transientUiContainer.length,
  debug: this.debugContainer?.length ?? 0,
}),
getSelectionLength: () => this.path.length,          // selected-cell count (0 after a cancel)
getTracePointCount: () => this.tracePointCount,      // scene-owned counter (NOT a Phaser.Graphics internal)
```

`tracePointCount` is a scene field, not a Phaser internal (`Graphics.commandBuffer` is undocumented and may be absent from the 4.2.1 typings):

```ts
private tracePointCount = 0;
// in drawTraceLine(): after (re)drawing the trace, set the counter to the geometry actually drawn
//   this.tracePointCount = this.path.length;   // e.g. one point per selected cell
// on any clear of the trace (mid-drag cancel, turn end):
//   this.traceGraphics.clear(); this.tracePointCount = 0;
```

Because several `forceReflow` calls in one frame each overwrite `pendingDebugInput` and set the single `reflowScheduled` flag, the frame applies exactly **one** reflow using the **last** override — deterministic coalescing. `buildViewportInput()` never reads `pendingDebugInput` (no feedback loop). `getLayerObjectCounts()` returns the per-layer child count for every persistent container; `getSelectionLength()`/`getTracePointCount()` expose the in-progress selection and drawn trace via **scene-owned** fields so a test can prove a mid-drag reflow really cleared them.

- [ ] **Step 5: Clean up listeners on shutdown.** In `create()`, register `this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { /* remove scale + input listeners */ })` (and `DESTROY`). Even though the Scale listener is wired in M4, add the teardown hook now so M4 only registers into it.

- [ ] **Step 6: E2E — coalesced idempotency + mid-drag cancel (via `forceReflow`).** Create `tests/e2e/reflow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { HexGrid, fillBoard } from '../../src/core/grid';
import type { CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';

// Same rule as battle.spec.ts's findValidChain: an adjacent same-color path of the
// minimum SCORING length (>= 3). A 2-stone pair would not score even without a reflow,
// so it could never detect a missing cancel — the chain here WOULD damage the monster.
// (Extract to a shared tests/e2e helper when convenient; kept inline for clarity.)
function findValidChain(grid: HexGrid): CellCoord[] {
  for (const cell of grid.getAllCells()) {
    const content = grid.get(cell.row, cell.col);
    if (content.type !== 'stone') continue;
    const color = content.color;
    const chain: CellCoord[] = [cell];
    const visited = new Set([`${cell.row},${cell.col}`]);
    let current = cell;
    while (chain.length < 3) {
      const next = grid.getNeighbors(current.row, current.col).find((n) => {
        if (visited.has(`${n.row},${n.col}`)) return false;
        const c = grid.get(n.row, n.col);
        return c.type === 'stone' && c.color === color;
      });
      if (!next) break;
      chain.push(next); visited.add(`${next.row},${next.col}`); current = next;
    }
    if (chain.length >= 3) return chain;
  }
  throw new Error('no valid 3-chain found for this seed');
}

test('coalesced reflows bump layoutRevision once and never duplicate layers or mutate state', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const before = await page.evaluate(() => ({
    rev: window.__debug!.getLayoutRevision(),
    hp: document.body.getAttribute('data-monster-hp'),
    board: window.__debug!.getBoard(),
    counts: window.__debug!.getLayerObjectCounts(),
  }));

  // three calls in ONE frame must collapse to a single applied reflow
  await page.evaluate(() => {
    window.__debug!.forceReflow();
    window.__debug!.forceReflow();
    window.__debug!.forceReflow();
  });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, before.rev);

  const after = await page.evaluate(() => ({
    rev: window.__debug!.getLayoutRevision(),
    hp: document.body.getAttribute('data-monster-hp'),
    board: window.__debug!.getBoard(),
    counts: window.__debug!.getLayerObjectCounts(),
  }));
  expect(after.rev).toBe(before.rev + 1);        // coalesced: exactly one applied reflow
  expect(after.counts).toEqual(before.counts);    // per-layer object counts identical (true idempotency)
  expect(after.hp).toBe(before.hp);               // no RNG, no combat, no mutation
  expect(after.board).toEqual(before.board);
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);

  // a second, separate burst keeps counts stable across repeated reflows
  await page.evaluate(() => { window.__debug!.forceReflow(); window.__debug!.forceReflow(); });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, after.rev);
  expect(await page.evaluate(() => window.__debug!.getLayerObjectCounts())).toEqual(before.counts);
});

test('a reflow during a drag of a WOULD-SCORE chain cancels it without resolving a turn', async ({ page }) => {
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const chain = findValidChain(grid);                       // >= 3 → would damage the monster
  const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
  const pts = chain.map((c) => cellToPixel(layout.board, c.row, c.col));

  const startHp = await page.getAttribute('body', 'data-monster-hp');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());

  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);  // drag the WHOLE valid chain
  await page.evaluate(() => window.__debug!.forceReflow());        // resize mid-drag
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  await page.mouse.up();                                           // release AFTER the reflow

  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBe(Number(startHp)); // no score
  expect(await page.evaluate(() => window.__debug!.lastTurn)).toBeNull();                    // nothing resolved
  expect(await page.evaluate(() => window.__debug!.getSelectionLength())).toBe(0);           // selection cleared
  expect(await page.evaluate(() => window.__debug!.getTracePointCount())).toBe(0);           // trace cleared
});

test('reflows do not advance the RNG (a scoring turn is identical with or without reflows)', async ({ browser, baseURL }) => {
  // Behavioural proof (no internal generator state exposed): run the SAME seeded scoring
  // turn on a control page (no reflow) and a test page (several reflows first). If a reflow
  // consumed the RNG, the refill after the clear — or the turn result — would differ.
  // Each page comes from an explicitly-configured context (own baseURL) and is torn down in finally.
  async function playSeededTurn(reflowsBefore: number) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.goto('/?seed=1&debug=1');       // resolves against the context baseURL
      await page.waitForSelector('[data-scene="battle"]');
      for (let i = 0; i < reflowsBefore; i++) {
        const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
        await page.evaluate(() => window.__debug!.forceReflow());
        await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
      }
      const grid = new HexGrid(); fillBoard(grid, mulberry32(1));
      const chain = findValidChain(grid);
      const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
      const pts = chain.map((c) => cellToPixel(layout.board, c.row, c.col));
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
      await page.mouse.up();
      return await page.evaluate(() => ({
        lastTurn: window.__debug!.lastTurn,       // damage/combo of the resolved turn
        board: window.__debug!.getBoard(),         // AFTER gravity + RNG refill
      }));
    } finally {
      await context.close();                       // always torn down, even on failure
    }
  }
  const control = await playSeededTurn(0);
  const withReflows = await playSeededTurn(5);
  expect(withReflows.lastTurn).toEqual(control.lastTurn);   // identical turn → RNG not advanced
  expect(withReflows.board).toEqual(control.board);          // identical refill → RNG not advanced
});
```

Run: `npx playwright test tests/e2e/reflow.spec.ts` → all three PASS.

- [ ] **Step 7: Full gate.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: all green; `reflow.spec.ts` adds the coalesced-idempotency, would-score mid-drag-cancel, and RNG-non-advance tests (the M0 visual baseline and all prior specs stay green).

- [ ] **Step 8: Commit.**

```bash
git add src/scenes/BattleScene.ts tests/e2e/reflow.spec.ts
git commit -m "feat(scene): idempotent layer redraws + coalesced next-frame reflow (fixed viewport)"
```

**Acceptance criteria:** several `forceReflow` in one frame coalesce to exactly one applied reflow (`layoutRevision` +1) with **identical per-layer object counts** before/after and HP/board/seed untouched; the one-shot debug override is consumed and cleared (never pollutes a later real resize); a mid-drag reflow of a **would-score** chain cancels it without scoring (`lastTurn` null, `getSelectionLength()`/`getTracePointCount()` both 0); reflows **provably do not advance the RNG** (a control page and a multi-reflow page produce the identical resolved turn and post-refill board); listeners are torn down on shutdown.

**Specific risks (R3, R7):** z-order/leak regressions and a reflow accidentally resolving a turn. Detection: the per-layer object-count equality (not just the canvas count) and the mid-drag path. Mitigation: per-layer `removeAll(true)`; `reflow()` guards `this.dragging` before recompute.

**Review stop-point:** Confirm idempotency via **stable per-layer object counts** (not just a single canvas), coalescing (three calls → +1 revision), the one-shot override clears, and reflow is `update()`-driven (not synchronous).

---

## M4 — Flip the transport to `Scale.RESIZE` + safe-area insets

**Objective:** Turn on real responsiveness: `Scale.RESIZE`, the mobile viewport meta/CSS, `browserViewport.ts` measuring + converting insets, the Scale `resize`→`scheduleReflow` wiring, and the canvas-bounds contract change. Keep the composition **identical at 480×720**.

**Scope:** `main.ts`, `index.html`, `browserViewport.ts`, `BattleScene.ts` (`buildViewportInput` reads real size + insets; wire `resize`), `canvas-bounds.spec.ts` rewrite, `reflow.spec.ts` real-resize case.

**Files:**
- Modify: `src/main.ts`, `index.html`, `src/scenes/BattleScene.ts`
- Create: `src/scenes/browserViewport.ts`
- Rewrite: `tests/e2e/canvas-bounds.spec.ts`
- Modify: `tests/e2e/reflow.spec.ts` (add real `setViewportSize` cases)
- Out of scope: band/radius tuning (M6), the deliberate small-phone width increase (M6), `src/core/**`.

**Interfaces:**
- Consumes: `computeBattleLayout`, inset helpers (M1); `scheduleReflow`, `applyLayout`, `layoutRevision` (M3).
- Produces: `browserViewport.ts` exports `readSafeInsetsCss(): SafeInsets` (DOM, CSS px, honoring a `--test-safe-inset-*` override seam), `getCanvasRect(game): { width: number; height: number }`, and `subscribeViewportChanges(cb): () => void`; `BattleScene.buildViewportInput()` now returns real `{ width, height, safeInsets }`.

- [ ] **Step 1: Enable the RESIZE transport.** Edit `src/main.ts`:

```ts
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [BattleScene],
};
```

(Remove the fixed `width: 480, height: 720`; RESIZE sizes from the parent. No `autoCenter`, no `roundPixels`, no `zoom`.)

- [ ] **Step 2: Add the mobile viewport meta + CSS.** Edit `index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```
```css
html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
#app { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; }
canvas { display: block; }
```

- [ ] **Step 3: Create `browserViewport.ts` (the only DOM reader).**

```ts
import type { SafeInsets } from './battleLayout';

// Reads env(safe-area-inset-*) via a probe element. Values are CSS px.
// The var(--test-safe-inset-*, env(...)) form lets E2E inject synthetic insets by
// setting those CSS variables; in production the variables are unset, so env() wins.
export function readSafeInsetsCss(): SafeInsets {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:var(--test-safe-inset-top, env(safe-area-inset-top));' +
    'padding-right:var(--test-safe-inset-right, env(safe-area-inset-right));' +
    'padding-bottom:var(--test-safe-inset-bottom, env(safe-area-inset-bottom));' +
    'padding-left:var(--test-safe-inset-left, env(safe-area-inset-left));';
  document.body.appendChild(el);
  const s = getComputedStyle(el);
  const insets: SafeInsets = {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
  el.remove();
  return insets;
}

export function getCanvasRect(game: Phaser.Game): { width: number; height: number } {
  const c = game.canvas;
  const r = c.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

// Viewport-change signals that Phaser's Scale 'resize' can miss (URL-bar show/hide,
// rotation). Each just requests a reflow — it NEVER passes width/height; the reflow
// reads this.scale.gameSize as the source of truth. Returns an unsubscribe fn.
export function subscribeViewportChanges(onChange: () => void): () => void {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  window.addEventListener('resize', onChange); // fallback where visualViewport is absent
  return () => {
    vv?.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    window.removeEventListener('resize', onChange);
  };
}
```

- [ ] **Step 4: Make `buildViewportInput()` real (measure + convert + sanitize + clamp).** In `BattleScene.ts`:

```ts
private buildViewportInput(): ViewportInput {
  const gameSize = this.scale.gameSize;                       // source of truth (audit §6.1)
  const canvasRect = getCanvasRect(this.game);
  const cssInsets = sanitizeInsets(readSafeInsetsCss());      // DOM → sane CSS px
  const gameInsets = cssInsetsToGame(cssInsets, gameSize, canvasRect);  // → game units (no-op under RESIZE)
  const safeInsets = clampInsetsToViewport(gameInsets, gameSize.width, gameSize.height);
  return { width: gameSize.width, height: gameSize.height, safeInsets };
}
```

(Keep the M3 `pendingDebugInput` override for synthetic-inset tests.)

- [ ] **Step 5: Wire the Scale `resize` event + the browser viewport signals.** In `create()`, register both into the SHUTDOWN teardown from M3. All of them only `scheduleReflow()`; the M3 coalescer collapses a simultaneous Phaser + browser burst to one reflow per frame:

```ts
const onResize = () => this.scheduleReflow();
this.scale.on('resize', onResize);
const unsubscribe = subscribeViewportChanges(() => this.scheduleReflow());
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  this.scale.off('resize', onResize);
  unsubscribe();
});
```

- [ ] **Step 6: Rewrite `canvas-bounds.spec.ts` to the RESIZE invariant.**

```ts
import { test, expect } from '@playwright/test';

// Under Scale.RESIZE the canvas fills the viewport at the origin at any size,
// so game-space coordinates equal CSS px (pointer accuracy depends on it).
for (const vp of [{ width: 480, height: 720 }, { width: 360, height: 640 }, { width: 768, height: 1024 }]) {
  test(`canvas fills the viewport at the origin (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1');
    await page.waitForSelector('[data-scene="battle"]');
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(vp.width);
    expect(box.height).toBe(vp.height);
  });
}
```

- [ ] **Step 7: Add a real mid-session resize case to `reflow.spec.ts`.** After a first turn at 480×720, `await page.setViewportSize({width:360,height:640})`, wait for `getLayoutRevision()` to exceed its pre-resize value, then drive a fresh valid chain from the **runtime** `getBattleLayout().board` and assert HP drops — proving pointer accuracy survives a real reflow. Also assert `getBattleLayout()` at 480×720 still yields `tileBounds` `{x:50,y:400,width:380,height:236}` (baseline neutrality under the new transport).

- [ ] **Step 8: Full gate + matrix smoke.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: all green; `canvas-bounds` now asserts the RESIZE invariant at three sizes; `reflow` covers a real resize.

- [ ] **Step 9: Commit.**

```bash
git add src/main.ts index.html src/scenes/browserViewport.ts src/scenes/BattleScene.ts tests/e2e/canvas-bounds.spec.ts tests/e2e/reflow.spec.ts
git commit -m "feat(responsive): Scale.RESIZE transport + safe-area insets + reflow wiring"
```

**Acceptance criteria:** Canvas fills the viewport at every tested size; a real `setViewportSize` reflows on the next frame (revision bumps) and clicks driven from the runtime layout stay accurate; 480×720 composition unchanged; the pure layout still never reads the DOM; `visualViewport`/`orientationchange`/`resize` listeners are added and removed on shutdown.

**Specific risks (R1, R5, R8):** pointer desync after a real reflow; wrong insets; dynamic-toolbar `vh` mismatch. Detection: the real-resize accuracy test; the `dvh` fallback; `this.scale.gameSize` as source of truth. Mitigation per Global Constraints.

**Review stop-point:** Confirm the transport is live, 480×720 is still neutral, and a real resize keeps clicks accurate.

---

## M5 — Safe areas, coordinate conversion, and the technical matrix

**Objective:** Lock the coordinate + safe-area behavior with the audit's synthetic-inset and DPR tests and the game→client conversion guard — still using the **conservative** M1 policy (no deliberate composition change yet).

**Scope:** Vitest synthetic-inset coverage; Playwright synthetic-inset (via `forceReflow`), DPR-independence, game→client conversion, first/last cell, resize-between-turns, and resize-during-drag.

**Files:**
- Modify: `tests/scenes/battleLayout.test.ts` (synthetic insets, invariants)
- Modify: `tests/e2e/reflow.spec.ts` (DPR, synthetic insets, conversion guard, resize-during-drag)
- Out of scope: policy tuning (M6), `src/core/**`, production code (this milestone is tests + guards; any code change is a bug fix surfaced by a test).

**Interfaces:**
- Consumes: everything from M1–M4.
- Produces: the permanent technical-matrix safety net the tuning milestone (M6) relies on.

- [ ] **Step 1: Vitest — synthetic safe-area insets (the three audit cases).** Add to `battleLayout.test.ts` assertions for `{0,0,0,0}`, `{top:47,bottom:34}`, and `{left:14,right:22,bottom:20}`: `safeRect` correct; `gameplayColumn` centered **in the safeRect**; board fully inside the column; distinct widths correct; bands contiguous and ordered; monster band taller than hero band.

- [ ] **Step 2: Vitest — DPR independence is structural.** Assert `computeBattleLayout` has no DPR parameter and that identical `ViewportInput`s yield deep-equal `BattleLayout`s (there is no DPR input to vary — this documents the invariant that layout is DPR-free).

Run: `npm test` → PASS.

- [ ] **Step 3: Playwright — synthetic insets, two distinct paths (labelled honestly).** In `reflow.spec.ts`, add both:
  - **(a) runtime-layout only — bypasses the DOM.** `window.__debug!.forceReflow({ safeInsets: { top: 47, right: 0, bottom: 34, left: 0 } })`, wait on `getLayoutRevision()`, then assert the runtime `getBattleLayout().safeRect` equals `{x:0,y:47,width:W,height:H-81}` and a chain driven from the reflowed `board` still damages the monster. This exercises `computeBattleLayout` + scene wiring **only** — it is *not* end-to-end.
  - **(b) full DOM chain.** Inject synthetic insets via the probe's CSS override and force a reflow with **no** argument, so `buildViewportInput()` performs the real DOM read:

```ts
test('synthetic safe-area CSS flows through the real DOM adapter into the layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--test-safe-inset-top', '47px');
    document.documentElement.style.setProperty('--test-safe-inset-bottom', '34px');
    window.__debug!.forceReflow();   // no arg → readSafeInsetsCss → cssInsetsToGame → clamp → buildViewportInput
  });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  const L = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(L.safeRect).toEqual({ x: 0, y: 47, width: 390, height: 844 - 47 - 34 });
});
```

  The path actually tested is: CSS synthetic inset → `readSafeInsetsCss` → `cssInsetsToGame` → `clampInsetsToViewport` → `buildViewportInput` → `computeBattleLayout` → `activeLayout`. (The Vitest in M1 already covers `cssInsetsToGame` as a pure function when `canvasRect ≠ gameSize`.)

- [ ] **Step 4: Playwright — high-DPR context.** Add a test using a `deviceScaleFactor: 3` browser context (via a dedicated `test.use({ deviceScaleFactor: 3, viewport: {width:390,height:844} })` block): assert the canvas CSS rect equals the DPR=1 case at the same CSS viewport, `getBattleLayout()` is deep-equal to the DPR=1 layout at that viewport, and a runtime-driven click still hits the intended cell.

- [ ] **Step 5: Playwright — game→client conversion guard.** Add the helper and use it for at least one click:

```ts
function gameToClient(g: {x:number;y:number}, canvasRect: DOMRect, gameW: number, gameH: number) {
  return {
    x: canvasRect.left + g.x * canvasRect.width / gameW,
    y: canvasRect.top + g.y * canvasRect.height / gameH,
  };
}
```

Assert that, under RESIZE, `gameToClient(center) ≈ center` (numeric no-op) — the guard fires if the canvas is ever offset/CSS-scaled.

- [ ] **Step 6: Playwright — first & last cell, resize-between-turns, resize-during-drag.** Add: resolve the board's **true** extremes — derive them from `getAllCells()` sorted by `col` then `row` (first `{row:0,col:0}`, last `{row:4,col:6}`; never hard-code `{row:3,col:6}`) — correctly at two viewports; a full turn, then `setViewportSize`, then another full turn (both score); and a resize issued **during the drag of a would-score chain** (`findValidChain` → `mouse.down` + move across the whole chain, then `setViewportSize`, wait on `getLayoutRevision()`, then `mouse.up`) asserting **no** HP change, `lastTurn` null, and `getSelectionLength()`/`getTracePointCount()` both 0 (cancelled, per M3 §6.5). A 2-cell drag would prove nothing since it never scores even without a resize.

- [ ] **Step 7: Full gate.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: all green.

- [ ] **Step 8: Commit.**

```bash
git add tests/scenes/battleLayout.test.ts tests/e2e/reflow.spec.ts
git commit -m "test(responsive): safe-area, DPR-independence, conversion, and resize-safety matrix"
```

**Acceptance criteria:** Synthetic insets produce correct `safeRect`/column; synthetic insets flow through the **real** browserViewport DOM chain (not only the injected-`safeInsets` shortcut); layout is provably DPR-independent; the game→client guard holds; first/last cells resolve; resize-between-turns works; resize-during-drag never scores.

**Specific risks (R1/R4/R5):** residual pointer/inset/DPR issues. Detection: this matrix. The non-automatable parts (visual sharpness, GPU perf, true notch) are deferred to M7's device checklist.

**Review stop-point:** Confirm the technical matrix is green and the composition is still the conservative baseline (no deliberate tuning yet).

---

## M6 — Responsive tuning: small phones, tall screens, tablets (deliberate composition changes)

**Objective:** Make the **intentional** composition decisions — horizontal width policy, vertical compression order, column cap, small-phone puzzle-width increase, feasible radii — and document each. This is the **only** milestone that changes the composition away from the 480 baseline on non-480 viewports.

**Scope:** `battleLayout.ts` policy behavior (widening on narrow viewports via `resolveTileWidthFraction`, band clamps, degradation order, radius **targets** + the hit-radius floor); `DEFAULT_BATTLE_LAYOUT_POLICY` value decisions; corresponding Vitest updates. **480×720 stays neutral throughout.** (`boardGeometry.ts` stays policy-free; M6 does not change its signature.)

**Files:**
- Modify: `src/scenes/battleLayout.ts` (`resolveTileWidthFraction`, band clamps, `DEFAULT_BATTLE_LAYOUT_POLICY` values) — **`boardGeometry.ts` stays unchanged and policy-free**
- Modify: `tests/scenes/battleLayout.test.ts`, `tests/scenes/boardGeometry.test.ts`
- Create: `docs/superpowers/plans/2026-07-12-responsive-layout-decisions.md` — the durable decisions record, **committed in this milestone**. **Do not edit the audit spec to record decisions.**
- Out of scope: `src/scenes/boardGeometry.ts` (unchanged), `src/core/**`, final assets, animation.

**Interfaces:**
- Consumes: M1 contracts.
- Produces: the tuned `DEFAULT_BATTLE_LAYOUT_POLICY` and the horizontal/vertical resolution logic in `resolveTileWidthFraction`/`computeBattleLayout` (`boardGeometry.ts` untouched).

- [ ] **Step 1: Implement the horizontal width policy (`tileWidthFraction` widening).** Change **only** `resolveTileWidthFraction` in `battleLayout.ts` (never `boardGeometry.ts`, which stays policy-free): at/above `narrowWidthThreshold` return `baseTileWidthFraction(policy)`; below it, interpolate up toward `maxTileWidthFraction` as width shrinks — **never** letting `tileBounds` exceed the `safeRect`. Apply the audit's horizontal order: raise fraction → reduce horizontal margins → use nearly the full safeRect width → rely on `hitRadius > visualRadius` → escalate to a product decision if `targetMinVisualRadius` is still unreachable (feasible result wins; never a blind floor that overflows).

- [ ] **Step 2: Vitest — 480 stays neutral; 320 widens without overflow.** Add tests: 480×720 still yields `tileBounds.width === 380` (fraction unchanged at baseline); `320×568` yields a **larger** fraction than baseline, `tileBounds` fully inside `safeRect`, and `visualRadius ≥ ~14.7` (best-effort floor). Assert `visualRadius` never forces `tileBounds` outside `safeRect` at 320.

- [ ] **Step 3: Implement the vertical degradation order.** In `computeBattleLayout`, when `safeRect.height` is scarce, reclaim space in the audit order (shrink topHud → crop/scale environment budget → reduce decorative gaps → reduce hero band → **only then** reduce the board), via min/max band clamps. Add Vitest asserting that on a short viewport the board band is reduced last (topHud/hero shrink first).

- [ ] **Step 4: Wire the radius *targets* (not floors on `visualRadius`).** `visualRadius` stays exactly `STONE_RADIUS * scale`; the lever that raises it on narrow viewports is a larger `scale` from Step 1's `tileWidthFraction` widening / the vertical budget — **never** a clamp on the radius. Expose `targetVisualRadiusSatisfied` and, when false, escalate to a decision (Step 7 doc) rather than inflating the radius. `targetMinHitRadius` remains the one true floor, applied only to `hitRadius` and capped at `maximumHitRadius`. Add Vitest: at 320px `visualRadius === STONE_RADIUS * scale` (equals the isotropic value, is **not** clamped up), `tileBounds` still fits `safeRect`, and `targetVisualRadiusSatisfied` reflects reality.

- [ ] **Step 5: Decide the column cap.** Compare `maxGameplayColumnWidth ∈ {520, 560, 600}` by loading `npm run dev` at `1000×700` and `768×1024` and inspecting composition; set the chosen value in `DEFAULT_BATTLE_LAYOUT_POLICY` and update the wide-viewport Vitest expectation. Record the choice in `2026-07-12-responsive-layout-decisions.md` (Step 7).

- [ ] **Step 6: Verify tablet + tall-screen composition.** Manually verify `768×1024` and `430×932`/`412×915` reveal more environment on the sides **without** stretching the table, and that heroes stay grounded on the table rear edge. Encode any newly-fixed invariant as a Vitest assertion (e.g., table width ≤ column width; environment spans full viewport).

- [ ] **Step 7: Write the durable decisions record.** Create `docs/superpowers/plans/2026-07-12-responsive-layout-decisions.md` capturing the values chosen above: officially supported minimum width; chosen `minVisualRadius`; chosen `minHitRadius`; maximum `tileWidthFraction`; column cap; mobile-landscape policy; tablet/desktop policy; HiDPI/DPR decision; and any decision left open after the automated matrix. This document — **not** the audit spec — is the decision of record.

- [ ] **Step 8: Full gate.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: all green; 480×720 E2E/values + visual baseline unchanged; new tuning invariants asserted.

- [ ] **Step 9: Commit.**

```bash
git add src/scenes/battleLayout.ts tests/scenes/ docs/superpowers/plans/2026-07-12-responsive-layout-decisions.md
git commit -m "feat(responsive): tuned width policy, degradation order, radii, column cap + decisions doc"
```

**Acceptance criteria:** 480×720 remains pixel-neutral; narrow viewports widen the puzzle within the safeRect (never overflow); `visualRadius` is never clamped independently of `scale`; vertical compression reduces the board last; the column cap is chosen and encoded; the small-phone width increase and every open value are recorded in the committed `2026-07-12-responsive-layout-decisions.md`.

**Specific risks (R6):** tiles below a usable touch target. Detection: the 320×568 Vitest. Mitigation: radius targets that yield to feasibility (never inflating `visualRadius`) + the widening order; `hitRadius` floored up to `maximumHitRadius`.

**Review stop-point:** Confirm the deliberate composition changes are intentional, documented, and that the refactor-era neutrality still holds at 480.

---

## M7 — Full viewport matrix, deterministic screenshots, device checklist

**Objective:** Validate the whole architecture across the mandatory matrix with targeted geometry/resize/interaction tests + deterministic screenshots, and record the device-only gates. Close the responsive plan.

**Scope:** Parameterized E2E across the matrix (geometry + one interaction + no-clip + no-duplication per viewport), deterministic `?seed=1` screenshots, and a real-device checklist doc. Full gameplay coverage stays on **one** primary viewport (not replayed per size).

**Files:**
- Modify: `tests/e2e/reflow.spec.ts` (matrix parameterization) or add `tests/e2e/matrix.spec.ts`
- Modify: `tests/e2e/canvas-bounds.spec.ts` (extend to the full matrix)
- Create: `docs/superpowers/plans/2026-07-12-responsive-device-checklist.md` (device-only gates)
- Out of scope: `src/core/**`, final assets, animation, polish.

**Interfaces:**
- Consumes: everything.
- Produces: the permanent matrix + screenshot suite and the device sign-off checklist.

- [ ] **Step 1: Parameterize the matrix.** Over `320×568, 360×640, 375×667, 390×844, 412×915, 430×932, 480×720, 768×1024, 1000×700`, for each: assert canvas fills viewport at origin; runtime `getBattleLayout()` deep-equals the Node `computeBattleLayout(sameInput, DEFAULT_BATTLE_LAYOUT_POLICY)` (browser↔Node consistency); `tileBounds` fully inside `safeRect` (no clipping); exactly one canvas (no duplication); and one runtime-driven valid-chain **drag** damages the monster (real interaction accuracy).

- [ ] **Step 2: Add the inset + DPR matrix rows.** Include null insets, a top/bottom-inset case, a lateral-inset case (via `forceReflow`), and one `deviceScaleFactor: 3` context — reusing the M5 assertions across a representative subset.

- [ ] **Step 3: Deterministic screenshots.** Extends the M1 480×720 baseline (already committed and green since M1) to the responsive sizes — M7 is **not** the first automated neutrality check. With `?seed=1`, capture a stable screenshot per key viewport (add 360×640, 768×1024) after waiting on `[data-scene="battle"]` and a settled `getLayoutRevision()`; commit baselines (same `-snapshots/` contract as M1: CI-runner reference platform, bounded tolerance). Assert seed/board invariance (same `getBoard()` across a resize).

- [ ] **Step 4: 320×568 decision record.** Assert the M6-fixed `minVisualRadius`/`minHitRadius`/max-safe-width/compression values hold at 320×568; record whether 320 is "supported" or "best-effort" in `2026-07-12-responsive-layout-decisions.md` (and cross-link it from the device checklist).

- [ ] **Step 5: Keep full gameplay coverage on one viewport.** Confirm `battle.spec.ts` (valid chain, min-length, backtrack, different-color prefix, trailing portal, debug, spawn, victory) runs at the single primary viewport; do **not** replay all eight per matrix size.

- [ ] **Step 6: Write the device checklist.** Create `docs/superpowers/plans/2026-07-12-responsive-device-checklist.md` listing the R4/R5/R8 device-only gates: high-DPR visual sharpness; correct notch insets **after rotation**; pointer accuracy; stable frame rate across resize/rotation; no clipping — on ≥1 notched high-DPR phone **and** ≥1 tablet.

- [ ] **Step 7: Full gate + matrix.**

Run: `npx tsc --noEmit && npm run build && npm test && npm run test:e2e`
Expected: all green across the matrix; screenshots stable.

- [ ] **Step 8: Commit.**

```bash
git add tests/e2e/ docs/superpowers/plans/2026-07-12-responsive-device-checklist.md docs/superpowers/plans/2026-07-12-responsive-layout-decisions.md
git commit -m "test(responsive): full viewport matrix, deterministic screenshots, device checklist"
```

**Acceptance criteria:** Every mandatory viewport passes geometry + no-clip + no-duplication + one interaction; browser↔Node layouts agree; screenshots are deterministic; seed/board invariant across resize; device checklist recorded. The responsive layout + coordinate architecture is stable and validated.

**Specific risks:** matrix flakiness from the dev server — mitigated by M0. Device-only gates remain manual and are explicitly out of the automated suite.

**Review stop-point:** Confirm the full matrix is green and the device checklist is in place; declare the responsive plan complete pending device sign-off.

---

## Self-review against the audit

- **Spec coverage:** §6.1 transport/CSS → M4; §6.2 safeRect/column/bands/board + width-vs-height → M1 (structure) + M6 (tuning); §6.3 `visualRadius`≠`hitRadius` + `cellAtPixel` → M1; §6.4 module split → module map + M1/M4; §6.5 reflow lifecycle + `layoutRevision` + `getBattleLayout`/`getLayoutRevision` → M2/M3; §6.6 interfaces → locked contract + M1; §7.1 pointer accuracy → M4/M5/M7; §7.2 runtime-layout + Node cross-check + game→client → M2/M5/M7; §7.3 re-read insets → M4; §7.4 redraw hygiene → M3; §7.5 min interactive size → M6; §8/§8.1 tests → M5; §8.2 matrix → M7; §9 risks → per-milestone risk lines (R1–R8); §10 auto vs device → M5/M7; §11 open decisions → M6 + the durable decisions doc (`2026-07-12-responsive-layout-decisions.md`); §12 assets → out of scope (unchanged); §13 migration → M1–M6 sequencing; the four user-mandated resolutions (resize contract, completed `BattleLayoutPolicy`, inset conversion, `hitRadius` rule, server hardening) → M3, M1 (policy), M1/M4 (insets), M1 (`hitRadius`), M0. No gaps.
- **R7 restatement:** captured as "reflow is deferred + coalesced to the next frame, applied fully, no tween, observable via `getLayoutRevision()`; a resize never resolves a turn" (Global Constraints + M3), not a synchronous handler.
- **Type consistency:** `computeBattleLayout`, `computeBoardGeometry`, `cellToPixel(geometry,…)`, `cellAtPixel(point,cells,geometry)`, `activeLayout`, `layoutRevision`, `getBattleLayout`/`getLayoutRevision`, `buildViewportInput`, `applyLayout`, `scheduleReflow`/`reflow` are named identically everywhere they appear.

## Resolved-at-execution product decisions (carry as tunable policy, decide in M6)

These stay open until M6 tuning; the plan holds them as `BattleLayoutPolicy` fields, never baked-in constants (audit §11): supported minimum width (360 vs 320); final `minVisualRadius` (~16, best-effort ~14.7 @320); final `minHitRadius` (~18–20, capped at half min center distance); max `tileBounds` share of `safeRect` (~92–94% narrow); column cap (520/560/600); mobile-landscape policy; desktop/tablet policy; HiDPI/DPR-cap strategy; real-device validation criteria. At execution they are decided in **M6** and written to the durable `docs/superpowers/plans/2026-07-12-responsive-layout-decisions.md` (never into the audit spec).
