import { test, expect } from '@playwright/test';
import { computeBattleLayout, DEFAULT_BATTLE_LAYOUT_POLICY } from '../../src/scenes/battleLayout';
import { computeBattleEnvironmentLayout } from '../../src/scenes/battleEnvironmentLayout';

// Covers the lot-01 &assetSlots=1 extension of the combatBackground art review
// mode (see docs/superpowers/specs/2026-07-14-lot-01-environment-production-setup-design.md).
// The overlay must be fully inert outside `artReview=combatBackground&assetSlots=1`,
// and its six rects must come exclusively from the pure battleEnvironmentLayout
// model — which these tests recompute in plain Node and compare byte-for-byte
// against the serialized DOM surface. The untouched visual-baseline.spec.ts
// remains the ultimate guard that normal rendering is unchanged.

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// The slots container holds 1 Graphics + 6 labels when active.
const ACTIVE_SLOT_OBJECT_COUNT = 7;

function expectedEnvLayout(width: number, height: number) {
  return computeBattleEnvironmentLayout(
    computeBattleLayout({ width, height, safeInsets: noInsets }, DEFAULT_BATTLE_LAYOUT_POLICY),
  );
}

test('assetSlots=1 inside the review mode activates the six slot guides', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&assetSlots=1&debug=1');
  await page.waitForSelector('[data-asset-slots-ready="true"]');

  expect(await page.evaluate(() => document.body.getAttribute('data-asset-slots'))).toBe('true');
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.assetSlots).toBe(ACTIVE_SLOT_OBJECT_COUNT);

  // The serialized layout equals the pure model recomputed in Node (same math,
  // zero safe-area insets in the test browser, JSON round-trip is lossless).
  const serialized = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
  expect(serialized).toEqual(expectedEnvLayout(480, 720));
});

test('normal mode carries no asset-slot attributes or objects', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const attrs = await page.evaluate(() => ({
    slots: document.body.getAttribute('data-asset-slots'),
    ready: document.body.getAttribute('data-asset-slots-ready'),
    layout: document.body.getAttribute('data-asset-slots-layout'),
  }));
  expect(attrs).toEqual({ slots: null, ready: null, layout: null });
  expect(await page.evaluate(() => window.__debug!.getLayerObjectCounts().assetSlots)).toBe(0);
});

test('artReview=combatBackground without assetSlots draws no slot guides', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const attrs = await page.evaluate(() => ({
    slots: document.body.getAttribute('data-asset-slots'),
    ready: document.body.getAttribute('data-asset-slots-ready'),
    layout: document.body.getAttribute('data-asset-slots-layout'),
  }));
  expect(attrs).toEqual({ slots: null, ready: null, layout: null });
  expect(await page.evaluate(() => window.__debug!.getLayerObjectCounts().assetSlots)).toBe(0);
});

test('assetSlots=1 without artReview stays fully inert', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&assetSlots=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  expect(await page.evaluate(() => document.body.getAttribute('data-asset-slots'))).toBeNull();
  expect(await page.evaluate(() => document.body.getAttribute('data-asset-slots-ready'))).toBeNull();
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.assetSlots).toBe(0);
  expect(counts.artReviewBackground).toBe(0);
});

test('a resize recomputes the six slots from the new layout', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&assetSlots=1&debug=1');
  await page.waitForSelector('[data-asset-slots-ready="true"]');
  const before = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
  expect(before).toEqual(expectedEnvLayout(480, 720));

  const revBefore = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, revBefore);

  const after = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-asset-slots-layout')!));
  expect(after).toEqual(expectedEnvLayout(360, 640));
});

test('repeated reflows never accumulate slot guide objects', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&assetSlots=1&debug=1');
  await page.waitForSelector('[data-asset-slots-ready="true"]');
  const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(before.assetSlots).toBe(ACTIVE_SLOT_OBJECT_COUNT);

  for (let i = 0; i < 2; i++) {
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  }
  const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(after).toEqual(before);
});
