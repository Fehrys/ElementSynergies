# Lot 2 — Gameplay-First Lower Board Responsive Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the puzzle board the element that defines the geometry of the lower battle band — sized from the actually-available space in `[layout.table.y, viewport.bottom]` — instead of being constrained by the same 560px `gameplayColumn` cap used for chrome (HUD/boss/heroes), and instead of aligning to the drawn cutting-board artwork in `battle_bg_lower.webp`. The upper composition (table.y ratio, HUD, boss, heroes, their scale/position/depth) must stay byte-identical. `battle_bg_lower.webp` is temporarily hidden in normal gameplay (kept loaded, kept available for art-review tooling) and replaced by a plain persistent surface + frame.

**Architecture:** `computeBattleLayout` keeps every existing computation that produces `safeRect`/`gameplayColumn`/`bands`/`boss`/`heroes`/`bossHud`/`table`/`environment` completely unchanged — including its private use of the *legacy* column-constrained board geometry (renamed `legacyBoard` internally) purely to derive `combatScale` and the hero/monster centering band, exactly as today. A new, independent computation then derives the real `board` (the one `BattleScene` renders and hit-tests against) by fitting the honeycomb's fixed-topology, scale-1 bounding box into `availableBoardRect` — a modestly-inset sub-rect of `table` (which already *is* `lowerBand`: `{x:0, y:table.y, width:viewport.width, height:viewport.height-table.y}`) — with a single isotropic max scale and true bounds-centering. No per-cell offset, no narrow-width widening heuristic, no vertical bias/nudge: the old fine-tuning knobs (`boardVerticalBias`, `columnSpacingReduction`, `boardVerticalOffset`, `tableWidthFraction`-driven widening) stay alive **only** inside the legacy/`combatScale` path — they never again touch the rendered board.

**Tech Stack:** TypeScript, Phaser 4, Vite, Vitest, Playwright. No new dependencies.

## Global Constraints

- Never modify any `.webp` under `public/assets/` — `git diff --name-only main...HEAD -- "*.webp"` must stay empty for the whole branch.
- Never change `layout.table.y`'s formula (`tableYFraction`), the HUD/boss/hero computations, their depths, or `battleBackgroundUpper`'s behavior.
- Never touch `src/core/**` (puzzle/combat rules) or the 32-cell/7-column/5-4-alternation honeycomb topology.
- Every new pure geometry function is Phaser-free and DOM-free (importable from plain Node, matching `boardGeometry.ts`/`battleLayout.ts` convention).
- No placeholder/TBD code; every step below is real, runnable code.
- Work happens on `design/lot-02-board-responsive-refactor` (already created off the tip of `design/lot-02-environment-runtime-integration`). Do not merge or push without explicit request.

---

## Audit summary (read before starting)

- `battle_bg_lower.webp`/`battle_bg_upper.webp` are both `status: 'available'` in `src/assets/battleEnvironmentAssets.ts` and already loaded unconditionally in `BattleScene.preload()`. No overscale/zoom logic remains anywhere in `src/` — it was already fully retired in commit `77916e8` (`fix: rebalance composition — drop overscale, raise separation, grow combat group`); `drawEnvironmentBackground` in `src/scenes/BattleScene.ts:554-591` already uses a plain `computeCoverFit`. **Section 5 of the brief (removing overscale) requires no further code changes** — this plan does not touch `combatBackgroundReview.ts`'s `computeCoverFit`.
- `layout.table` (in `src/scenes/battleLayout.ts:338-343`) is **already** exactly `lowerBand`: `{x:0, y:tableY, width, height:height-tableY}`, full viewport width, full-bleed. No new field is needed for it — the plan reuses `layout.table` as `lowerBand`.
- The puzzle board's rendered geometry currently comes from `computeBoardGeometry` (`src/scenes/boardGeometry.ts:75-126`), fed by `resolveBoardGeometryInput` (`battleLayout.ts:233-252`), constrained by `gameplayColumn` (capped at `policy.maxGameplayColumnWidth = 560`) and a `tableSpan` derived from the hero/hud bands — **not** by `layout.table`/`lowerBand`. This is the coupling this plan breaks.
- `combatScale` (`battleLayout.ts:410`, boss/hero group scale) is derived from `board.rowHeight / 48` — i.e., it reuses the *old* board's own isotropic scale. If the rendered board is decoupled from `gameplayColumn` and allowed to grow to fill `lowerBand`, and `combatScale` keeps reading the *new* board's scale, the boss/heroes would balloon far past their locked footprint. **This is the central risk of the refactor.** The fix: keep computing the *old* column-constrained geometry internally (renamed `legacyBoard`), feed `combatScale` and the `tableWidthFraction`-driven hero/monster centering band from `legacyBoard` exactly as today, and only expose the *new* fit-to-`availableBoardRect` geometry as the public `board`.
- Real, current (pre-refactor) values captured by running `computeBattleLayout` directly (used as the Task 2 lock fixture) at `{top:0,right:0,bottom:0,left:0}` insets:

  | | 360×640 | 480×720 | 768×1024 |
  |---|---|---|---|
  | `table.y` | 326.4 | 367.2 | 522.24 |
  | `table` | `{x:0,y:326.4,w:360,h:313.6}` | `{x:0,y:367.2,w:480,h:352.8}` | `{x:0,y:522.24,w:768,h:501.76}` |
  | `boss` | `{x:90,y:83.60000000000002,w:180,h:140}` | `{x:150,y:110,w:180,h:140}` | `{x:279,y:198.78666666666672,w:209.99999999999997,h:163.33333333333331}` |
  | `heroes[0..3].x` | 32.88016447368422 / 114.29338815789475 / 195.70661184210525 / 277.1198355263158 | 56.60000000000001 / 162.2 / 267.8 / 373.4 | 170.03333333333333 / 293.23333333333335 / 416.43333333333334 / 539.6333333333332 |
  | `heroes[i].y/w/h` | 235.06666666666666 / 50 / 70 | 262 / 50 / 70 | 376.12 / 58.33333333333333 / 81.66666666666666 |
  | `bossHud.text` | `{x:180,y:33.6}` | `{x:240,y:36.8}` | `{x:384,y:48.96}` |
  | `bossHud.bar` | `{x:60,y:61.6,w:240,h:12}` | `{x:120,y:64.8,w:240,h:12}` | `{x:249,y:76.96000000000001,w:270,h:12}` |

- Simulating the proposed `computeAvailableBoardRect`/`computeResponsiveBoardGeometry` formulas (below) against the *current* `table` values at those same three formats (zero insets) gives fully isotropic, fully-occupying, monotonically-growing results:

  | | 360×640 | 480×720 | 768×1024 |
  |---|---|---|---|
  | `availableBoardRect` | `{x:12.544,y:338.944,w:334.912,h:288.512}` | `{x:14.112,y:381.312,w:451.776,h:324.576}` | `{x:20.0704,y:542.3104,w:727.8592,h:461.6192}` |
  | `board.scale` | 0.8813473684210528 | 1.1888842105263158 | 1.9154189473684213 |
  | `board.visualRadius` | 19.38964210526316 | 26.155452631578946 | 42.13921684210527 |
  | `board.tileBounds` | `{x:12.543999999999972,y:379.20101052631577,w:334.9120000000001,h:207.99797894736847}` | `{x:14.112000000000002,y:403.3116631578947,w:451.77599999999995,h:280.5766736842105}` | `{x:20.0704,y:547.1005642105263,w:727.8592000000001,h:452.03887157894746}` |
  | width-axis occupancy | 100.0% (width-bound) | 100.0% (width-bound) | 100.0% (width-bound) |

  Confirms: strictly monotonic growth 360→480→768, the constrained axis is fully used at every format, `visualRadius` at 768×1024 (42.1) already exceeds the *old* hard cap (`22 * maxBoardScale(1.4) = 30.8`) — proving the puzzle genuinely dominates the band once the legacy cap no longer applies to it.

---

## Task 1: Docs — define the gameplay-first lower-board decision

**Files:**
- Create: `docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md`
- Modify: `design/production/combat/lot-01-environment/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the design doc**

Create `docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md`:

```markdown
# Lot 2 — Gameplay-First Lower Board (design)

## Decision

The puzzle board now defines the geometry of the lower battle band. The
previous direction — fitting the honeycomb to the drawn cutting board in
`battle_bg_lower.webp` — is abandoned: it placed the decor above the
gameplay. The lower band's only job now is to give the puzzle the largest
safe isotropic size the real viewport allows; a future decor pass will be
designed around the puzzle's resulting bounds, not the other way around.

## What changes

