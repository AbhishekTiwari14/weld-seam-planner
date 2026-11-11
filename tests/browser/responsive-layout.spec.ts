import { expect, test } from '@playwright/test';

const sizes = [
  { width: 1440, height: 900 }, { width: 1366, height: 768 },
  { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 390, height: 844 },
];

test('landing content has one page scroll and reachable sample actions at desktop and mobile sizes', async ({ page }, info) => {
  await page.goto('/');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect(page.locator('.sample-card')).toHaveCount(3);
    const layout = await page.evaluate(() => {
      const nestedScrollers = [...document.querySelectorAll<HTMLElement>('.empty-workspace *')].filter((element) => {
        const style = getComputedStyle(element);
        return /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      }).map((element) => element.className);
      return { nestedScrollers, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    expect(layout.nestedScrollers).toEqual([]);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    if (size.width >= 1280) {
      const cards = await page.locator('.empty-samples-card .sample-card').evaluateAll((elements) => elements.map((element) => {
        const card = element.getBoundingClientRect();
        const button = element.querySelector('button')!.getBoundingClientRect();
        return { height: card.height, buttonTop: button.top };
      }));
      expect(Math.max(...cards.map((card) => card.height)) - Math.min(...cards.map((card) => card.height))).toBeLessThan(1);
      expect(Math.max(...cards.map((card) => card.buttonTop)) - Math.min(...cards.map((card) => card.buttonTop))).toBeLessThan(1);
    }
    for (const button of await page.locator('.empty-samples-card .sample-card-action button').all()) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    }
    await page.screenshot({ path: info.outputPath(`landing-${size.width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm & open model' })).toBeInViewport({ ratio: 1 });
});

test('planning viewport stays usable and panels remain reachable across target sizes', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const viewport = page.getByLabel('3D workpiece viewport');
    await viewport.scrollIntoViewIfNeeded();
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(300);
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: /Fit model/ }).click();
    const add = page.getByRole('button', { name: 'Add seam', exact: true });
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`planning-${size.width}.png`), fullPage: true });
  }
});
