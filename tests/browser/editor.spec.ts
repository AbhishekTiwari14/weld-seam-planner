import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { analyticTriangles, asciiStl, binaryStl } from '../helpers/stl.ts';
import { clickPlate, configureSeam, createSeam, downloadJob, plateScreenPoint, visiblePointCoordinates } from '../helpers/planning-browser.ts';

const analytic = Buffer.from(asciiStl(analyticTriangles));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile(JSON.parse(readFileSync('schemas/weld-job.v1.schema.json', 'utf8')) as object);
const undo = (page: Page) => page.getByRole('button', { name: /^Undo / });
const redo = (page: Page) => page.getByRole('button', { name: /^Redo / });
const viewport = (page: Page) => page.getByRole('region', { name: '3D workpiece viewport', exact: true });
const pointIds = (page: Page) => page.getByTestId('path-point').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-point-id')!));
async function revision(page: Page) {
  return Number((await page.locator('.seam-panel-footer > span').innerText()).match(/Revision (\d+)/)![1]);
}
async function selectFile(page: Page) {
  await page.getByLabel('Import STL file').setInputFiles({ name: 'editor-plate.stl', mimeType: 'application/octet-stream', buffer: analytic });
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function openPlate(page: Page, unit = 'mm') {
  await page.goto('/?inspect=1'); await selectFile(page);
  await page.getByRole('radio', { name: unit, exact: true }).check();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect.poll(() => page.evaluate(() => {
    const s = window.__weldDebug?.snapshot();
    return s && s.geometryRevision === s.renderedGeometryRevision ? s.geometries : null;
  })).toBe(1);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
}
async function selectPoint(page: Page, index: number) {
  await visiblePointCoordinates(page);
  await page.getByRole('button', { name: `Select point ${index}`, exact: true }).click();
}
async function applyPoint(page: Page) {
  await expect(page.getByTestId('candidate-coordinates')).toBeVisible();
  await page.getByRole('button', { name: /^Apply point/ }).click();
  await expect(viewport(page)).toHaveAttribute('data-edit-mode', 'navigate');
}

test('surface replacement and insertion preserve IDs, source millimetres and exact export through undo/redo', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await openPlate(page, 'cm');
  await createSeam(page, [[-5, -10, 5], [15, -10, 5], [15, 25, 5]], 'Editable');
  await configureSeam(page, '5', '80', '20');
  const original = await visiblePointCoordinates(page), ids = await pointIds(page);
  const firstRevision = await revision(page);
  const frame = await page.evaluate(() => window.__weldDebug!.snapshot());
  await selectPoint(page, 2);
  await expect(viewport(page)).toHaveAttribute('data-highlight-ids', ids[1]!);
  await page.getByRole('button', { name: 'Replace on surface', exact: true }).click();
  await expect(viewport(page)).toHaveAttribute('data-edit-mode', 'replace');
  await clickPlate(page, [20, 0, 5]);
  expect(await revision(page)).toBe(firstRevision);
  expect(await visiblePointCoordinates(page)).toEqual(original);
  await page.screenshot({ path: info.outputPath('replace-preview.png') });
  await applyPoint(page);
  const replaced = await visiblePointCoordinates(page);
  expect(await pointIds(page)).toEqual(ids);
  replaced[1]!.forEach((value, axis) => expect(value).toBeCloseTo([200, 0, 50][axis]!, 2));
  expect(await revision(page)).toBe(firstRevision + 1);
  await undo(page).click(); expect(await visiblePointCoordinates(page)).toEqual(original);
  await redo(page).click(); expect(await visiblePointCoordinates(page)).toEqual(replaced);
  expect(await revision(page)).toBe(firstRevision + 3);
  await page.getByRole('button', { name: 'Select segment 1', exact: true }).click();
  await page.getByRole('button', { name: 'Insert point on surface', exact: true }).click();
  await clickPlate(page, [2, -4, 5]); await applyPoint(page);
  const inserted = await visiblePointCoordinates(page), insertedIds = await pointIds(page);
  expect(insertedIds).toHaveLength(4);
  expect([insertedIds[0], ...insertedIds.slice(2)]).toEqual(ids);
  expect(ids).not.toContain(insertedIds[1]);
  expect(inserted[1]![0]).toBeCloseTo(20, 2);
  await page.getByRole('button', { name: 'Remove point', exact: true }).click();
  expect(await pointIds(page)).toEqual(ids);
  await undo(page).click(); expect(await pointIds(page)).toEqual(insertedIds);
  await redo(page).click(); expect(await visiblePointCoordinates(page)).toEqual(replaced);
  await page.getByRole('button', { name: 'Reverse direction', exact: true }).click();
  expect(await pointIds(page)).toEqual([...ids].reverse());
  await page.getByRole('button', { name: 'Reverse direction', exact: true }).click();
  expect(await pointIds(page)).toEqual(ids);
  const finalRevision = await revision(page);
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const result = await downloadJob(page);
  expect(validateSchema(JSON.parse(result.text)), JSON.stringify(validateSchema.errors)).toBe(true);
  expect(result.job.revision).toBe(finalRevision);
  expect(result.job.seams[0]!.geometry.points).toEqual(ids.map((id, i) => ({ id, positionMm: replaced[i] })));
  expect(result.job.seams[0]!.parameters).toEqual({ travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 });
  expect(result.job.workpiece.source.unit).toBe('cm');
  expect((await downloadJob(page)).text).toBe(result.text);
  const finalFrame = await page.evaluate(() => window.__weldDebug!.snapshot());
  expect(finalFrame.geometryRevision).toBe(frame.geometryRevision);
  expect(finalFrame.frame).toBe(frame.frame); expect(finalFrame.camera).toEqual(frame.camera);
  expect(errors).toEqual([]);
});