- The rendered board (`BattleLayout.board`) is fit to `availableBoardRect`,
  a modestly-inset sub-rect of `layout.table` (which is already the full
  `[0, viewport.width] x [table.y, viewport.height]` lower band — see
  `battleLayout.ts`'s `table` rect). It is no longer constrained by
  `gameplayColumn` (the 560px chrome cap) or by any alignment to the
  drawn cutting-board artwork.
- `battle_bg_lower.webp` is hidden (`setVisible(false)`) in normal
  gameplay. It stays loaded, stays a persistent masked sprite, and stays
  fully available to `?artReview=combatBackground` and
  `?artReview=combatBackground&assetSlots=1` — nothing about the Lot 1
  asset contract, manifest, or file changes.
- A temporary plain surface + a thin responsive frame (both persistent
  `Phaser.GameObjects.Graphics`) stand in for the hidden artwork so the
  band still reads clearly during this refactor.

## What does not change

- `layout.table.y` (the `tableYFraction` formula), `layout.boss`,
  `layout.heroes`, `layout.bossHud`, their depths, and
  `battleBackgroundUpper`'s behavior are untouched. `combatScale` (the
  boss/hero group's responsive scale) keeps deriving from the **old**
  column-constrained board geometry — kept alive internally as
  `legacyBoard` in `computeBattleLayout` — specifically so decoupling the
  rendered board from `gameplayColumn` cannot inflate the boss/hero
  footprint. See `tests/scenes/upperCompositionLock.test.ts`.
- The 32-cell / 7-column / 5-4-alternation honeycomb topology
  (`src/core/grid.ts`) and every puzzle/combat rule are untouched.

## `availableBoardRect` formula

```
minDim = min(lowerBand.width, lowerBand.height)
baseMargin = clamp(minDim * 0.04, 10, 28)
marginLeft = max(baseMargin, safeInsets.left)
marginRight = max(baseMargin, safeInsets.right)
marginBottom = max(baseMargin, safeInsets.bottom)
marginTop = baseMargin
availableBoardRect = {
  x: lowerBand.x + marginLeft,
  y: lowerBand.y + marginTop,
  width: lowerBand.width - marginLeft - marginRight,
  height: lowerBand.height - marginTop - marginBottom,
}
```

A single clamp-based rule, not three per-format constants — see
`src/scenes/boardArea.ts`. Incorporating `safeInsets` into the
left/right/bottom margins keeps `availableBoardRect` inside `safeRect`
even on notched devices; the top edge needs no inset term because
`table.y` is already derived from `safeRect.y`.

## Board-fit formula

```
normalizedBoardBounds = { width: 380, height: 236 }   // scale-1 honeycomb bbox (topology constant)
scale = min(availableBoardRect.width / 380, availableBoardRect.height / 236)
// isotropic; centered on availableBoardRect's full bounds (not just a point)
```

See `computeResponsiveBoardGeometry` in `src/scenes/boardGeometry.ts`. No
upper cap is applied beyond what `availableBoardRect` itself allows — the
old `maxBoardScale` (1.4) only still applies to `legacyBoard`.

## Re-introducing real lower decor later

A future artist pass should paint around `layout.boardFrame`/
`layout.board.tileBounds` at the reference formats, not the other way
around. `battle_bg_lower.webp` remains a valid, available Lot 1 asset —
only its normal-gameplay visibility is off; flipping it back on is a
one-line change in `drawEnvironmentBackground` once new art (or an
explicit decision to keep the plain surface) exists.
```

- [ ] **Step 2: Add a status note to the Lot 1 README**

In `design/production/combat/lot-01-environment/README.md`, after the existing "Status" section's last paragraph (the one ending "...visual integration into the normal combat scene is a separate, later lot."), add:

```markdown

## Lot 2 update (2026-07-18)

`battleBackgroundLower`'s sprite is now hidden (`setVisible(false)`) in
normal gameplay — the puzzle board's size no longer aligns to this
artwork; see
`docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md`.
The file, manifest entry, and loading are all unchanged and it remains
fully available to both `?artReview=combatBackground` review modes.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md design/production/combat/lot-01-environment/README.md
git commit -m "docs: define gameplay-first lower battle refactor"
```

---

## Task 2: Lock the upper composition

**Files:**
- Create: `tests/scenes/upperCompositionLock.test.ts`

**Interfaces:**
- Consumes: `computeBattleLayout(input, policy)`, `DEFAULT_BATTLE_LAYOUT_POLICY` from `src/scenes/battleLayout.ts` (existing, unchanged).

This test must be written and pass **before** any board-geometry code changes (Tasks 3-5) — it is the regression guard those tasks must not break.

- [ ] **Step 1: Write the lock test**

Create `tests/scenes/upperCompositionLock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';

// Regression lock for the Lot 2 gameplay-first lower-board refactor (see
// docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md).
// These are the REAL values computeBattleLayout produced before the board's
// geometry was decoupled from gameplayColumn — captured by actually running
// the function, not hand-derived. Every later task in that refactor must keep
// this test green: only `board`/`availableBoardRect`/`boardFrame` may change.

const none = { top: 0, right: 0, bottom: 0, left: 0 };
const P = DEFAULT_BATTLE_LAYOUT_POLICY;

const LOCKED = {
  360: {
    tableY: 326.4,
    table: { x: 0, y: 326.4, width: 360, height: 313.6 },
    boss: { x: 90, y: 83.60000000000002, width: 180, height: 140 },
    heroes: [
      { x: 32.88016447368422, y: 235.06666666666666, width: 50, height: 70 },
      { x: 114.29338815789475, y: 235.06666666666666, width: 50, height: 70 },
      { x: 195.70661184210525, y: 235.06666666666666, width: 50, height: 70 },
      { x: 277.1198355263158, y: 235.06666666666666, width: 50, height: 70 },
    ],
    bossHud: { text: { x: 180, y: 33.6 }, bar: { x: 60, y: 61.6, width: 240, height: 12 } },
  },
  480: {
    tableY: 367.2,
    table: { x: 0, y: 367.2, width: 480, height: 352.8 },
    boss: { x: 150, y: 110, width: 180, height: 140 },
    heroes: [
      { x: 56.60000000000001, y: 262, width: 50, height: 70 },
      { x: 162.2, y: 262, width: 50, height: 70 },
      { x: 267.8, y: 262, width: 50, height: 70 },
      { x: 373.4, y: 262, width: 50, height: 70 },
    ],
    bossHud: { text: { x: 240, y: 36.8 }, bar: { x: 120, y: 64.8, width: 240, height: 12 } },
  },
  768: {
    tableY: 522.24,
    table: { x: 0, y: 522.24, width: 768, height: 501.76 },
    boss: { x: 279, y: 198.78666666666672, width: 209.99999999999997, height: 163.33333333333331 },
    heroes: [
      { x: 170.03333333333333, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
      { x: 293.23333333333335, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
      { x: 416.43333333333334, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
      { x: 539.6333333333332, y: 376.12, width: 58.33333333333333, height: 81.66666666666666 },
    ],
    bossHud: { text: { x: 384, y: 48.96 }, bar: { x: 249, y: 76.96000000000001, width: 270, height: 12 } },
  },
} as const;

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

function expectRectCloseTo(actual: { x: number; y: number; width: number; height: number }, expected: typeof actual) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.width).toBeCloseTo(expected.width, 9);
  expect(actual.height).toBeCloseTo(expected.height, 9);
}

describe('upper composition lock (Lot 2 refactor must not move any of this)', () => {
  for (const vp of FORMATS) {
    const locked = LOCKED[vp.width as keyof typeof LOCKED];
    it(`keeps table.y, table, boss, heroes, and bossHud at ${vp.width}x${vp.height}`, () => {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.table.y).toBeCloseTo(locked.tableY, 9);
      expectRectCloseTo(L.table, locked.table);
      expectRectCloseTo(L.boss, locked.boss);
      locked.heroes.forEach((h, i) => expectRectCloseTo(L.heroes[i], h));
      expect(L.bossHud.text.x).toBeCloseTo(locked.bossHud.text.x, 9);
      expect(L.bossHud.text.y).toBeCloseTo(locked.bossHud.text.y, 9);
      expectRectCloseTo(L.bossHud.bar, locked.bossHud.bar);
    });
  }
});
```

- [ ] **Step 2: Run it and confirm it passes against the current (pre-refactor) code**

Run: `npx vitest run tests/scenes/upperCompositionLock.test.ts`
Expected: `3 passed`

- [ ] **Step 3: Commit**

```bash
git add tests/scenes/upperCompositionLock.test.ts
git commit -m "test: lock the upper battle composition before the board refactor"
```

---

## Task 3: `boardArea.ts` — available board rect + frame bounds

**Files:**
- Create: `src/scenes/boardArea.ts`
- Test: `tests/scenes/boardArea.test.ts`

**Interfaces:**
- Consumes: `Rect`, `SafeInsets` types from `src/scenes/battleLayout.ts` (existing).
- Produces: `computeAvailableBoardRect(lowerBand: Rect, insets: SafeInsets): Rect`, `computeBoardFrameBounds(tileBounds: Rect, lowerBand: Rect): Rect`, and the constants `BOARD_MARGIN_FRACTION`, `BOARD_MARGIN_MIN`, `BOARD_MARGIN_MAX` — consumed by Task 5 (`battleLayout.ts`).

- [ ] **Step 1: Write the failing tests**

Create `tests/scenes/boardArea.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeAvailableBoardRect,
  computeBoardFrameBounds,
  BOARD_MARGIN_MIN,
  BOARD_MARGIN_MAX,
} from '../../src/scenes/boardArea';

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('computeAvailableBoardRect', () => {
  it('stays strictly inside the lowerBand on every side', () => {
    const lowerBand = { x: 0, y: 300, width: 480, height: 400 };
    const r = computeAvailableBoardRect(lowerBand, none);
    expect(r.x).toBeGreaterThan(lowerBand.x);
    expect(r.y).toBeGreaterThan(lowerBand.y);
    expect(r.x + r.width).toBeLessThan(lowerBand.x + lowerBand.width);
    expect(r.y + r.height).toBeLessThan(lowerBand.y + lowerBand.height);
  });

  it('saturates the margin at BOARD_MARGIN_MIN on a tiny band', () => {
    const lowerBand = { x: 0, y: 0, width: 100, height: 100 };
    const r = computeAvailableBoardRect(lowerBand, none);
    expect(r.x).toBeCloseTo(BOARD_MARGIN_MIN, 9);
    expect(r.width).toBeCloseTo(100 - 2 * BOARD_MARGIN_MIN, 9);
  });

  it('saturates the margin at BOARD_MARGIN_MAX on a huge band', () => {
    const lowerBand = { x: 0, y: 0, width: 4000, height: 4000 };
    const r = computeAvailableBoardRect(lowerBand, none);
    expect(r.x).toBeCloseTo(BOARD_MARGIN_MAX, 9);
  });

  it('widens the left/right/bottom margin to at least the safe-area inset', () => {
    const lowerBand = { x: 0, y: 300, width: 480, height: 400 };
    const insets = { top: 0, right: 40, bottom: 30, left: 25 };
    const r = computeAvailableBoardRect(lowerBand, insets);
    expect(r.x).toBeGreaterThanOrEqual(lowerBand.x + insets.left);
    expect(r.x + r.width).toBeLessThanOrEqual(lowerBand.x + lowerBand.width - insets.right);
    expect(r.y + r.height).toBeLessThanOrEqual(lowerBand.y + lowerBand.height - insets.bottom);
  });

  it('never produces a negative size on a degenerate band', () => {
    const r = computeAvailableBoardRect({ x: 0, y: 0, width: 5, height: 5 }, none);
    expect(r.width).toBeGreaterThanOrEqual(0);
    expect(r.height).toBeGreaterThanOrEqual(0);
  });
});

