import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Vec3 } from '../../src/domain/contracts.ts';
import { validateWeldJob } from '../../src/export/job.ts';

/** Test-side projection of the analytic plate in the documented reset camera.
 * Uses no application store, debug API, picker or coordinate utility. Clicks still
 * go through real DOM events, WebGL geometry and the production surface picker. */
export async function plateScreenPoint(page: Page, point: Vec3) {
  const rect = await page.locator('canvas').boundingBox();
  if (!rect) throw new Error('Viewport canvas is not visible.');
  const aspect = rect.width / rect.height;
  const vertical = 40 * Math.PI / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const camera = new PerspectiveCamera(40, aspect, 0.0001, 5000);
  camera.up.set(0, 0, 1);
  camera.position.set(1.2, -1.6, 1.1).normalize().multiplyScalar(0.56 / Math.sin(Math.min(vertical, horizontal) / 2));
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const projected = new Vector3(point[0] - 10, point[1] - 10, point[2] - 5).divideScalar(Math.hypot(40, 60)).project(camera);
  return { x: rect.x + (projected.x + 1) * rect.width / 2, y: rect.y + (1 - projected.y) * rect.height / 2 };
}

export async function clickPlate(page: Page, point: Vec3) {
  const screen = await plateScreenPoint(page, point);
  await page.mouse.click(screen.x, screen.y);
}

export async function createSeam(page: Page, points: Vec3[], name: string) {
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  for (let i = 0; i < points.length; i++) {
    await clickPlate(page, points[i]!);
    await expect(page.getByTestId('draft-count')).toHaveText(String(i + 1));
  }
  await page.getByRole('button', { name: /Finish seam/ }).click();
  await page.getByLabel('Seam name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('button', { name: `Select ${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

export async function configureSeam(page: Page, speed: string, current: string, voltage: string) {
  await page.getByLabel('Travel speed').fill(speed);
  await page.getByLabel('Current target').fill(current);
  await page.getByLabel('Voltage target').fill(voltage);
  await page.getByRole('button', { name: 'Apply parameters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply parameters', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review & Export', exact: true })).toBeEnabled();
}

export async function downloadJob(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download weld job', exact: true }).click();
  const download = await downloadEvent;
  const file = await download.path();
  if (!file) throw new Error('Downloaded JSON is unavailable.');
  const text = await readFile(file, 'utf8');
  return { job: validateWeldJob(JSON.parse(text)), text, filename: download.suggestedFilename() };
}

export async function visiblePointCoordinates(page: Page): Promise<number[][]> {
  const details = page.locator('.point-inspector');
  if (!await details.evaluate((element) => (element as HTMLDetailsElement).open)) await details.locator('summary').click();
  return page.getByTestId('path-point').locator('code').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('title')!.split(', ').map(Number)));
}
