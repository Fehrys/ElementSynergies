# Lot 1 Environment Asset Production Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the production contract, TypeScript manifest, pure responsive slot layout, and `&assetSlots=1` review overlay for the six Lot 1 combat-environment assets — with zero change to normal rendering and no graphic asset created.

**Architecture:** A new pure module `src/scenes/battleEnvironmentLayout.ts` derives six `AssetPlacement`s from an already-computed `BattleLayout` (never feeding back into it); an inert data manifest `src/assets/battleEnvironmentAssets.ts` names the six future files; `BattleScene` gains one always-empty-unless-active `assetSlotsContainer` drawn by an idempotent `drawAssetSlots()` following the exact `drawArtGuides()` pattern.

**Tech Stack:** Phaser 4 + TypeScript + Vite; Vitest (`tests/scenes/**`); Playwright (`tests/e2e/**`).

## Global Constraints

- Normal (no query param) rendering stays pixel-identical: `battle-360x640.png`, `battle-480x720.png`, `battle-768x1024.png` baselines pass with NO `--update-snapshots`.
- `?artReview=combatBackground` WITHOUT `assetSlots=1` stays unchanged.
- Never modify: puzzle rules, 32 cells, 7-column 5/4 shape, boss/hero/HUD positions, combat/prep separation, board vertical offset, 3-px column-spacing reduction, touch zones, resize behavior, `design/references/combat-background-target.png`.
- No placeholder/fake image at any future asset path — `.gitkeep` only.
- No `this.load.image()` on the six future paths anywhere.
- No coordinate hand-copied from the reference image — every slot rect derives from `BattleLayout`.
- Existing captures under `design/production/combat/lot-01-environment/review/` are never replaced; new captures go in `review/slots/`.

---

### Task 1: Production tree + asset contract + lot README

**Files:**
- Create: `public/assets/battle/environment/{architecture,floor,props/left,props/right,preparation}/.gitkeep`
- Create: `design/production/combat/lot-01-environment/README.md`
- Create: `design/production/combat/lot-01-environment/ASSET_CONTRACT.md`
- Create: `design/production/combat/lot-01-environment/{source,exports}/.gitkeep`
- (Spec + this plan are committed here too.)

**Interfaces:**
- Produces: the documented contract (names, keys, anchors, depths, responsive policies) that Tasks 2–4 implement verbatim: keys `battle-env-arch-upper`, `battle-env-floor-stone`, `battle-env-left-hearth`, `battle-env-right-larder`, `battle-env-prep-table-base`, `battle-env-cutting-board`; roles `upperArchitecture | stoneFloor | leftHearth | rightLarder | prepTableBase | cuttingBoard`.