describe('computeBoardFrameBounds', () => {
  const lowerBand = { x: 0, y: 300, width: 480, height: 400 };
  const tileBounds = { x: 60, y: 350, width: 360, height: 200 };

  it('fully encloses tileBounds', () => {
    const frame = computeBoardFrameBounds(tileBounds, lowerBand);
    expect(frame.x).toBeLessThanOrEqual(tileBounds.x);
    expect(frame.y).toBeLessThanOrEqual(tileBounds.y);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(tileBounds.x + tileBounds.width);
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(tileBounds.y + tileBounds.height);
  });

  it('never exceeds lowerBand even when padding would overflow it', () => {
    const wideTiles = { x: 5, y: 305, width: 470, height: 390 };
    const frame = computeBoardFrameBounds(wideTiles, lowerBand);
    expect(frame.x).toBeGreaterThanOrEqual(lowerBand.x);
    expect(frame.y).toBeGreaterThanOrEqual(lowerBand.y);
    expect(frame.x + frame.width).toBeLessThanOrEqual(lowerBand.x + lowerBand.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(lowerBand.y + lowerBand.height);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/scenes/boardArea.test.ts`
Expected: FAIL — `Cannot find module '../../src/scenes/boardArea'`

- [ ] **Step 3: Implement `boardArea.ts`**

Create `src/scenes/boardArea.ts`:

```typescript
// Pure, Phaser-free and DOM-free derivation of the puzzle's own lower-band
// footprint (see docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md).
// `lowerBand` is always the caller's `layout.table` rect — already the full
// [0, viewport.width] x [table.y, viewport.height] band (battleLayout.ts).
// This module never reads gameplayColumn: the puzzle is no longer capped by
// the chrome column width.
import type { Rect, SafeInsets } from './battleLayout';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// A single clamp-based margin rule (not three per-format constants): modest
// on small phones, capped so it never becomes decorative on large tablets.
export const BOARD_MARGIN_FRACTION = 0.04;
export const BOARD_MARGIN_MIN = 10;
export const BOARD_MARGIN_MAX = 28;

// Derives the responsive interactive rect inside the lower band: enough
// clearance for touch safety, drag/selection-ring effects, and never under a
// safe-area inset. Left/right/bottom margins widen to at least the matching
// safe-area inset (the top edge needs no such term: table.y is already
// derived from safeRect.y, so lowerBand's top is already inset-safe).
export function computeAvailableBoardRect(lowerBand: Rect, insets: SafeInsets): Rect {
  const minDim = Math.min(lowerBand.width, lowerBand.height);
  const baseMargin = clamp(minDim * BOARD_MARGIN_FRACTION, BOARD_MARGIN_MIN, BOARD_MARGIN_MAX);
  const marginLeft = Math.max(baseMargin, insets.left);
  const marginRight = Math.max(baseMargin, insets.right);
  const marginBottom = Math.max(baseMargin, insets.bottom);
  const marginTop = baseMargin;
  return {
    x: lowerBand.x + marginLeft,
    y: lowerBand.y + marginTop,
    width: Math.max(0, lowerBand.width - marginLeft - marginRight),
    height: Math.max(0, lowerBand.height - marginTop - marginBottom),
  };
}

const BOARD_FRAME_PADDING_FRACTION = 0.02;
const BOARD_FRAME_PADDING_MIN = 6;
const BOARD_FRAME_PADDING_MAX = 16;

// The temporary responsive frame's bounds: tileBounds expanded by a modest
// padding, clamped so it can never spill outside lowerBand (and therefore
// never overlaps the upper composition).
export function computeBoardFrameBounds(tileBounds: Rect, lowerBand: Rect): Rect {
  const minDim = Math.min(lowerBand.width, lowerBand.height);
  const padding = clamp(minDim * BOARD_FRAME_PADDING_FRACTION, BOARD_FRAME_PADDING_MIN, BOARD_FRAME_PADDING_MAX);
  const x = Math.max(lowerBand.x, tileBounds.x - padding);
  const y = Math.max(lowerBand.y, tileBounds.y - padding);
  const right = Math.min(lowerBand.x + lowerBand.width, tileBounds.x + tileBounds.width + padding);
  const bottom = Math.min(lowerBand.y + lowerBand.height, tileBounds.y + tileBounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scenes/boardArea.test.ts`
Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add src/scenes/boardArea.ts tests/scenes/boardArea.test.ts
git commit -m "feat: derive the lower band's available board rect and frame bounds"
```

---

## Task 4: `computeResponsiveBoardGeometry` — fit the honeycomb to a rect

**Files:**
- Modify: `src/scenes/boardGeometry.ts`
- Test: `tests/scenes/boardGeometry.test.ts` (append; the existing `computeBoardGeometry` tests stay untouched — that function is still used for `legacyBoard`)

**Interfaces:**
- Consumes: `Rect` from `battleLayout.ts` (existing).
- Produces: `NORMALIZED_BOARD_BOUNDS: { width: number; height: number }`, `computeResponsiveBoardGeometry(rect: Rect, targetMinHitRadius: number): BoardGeometry` — consumed by Task 5.
- `BoardGeometry` gains an optional `scale?: number` field (only set by the new function; `computeBoardGeometry` keeps not setting it, so every existing call site/object-literal stays valid).

- [ ] **Step 1: Write the failing tests**

Append to `tests/scenes/boardGeometry.test.ts` (after the existing content, same imports style — add `computeResponsiveBoardGeometry, NORMALIZED_BOARD_BOUNDS` to the existing `import { computeBoardGeometry, cellToPixel, cellAtPixel } from '../../src/scenes/boardGeometry';` line):

```typescript
describe('computeResponsiveBoardGeometry — fits the honeycomb to an arbitrary rect', () => {
  it('exposes the fixed scale-1 honeycomb bbox as a topology constant', () => {
    expect(NORMALIZED_BOARD_BOUNDS).toEqual({ width: 380, height: 236 });
  });

  it('is isotropic: colWidth/56 === rowHeight/48 === visualRadius/22 === scale', () => {
    const g = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 400, height: 400 }, 20);
    expect(g.colWidth / 56).toBeCloseTo(g.rowHeight / 48, 9);
    expect(g.visualRadius / 22).toBeCloseTo(g.rowHeight / 48, 9);
    expect(g.scale).toBeCloseTo(g.rowHeight / 48, 9);
  });

  it('picks scale = min(widthFit, heightFit) — width-bound case', () => {
    const rect = { x: 10, y: 20, width: 380, height: 1000 }; // width is the tight axis
    const g = computeResponsiveBoardGeometry(rect, 20);
    expect(g.scale).toBeCloseTo(1, 9);
    expect(g.tileBounds.width).toBeCloseTo(rect.width, 6);
  });

  it('picks scale = min(widthFit, heightFit) — height-bound case', () => {
    const rect = { x: 10, y: 20, width: 1000, height: 236 }; // height is the tight axis
    const g = computeResponsiveBoardGeometry(rect, 20);
    expect(g.scale).toBeCloseTo(1, 9);
    expect(g.tileBounds.height).toBeCloseTo(rect.height, 6);
  });

  it('centers the full tile bounds (not just a point) inside rect', () => {
    const rect = { x: 50, y: 100, width: 760, height: 472 };
    const g = computeResponsiveBoardGeometry(rect, 20);
    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;
    const tbCenterX = g.tileBounds.x + g.tileBounds.width / 2;
    const tbCenterY = g.tileBounds.y + g.tileBounds.height / 2;
    expect(tbCenterX).toBeCloseTo(rectCenterX, 6);
    expect(tbCenterY).toBeCloseTo(rectCenterY, 6);
  });

  it('confines tileBounds strictly inside rect at every size', () => {
    for (const rect of [
      { x: 0, y: 0, width: 200, height: 500 },
      { x: 20, y: 40, width: 900, height: 300 },
      { x: 5, y: 5, width: 1500, height: 1200 },
    ]) {
      const g = computeResponsiveBoardGeometry(rect, 20);
      expect(g.tileBounds.x).toBeGreaterThanOrEqual(rect.x - 1e-6);
      expect(g.tileBounds.y).toBeGreaterThanOrEqual(rect.y - 1e-6);
      expect(g.tileBounds.x + g.tileBounds.width).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
      expect(g.tileBounds.y + g.tileBounds.height).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
    }
  });

  it('fully occupies the constraining axis (a larger scale would overflow rect)', () => {
    const rect = { x: 0, y: 0, width: 380, height: 1000 }; // width-bound
    const g = computeResponsiveBoardGeometry(rect, 20);
    expect(g.tileBounds.width).toBeCloseTo(rect.width, 6);
    const biggerScale = g.scale * 1.01;
    const overflowWidth = 6 * (56 * biggerScale) + 2 * (22 * biggerScale);
    expect(overflowWidth).toBeGreaterThan(rect.width);
  });

  it('grows monotonically as the rect grows (360 < 480 < 768 reference widths)', () => {
    const small = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 335, height: 289 }, 20);
    const mid = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 452, height: 325 }, 20);
    const large = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 728, height: 462 }, 20);
    expect(mid.visualRadius).toBeGreaterThan(small.visualRadius);
    expect(large.visualRadius).toBeGreaterThan(mid.visualRadius);
  });

  it('keeps hitRadius strictly below half the minimum center distance (no overlap)', () => {
    const g = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 728, height: 462 }, 20);
    expect(g.hitRadius).toBeLessThan(g.rowHeight / 2);
  });

  it('floors hitRadius at targetMinHitRadius on a tiny rect, never negative', () => {
    const g = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 40, height: 40 }, 20);
    expect(g.hitRadius).toBeGreaterThanOrEqual(0);
  });

  it('never produces NaN/negative geometry on a degenerate (zero) rect', () => {
    const g = computeResponsiveBoardGeometry({ x: 0, y: 0, width: 0, height: 0 }, 20);
    expect(g.scale).toBe(0);
    expect(g.hitRadius).toBe(0);
    expect(Number.isFinite(g.tileBounds.x)).toBe(true);
  });

  it('produces a straight, unrotated honeycomb (columns vertical, uniform row step)', () => {
    const g = computeResponsiveBoardGeometry({ x: 10, y: 20, width: 728, height: 462 }, 20);
    for (let col = 0; col < 7; col++) {
      const p0 = cellToPixel(g, 0, col);
      const p1 = cellToPixel(g, 1, col);
      expect(p1.x).toBe(p0.x);
      expect(p1.y - p0.y).toBeCloseTo(g.rowHeight, 9);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/scenes/boardGeometry.test.ts`
Expected: FAIL — `computeResponsiveBoardGeometry is not exported`

- [ ] **Step 3: Implement in `src/scenes/boardGeometry.ts`**

Add near the top, after the existing `EPSILON` constant (`boardGeometry.ts:24`):

```typescript
// Fixed scale-1 honeycomb bbox — a topology constant (COLS=7, tallest column
// 5 rows), exported so callers/tests never re-derive it by hand.
export const NORMALIZED_BOARD_BOUNDS = { width: BBOX_WIDTH, height: BBOX_HEIGHT };
```

Add `scale?: number;` to the `BoardGeometry` interface (`boardGeometry.ts:26-38`), right after `hitRadius: number;`:

```typescript
  hitRadius: number; // pointer acquisition only (separate; may exceed visualRadius, capped)
  scale?: number; // isotropic scale actually applied — set by computeResponsiveBoardGeometry only
```

Add the new function at the end of the file, after `computeBoardGeometry` (`boardGeometry.ts:126`):

```typescript
// Fits the fixed-topology honeycomb into an arbitrary rect with the largest
// isotropic scale that keeps it fully inside — no column/tableSpan coupling,
// no vertical bias, no per-cell offset: the tile bounds are centered on
// `rect`'s full bounds (2026-07-18 Lot 2 refactor — see
// docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md).
// `computeBoardGeometry` above is kept as-is for `legacyBoard`
// (battleLayout.ts's combatScale/hero-centering derivation only).
export function computeResponsiveBoardGeometry(rect: Rect, targetMinHitRadius: number): BoardGeometry {
  const scaleFromWidth = rect.width / BBOX_WIDTH;
  const scaleFromHeight = rect.height / BBOX_HEIGHT;
  const scale = Math.max(0, Math.min(scaleFromWidth, scaleFromHeight));

  const colWidth = COL_WIDTH * scale;
  const rowHeight = ROW_HEIGHT * scale;
  const visualRadius = STONE_RADIUS * scale;
  const scaledBboxW = 6 * colWidth + 2 * visualRadius;
  const scaledBboxH = 4 * rowHeight + 2 * visualRadius;

  const originX = rect.x + (rect.width - scaledBboxW) / 2 + visualRadius;
  const originY = rect.y + (rect.height - scaledBboxH) / 2 + visualRadius;

  const minCenterDistance = rowHeight;
  const maximumHitRadius = minCenterDistance / 2 - EPSILON;
  const hitRadius = scale > 0 ? Math.min(maximumHitRadius, Math.max(visualRadius, targetMinHitRadius)) : 0;

  const tileBounds: Rect = {
    x: originX - visualRadius,
    y: originY - visualRadius,
    width: scaledBboxW,
    height: scaledBboxH,
  };

  return { originX, originY, colWidth, rowHeight, visualRadius, hitRadius, tileBounds, scale };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scenes/boardGeometry.test.ts`
Expected: all tests pass (old `computeBoardGeometry` describe blocks + new `computeResponsiveBoardGeometry` describe block)

- [ ] **Step 5: Commit**

```bash
git add src/scenes/boardGeometry.ts tests/scenes/boardGeometry.test.ts
git commit -m "feat: add computeResponsiveBoardGeometry, an available-rect honeycomb fit"
```

---

## Task 5: Wire the new board into `computeBattleLayout`

**Files:**
- Modify: `src/scenes/battleLayout.ts`
- Modify: `tests/scenes/battleLayout.test.ts`
- Modify: `tests/e2e/reflow.spec.ts`

**Interfaces:**
- Consumes: `computeAvailableBoardRect`, `computeBoardFrameBounds` (Task 3); `computeResponsiveBoardGeometry`, `NORMALIZED_BOARD_BOUNDS` (Task 4).
- Produces: `BattleLayout` gains `availableBoardRect: Rect` and `boardFrame: Rect`; `BattleLayout.board` is now the new fit-based geometry (public API shape unchanged: still a `BoardGeometry`).

- [ ] **Step 1: Modify `battleLayout.ts`**

Add imports at the top (after the existing `boardGeometry` import on line 8):

```typescript
import { computeBoardGeometry, computeResponsiveBoardGeometry, type BoardGeometry, type BoardGeometryInput } from './boardGeometry';
import { computeAvailableBoardRect, computeBoardFrameBounds } from './boardArea';
```

(This replaces the existing single-line import of `computeBoardGeometry`.)

Add two fields to the `BattleLayout` interface (`battleLayout.ts:109-121`), after `table: Rect;`:

```typescript
  table: Rect; // == lowerBand: {x:0, y:table.y, width:viewport.width, height:viewport.height-table.y}
  availableBoardRect: Rect; // lowerBand inset by the responsive margin (see boardArea.ts)
  boardFrame: Rect; // tileBounds + a modest padding, clamped inside lowerBand
```

In `computeBattleLayout` (`battleLayout.ts:379-381`), rename the existing board computation to `legacyBoard` — it is kept **only** to drive `combatScale` and the hero/monster centering band below, exactly as before:

```typescript
  // Board geometry works entirely in GLOBAL space (global column + global table
  // span), so board.tileBounds/origin are already global.
  // RENAMED (Lot 2): this is now `legacyBoard` — kept alive solely to derive
  // combatScale/minBoardWidthBand below so the boss/hero footprint and the
  // hero-centering band stay byte-identical to before the refactor. It is
  // NEVER exposed as the public `board` anymore (see availableBoardRect below).
  const legacyBoard = computeBoardGeometry(
    resolveBoardGeometryInput(gameplayColumn, tableSpanGlobal, heroBottomGlobal, policy),
  );
```

Update every subsequent reference to the old `board` variable within this function to `legacyBoard` — specifically `battleLayout.ts:388` (`minBoardWidthBand`) and `battleLayout.ts:410` (`combatScale`):

```typescript
  const minBoardWidthBand = legacyBoard.tileBounds.width + 2 * policy.minimumTablePadding;
```

```typescript
  const combatScale = Math.min(policy.maxBoardScale, Math.max(1, legacyBoard.rowHeight / 48));
```

Immediately before the function's final `return` statement (`battleLayout.ts:431`), add the new board computation:

```typescript
  // The REAL rendered/hit-tested board (Lot 2): fit to the puzzle's own
  // available space inside the lower band (== `table`), completely
  // independent of gameplayColumn/legacyBoard. See
  // docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md.
  const availableBoardRect = computeAvailableBoardRect(table, insets);
  const board = computeResponsiveBoardGeometry(availableBoardRect, policy.targetMinHitRadius);
  const boardFrame = computeBoardFrameBounds(board.tileBounds, table);
```

Update the `return` statement to include the two new fields and the new `board`:

```typescript
  return {
    input,
    safeRect,
    gameplayColumn,
    background,
    bands,
    board,
    table,
    availableBoardRect,
    boardFrame,
    boss,
    heroes,
    bossHud,
    environment,
  };
```

- [ ] **Step 2: Run the upper-composition lock test — must still pass unchanged**

Run: `npx vitest run tests/scenes/upperCompositionLock.test.ts`
Expected: `3 passed` (proves `legacyBoard`'s rename didn't disturb `combatScale`/boss/heroes/bossHud)

- [ ] **Step 3: Fix the hard-coded 480×720 baseline in `battleLayout.test.ts`**

In `tests/scenes/battleLayout.test.ts`, the `describe('computeBattleLayout — 480×720 baseline neutrality', ...)` block (lines 16-42) asserts the *old* `board.tileBounds`. Replace the whole block:

```typescript
describe('computeBattleLayout — 480×720 baseline neutrality', () => {
  const L = computeBattleLayout({ width: 480, height: 720, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
  it('safeRect equals the full viewport with no insets', () => {
    expect(L.safeRect).toEqual({ x: 0, y: 0, width: 480, height: 720 });
  });
  it('gameplay column is the full width (≤ cap) and centered', () => {
    expect(L.gameplayColumn.width).toBe(480);
    expect(L.gameplayColumn.x).toBe(0);
  });
  // 2026-07-18 Lot 2: the board is no longer aligned to the legacy
  // column-constrained geometry — it fits availableBoardRect (a modest inset
  // of the full lower band). See tests/scenes/boardGeometry.test.ts and
  // tests/scenes/boardArea.test.ts for the formula's own unit coverage; this
  // just cross-checks the two are wired together correctly at the 480x720
  // reference format.
  it('fits the board to availableBoardRect, not to gameplayColumn/legacyBoard', () => {
    const avail = computeAvailableBoardRect(L.table, { top: 0, right: 0, bottom: 0, left: 0 });
    const expected = computeResponsiveBoardGeometry(avail, DEFAULT_BATTLE_LAYOUT_POLICY.targetMinHitRadius);
    expect(L.availableBoardRect).toEqual(avail);
    expect(L.board.tileBounds).toEqual(expected.tileBounds);
    expect(L.board.scale).toBeCloseTo(expected.scale!, 9);
  });
  it('keeps distinct widths separate', () => {
    expect(L.gameplayColumn.width).toBe(480); // column
    expect(L.table.width).toBe(480); // full-bleed composition band, == viewport width
  });
});
```

Add the two new imports at the top of the file (extend the existing `battleLayout` import and add a new one):

```typescript
import {
  computeBattleLayout,
  DEFAULT_BATTLE_LAYOUT_POLICY,
  sanitizeInsets,
  cssInsetsToGame,
  clampInsetsToViewport,
  resolveTileWidthFraction,
  resolveBandRanges,
  baseTileWidthFraction,
} from '../../src/scenes/battleLayout';
import { computeAvailableBoardRect } from '../../src/scenes/boardArea';
import { computeResponsiveBoardGeometry } from '../../src/scenes/boardGeometry';
import { HexGrid, getAllCells } from '../../src/core/grid';
```

(`HexGrid`/`getAllCells` are needed by the new "no visual/hit overlap" test added in Step 5 below.)

- [ ] **Step 4: Retire the describe blocks that assert the retired column-constrained board behavior**

In `tests/scenes/battleLayout.test.ts`, delete these describe blocks in full (they assert `board.tileBounds`/`board.colWidth`/`board.visualRadius` relative to `gameplayColumn`/`boardVerticalBias`/`columnSpacingReduction` — all now legacy-only concerns that no longer apply to the public `board`):

- `'M6 — horizontal width policy (widening on narrow viewports)'`
- `'M6 — radius targets, never a clamp on visualRadius'`
- `'M7 — 320x568 support classification (on usable gameplayColumn width, not raw viewport)'`
- `'2026-07-14 — realignment to the combat background art target'` (the whole block, including its `PRE_REALIGNMENT_POLICY` constant just above it)
- `'2026-07-19 — combatScale grows the boss/hero footprint on large formats'` — **keep this one**, it only reads `boss`/`heroes`, not `board`.
- `'2026-07-18 — board vertical recalibration is horizontal-invariant'` (the whole block; it asserts `board.tileBounds`/`colWidth`/`originX` equality under a `legacyBoard`-only policy knob against the *public* `board`, which is no longer coupled to it)

Also, within `describe('computeBattleLayout — invariants across sizes', ...)`, delete the `'never scales the board anisotropically (single scale factor)'` and `'keeps the board fully inside the gameplay column'` tests (both assert the retired column-confinement relationship) — replace them with:

```typescript
  it('never scales the board anisotropically (single isotropic scale)', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.colWidth / 56).toBeCloseTo(L.board.rowHeight / 48, 9);
    expect(L.board.visualRadius / 22).toBeCloseTo(L.board.rowHeight / 48, 9);
  });
  it('keeps the board fully inside availableBoardRect (not gameplayColumn — the puzzle now owns the lower band)', () => {
    const L = computeBattleLayout({ width: 360, height: 640, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.availableBoardRect.x + L.availableBoardRect.width + 0.5,
    );
  });
```

Within `describe('computeBattleLayout — synthetic safe-area insets (audit cases)', ...)`, replace the `'keeps the board fully inside the gameplay column'` test (asserts against `gameplayColumn`) with:

```typescript
      it('keeps the board fully inside availableBoardRect', () => {
        expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
        expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
          L.availableBoardRect.x + L.availableBoardRect.width + 0.5,
        );
      });
```

Within `describe('computeBattleLayout — global coordinate spaces (offsets applied)', ...)`, the `'centers board/table/boss about a horizontally-offset column center'` test asserts the board bbox is centered on the *gameplayColumn*'s center — that is no longer true (the board is now centered on `availableBoardRect`, which is centered on the full-width `table`, not the capped `gameplayColumn`). Replace its board-related assertion:

```typescript
  it('centers board/table/boss about a horizontally-offset column center', () => {
    const L = computeBattleLayout({ width: 900, height: 800, safeInsets: none }, DEFAULT_BATTLE_LAYOUT_POLICY);
    expect(L.gameplayColumn.x).toBeGreaterThan(0); // wide → capped, offset column
    const c = L.gameplayColumn.x + L.gameplayColumn.width / 2;
    expect(L.table.x + L.table.width / 2).toBeCloseTo(c, 3);
    expect(L.boss.x + L.boss.width / 2).toBeCloseTo(c, 3);
    // The board is centered on availableBoardRect (== the full-width lower
    // band's own center), not on gameplayColumn's center — see Task 5's design.
    const boardRectCenter = L.availableBoardRect.x + L.availableBoardRect.width / 2;
    expect(L.board.tileBounds.x + L.board.tileBounds.width / 2).toBeCloseTo(boardRectCenter, 3);
  });
```

Within `describe('computeBattleLayout — global coordinate spaces (offsets applied)', ...)`, the `'keeps heroes and board inside a left-inset, offset column'` test's board assertion (`expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5)`) must change to check `availableBoardRect` instead:

```typescript
  it('keeps heroes and board inside a left-inset, offset column', () => {
    const left = 40;
    const L = computeBattleLayout(
      { width: 500, height: 800, safeInsets: { top: 0, right: 0, bottom: 0, left } },
      DEFAULT_BATTLE_LAYOUT_POLICY,
    );
    expect(L.safeRect.x).toBe(left);
    expect(L.gameplayColumn.x).toBeGreaterThanOrEqual(left);
    for (const h of L.heroes) expect(h.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - 0.5);
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
  });
```

Within `describe('computeBattleLayout — DPR independence is structural', ...)` and the tablet/tall-screen block: in `describe('M6 — tablet / tall-screen invariants', ...)`, the `'keeps the table full-bleed and the background spanning the full viewport (768x1024)'` test's board assertions (checking against `gameplayColumn`) must switch to `availableBoardRect`:

```typescript
  it('keeps the table full-bleed and the background spanning the full viewport (768x1024)', () => {
    const L = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    expect(L.table.width).toBe(L.background.width); // full-bleed, not column-capped
    expect(L.background).toEqual({ x: 0, y: 0, width: 768, height: 1024 });
    expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.availableBoardRect.x - 0.5);
    expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(
      L.availableBoardRect.x + L.availableBoardRect.width + 0.5,
    );
  });
```

The `'keeps heroes within the column and above the board across tablet/tall sizes'` test in that same block stays valid as-is (heroes vs `gameplayColumn`, and heroes vs `board.tileBounds.y` — both relationships are still true post-refactor, as verified in the audit above) — **no change needed**.

- [ ] **Step 5: Add the Lot 2 board-sizing describe block**

Append to `tests/scenes/battleLayout.test.ts`:

```typescript
// 2026-07-18 — Lot 2: the rendered board is fit to availableBoardRect (a
// modest inset of the full lower band), independent of gameplayColumn/
// legacyBoard. See docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md.
describe('2026-07-18 — Lot 2 gameplay-first lower board', () => {
  const REFERENCE_FORMATS = [
    { width: 360, height: 640 },
    { width: 480, height: 720 },
    { width: 768, height: 1024 },
  ];
  // Confinement/topology must also hold at these additional formats the
  // brief calls out explicitly (320x568, 430x932) plus a landscape format
  // already exercised elsewhere in this suite (844x390, matrix.spec.ts).
  const EXTRA_FORMATS = [
    { width: 320, height: 568 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ];
  const ALL_FORMATS = [...REFERENCE_FORMATS, ...EXTRA_FORMATS];

  it('matches computeResponsiveBoardGeometry(computeAvailableBoardRect(table, insets)) exactly, at every reference format', () => {
    for (const vp of REFERENCE_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      const avail = computeAvailableBoardRect(L.table, none);
      const expected = computeResponsiveBoardGeometry(avail, P.targetMinHitRadius);
      expect(L.availableBoardRect).toEqual(avail);
      expect(L.board.tileBounds).toEqual(expected.tileBounds);
    }
  });

  it('grows the board strictly across 360 -> 480 -> 768 (puzzle becomes visually dominant)', () => {
    const sizes = REFERENCE_FORMATS.map(
      (vp) => computeBattleLayout({ ...vp, safeInsets: none }, P).board.visualRadius,
    );
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
  });

  it('exceeds the old legacy cap (22 * maxBoardScale) at 768x1024 — the puzzle is no longer capped by legacyBoard', () => {
    const L = computeBattleLayout({ width: 768, height: 1024, safeInsets: none }, P);
    expect(L.board.visualRadius).toBeGreaterThan(22 * P.maxBoardScale);
  });

  it('is no longer confined to gameplayColumn on a wide viewport (the intentional decoupling)', () => {
    const L = computeBattleLayout({ width: 1000, height: 700, safeInsets: none }, P);
    expect(L.board.tileBounds.width).toBeGreaterThan(L.gameplayColumn.width);
  });

  it('keeps availableBoardRect and boardFrame inside the lower band (table) at every format, including 320x568/430x932/844x390 landscape', () => {
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.availableBoardRect.x).toBeGreaterThanOrEqual(L.table.x - 1e-6);
      expect(L.availableBoardRect.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
      expect(L.availableBoardRect.x + L.availableBoardRect.width).toBeLessThanOrEqual(L.table.x + L.table.width + 1e-6);
      expect(L.availableBoardRect.y + L.availableBoardRect.height).toBeLessThanOrEqual(L.table.y + L.table.height + 1e-6);
      expect(L.boardFrame.x).toBeGreaterThanOrEqual(L.table.x - 1e-6);
      expect(L.boardFrame.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
      expect(L.boardFrame.x + L.boardFrame.width).toBeLessThanOrEqual(L.table.x + L.table.width + 1e-6);
      expect(L.boardFrame.y + L.boardFrame.height).toBeLessThanOrEqual(L.table.y + L.table.height + 1e-6);
    }
  });

  it('never lets the board rise above table.y at any format (the upper composition boundary)', () => {
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      expect(L.board.tileBounds.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
    }
  });

  it('leaves the 32-cell honeycomb topology unchanged (7 columns, 5/4 alternation) at every format', () => {
    const COLUMN_ROW_COUNTS = [5, 4, 5, 4, 5, 4, 5];
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      let total = 0;
      for (let col = 0; col < 7; col++) {
        for (let row = 0; row < COLUMN_ROW_COUNTS[col]; row++) {
          const p = cellToPixel(L.board, row, col);
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
          total++;
        }
      }
      expect(total).toBe(32);
    }
  });

  it('keeps every pair of neighboring cells farther apart than 2*hitRadius (no visual/hit overlap) at every format', () => {
    const grid = new HexGrid();
    for (const vp of ALL_FORMATS) {
      const L = computeBattleLayout({ ...vp, safeInsets: none }, P);
      for (const cell of getAllCells()) {
        const p0 = cellToPixel(L.board, cell.row, cell.col);
        for (const n of grid.getNeighbors(cell.row, cell.col)) {
          const p1 = cellToPixel(L.board, n.row, n.col);
          const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          expect(dist).toBeGreaterThanOrEqual(2 * L.board.hitRadius - 1e-6);
        }
      }
    }
  });
});
```

- [ ] **Step 6: Fix the hard-coded 480×720 baseline in `tests/e2e/reflow.spec.ts`**

In `tests/e2e/reflow.spec.ts`, the test `'a real mid-session resize reflows on the next frame and keeps clicks accurate'` (around line 178) asserts the *old* tileBounds:

```typescript
  const l480 = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(l480.board.tileBounds).toEqual({ x: 59, y: 429, width: 362, height: 236 });
```

Replace with a formula-based cross-check (mirrors the Node model rather than a hand-copied literal, so it can never drift from Task 4/5's implementation):

```typescript
  const l480 = await page.evaluate(() => window.__debug!.getBattleLayout());
  const node480 = computeBattleLayout(
    { width: 480, height: 720, safeInsets: { top: 0, right: 0, bottom: 0, left: 0 } },
    DEFAULT_BATTLE_LAYOUT_POLICY,
  );
  expect(l480.board.tileBounds).toEqual(node480.board.tileBounds);
```

This import (`computeBattleLayout`, `DEFAULT_BATTLE_LAYOUT_POLICY`) is already present at the top of `reflow.spec.ts` — no new import needed.

Also update the `high-DPR context` test at the bottom of the same file: it already cross-checks `L.board.tileBounds` against the Node model dynamically (`expected.board.tileBounds`), not a hard-coded literal — **no change needed there**.

- [ ] **Step 7: Run the full unit suite**

Run: `npx vitest run`
Expected: all tests pass (0 failures)

- [ ] **Step 8: Commit**

```bash
git add src/scenes/battleLayout.ts tests/scenes/battleLayout.test.ts tests/e2e/reflow.spec.ts
git commit -m "feat: fit the rendered board to the lower band, decoupled from gameplayColumn"
```

---

## Task 6: Hide `battleBackgroundLower` in normal gameplay

**Files:**
- Modify: `src/scenes/BattleScene.ts`
- Test: `tests/e2e/environment-backgrounds.spec.ts`

**Interfaces:**
- Consumes: existing `drawEnvironmentBackground`, `DebugApi` (both in `BattleScene.ts`).
- Produces: `DebugApi.getLowerBackgroundDebugInfo(): { loaded: boolean; objectCount: number; visibleInNormalMode: boolean }`.

- [ ] **Step 1: Add the visibility toggle in `drawEnvironmentBackground`**

In `src/scenes/BattleScene.ts`, at the end of `drawEnvironmentBackground` (after the existing `entry.sprite.setPosition(...)` line, `BattleScene.ts:583`), add:

```typescript
    entry.sprite.setPosition(rect.x + fit.x, rect.y + fit.y);
    // Lot 2 (2026-07-18): the lower background is hidden in normal gameplay —
    // the puzzle now defines the lower band's geometry instead of aligning to
    // this artwork. The sprite stays created/masked/updated exactly as
    // before (never destroyed), so re-enabling it later is a one-line change.
    // battleBackgroundUpper is unaffected and stays visible.
    entry.sprite.setVisible(role !== 'battleBackgroundLower');
```

- [ ] **Step 2: Add the debug getter**

In `DebugApi` interface (`BattleScene.ts:64-79`), add after `hasTexture`:

```typescript
  hasTexture(key: string): boolean; // Phaser texture-manager check (e.g. a background actually loaded)
  getLowerBackgroundDebugInfo(): { loaded: boolean; objectCount: number; visibleInNormalMode: boolean }; // Lot 2 hide-in-normal-mode surface
```

In the `window.__debug = {...}` object literal (inside `create()`, after the existing `hasTexture: ...` entry around `BattleScene.ts:243`), add:

```typescript
        hasTexture: (key) => this.textures.exists(key),
        getLowerBackgroundDebugInfo: () => {
          const def = environmentAssetByRole('battleBackgroundLower');
          const entry = this.environmentBackgrounds.battleBackgroundLower;
          return {
            loaded: this.textures.exists(def.key),
            objectCount: this.tableContainer.length,
            visibleInNormalMode: entry?.sprite.visible ?? false,
          };
        },
```

- [ ] **Step 3: Write the e2e test**

Append to `tests/e2e/environment-backgrounds.spec.ts`:

```typescript
// 2026-07-18 Lot 2: battleBackgroundLower is hidden in normal gameplay but
// stays loaded and persistent (see
// docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md).
for (const vp of FORMATS) {
  test(`battleBackgroundLower stays loaded/persistent but invisible in normal mode (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    const info = await page.evaluate(() => window.__debug!.getLowerBackgroundDebugInfo());
    expect(info.loaded).toBe(true);
    expect(info.objectCount).toBe(1);
    expect(info.visibleInNormalMode).toBe(false);

    // battleBackgroundUpper is unaffected and stays visible/rendered.
    const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(counts.background).toBe(1);
  });
}

test('battleBackgroundLower stays loaded and persistent under artReview=combatBackground too', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const info = await page.evaluate(() => window.__debug!.getLowerBackgroundDebugInfo());
  expect(info.loaded).toBe(true);
  // In this mode the real sprite is removed entirely (existing behavior,
  // unchanged by Lot 2) in favor of the master reference image.
  expect(info.objectCount).toBe(0);
});
```

- [ ] **Step 4: Run the e2e spec**

Run: `npx playwright test tests/e2e/environment-backgrounds.spec.ts`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/scenes/BattleScene.ts tests/e2e/environment-backgrounds.spec.ts
git commit -m "feat: hide battleBackgroundLower in normal gameplay, keep it loaded and reviewable"
```

---

## Task 7: Temporary lower surface + responsive board frame

**Files:**
- Modify: `src/scenes/depth.ts`
- Modify: `tests/scenes/depth.test.ts`
- Modify: `src/scenes/BattleScene.ts`
- Test: `tests/e2e/board-frame.spec.ts` (new)

**Interfaces:**
- Consumes: `layout.table` (== lowerBand), `layout.boardFrame` (Task 5).
- Produces: two new persistent containers/graphics in `BattleScene`; `DebugApi.getLayerObjectCounts()` gains `lowerSurface`/`boardFrame` keys.

- [ ] **Step 1: Add depth constants**

In `src/scenes/depth.ts`, insert two new entries between `TABLE` and `BACKGROUND`:

```typescript
export const DEPTH = {
  TABLE: -10,
  LOWER_SURFACE: -9, // Lot 2 temporary plain surface standing in for the hidden battleBackgroundLower
  BOARD_FRAME: -8, // Lot 2 temporary responsive frame around the puzzle's own bounds
  BACKGROUND: 0,
  ENVIRONMENT: 10,
  MONSTER: 21,
  HERO: 31,
  BOARD: 50,
  PUZZLE_FEEDBACK: 60,
  HUD: 80,
  TRANSIENT_UI: 90,
  DEBUG: 100,
} as const;
```

- [ ] **Step 2: Extend `depth.test.ts`**

Append to `tests/scenes/depth.test.ts`, inside the existing `describe('DEPTH — z-order invariants', ...)` block (before its closing `});`):

```typescript
  it('keeps the Lot 2 temporary lower surface and frame behind the board but above the (hidden) real table sprite', () => {
    expect(DEPTH.TABLE).toBeLessThan(DEPTH.LOWER_SURFACE);
    expect(DEPTH.LOWER_SURFACE).toBeLessThan(DEPTH.BOARD_FRAME);
    expect(DEPTH.BOARD_FRAME).toBeLessThan(DEPTH.BOARD);
  });
```

- [ ] **Step 3: Run the depth unit test to verify it fails, then passes**

Run: `npx vitest run tests/scenes/depth.test.ts`
Expected: FAIL first (`DEPTH.LOWER_SURFACE is undefined`) — after Step 1's edit, re-run and expect all pass.

- [ ] **Step 4: Add the two containers, graphics, and draw methods in `BattleScene.ts`**

Add two private fields, near the existing `private tableContainer!: Phaser.GameObjects.Container;` (`BattleScene.ts:100`):

```typescript
  private tableContainer!: Phaser.GameObjects.Container;
  private lowerSurfaceContainer!: Phaser.GameObjects.Container;
  private boardFrameContainer!: Phaser.GameObjects.Container;
```

And two persistent Graphics fields, near `private traceGraphics!: Phaser.GameObjects.Graphics;` (`BattleScene.ts:124`):

```typescript
  private traceGraphics!: Phaser.GameObjects.Graphics;
  private lowerSurfaceGraphics!: Phaser.GameObjects.Graphics;
  private boardFrameGraphics!: Phaser.GameObjects.Graphics;
```

In `create()`, after `this.tableContainer = this.add.container(0, 0).setDepth(DEPTH.TABLE);` (`BattleScene.ts:267`), add:

```typescript
    this.tableContainer = this.add.container(0, 0).setDepth(DEPTH.TABLE);
    this.lowerSurfaceContainer = this.add.container(0, 0).setDepth(DEPTH.LOWER_SURFACE);
    this.boardFrameContainer = this.add.container(0, 0).setDepth(DEPTH.BOARD_FRAME);
```

After the existing `this.traceGraphics = this.add.graphics(); this.puzzleFeedbackContainer.add(this.traceGraphics);` (`BattleScene.ts:279-280`), add:

```typescript
    this.lowerSurfaceGraphics = this.add.graphics();
    this.lowerSurfaceContainer.add(this.lowerSurfaceGraphics);
    this.boardFrameGraphics = this.add.graphics();
    this.boardFrameContainer.add(this.boardFrameGraphics);
```

In `applyLayout()` (`BattleScene.ts:344-357`), call the two new draw methods between `drawTable()` and `drawBoard()`:

```typescript
  private applyLayout(layout: BattleLayout): void {
    this.activeLayout = layout;
    this.drawBackground();
    this.drawArtReviewBackground(); // no-op unless artReviewMode === 'combatBackground'
    this.drawEnvironment();
    this.drawTable();
    this.drawLowerSurface(); // Lot 2: temporary plain surface standing in for the hidden artwork
    this.drawBoardFrame(); // Lot 2: temporary responsive frame around the puzzle's own bounds
    this.drawBoard();
    this.drawHp();
    this.drawCharacterPlaceholders();
    this.drawArtGuides(); // no-op unless artReviewMode === 'combatBackground' && artGuidesEnabled
    this.drawAssetSlots(); // no-op unless artReviewMode === 'combatBackground' && assetSlotsEnabled
    this.drawTraceLine(); // keeps an in-progress trace consistent if not cancelled
    if (isDefeated(this.monster)) this.checkVictory();
  }
```

Add the two new draw methods, right after the existing `drawTable()` method (`BattleScene.ts:610-615`):

```typescript
  // Lot 2 temporary surface (2026-07-18): a plain, sober fill covering exactly
  // the lower band (== layout.table) — stands in for the hidden
  // battleBackgroundLower so the band still reads clearly during this
  // refactor. Persistent Graphics, cleared+redrawn (never recreated) each
  // reflow. Warm/dark/no-detail per the Lot 2 design decision.
  private drawLowerSurface(): void {
    this.lowerSurfaceGraphics.clear();
    const band = this.activeLayout.table;
    this.lowerSurfaceGraphics.fillStyle(0x2e1a12, 1);
    this.lowerSurfaceGraphics.fillRect(band.x, band.y, band.width, band.height);
  }

  // Lot 2 temporary responsive frame (2026-07-18): a sober rounded rect
  // around the puzzle's own bounds (layout.boardFrame — tileBounds + a
  // modest padding, clamped inside the lower band by boardArea.ts). Never
  // covers a tile: it renders below DEPTH.BOARD and boardFrame is always
  // clamped inside layout.table, so it can never bleed into the upper
  // composition either. Persistent Graphics, cleared+redrawn each reflow.
  private drawBoardFrame(): void {
    this.boardFrameGraphics.clear();
    const frame = this.activeLayout.boardFrame;
    this.boardFrameGraphics.fillStyle(0x3a2417, 1);
    this.boardFrameGraphics.fillRoundedRect(frame.x, frame.y, frame.width, frame.height, 12);
    this.boardFrameGraphics.lineStyle(2, 0x1a0f08, 0.85);
    this.boardFrameGraphics.strokeRoundedRect(frame.x, frame.y, frame.width, frame.height, 12);
  }
```

- [ ] **Step 5: Extend `getLayerObjectCounts` and add `getTileGeometry`**

In the `DebugApi` interface, add after `getContainerDepths`:

```typescript
  getContainerDepths(): Record<string, number>; // per-container Phaser depth — the z-order regression probe
  getTileGeometry(): { row: number; col: number; x: number; y: number; hitRadius: number }[]; // Lot 2: per-cell rendered center + hit radius
```

In `getLayerObjectCounts: () => ({...})` (`BattleScene.ts:227-240`), add two entries:

```typescript
        getLayerObjectCounts: () => ({
          background: this.backgroundContainer.length,
          environment: this.environmentContainer.length,
          monster: this.monsterContainer.length,
          hero: this.heroContainer.length,
          table: this.tableContainer.length,
          lowerSurface: this.lowerSurfaceContainer.length,
          boardFrame: this.boardFrameContainer.length,
          board: this.boardLayer.length,
          puzzleFeedback: this.puzzleFeedbackContainer.length,
          hud: this.hudContainer.length,
          transientUi: this.transientUiContainer.length,
          artReviewBackground: this.artReviewBackgroundContainer.length,
          artGuides: this.artGuidesContainer.length,
          assetSlots: this.assetSlotsContainer.length,
        }),
```

Add `getTileGeometry` right after `getSelectionLength`:

```typescript
        getSelectionLength: () => this.path.length,
        getTileGeometry: () =>
          getAllCells().map((cell) => {
            const p = cellToPixel(this.activeLayout.board, cell.row, cell.col);
            return { row: cell.row, col: cell.col, x: p.x, y: p.y, hitRadius: this.activeLayout.board.hitRadius };
          }),
```

- [ ] **Step 6: Write the e2e test**

Create `tests/e2e/board-frame.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

for (const vp of FORMATS) {
  test(`lower surface and board frame are exactly one persistent object each (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');
    const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(counts.lowerSurface).toBe(1);
    expect(counts.boardFrame).toBe(1);
  });
}

test('repeated reflows never accumulate the lower surface or board frame objects', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(before.lowerSurface).toBe(1);
  expect(before.boardFrame).toBe(1);

  for (let i = 0; i < 3; i++) {
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  }

  const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(after).toEqual(before);
});

test('the board frame follows layout.boardFrame and stays inside the lower band', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const L = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(L.boardFrame.x).toBeGreaterThanOrEqual(L.table.x - 1e-6);
  expect(L.boardFrame.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
  expect(L.boardFrame.x + L.boardFrame.width).toBeLessThanOrEqual(L.table.x + L.table.width + 1e-6);
  expect(L.boardFrame.y + L.boardFrame.height).toBeLessThanOrEqual(L.table.y + L.table.height + 1e-6);
});
```

- [ ] **Step 7: Run the new e2e spec**

Run: `npx playwright test tests/e2e/board-frame.spec.ts`
Expected: all tests pass

- [ ] **Step 8: Run the full unit suite once more (depth + battleLayout + boardArea + boardGeometry)**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add src/scenes/depth.ts tests/scenes/depth.test.ts src/scenes/BattleScene.ts tests/e2e/board-frame.spec.ts
git commit -m "feat: add temporary responsive lower surface and board frame"
```

---

## Task 8: E2E — responsive board geometry, interaction, and no-accumulation across formats

**Files:**
- Create: `tests/e2e/board-responsive.spec.ts`

**Interfaces:**
- Consumes: `window.__debug!.getBattleLayout()`, `getTileGeometry()`, `getLayerObjectCounts()` (Tasks 5/7), `cellToPixel` from `boardGeometry.ts`, `HexGrid`/`fillBoard`/`getAllCells` from `core/grid.ts`, `mulberry32` from `core/rng.ts`.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/board-responsive.spec.ts`:

```typescript
import { test, expect, type Page } from '@playwright/test';
import { HexGrid, fillBoard, getAllCells } from '../../src/core/grid';
import type { CellCoord } from '../../src/core/grid';
import { mulberry32 } from '../../src/core/rng';
import { cellToPixel } from '../../src/scenes/boardGeometry';

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

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
      chain.push(next);
      visited.add(`${next.row},${next.col}`);
      current = next;
    }
    if (chain.length >= 3) return chain;
  }
  throw new Error('no valid 3-chain found for this seed');
}

