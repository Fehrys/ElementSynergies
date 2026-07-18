import { test, expect, type Page } from '@playwright/test';

// Covers the Lot 2 runtime integration of the two Lot 1 combat-environment
// backgrounds (see
// docs/superpowers/specs/2026-07-18-battle-environment-runtime-integration-design.md).
// tests/e2e/asset-slots.spec.ts and tests/e2e/art-review.spec.ts already
// cover the diagnostic overlay/review-mode surfaces and are left untouched;
// this spec covers the REAL textures loaded and rendered in normal play.
// tests/e2e/visual-baseline.spec.ts remains the ultimate pixel-level guard.

function collectPageErrors(page: Page): { errors: string[]; failedRequests: string[] } {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`));
  return { errors, failedRequests };
}

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

for (const vp of FORMATS) {
  test(`normal mode loads and renders both backgrounds with no errors (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    const { errors, failedRequests } = collectPageErrors(page);
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    expect(failedRequests, `Failed network requests: ${failedRequests.join(', ')}`).toEqual([]);
    expect(errors, `Console/page errors: ${errors.join(', ')}`).toEqual([]);

    const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    // Exactly one persistent sprite per background container; the retired
    // cupboard/cookware placeholder container stays empty.
    expect(counts.background).toBe(1);
    expect(counts.table).toBe(1);
    expect(counts.environment).toBe(0);

    // Both texture keys from the manifest are genuinely loaded by Phaser
    // (not silently skipped), via the same ?debug=1 surface every other e2e
    // spec in this suite already relies on.
    const textureKeys = await page.evaluate(() => [
      window.__debug!.hasTexture('battle-env-bg-upper'),
      window.__debug!.hasTexture('battle-env-bg-lower'),
    ]);
    expect(textureKeys).toEqual([true, true]);
  });
}

test('repeated reflows never accumulate or recreate the background sprites', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(before.background).toBe(1);
  expect(before.table).toBe(1);

  for (let i = 0; i < 3; i++) {
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  }

  const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(after).toEqual(before);
});

test('a real resize keeps exactly one sprite per band across all three mandatory formats', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');

  for (const vp of FORMATS) {
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.setViewportSize(vp);
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
    const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(counts.background).toBe(1);
    expect(counts.table).toBe(1);
  }
});

test('artReview=combatBackground still masks both real backgrounds (no double-rendering against the master reference)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.background).toBe(0);
  expect(counts.table).toBe(0);
  expect(counts.artReviewBackground).toBe(1);
});

// 2026-07-18 Lot 2 review fix: the lower background used to render at
// DEPTH.TABLE (40) — ABOVE the heroes (DEPTH.HERO, 31) — so once it became a
// full opaque painting instead of a thin table-edge lip, it could visually
// swallow the heroes whenever their footprint drifted into the lower band
// (observed at 768x1024). DEPTH.TABLE now sits below MONSTER/HERO/BOARD.
for (const vp of FORMATS) {
  test(`the lower background renders strictly behind the heroes, boss, and board (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');

    const depths = await page.evaluate(() => window.__debug!.getContainerDepths());
    expect(depths.table).toBeLessThan(depths.hero);
    expect(depths.table).toBeLessThan(depths.monster);
    expect(depths.table).toBeLessThan(depths.board);
    // 2026-07-18 Lot 2 (reverses the 2026-07-19 ordering): the upper
    // background must render strictly BEHIND the lower band now, since the
    // puzzle board defines the lower band and is the dominant element — any
    // sub-pixel mask-edge imprecision at the shared seam falls harmlessly
    // behind the lower band's own visuals instead of painting over them.
    expect(depths.background).toBeLessThan(depths.table);

    // All four heroes (shadow + shape each) are actually drawn, not silently
    // dropped — the object-count-level companion to the depth check above.
    const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(counts.hero).toBe(8);
  });
}

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
