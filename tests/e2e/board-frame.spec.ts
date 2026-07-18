import { test, expect } from '@playwright/test';

const FORMATS = [
  { width: 360, height: 640 },
  { width: 480, height: 720 },
  { width: 768, height: 1024 },
];

for (const vp of FORMATS) {
  test(`lower surface and board frame are exactly one persistent object each (${vp.width}x${vp.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto('/?seed=1&debug=1');
    await page.waitForSelector('[data-scene="battle"]');
    const counts = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
    expect(counts.lowerSurface).toBe(1);
    expect(counts.boardFrame).toBe(1);
  });
}

test('repeated reflows never accumulate the lower surface or board frame objects', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const before = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(before.lowerSurface).toBe(1);
  expect(before.boardFrame).toBe(1);

  for (let i = 0; i < 3; i++) {
    const rev = await page.evaluate(() => window.__debug!.getLayoutRevision());
    await page.evaluate(() => window.__debug!.forceReflow());
    await page.waitForFunction((r) => window.__debug!.getLayoutRevision() > r, rev);
  }

  const after = await page.evaluate(() => window.__debug!.getLayerObjectCounts());
  expect(after).toEqual(before);
});

test('the board frame follows layout.boardFrame and stays inside the lower band', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/?seed=1&debug=1');
  await page.waitForSelector('[data-scene="battle"]');
  const L = await page.evaluate(() => window.__debug!.getBattleLayout());
  expect(L.boardFrame.x).toBeGreaterThanOrEqual(L.table.x - 1e-6);
  expect(L.boardFrame.y).toBeGreaterThanOrEqual(L.table.y - 1e-6);
  expect(L.boardFrame.x + L.boardFrame.width).toBeLessThanOrEqual(L.table.x + L.table.width + 1e-6);
  expect(L.boardFrame.y + L.boardFrame.height).toBeLessThanOrEqual(L.table.y + L.table.height + 1e-6);
});