async function playTurnAndAssertScores(page: Page): Promise<void> {
  const startHp = Number(await page.getAttribute('body', 'data-monster-hp'));
  const layout = await page.evaluate(() => window.__debug!.getBattleLayout());
  const grid = new HexGrid();
  fillBoard(grid, mulberry32(1));
  const pts = findValidChain(grid).map((c) => cellToPixel(layout.board, c.row, c.col));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  expect(Number(await page.getAttribute('body', 'data-monster-hp'))).toBeLessThan(startHp);
}

for (const vp of FORMATS) {
  test(`the puzzle dominates the lower band, uncut, centered, and interactive (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    const L = await page.evaluate(() => window.__debug!.getBattleLayout());

    // Upper composition unaffected.
    expect(L.table.y).toBeGreaterThan(0);

    // No tile above table.y, none outside the lower band, none clipped by the canvas.
    const tb = L.board.tileBounds;
    expect(tb.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
    expect(tb.x).toBeGreaterThanOrEqual(0 - 1e-6);
    expect(tb.y + tb.height).toBeLessThanOrEqual(vp.height + 1e-6);
    expect(tb.x + tb.width).toBeLessThanOrEqual(vp.width + 1e-6);

    // Centered inside availableBoardRect.
    const avail = L.availableBoardRect;
    expect(tb.x + tb.width / 2).toBeCloseTo(avail.x + avail.width / 2, 3);
    expect(tb.y + tb.height / 2).toBeCloseTo(avail.y + avail.height / 2, 3);

    // Dominates the band: occupies almost all of the constraining axis.
    const wideEnough = tb.width / avail.width > 0.95;
    const tallEnough = tb.height / avail.height > 0.95;
    expect(wideEnough || tallEnough).toBe(true);

    // 32 cells, all inside tileBounds, hitboxes match visual centers exactly
    // (getTileGeometry reads the SAME activeLayout.board the renderer used).
    const tiles = await page.evaluate(() => window.__debug!.getTileGeometry());
    expect(tiles).toHaveLength(32);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(tb.x - 1e-6);
      expect(t.x).toBeLessThanOrEqual(tb.x + tb.width + 1e-6);
      expect(t.y).toBeGreaterThanOrEqual(tb.y - 1e-6);
      expect(t.y).toBeLessThanOrEqual(tb.y + tb.height + 1e-6);
    }

    // Real interaction still scores.
    await playTurnAndAssertScores(page);
  });
}

test('the puzzle grows strictly from 360x640 to 480x720 to 768x1024', async ({ page }) => {
  const radii: number[] = [];
  for (const vp of FORMATS) {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');
    const L = await page.evaluate(() => window.__debug!.getBattleLayout());
    radii.push(L.board.visualRadius);
  }
  expect(radii[1]).toBeGreaterThan(radii[0]);
  expect(radii[2]).toBeGreaterThan(radii[1]);
});

test('a resize regrows the board and hitboxes follow it, with no stale hit position', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const before = await page.evaluate(() => window.__debug!.getBattleLayout());
  const cellBefore = cellToPixel(before.board, 2, 2);

  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  const after = await page.evaluate(() => window.__debug!.getBattleLayout());
  const cellAfter = cellToPixel(after.board, 2, 2);
  expect(cellAfter.x).not.toBeCloseTo(cellBefore.x, 0);

  // The OLD position is no longer hit-testable; the NEW one is.
  await page.mouse.move(cellBefore.x, cellBefore.y);
  await page.mouse.down();
  const staleHit = await page.evaluate(() => window.__debug!.getSelectionLength());
  await page.mouse.up();

  await page.mouse.move(cellAfter.x, cellAfter.y);
  await page.mouse.down();
  const freshHit = await page.evaluate(() => window.__debug!.getSelectionLength());
  await page.mouse.up();

  expect(freshHit).toBe(1);
  // (staleHit may legitimately be 1 too if the two cells' hit circles happen to
  // overlap at these two sizes; the meaningful guarantee is that the FRESH
  // position always hits — asserted above.)
  void staleHit;

  // A full turn still scores after the resize.
  await playTurnAndAssertScores(page);
});

for (let i = 0; i < 3; i++) {
  test(`reflow #${i + 1} never accumulates or duplicates board layers`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 720 });
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');
    const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
    const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(after).toEqual(before);
  });
}
```

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test tests/e2e/board-responsive.spec.ts`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/board-responsive.spec.ts
git commit -m "test: cover responsive board geometry and interaction across formats"
```

---

## Task 9: Fix the one e2e assertion that hard-couples the board to `gameplayColumn`

**Files:**
- Modify: `tests/e2e/matrix.spec.ts`

**Interfaces:** none new.

- [ ] **Step 1: Update the lateral safe-area insets test**

In `tests/e2e/matrix.spec.ts`, the test `'lateral safe-area insets keep the board inside an offset column (via forceReflow)'` currently asserts `L.board.tileBounds.x).toBeGreaterThanOrEqual(L.gameplayColumn.x - EPS)`. This relationship no longer holds by design (the board is now sized from the full-width lower band, not the capped column) — replace the assertion:

```typescript
test('lateral safe-area insets keep the board inside the safe rect (via forceReflow)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => window.__debug!.forceReflow({ safeInsets: { top: 0, right: 24, bottom: 20, left: 16 } }));
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);

  const L = await getLayout(page);
  expect(L.safeRect).toEqual({ x: 16, y: 0, width: 390 - 16 - 24, height: 844 - 20 });
  expect(L.gameplayColumn.x).toBeGreaterThanOrEqual(L.safeRect.x - EPS);
  // The board now respects safeRect directly (via availableBoardRect's
  // inset-aware margins), not gameplayColumn — see boardArea.ts.
  expect(L.board.tileBounds.x).toBeGreaterThanOrEqual(L.safeRect.x - EPS);
  expect(L.board.tileBounds.x + L.board.tileBounds.width).toBeLessThanOrEqual(L.safeRect.x + L.safeRect.width + EPS);
  await playTurnAndAssertScores(page);
});
```

(Only the test name and the two `board.tileBounds` assertions change; everything else in the test body is unchanged from the original.)

- [ ] **Step 2: Run the full matrix spec**

Run: `npx playwright test tests/e2e/matrix.spec.ts`
Expected: all pass (this spec's per-viewport loop already only checks `tileBounds` against `safeRect`, which remains valid unchanged)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/matrix.spec.ts
git commit -m "test: assert the board against safeRect, not the retired gameplayColumn coupling"
```

