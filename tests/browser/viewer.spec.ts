import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { analyticTriangles, asciiStl, binaryStl } from '../helpers/stl.ts';

const analytic = Buffer.from(asciiStl(analyticTriangles));
async function select(page: Page, buffer = analytic, name = 'analytic.stl') {
  await page.getByLabel('Import STL file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: /Confirm & (open|replace) model/ }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__weldDebug?.snapshot().triangles ?? 0)).toBeGreaterThan(0);
}
test.beforeEach(async ({ page }) => { await page.goto('/?inspect=1'); });

test('real rendering, source units, surface hit, camera gestures and reset', async ({ page }, info) => {
  const errors: string[] = [];
  const clockWarnings: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.text().includes('THREE.Clock')) clockWarnings.push(message.text()); });
  await page.screenshot({ path: info.outputPath('empty.png') });
  await select(page);
  await page.getByRole('radio', { name: 'cm', exact: true }).check();
  await expect(page.locator('.dimension-preview')).toContainText('400');
  await confirm(page);
  const initial = await page.evaluate(() => window.__weldDebug!.snapshot());
  expect(initial.triangles).toBe(2);
  expect(initial.geometries).toBe(1);
  const idleFrames = await page.evaluate(async () => {
    const frames: number[] = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(requestAnimationFrame);
      frames.push(window.__weldDebug!.snapshot().renderFrame);
    }
    return frames;
  });
  expect(new Set(idleFrames.slice(-5)).size).toBe(1); // Demand rendering sleeps while idle.
  expect(JSON.parse(initial.frame).source.sha256).toBe(createHash('sha256').update(analytic).digest('hex'));
  const point = await page.evaluate(() => window.__weldDebug!.project([-20, 30, 50]));
  await page.mouse.click(point.x, point.y);
  const hit = await page.evaluate(() => window.__weldDebug!.snapshot().lastHit);
  expect(hit?.pointMm[0]).toBeCloseTo(-20, 2);
  expect(hit?.pointMm[1]).toBeCloseTo(30, 2);
  expect(hit?.pointMm[2]).toBeCloseTo(50, 7);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 110, point.y + 35, { steps: 12 }); await page.mouse.up();
  const orbited = await page.evaluate(() => window.__weldDebug!.snapshot());
  expect(orbited.camera).not.toEqual(initial.camera);
  expect(orbited.renderFrame).toBeGreaterThan(initial.renderFrame);
  expect(orbited.lastHit).toEqual(hit); // Navigation did not become a surface click.
  expect(orbited.frame).toBe(initial.frame);
  await page.mouse.down({ button: 'right' }); await page.mouse.move(point.x + 160, point.y + 60, { steps: 5 }); await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -200);
  await page.getByRole('button', { name: 'Reset view' }).click();
  const reset = await page.evaluate(() => window.__weldDebug!.snapshot());
  reset.camera.forEach((value, i) => expect(value).toBeCloseTo(initial.camera[i]!, 8));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Fit model/ }).click();
  await page.screenshot({ path: info.outputPath('analytic-view.png') });
  expect(errors).toEqual([]);
  expect(clockWarnings).toEqual([]);
});

test('failed and cancelled replacements preserve active model; repeated imports release geometry', async ({ page }) => {
  await select(page); await confirm(page);
  const frame = await page.evaluate(() => window.__weldDebug!.snapshot().frame);
  await page.getByLabel('Import STL file').setInputFiles({ name: 'broken.stl', mimeType: 'text/plain', buffer: Buffer.from('not STL') });
  await expect(page.getByRole('alert')).toContainText('Could not import');
  expect(await page.evaluate(() => window.__weldDebug!.snapshot().frame)).toBe(frame);
  await select(page); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => window.__weldDebug!.snapshot().frame)).toBe(frame);
  for (let i = 0; i < 4; i++) {
    await select(page, Buffer.from(binaryStl(1, 'solid binary header')), `replacement-${i}.data`);
    await confirm(page);
    expect(await page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(1);
  }
});

test('large-offset source precision survives real worker, GPU display and raycasting', async ({ page }) => {
  await select(page, Buffer.from(asciiStl([[[1e9, -2, 3], [1e9 + 0.125, -2, 3], [1e9, -1.75, 3]]])), 'offset.stl');
  await confirm(page);
  const hit = await page.evaluate(() => {
    const p = window.__weldDebug!.project([1e9 + 0.03125, -1.9375, 3]);
    return window.__weldDebug!.pick(p.x, p.y);
  });
  expect(hit?.pointMm[0]).toBe(1e9 + 0.03125);
  expect(hit?.pointMm[1]).toBeCloseTo(-1.9375, 10);
});

test('a newer real-worker import wins and a cancelled import cannot activate', async ({ page }) => {
  await page.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    for (const name of ['older.stl', 'newest.stl']) {
      const transfer = new DataTransfer(); transfer.items.add(new File([text], name));
      input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, analytic.toString());
  await expect(page.getByRole('dialog')).toContainText('newest.stl');
  await confirm(page);
  expect(JSON.parse(await page.evaluate(() => window.__weldDebug!.snapshot().frame)).source.filename).toBe('newest.stl');
  await page.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const transfer = new DataTransfer(); transfer.items.add(new File([text], 'cancelled.stl'));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, analytic.toString());
  // Cancellation from the unit-review boundary is deterministic and terminates the real worker.
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(JSON.parse(await page.evaluate(() => window.__weldDebug!.snapshot().frame)).source.filename).toBe('newest.stl');
});

test('WebGL unavailability has a visible recovery explanation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.reload();
  await select(page);
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByRole('alert')).toContainText(/WebGL|3D rendering is unavailable/);
});
