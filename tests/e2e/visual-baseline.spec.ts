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

// M7 extends the M0/M1 480 baseline to two responsive sizes (a narrow phone and a
// tablet). Same snapshot contract: the CI runner is the reference platform; a local
// (win32) capture may regenerate locally but must not overwrite the committed CI
// baseline. These sizes DO exercise the M6 composition (widening + degradation).
for (const vp of [
  { name: 'battle-360x640.png', width: 360, height: 640 },
  { name: 'battle-768x1024.png', width: 768, height: 1024 },
]) {
  test(`battle composition at ${vp.width}x${vp.height} matches the committed baseline`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/?seed=1');
    await page.waitForSelector('[data-scene="battle"]');
    await expect(page).toHaveScreenshot(vp.name, {
      animations: 'disabled',
      maxDiffPixelRatio: 0,
    });
  });
}