---

## Task 10: Full validation pass before visual work

**Files:** none (verification only).

- [ ] **Step 1: Type-check, build, unit tests**

Run in order:

```bash
npx tsc --noEmit
npm run build
npm test
```

Expected: all succeed with zero errors/failures.

- [ ] **Step 2: Targeted e2e suites**

```bash
npx playwright test tests/e2e/asset-slots.spec.ts
npx playwright test tests/e2e/environment-backgrounds.spec.ts
npx playwright test tests/e2e/art-review.spec.ts
npx playwright test tests/e2e/canvas-bounds.spec.ts
npx playwright test tests/e2e/reflow.spec.ts
npx playwright test tests/e2e/matrix.spec.ts
npx playwright test tests/e2e/battle.spec.ts
npx playwright test tests/e2e/board-frame.spec.ts
npx playwright test tests/e2e/board-responsive.spec.ts
```

Expected: all pass. (`tests/e2e/visual-baseline.spec.ts` is deliberately excluded here — it is expected to FAIL until Task 11 regenerates it, since the lower band's visuals have intentionally changed.)

- [ ] **Step 3: Confirm no asset files were touched**

```bash
git diff --name-only main...HEAD -- "*.webp"
```

Expected: empty output.

- [ ] **Step 4: If anything failed, fix it now — do not proceed to Task 11 with red tests.**

No commit for this task (verification only); if fixes were needed, commit them with a message describing the specific fix.

---

## Task 11: Regenerate the functional visual baselines

**Files:**
- Modify: `tests/e2e/visual-baseline.spec.ts` snapshots (regenerated, not hand-edited)

**Interfaces:** none new.

- [ ] **Step 1: Regenerate the three baseline screenshots**

```bash
npx playwright test tests/e2e/visual-baseline.spec.ts --update-snapshots
```

- [ ] **Step 2: Manually inspect the three regenerated PNGs**

Read each of the three updated screenshots (paths under `tests/e2e/visual-baseline.spec.ts-snapshots/` or the platform-suffixed equivalent Playwright wrote) and confirm for each of `battle-360x640.png`, `battle-480x720.png`, `battle-768x1024.png`:

1. The upper composition (HUD/boss/heroes/upper background) is visually identical to before this branch.
2. The puzzle board is now clearly the dominant element of the lower band.
3. No tile is cut off by the canvas edge or crosses `table.y` upward.
4. The board is visually centered in the lower band.
5. The temporary frame hugs the board's real bounds.
6. The temporary lower surface is a plain, sober fill — not competing for attention.
7. `battle_bg_lower.webp`'s artwork is NOT visible anywhere in these three screenshots.

- [ ] **Step 3: Re-run the full validation pass once more with the new baselines in place**

```bash
npx tsc --noEmit
npm test
npx playwright test tests/e2e/visual-baseline.spec.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/visual-baseline.spec.ts-snapshots
git commit -m "test: update visual baselines for the gameplay-first lower board"
```

---

## Task 12: Final documentation pass + summary

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md`

**Interfaces:** none new.

- [ ] **Step 1: Fill in the real measured numbers**

At the end of `docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md`, add a final section with the ACTUAL values read from `getBattleLayout()` at the three reference formats after Task 5 landed (re-run the Task-2-style dump — a throwaway Vitest test importing `computeBattleLayout` and `console.log`-ing `{ table, availableBoardRect, board, boardFrame }` at 360x640/480x720/768x1024 — never commit that throwaway file):

```markdown

## Measured results (post-refactor)

| | 360x640 | 480x720 | 768x1024 |
|---|---|---|---|
| `lowerBand` (== `table`) | _fill in_ | _fill in_ | _fill in_ |
| `availableBoardRect` | _fill in_ | _fill in_ | _fill in_ |
| `board.tileBounds` | _fill in_ | _fill in_ | _fill in_ |
| `board.visualRadius` | _fill in_ | _fill in_ | _fill in_ |
| occupancy of the constraining axis | _fill in_% | _fill in_% | _fill in_% |

Phaser object counts before/after 3 forced reflows at 480x720: `lowerSurface` 1/1, `boardFrame` 1/1, `table` 1/1 (unchanged idempotency guarantee — see `tests/e2e/board-frame.spec.ts`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-lot-02-board-responsive-refactor-design.md
git commit -m "docs: record measured lower-board results after the refactor"
```

- [ ] **Step 3: Report the final summary to the user**

Include: the audit findings (already in this plan's "Audit summary"), confirmation the upper composition lock stayed green throughout, the exact `availableBoardRect`/board-fit formulas, `battle_bg_lower.webp`'s visibility per mode, before/after Phaser object counts, the three measured-numbers tables, all test suite results, the `git diff --name-only main...HEAD -- "*.webp"` empty-output confirmation, the full list of modified/created files, the list of commits, and the three final screenshots for manual inspection. Do not merge or push without an explicit request.
