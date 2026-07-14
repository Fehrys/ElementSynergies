import { test, expect } from '@playwright/test';
import { computeCoverFit } from '../../src/scenes/combatBackgroundReview';

// Covers the temporary ?artReview=combatBackground[&artGuides=1] diagnostic
// overlay (see docs/superpowers/specs/2026-07-14-combat-background-art-review-design.md).
// This mode must never alter gameplay coordinates, resize behavior, or the
// normal (non-review) rendering path — the untouched visual-baseline.spec.ts
// is the ultimate guard for that; these tests cover the mode's own surface.
//
// Every test sets an explicit viewport: Playwright's default (1280x720) is not
// the game's composition reference, matching the convention in battle.spec.ts
// / reflow.spec.ts.

test('normal mode has no art-review DOM attributes', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');
  const attrs = await page.evaluate(() => ({
    review: document.body.getAttribute('data-art-review'),
    guides: document.body.getAttribute('data-art-guides'),
    loaded: document.body.getAttribute('data-art-background-loaded'),
    ready: document.body.getAttribute('data-art-review-ready'),
  }));
  expect(attrs).toEqual({ review: null, guides: null, loaded: null, ready: null });
});

test('artReview=combatBackground activates the mode, loads the texture, and stays ready', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');

  const attrs = await page.evaluate(() => ({
    review: document.body.getAttribute('data-art-review'),
    guides: document.body.getAttribute('data-art-guides'),
    loaded: document.body.getAttribute('data-art-background-loaded'),
  }));
  expect(attrs).toEqual({ review: 'combatBackground', guides: 'false', loaded: 'true' });

  const info = await page.evaluate(() => {
    const raw = document.body.getAttribute('data-art-review-info');
    return raw ? JSON.parse(raw) : null;
  });
  expect(info).not.toBeNull();
  // Cross-check the DOM-reported fit against the same pure function, at the
  // texture's real dimensions and the 480x720 test viewport.
  const expected = computeCoverFit(info.sourceWidth, info.sourceHeight, 480, 720);
  expect(info.scale).toBeCloseTo(expected.scale, 6);
  expect(info.displayWidth).toBeCloseTo(expected.displayWidth, 6);
  expect(info.displayHeight).toBeCloseTo(expected.displayHeight, 6);
  expect(info.viewportWidth).toBe(480);
  expect(info.viewportHeight).toBe(720);
  // A cover fit must fully cover the viewport on both axes.
  expect(info.displayWidth).toBeGreaterThanOrEqual(480 - 1e-6);
  expect(info.displayHeight).toBeGreaterThanOrEqual(720 - 1e-6);
});

test('review mode masks the provisional background, environment, and table', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.background).toBe(0);
  expect(counts.environment).toBe(0);
  expect(counts.table).toBe(0);
  expect(counts.artReviewBackground).toBe(1); // the master image, created once
});

test('review mode still renders the boss, all four heroes, the full board, and the HUD', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.monster).toBeGreaterThan(0); // shadow + shape
  expect(counts.hero).toBe(8); // 4 heroes x (shadow + shape)
  expect(counts.board).toBeGreaterThanOrEqual(32); // >= 32 (special tiles add extra icon graphics)
  expect(counts.hud).toBeGreaterThan(0); // bar + text

  const board = await page.evaluate(() => window.__debug!.getBoard());
  expect(board).toHaveLength(32);
});

test('artGuides=1 adds guide objects; without it, none are added', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const withoutGuides = await page.evaluate(() => window.__debug!.getLayerObjectCounts().artGuides);
  expect(withoutGuides).toBe(0);
  expect(await page.evaluate(() => document.body.getAttribute('data-art-guides'))).toBe('false');

  await page.goto('/?seed=1&artReview=combatBackground&artGuides=1&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');
  const withGuides = await page.evaluate(() => window.__debug!.getLayerObjectCounts().artGuides);
  expect(withGuides).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.body.getAttribute('data-art-guides'))).toBe('true');
});

test('artGuides=1 without artReview does not activate the mode or draw guides', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artGuides=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(counts.artGuides).toBe(0);
  expect(counts.artReviewBackground).toBe(0);
  expect(await page.evaluate(() => document.body.getAttribute('data-art-review'))).toBeNull();
});

test('two identical reflows never duplicate the review background or guide layers', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&artGuides=1&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');

  const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());

  const revBefore = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => window.__debug!.forceReflow());
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, revBefore);
  const afterFirst = await page.evaluate(() => window.__debug!.getLayerObjectCounts());

  const revMid = await page.evaluate(() => window.__debug!.getLayoutRevision());
  await page.evaluate(() => window.__debug!.forceReflow());
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, revMid);
  const afterSecond = await page.evaluate(() => window.__debug!.getLayerObjectCounts());

  expect(afterFirst).toEqual(before);
  expect(afterSecond).toEqual(before);
});

test('a resize recomputes the cover fit without changing gameplay board geometry semantics', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&artReview=combatBackground&debug=1');
  await page.waitForSelector('[data-art-review-ready="true"]');

  const revBefore = await page.evaluate(() => window.__debug!.getLayoutRevision());
  const infoBefore = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-art-review-info')!));
  expect(infoBefore.viewportWidth).toBe(480);
  expect(infoBefore.viewportHeight).toBe(720);

  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, revBefore);

  const infoAfter = await page.evaluate(() => JSON.parse(document.body.getAttribute('data-art-review-info')!));
  expect(infoAfter.viewportWidth).toBe(360);
  expect(infoAfter.viewportHeight).toBe(640);
  expect(infoAfter.sourceWidth).toBe(infoBefore.sourceWidth);
  expect(infoAfter.sourceHeight).toBe(infoBefore.sourceHeight);

  const expected = computeCoverFit(infoAfter.sourceWidth, infoAfter.sourceHeight, 360, 640);
  expect(infoAfter.scale).toBeCloseTo(expected.scale, 6);
  expect(infoAfter.displayWidth).toBeGreaterThanOrEqual(360 - 1e-6);
  expect(infoAfter.displayHeight).toBeGreaterThanOrEqual(640 - 1e-6);

  // The review overlay never touches board geometry: still the full 32-cell board.
  const board = await page.evaluate(() => window.__debug!.getBoard());
  expect(board).toHaveLength(32);
});