test('history restores deletion, parameters and execution order; native text undo and draft cancellation stay isolated', async ({ page }) => {
  await openPlate(page);
  await createSeam(page, [[-5, -10, 5], [20, -10, 5]], 'First'); await configureSeam(page, '5', '80', '20');
  await createSeam(page, [[0, 10, 5], [20, 25, 5]], 'Second'); await configureSeam(page, '10', '90', '24');
  await page.getByRole('button', { name: 'Move Second earlier', exact: true }).click();
  await undo(page).click(); await expect(page.locator('.seam-summary strong')).toHaveText(['First', 'Second']);
  await redo(page).click(); await expect(page.locator('.seam-summary strong')).toHaveText(['Second', 'First']);
  const ids = await pointIds(page), points = await visiblePointCoordinates(page);
  const sequence = await page.locator('.seam-list > li').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-seam-id')));
  const initialRevision = await revision(page);
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Delete seam', exact: true }).click();
  await expect(page.locator('.seam-list > li')).toHaveCount(1);
  await undo(page).click();
  await page.getByRole('button', { name: 'Select Second', exact: true }).click();
  expect(await pointIds(page)).toEqual(ids); expect(await visiblePointCoordinates(page)).toEqual(points);
  await expect(page.getByLabel('Travel speed')).toHaveValue('10');
  await redo(page).click(); await expect(page.locator('.seam-list > li')).toHaveCount(1);
  await expect(page.getByLabel('Selected seam', { exact: true })).toHaveCount(0);
  await undo(page).click(); await page.getByRole('button', { name: 'Select Second', exact: true }).click();
  expect(await revision(page)).toBe(initialRevision + 4);
  await configureSeam(page, '12', '100', '25');
  await expect(redo(page)).toBeDisabled(); // New committed edit discards redo deletion.
  await undo(page).click(); await expect(page.getByLabel('Travel speed')).toHaveValue('10');
  await redo(page).click(); await expect(page.getByLabel('Travel speed')).toHaveValue('12');
  const beforeText = await revision(page);
  const name = page.getByLabel('Seam name', { exact: true });
  await name.focus(); await name.press('End'); await name.pressSequentially(' extra');
  await name.press('Control+z'); await expect(name).toHaveValue('Second');
  expect(await revision(page)).toBe(beforeText);
  await name.fill('Renamed'); await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await viewport(page).focus(); await page.keyboard.press('Control+z');
  await expect(name).toHaveValue('Second');
  await page.keyboard.press('Control+Shift+z'); await expect(name).toHaveValue('Renamed');
  await page.getByLabel('Travel speed').fill('17'); await expect(undo(page)).toBeDisabled();
  await viewport(page).focus(); await page.keyboard.press('Control+z');
  expect(await revision(page)).toBe(beforeText + 3);
  await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  const beforeDraft = await revision(page), historyTitle = await undo(page).getAttribute('title');
  await page.getByRole('button', { name: 'Add seam', exact: true }).click(); await clickPlate(page, [2, 2, 5]);
  await page.keyboard.press('Control+z'); await expect(page.getByTestId('draft-count')).toHaveText('1');
  await page.keyboard.press('Escape'); expect(await revision(page)).toBe(beforeDraft);
  expect(await undo(page).getAttribute('title')).toBe(historyTitle);
  await selectPoint(page, 1); await expect(page.getByRole('button', { name: 'Remove point', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const result = await downloadJob(page); expect(result.job.sequence).toEqual(sequence);
  const restored = result.job.seams.find((seam) => seam.name === 'Renamed')!;
  expect(restored.geometry.points).toEqual(ids.map((id, i) => ({ id, positionMm: points[i] })));
  expect(restored.parameters).toEqual({ travelSpeedMmPerS: 12, currentTargetA: 100, voltageTargetV: 25 });
});

test('invalid picks, camera gestures and cancelled replacements never commit point edits', async ({ page }) => {
  await openPlate(page);
  await createSeam(page, [[-5, -10, 5], [20, -10, 5], [20, 25, 5]], 'Protected');
  const before = await visiblePointCoordinates(page), rev = await revision(page), history = await undo(page).getAttribute('title');
  await selectPoint(page, 2); await page.getByRole('button', { name: 'Replace on surface', exact: true }).click();
  await clickPlate(page, [-5, -10, 5]);
  await expect(page.getByRole('alert')).toContainText(/coincident|coincide/i);
  await expect(page.getByRole('button', { name: /^Apply point/ })).toBeDisabled();
  const position = await plateScreenPoint(page, [0, 0, 5]);
  await page.mouse.move(position.x, position.y); await page.mouse.down();
  await page.mouse.move(position.x + 60, position.y + 30, { steps: 8 }); await page.mouse.up();
  await page.mouse.down({ button: 'right' }); await page.mouse.move(position.x + 80, position.y + 40, { steps: 6 }); await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -120); await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Apply point/ })).toBeDisabled();
  await clickPlate(page, [10, 0, 5]); await expect(page.getByRole('button', { name: /^Apply point/ })).toBeEnabled();
  const rect = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(rect.x + 8, rect.y + rect.height / 2);
  await expect(page.getByRole('alert')).toContainText('No surface');
  await expect(page.getByRole('button', { name: /^Apply point/ })).toBeDisabled();
  await clickPlate(page, [10, 0, 5]); await page.keyboard.press('Escape');
  expect(await visiblePointCoordinates(page)).toEqual(before); expect(await revision(page)).toBe(rev);
  expect(await undo(page).getAttribute('title')).toBe(history);
  await page.getByRole('button', { name: 'Select segment 1', exact: true }).click();
  await page.getByRole('button', { name: 'Insert point on surface', exact: true }).click();
  await clickPlate(page, [10, 0, 5]); await page.getByRole('button', { name: /^Cancel point edit/ }).click();
  expect(await visiblePointCoordinates(page)).toEqual(before); expect(await revision(page)).toBe(rev);
  expect(await undo(page).getAttribute('title')).toBe(history);
});