- [ ] **Step 1: Create the five `.gitkeep`s under `public/assets/battle/environment/` and the two under `design/production/combat/lot-01-environment/{source,exports}/`.**
- [ ] **Step 2: Write `README.md` (production guide: what the lot is, tree, workflow master → source/ → exports/ → public/, link to ASSET_CONTRACT.md and the review mode URL).**
- [ ] **Step 3: Write `ASSET_CONTRACT.md`** — for each of the six assets: file name, Phaser key, artistic role, file type, opaque/transparent, anchor, planned depth, logical target rect (as a formula over `BattleLayout`, e.g. "full-width band from `environment.horizonY` to `table.y`"), responsive behavior, crop behavior, must-include / must-exclude lists, layout relationship, technical validation criteria. Content per the approved spec (`docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md`).
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers design/production public/assets
git commit -m "docs: define lot 1 environment asset contract"
```

---

### Task 2: `parseAssetSlots` flag (pure)

**Files:**
- Modify: `src/scenes/combatBackgroundReview.ts` (append)
- Test: `tests/scenes/combatBackgroundReview.test.ts` (append)

**Interfaces:**
- Produces: `parseAssetSlots(search: string): boolean` — `true` iff the query string has `assetSlots=1`.

- [ ] **Step 1: Write the failing tests** (append a `describe` to the existing test file):

```ts
describe('parseAssetSlots', () => {
  it('is false with no params', () => expect(parseAssetSlots('')).toBe(false));
  it('is true for assetSlots=1', () => expect(parseAssetSlots('?assetSlots=1')).toBe(true));
  it('is false for any other value', () => expect(parseAssetSlots('?assetSlots=0')).toBe(false));
  it('composes with the review params', () =>
    expect(parseAssetSlots('?seed=1&artReview=combatBackground&assetSlots=1')).toBe(true));
});
```

- [ ] **Step 2: Run** `npx vitest run tests/scenes/combatBackgroundReview.test.ts` — expect FAIL (`parseAssetSlots` not exported).
- [ ] **Step 3: Implement** (append to `combatBackgroundReview.ts`):

```ts
// Lot 1 asset-slot overlay flag (only meaningful when the combatBackground
// review mode is also active; the scene enforces that conjunction).
export function parseAssetSlots(search: string): boolean {
  return new URLSearchParams(search).get('assetSlots') === '1';
}
```

- [ ] **Step 4: Run the test again — expect PASS.**
- [ ] **Step 5: Commit** (`feat: add assetSlots review flag parsing`).

---

### Task 3: Asset manifest (inert data)

**Files:**
- Create: `src/assets/battleEnvironmentAssets.ts`
- Test: folded into Task 4's `tests/scenes/battleEnvironmentLayout.test.ts` (vitest.config only includes `tests/core`+`tests/scenes`).

**Interfaces:**
- Produces: `BattleEnvironmentRole`, `BattleEnvironmentAssetDefinition`, `BATTLE_ENVIRONMENT_ASSETS` (readonly array of 6), `environmentAssetByRole(role)`.

- [ ] **Step 1: Write `src/assets/battleEnvironmentAssets.ts`** with the six definitions (keys/paths/formats/anchors/depths per the contract; `responsivePolicy: 'viewportCover' | 'viewportBand' | 'edgeCluster' | 'gameplayColumnObject'`; `depth` from `DEPTH`). No loader call.
- [ ] **Step 2: `npx tsc --noEmit` — expect clean.**
- [ ] **Step 3: Commit** (`feat: add battle environment asset manifest`).

---

### Task 4: Pure slot layout + unit tests

**Files:**
- Create: `src/scenes/battleEnvironmentLayout.ts`
- Test: `tests/scenes/battleEnvironmentLayout.test.ts`

**Interfaces:**
- Consumes: `computeBattleLayout`/`BattleLayout` (existing), `BATTLE_ENVIRONMENT_ASSETS` (Task 3).
- Produces: `AssetPlacement { x, y, width, height, originX, originY }` (anchor-point convention), `BattleEnvironmentLayout` (six named placements), `EnvironmentSlotPolicy`, `DEFAULT_ENVIRONMENT_SLOT_POLICY`, `placementToRect(p): Rect`, `computeBattleEnvironmentLayout(layout, policy?)`.

- [ ] **Step 1: Write the failing tests** covering the 11 required properties at 360×640, 480×720, 768×1024 (all placements finite and positive; prepTableBase === `layout.table`; cutting board centered on the gameplay column, wider than tileBounds by exactly the policy margins, and strictly narrower than the viewport on tablet; clusters flush to the left/right viewport edges; env computation mutates nothing in `BattleLayout`; stoneFloor bottom === `table.y`; two identical computations deep-equal) + manifest consistency (6 unique keys/roles, path prefix, `png ⇔ alphaRequired`, manifest anchor === placement origin).
- [ ] **Step 2: Run — expect FAIL (module missing).**
- [ ] **Step 3: Implement `battleEnvironmentLayout.ts`** — semantic sources only: `layout.background`, `layout.environment.horizonY`, `layout.table`, `layout.bands.monster.top`, `layout.board.tileBounds`, `layout.gameplayColumn`. Margins as fractions of tileBounds; cluster width `min(fraction × viewport, cap)`.
- [ ] **Step 4: Run — expect PASS. Also `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** (`feat: add responsive environment asset slot layout`).

