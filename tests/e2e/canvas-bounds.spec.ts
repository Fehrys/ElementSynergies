import { test, expect } from '@playwright/test';

// Under Scale.RESIZE the canvas fills the viewport at the origin at any size,
// so game-space coordinates equal CSS px (pointer accuracy depends on it). If
// this ever fails, clicks driven from the runtime layout are silently offset.
for (const vp of [
  { width: 480, height: 720 },
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
]) {
  test(`canvas fills the viewport at the origin (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1');
    await page.waitForSelector('[data-scene="battle"]');
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) throw new Error('no canvas element');
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(vp.width);
    expect(box.height).toBe(vp.height);
  });
}