test('diagnostics target exact geometry and repeated selection/edit/history cycles release overlays', async ({ page }, info) => {
  await openPlate(page);
  await createSeam(page, [[0, 0, 5], [0.5, 0, 5], [0.5, 10, 5]], 'Inspect');
  await configureSeam(page, '5', '80', '20');
  await visiblePointCoordinates(page); const ids = await pointIds(page), rev = await revision(page);
  const originalFrame = await page.evaluate(() => window.__weldDebug!.snapshot());
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Inspect turn at point 2 in Inspect', exact: true }).click();
    await expect(viewport(page)).toHaveAttribute('data-highlight-ids', ids[1]!);
    await expect(page.getByRole('button', { name: 'Select point 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(8);
    await page.getByRole('button', { name: /^Inspect segment 1 / }).click();
    await expect(viewport(page)).toHaveAttribute('data-highlight-ids', `${ids[0]},${ids[1]}`);
    await expect(page.getByRole('button', { name: 'Select segment 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(7);
    await page.getByRole('button', { name: 'Clear highlight', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(5);
  }
  expect(await revision(page)).toBe(rev);
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Inspect segment 1 / }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(viewport(page)).toHaveAttribute('data-highlight-kind', 'segment');
  await page.screenshot({ path: info.outputPath('diagnostic-segment.png') });
  await page.getByRole('button', { name: 'Clear highlight', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await selectPoint(page, 3); await page.getByRole('button', { name: 'Replace on surface', exact: true }).click();
    await clickPlate(page, [2 + i, 15, 5]); await applyPoint(page);
    await undo(page).click(); await redo(page).click();
    await page.getByRole('button', { name: 'Clear highlight', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(5);
  }
  const after = await page.evaluate(() => window.__weldDebug!.snapshot());
  expect(after.geometryRevision).toBe(originalFrame.geometryRevision);
  expect(after.camera).toEqual(originalFrame.camera); expect(after.frame).toBe(originalFrame.frame);
});

test('failed/cancelled imports preserve both history stacks; successful replacement clears history and stale point editing', async ({ page }) => {
  await openPlate(page);
  await createSeam(page, [[0, 0, 5], [15, 15, 5]], 'Keep history');
  await page.getByRole('button', { name: 'Reverse direction', exact: true }).click(); await undo(page).click();
  const past = await undo(page).getAttribute('title'), future = await redo(page).getAttribute('title');
  const before = await visiblePointCoordinates(page);
  await selectPoint(page, 1); await page.getByRole('button', { name: 'Replace on surface', exact: true }).click();
  await clickPlate(page, [2, 2, 5]);
  await page.getByLabel('Import STL file').setInputFiles({ name: 'bad.stl', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('Could not import');
  await page.getByRole('button', { name: 'Dismiss import error' }).click();
  await selectFile(page); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('candidate-coordinates')).toBeVisible();
  await page.getByRole('button', { name: /^Cancel point edit/ }).click();
  expect(await undo(page).getAttribute('title')).toBe(past); expect(await redo(page).getAttribute('title')).toBe(future);
  expect(await visiblePointCoordinates(page)).toEqual(before);
  await redo(page).click(); expect(await visiblePointCoordinates(page)).toEqual([...before].reverse());
  await undo(page).click();
  await selectPoint(page, 1); await page.getByRole('button', { name: 'Replace on surface', exact: true }).click();
  await clickPlate(page, [2, 2, 5]);
  const old = await page.evaluate(() => window.__weldDebug!.snapshot().geometryRevision);
  await selectFile(page); await page.getByRole('radio', { name: 'mm', exact: true }).check();
  await page.getByRole('button', { name: 'Confirm & replace model' }).click();
  await expect.poll(() => page.evaluate((previous) => {
    const s = window.__weldDebug!.snapshot();
    return s.geometryRevision !== previous && s.geometryRevision === s.renderedGeometryRevision ? s.geometries : null;
  }, old)).toBe(1);
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  await expect(viewport(page)).toHaveAttribute('data-edit-mode', 'navigate');
  await expect(viewport(page)).toHaveAttribute('data-highlight-kind', 'none');
  await expect(page.getByTestId('candidate-coordinates')).toHaveCount(0);
  await expect(page.locator('.seam-list > li')).toHaveCount(0);
  await viewport(page).focus(); await page.keyboard.press('Enter'); expect(await revision(page)).toBe(0);
});

test('point replacement and insertion use real BVH nearest-surface picks on a large reverse-wound mesh', async ({ page }) => {
  const buffer = binaryStl(50_000, 'solid layered binary'); const bytes = new DataView(buffer);
  let face = 0;
  for (const z of [0, 5]) for (let x = 0; x < 250; x++) for (let y = 0; y < 50; y++) {
    const left = -10 + 40 * x / 250, right = -10 + 40 * (x + 1) / 250;
    const bottom = -20 + 60 * y / 50, top = -20 + 60 * (y + 1) / 50;
    for (const triangle of [[left, bottom, z, left, top, z, right, bottom, z], [right, bottom, z, left, top, z, right, top, z]]) {
      triangle.forEach((value, i) => bytes.setFloat32(84 + face * 50 + 12 + i * 4, value, true)); face++;
    }
  }
  await page.goto('/');
  await page.getByLabel('Import STL file').setInputFiles({ name: 'editing-layered.stl', mimeType: 'application/octet-stream', buffer: Buffer.from(buffer) });
  await page.getByRole('dialog').waitFor(); await page.getByRole('radio', { name: 'in', exact: true }).check();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  const rect = (await page.locator('canvas').boundingBox())!;
  const click = (offset: number) => page.mouse.click(rect.x + rect.width / 2 + offset, rect.y + rect.height / 2);
  await click(-30); await click(30); await page.getByRole('button', { name: /Finish seam/ }).click();
  await configureSeam(page, '5', '80', '20'); await selectPoint(page, 1);
  const ids = await pointIds(page);
  await page.getByRole('button', { name: 'Replace on surface', exact: true }).click(); await click(-50); await applyPoint(page);
  await page.getByRole('button', { name: 'Select segment 1', exact: true }).click();
  await page.getByRole('button', { name: 'Insert point on surface', exact: true }).click(); await click(0); await applyPoint(page);
  const positions = await visiblePointCoordinates(page), finalIds = await pointIds(page);
  expect([finalIds[0], finalIds[2]]).toEqual(ids);
  positions.forEach((point) => expect(point[2]).toBeCloseTo(127, 8));
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  expect((await downloadJob(page)).job.seams[0]!.geometry.points.map((point) => point.positionMm)).toEqual(positions);
});
