import { test, expect } from '@playwright/test';

// Locks the 480x720 composition pixel-for-pixel for the whole responsive refactor.
// Captured in M0 against the STARTING commit's production code so no later regression
// can define the reference. M1-M6 only compare; only M7 adds (never regenerates)
// responsive sizes.
test('battle composition at 480x720 matches the committed baseline', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');
  await expect(page).toHaveScreenshot('battle-480x720.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0, // renderer + Phaser are pinned during this work -> zero-tolerance target
  });
});