---

### Task 5: Scene overlay (`drawAssetSlots`) + DOM surface

**Files:**
- Modify: `src/scenes/BattleScene.ts`

**Interfaces:**
- Consumes: `parseAssetSlots` (Task 2), manifest (Task 3), `computeBattleEnvironmentLayout`/`placementToRect` (Task 4).
- Produces: `assetSlotsContainer` (DEPTH.DEBUG, always created, empty unless active), `drawAssetSlots()` in `applyLayout()` after `drawArtGuides()`; DOM attrs `data-asset-slots`, `data-asset-slots-ready` (end of `create()` only), `data-asset-slots-layout` (JSON, refreshed each reflow); `getLayerObjectCounts()` gains an `assetSlots` key.

- [ ] **Step 1: Implement** following the `drawArtGuides` pattern exactly: parse in `init()`; container in `create()`; idempotent redraw (`removeAll(true)`; no-op unless `artReviewMode === 'combatBackground' && assetSlotsEnabled`); one Graphics (fill alpha ~0.18 + stroke per slot, one color per role) + six small `Text` labels (the manifest keys, 10px, diagnostic only — no panel); attrs only when active.
- [ ] **Step 2: `npx tsc --noEmit` + `npm test` — expect clean/green.**
- [ ] **Step 3: Manual smoke via dev server: `/?seed=1&artReview=combatBackground&assetSlots=1` shows six labeled rects over the master; normal URL unchanged.**
- [ ] **Step 4: Commit** (`feat: overlay environment asset slots in the combat art review mode`).

---

### Task 6: E2E coverage

**Files:**
- Create: `tests/e2e/asset-slots.spec.ts`

**Interfaces:**
- Consumes: DOM surface from Task 5; pure modules imported in Node for cross-checking (`computeBattleLayout`, `computeBattleEnvironmentLayout`).

- [ ] **Step 1: Write the spec**: activation (attrs + 7 `assetSlots` objects + serialized layout `toEqual` the pure computation); absent in normal mode; absent in `artReview=combatBackground` without the param; `assetSlots=1` without `artReview` does nothing; resize (480→360) recomputes the serialized slots to the pure 360×640 values; two `forceReflow()`s leave all layer counts identical.
- [ ] **Step 2: `npm run test:e2e` — ALL specs green including untouched `visual-baseline.spec.ts` (no snapshot regeneration).**
- [ ] **Step 3: Commit** (`test: cover environment production slot review`).

---

### Task 7: Slot review captures

**Files:**
- Create: `design/production/combat/lot-01-environment/review/slots/environment-slots-{360x640,480x720,768x1024}.png`
- Scratchpad script (not committed): Playwright capture at the three exact viewports, URL `/?seed=1&artReview=combatBackground&assetSlots=1`, waiting on `[data-asset-slots-ready="true"]`.

- [ ] **Step 1: Start the dev server, run the capture script, verify the three PNGs' exact dimensions.**
- [ ] **Step 2: Commit** (`docs: add environment slot review captures at the three reference formats`).

---

### Task 8: Full validation gate

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm test` — green (baseline was 162 tests; now more).
- [ ] `npm run test:e2e` — green, including the three visual baselines, unmodified.
- [ ] `npm run build` — succeeds.
- [ ] `git status` / diff review: no change under `design/references/`, no image file added under `public/assets/`.

## Self-Review

- Spec coverage: tree (T1), contract (T1), manifest (T3), pure layout (T4), review mode + DOM attrs (T5), captures (T7), unit tests (T4), e2e (T6), validation (T8), commits (each task). ✔
- No placeholders: full code lives in the tasks' referenced files (written at execution). ✔
- Type consistency: `AssetPlacement`/`BattleEnvironmentLayout` names used identically in Tasks 4–6. ✔
