# Combat Background Art Review — Implementation Plan

**Companion design doc:** `docs/superpowers/specs/2026-07-14-combat-background-art-review-design.md`

**Goal:** ship a temporary `?artReview=combatBackground[&artGuides=1]` review
mode that overlays real gameplay on `design/references/combat-background-target.png`,
without changing any production coordinate, depth, or normal-mode pixel output.

**Validation gate for the whole plan:**

```bash
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
```

All four must be green, with the three committed visual baselines
(`battle-360x640.png`, `battle-480x720.png`, `battle-768x1024.png`) unchanged
and **not regenerated**.

---

## Step 1 — Enable the asset import

- Create `src/vite-env.d.ts`:
  ```ts
  /// <reference types="vite/client" />
  ```
  (needed so `tsc --noEmit` resolves `*.png?url` imports via Vite's ambient
  `declare module '*?url'`; nothing else in the repo currently references
  `vite/client`).
- Verify: `npx tsc --noEmit` still passes with an unused test import added
  temporarily, then remove it (or just proceed to Step 2, which exercises it
  for real).

## Step 2 — Pure module `combatBackgroundReview.ts`, test-first

- [ ] Write `tests/scenes/combatBackgroundReview.test.ts` first (TDD):
  - `parseArtReviewMode`: `'?artReview=combatBackground'` → `'combatBackground'`;
    `''`, `'?artReview=foo'`, `'?artReview=combatbackground'` (case-sensitive) → `'none'`.
  - `parseArtGuides`: `'?artGuides=1'` → `true`; `''`, `'?artGuides=0'`,
    `'?artGuides=true'` → `false`.
  - `computeCoverFit` — four cases from the brief:
    1. source 300×400 (3:4) → viewport 480×720: `scale=1.8`, `displayWidth=540`,
       `displayHeight=720`, `cropX=60`, `cropY=0`, `x=240`, `y=360`.
    2. source 300×400 → viewport 360×640: `scale=1.6`, `displayWidth=480`,
       `displayHeight=640`, `cropX=120`, `cropY=0`.
    3. source 300×400 → viewport 768×1024: `scale=2.56`, `displayWidth=768`,
       `displayHeight=1024`, `cropX=0`, `cropY=0` (this ratio happens to match,
       which is a valid degenerate case of `cover`).
    4. source and viewport of identical ratio, e.g. 200×300 → 400×600:
       `scale=2`, no crop on either axis.
  - Run `npx vitest run tests/scenes/combatBackgroundReview.test.ts` → confirm
    it FAILS (module doesn't exist yet).
- [ ] Implement `src/scenes/combatBackgroundReview.ts` per the design doc:
  `ArtReviewMode`, `parseArtReviewMode`, `parseArtGuides`, `CoverFit`,
  `computeCoverFit`. Phaser-free, DOM-free (`search`/numbers only).
- [ ] Run the test file again → PASS.

## Step 3 — Wire into `BattleScene`

- [ ] Add the asset import and a texture key constant near the top of
  `BattleScene.ts`:
  ```ts
  import combatBackgroundTargetUrl from '../../design/references/combat-background-target.png?url';
  import { parseArtReviewMode, parseArtGuides, computeCoverFit } from './combatBackgroundReview';
  import type { ArtReviewMode } from './combatBackgroundReview';

  const ART_REVIEW_BACKGROUND_KEY = 'combat-background-target';
  ```
- [ ] Add instance fields: `artReviewMode: ArtReviewMode = 'none'`,
  `artGuidesEnabled = false`, `artReviewBackgroundContainer!: Phaser.GameObjects.Container`,
  `artGuidesContainer!: Phaser.GameObjects.Container`,
  `artReviewBackgroundSprite?: Phaser.GameObjects.Image`.
- [ ] Add `init(): void` reading both flags from `window.location.search` — the
  first thing the scene does, before `preload()`/`create()`.
- [ ] Add `preload(): void` that queues the image load iff
  `this.artReviewMode === 'combatBackground'`.
- [ ] In `create()`:
  - create the two new containers alongside the existing nine, at the depths
    from the design doc (`DEPTH.BACKGROUND` and `DEPTH.DEBUG`);
  - leave the rest of `create()` untouched (same `applyLayout()` call site).
- [ ] Branch the three masking methods (`drawBackground`, `drawEnvironment`,
  `drawTable`) exactly as designed: clear-and-return when
  `artReviewMode === 'combatBackground'`, otherwise unchanged existing body.
- [ ] Add `drawArtReviewBackground()` and `drawArtGuides()` per the design doc;
  call both from `applyLayout()`, after `drawTable()`/`drawBoard()` and after
  `drawHp()`/`drawCharacterPlaceholders()` respectively, matching the depth
  order in the design doc.
- [ ] At the end of `create()`, after the existing
  `document.body.setAttribute('data-scene', 'battle')` line, set the
  review-mode DOM attributes (only when `artReviewMode !== 'none'`):
  `data-art-review`, `data-art-guides`, `data-art-background-loaded`,
  `data-art-review-info`, `data-art-review-ready="true"`.
- [ ] `npx tsc --noEmit` clean.

## Step 4 — Manual smoke check

- [ ] `npm run dev`, open:
  - `http://localhost:5173/?seed=1` — must look byte-for-byte like before.
  - `http://localhost:5173/?seed=1&artReview=combatBackground`
  - `http://localhost:5173/?seed=1&artReview=combatBackground&artGuides=1`
- [ ] Confirm visually: master image covers viewport, no provisional bg/env/table,
  boss+heroes+board+HUD render at their normal spots, guides only in the third URL.

## Step 5 — Playwright coverage

- [ ] Add `tests/e2e/art-review.spec.ts` covering (per the design doc's test
  list): mode activation, texture loaded (`data-art-background-loaded`),
  background rendered behind gameplay, provisional bg/env/table absent (via
  `getLayerObjectCounts()` extended to report `artReviewBackground`/`artGuides`,
  or by asserting `environment`/`table` counts are 0 in review mode), boss +
  4 heroes + board(32 cells) + HUD present, `artGuides=1` adds guide objects,
  guides absent without the flag, two reflows (`setViewportSize` twice) don't
  change object counts, a resize recomputes the cover fit (`data-art-review-info`
  changes), a resize doesn't alter `getBattleLayout()` beyond what a normal
  resize already does, and normal mode (`?seed=1`) is unaffected (existing
  `battle.spec.ts` / `reflow.spec.ts` already re-run unmodified as the guard).
- [ ] Extend `DebugApi`/`getLayerObjectCounts()` minimally if needed so the
  new containers are inspectable under `?debug=1` — additive only, no change
  to existing keys' meaning.
- [ ] `npm run test:e2e` green, including the untouched
  `visual-baseline.spec.ts` (no `--update-snapshots`).

## Step 6 — Export the two review PNGs

- [ ] Add a small one-off Playwright spec (or extend `art-review.spec.ts` with
  two dedicated `test()`s) that navigates to the two review URLs at exactly
  480×720, waits for `[data-art-review-ready="true"]`, and screenshots the
  page (not a named-snapshot assertion — an explicit file write via
  `page.screenshot({ path })`) to:
  - `design/production/combat/lot-01-environment/review/combat-background-review-480x720.png`
  - `design/production/combat/lot-01-environment/review/combat-background-guides-480x720.png`
- [ ] Verify both PNGs are exactly 480×720 and non-empty.

## Step 7 — Full gate + commits

- [ ] `npx tsc --noEmit && npm run build && npm test && npm run test:e2e` — all
  green; the three committed baselines unchanged.
- [ ] `git status` — confirm the diff is limited to: `src/vite-env.d.ts`,
  `src/scenes/combatBackgroundReview.ts`, `src/scenes/BattleScene.ts`,
  `tests/scenes/combatBackgroundReview.test.ts`, `tests/e2e/art-review.spec.ts`,
  the two new PNGs, plus the two new docs — **no** change under
  `src/scenes/battleLayout.ts`, `boardGeometry.ts`, `compositionLayout.ts`,
  `depth.ts`, `main.ts`, or any `tests/e2e/*-snapshots/` baseline.
- [ ] Commit 1: `feat: add combat background art review mode`
      (vite-env.d.ts, combatBackgroundReview.ts, BattleScene.ts changes).
- [ ] Commit 2: `test: cover combat background review rendering`
      (combatBackgroundReview.test.ts, art-review.spec.ts, the two review PNGs).
- [ ] Do not merge. Stop for art review.
