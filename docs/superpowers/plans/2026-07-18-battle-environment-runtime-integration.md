# Lot 2 — Battle environment runtime integration — implementation plan

**Goal:** Load `battle_bg_upper.webp` / `battle_bg_lower.webp` into the normal
`BattleScene`, replacing the flat background/environment/table placeholders,
confined to their bands via `GeometryMask`, with zero gameplay change and
zero binary asset modification.

**Architecture:** see the design doc,
`docs/superpowers/specs/2026-07-18-battle-environment-runtime-integration-design.md`.

## Global constraints

- Gameplay is never touched: `layout.table.y`, boss/hero/HUD positions, the
  32-cell grid, `tileBounds`, the 360×640/480×720/768×1024 responsive policy.
- Neither WebP file is created, resized, cropped, re-encoded, or renamed.
- Reuse `computeCoverFit`, `computeBattleEnvironmentLayout`,
  `placementToRect`, the manifest — no duplicated math, no hardcoded paths
  outside the manifest.
- `assetSlots=1` and `artReview=combatBackground` keep behaving exactly as
  today (already-passing tests in `asset-slots.spec.ts` / `art-review.spec.ts`
  must still pass unmodified).

---

### Task 1: Load and render the two backgrounds in `BattleScene`

**Files:** Modify `src/scenes/BattleScene.ts`

- [ ] Import `environmentAssetByRole` alongside the existing
      `BATTLE_ENVIRONMENT_ASSETS` import.
- [ ] `preload()`: after the existing art-review conditional load, loop
      `BATTLE_ENVIRONMENT_ASSETS` and `this.load.image(def.key, def.path)`
      for every `status === 'available'` entry.
- [ ] Add a private field
      `environmentBackgrounds: Partial<Record<BattleEnvironmentRole, { sprite: Phaser.GameObjects.Image; maskShape: Phaser.GameObjects.Graphics }>> = {}`.
- [ ] Add `private drawEnvironmentBackground(role, container): void`:
  - No-ops (container `removeAll(true)`, drop the role's map entry) when
    `artReviewMode === 'combatBackground'` or the manifest entry for `role`
    isn't `status === 'available'`.
  - Otherwise: lazily create the sprite (`origin(0.5, 0.5)`, added to
    `container` once) and its mask `Graphics`
    (`this.make.graphics({}, false)`, `sprite.setMask(shape.createGeometryMask())`)
    on first call only.
  - Every call: recompute `rect = placementToRect(computeBattleEnvironmentLayout(this.activeLayout)[role])`,
    `fit = computeCoverFit(def.productionSize.width, def.productionSize.height, rect.width, rect.height)`,
    `sprite.setDisplaySize(fit.displayWidth, fit.displayHeight)`,
    `sprite.setPosition(rect.x + fit.x, rect.y + fit.y)`, and redraw the mask
    shape (`clear()`, `fillStyle(0xffffff,1)`, `fillRect(rect.x, rect.y, rect.width, rect.height)`).
- [ ] Replace `drawBackground()`'s body with
      `this.drawEnvironmentBackground('battleBackgroundUpper', this.backgroundContainer)`
      (delete the old gradient/ellipse Graphics code).
- [ ] Replace `drawTable()`'s body with
      `this.drawEnvironmentBackground('battleBackgroundLower', this.tableContainer)`
      (delete the old flat-rect Graphics code).
- [ ] Replace `drawEnvironment()`'s body with just
      `this.environmentContainer.removeAll(true);` (delete the cupboard/cookware
      Graphics code) and update its comment to explain the retirement.
- [ ] Update/trim stale comments referencing the old placeholders.

- [ ] **Run**: `npx tsc --noEmit` — expect no errors.

---

### Task 2: Unit test coverage

**Files:**
- Confirm `tests/scenes/battleEnvironmentLayout.test.ts` and
  `tests/scenes/combatBackgroundReview.test.ts` already cover the placement
  and cover-fit math this lot depends on (they do, from Lot 1 — no change
  expected). If any gap is found while implementing Task 1 (e.g. a new pure
  helper), add tests for it here.

- [ ] **Run**: `npm test` — expect all pass.

---

### Task 3: E2E coverage for the real runtime integration

**Files:** Add `tests/e2e/environment-backgrounds.spec.ts`

- [ ] Normal mode at 480×720: no console errors / failed requests for the
      two texture URLs; `window.__debug!.getLayerObjectCounts().background === 1`
      and `.table === 1` (exactly one sprite each); `environment === 0`.
- [ ] Repeated `forceReflow()` (several calls) never changes those counts
      (no accumulation).
- [ ] The three mandatory formats (360×640, 480×720, 768×1024): same
      presence/count assertions at each.
- [ ] `artReview=combatBackground` (no `assetSlots`): `background === 0`,
      `table === 0`, `environment === 0` (still masked, reusing the existing
      `art-review.spec.ts` assertion shape but re-confirmed here since the
      containers' content changed).
- [ ] `assetSlots=1` under `artReview=combatBackground`: unchanged from
      `asset-slots.spec.ts` (no edit needed there — confirm it still passes).

- [ ] **Run**: `npx playwright test tests/e2e/environment-backgrounds.spec.ts tests/e2e/asset-slots.spec.ts tests/e2e/art-review.spec.ts` — expect all pass.

---

### Task 4: Visual checkpoints and baseline update

- [ ] Start the dev server (or reuse Playwright's) and inspect
      `/?seed=1` at 360×640, 480×720, 768×1024: boss/heroes/HUD legible over
      the upper background, cutting board centered under the tiles with
      margin, no seam artifact, no leftover placeholder.
- [ ] Run `npx playwright test tests/e2e/visual-baseline.spec.ts` to see the
      diff against the committed baselines (expected to fail — placeholders
      changed to real art).
- [ ] Regenerate with `--update-snapshots`, then visually inspect each of the
      3 new PNGs before committing.

- [ ] **Run**: `npx playwright test tests/e2e/visual-baseline.spec.ts` (post-update) — expect pass.

---

### Task 5: Full validation sweep

- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run test:e2e`
- [ ] `git status`, `git diff --stat` — confirm no WebP touched, no
      out-of-scope file changed.

---

### Task 6: Commits

1. `docs: plan battle environment runtime integration`
2. `feat: render final battle environment backgrounds`
3. `test: cover responsive background integration`
4. `test: update reviewed environment visual baselines`

Do not merge or push.
