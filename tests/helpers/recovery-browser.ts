import { expect, type Page } from '@playwright/test';
import { analyticTriangles, asciiStl } from './stl.ts';
import { configureSeam, createSeam, downloadJob } from './planning-browser.ts';

export const recoveryPlate = Buffer.from(asciiStl(analyticTriangles));
export async function createRecoverablePlan(page: Page, inspect = true) {
  await page.goto(inspect ? '/?inspect=1' : '/');
  await page.getByLabel('Import STL file').setInputFiles({ name: 'recovery-plate.stl', mimeType: 'application/octet-stream', buffer: recoveryPlate });
  await page.getByRole('radio', { name: 'cm', exact: true }).check();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await createSeam(page, [[0, 0, 5], [0.05, 0, 5], [0.05, 20, 5]], 'Root pass with short segment');
  await configureSeam(page, '5', '80', '20');
  await createSeam(page, [[-5, -10, 5], [20, -10, 5]], 'Second pass');
  await configureSeam(page, '10', '100', '24');
  await page.getByRole('button', { name: 'Move Second pass earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const saved = await downloadJob(page);
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  return saved;
}

export async function stageRestore(page: Page, text: string, stl = recoveryPlate, filename = 'renamed-original.stl') {
  await page.getByRole('button', { name: 'Restore Plan', exact: true }).click();
  await page.getByLabel('Original STL', { exact: true }).setInputFiles({ name: filename, mimeType: 'application/octet-stream', buffer: stl });
  await page.getByLabel('Saved weld-job JSON', { exact: true }).setInputFiles({ name: 'saved.weld-job.v1.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const verify = page.getByRole('button', { name: 'Verify files', exact: true });
  await expect.poll(async () => await verify.isEnabled() || await page.getByRole('dialog').getByRole('alert').isVisible()).toBe(true);
  if (await verify.isEnabled()) await verify.click();
}

export async function confirmRestore(page: Page, previous: string | null = null, geometries = 7) {
  await page.getByRole('button', { name: 'Confirm & restore plan', exact: true }).click();
  await expect.poll(() => page.evaluate((old) => {
    const s = window.__weldDebug?.snapshot();
    return s && s.geometryRevision !== old && s.renderedGeometryRevision === s.geometryRevision ? s.geometries : null;
  }, previous)).toBe(geometries);
  await expect(page.getByRole('button', { name: /^Undo / })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Redo / })).toBeDisabled();
}
