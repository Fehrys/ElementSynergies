import { test, expect } from '@playwright/test';

// The canvas must stay unscaled at the viewport origin so that absolute
// cellToPixel coordinates map 1:1 to viewport pixels. If this ever fails,
// pointer accuracy in battle.spec.ts is silently compromised.
test('the game canvas stays unscaled at viewport origin (480x720)', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1');
  await page.waitForSelector('[data-scene="battle"]');

  const box = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('no canvas element');
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(480);
  expect(box.height).toBe(720);
});
