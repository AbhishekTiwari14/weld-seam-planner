import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { analyticTriangles, asciiStl, binaryStl } from '../helpers/stl.ts';
import { clickPlate, configureSeam, createSeam, downloadJob, plateScreenPoint, visiblePointCoordinates } from '../helpers/planning-browser.ts';
import { serializeWeldJob } from '../../src/export/job.ts';
import type { Vec3 } from '../../src/domain/contracts.ts';

const analytic = Buffer.from(asciiStl(analyticTriangles));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateStructure = ajv.compile(JSON.parse(readFileSync('schemas/weld-job.v1.schema.json', 'utf8')) as object);

async function select(page: Page, name = 'planning-plate.stl') {
  await page.getByLabel('Import STL file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: analytic });
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function importPlate(page: Page, inspect = false, unit = 'mm') {
  await page.goto(inspect ? '/?inspect=1' : '/');
  await select(page);
  await page.getByRole('radio', { name: unit, exact: true }).check();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Interactive 3D model', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
}

test('production UI plans two real surface paths, independent targets, sequence, review and exact JSON download', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await importPlate(page, false, 'cm');
  expect(await page.evaluate(() => window.__weldDebug)).toBeUndefined();
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download weld job' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close review' }).click();
  const straight: Vec3[] = [[-5, -10, 5], [20, -10, 5]];
  const polyline: Vec3[] = [[-5, 15, 5], [15, 15, 5], [15, 30, 5]];
  await createSeam(page, straight, 'Root pass');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.locator('.review-errors')).toContainText('Travel speed (mm/s) is required.');
  await expect(page.locator('.review-errors li')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Download weld job' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close review' }).click();
  await configureSeam(page, '5', '80', '20');
  const firstPoints = await visiblePointCoordinates(page);
  await expect(page.locator('.metric-pair')).toContainText('50 s');
  await createSeam(page, polyline, 'Return pass');
  await expect(page.getByLabel('Travel speed')).toHaveValue('');
  await configureSeam(page, '10', '110', '24');
  const secondPoints = await visiblePointCoordinates(page);
  await expect(page.locator('.point-inspector')).toContainText('Turn: 90');
  await page.getByRole('button', { name: 'Move Return pass earlier', exact: true }).click();
  const sequence = await page.locator('.seam-list > li').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-seam-id')));
  await expect(page.locator('.seam-list .seam-summary strong')).toHaveText(['Return pass', 'Root pass']);
  // Viewport selection uses real line raycasting, not a test-side state change.
  await clickPlate(page, [7.5, -10, 5]);
  await expect(page.getByRole('button', { name: 'Select Root pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Current target')).toHaveValue('80');
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 7');
  await page.screenshot({ path: info.outputPath('planning-workbench.png') });
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.locator('.review-sequence strong')).toHaveText(['Return pass', 'Root pass']);
  // DOM pointer coordinates have finite precision. Compare displayed metrics to
  // the actual picked coordinates, allowing only the UI's four-decimal rounding.
  const length = (points: number[][]) => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(...point.map((value, axis) => value - points[i]![axis]!)), 0);
  const totalLength = length(firstPoints) + length(secondPoints);
  const totalTime = length(firstPoints) / 5 + length(secondPoints) / 10;
  const displayed = await page.locator('.review-metrics strong').allTextContents();
  expect(Number.parseFloat(displayed[1]!.replaceAll(',', ''))).toBeCloseTo(totalLength, 3);
  expect(Number.parseFloat(displayed[2]!)).toBeCloseTo(totalTime, 3);
  expect(totalLength).toBeCloseTo(600, 2);
  await expect(page.locator('.review-limitations')).toContainText('Torch orientation');
  await page.screenshot({ path: info.outputPath('engineering-review.png') });
  const result = await downloadJob(page);
  expect(result.filename).toBe('planning-plate.weld-job.v1.json');
  expect(validateStructure(JSON.parse(result.text)), JSON.stringify(validateStructure.errors)).toBe(true);
  // Canonicalization is idempotent locally; measured warnings can differ in
  // their final bits between browser and Node. Browser byte determinism is
  // checked below by downloading the same committed revision again.
  expect(serializeWeldJob(result.job)).toBe(serializeWeldJob(JSON.parse(result.text)));
  expect(result.job.sequence).toEqual(sequence);
  expect(result.job.revision).toBe(7);
  expect(result.job.workpiece.source.unit).toBe('cm');
  expect(result.job.workpiece.source.sha256).toBe(createHash('sha256').update(analytic).digest('hex'));
  expect(result.job.workpiece.boundsMm).toEqual({ min: [-100, -200, 50], max: [300, 400, 50] });
  const first = result.job.seams.find((seam) => seam.name === 'Root pass')!;
  const second = result.job.seams.find((seam) => seam.name === 'Return pass')!;
  expect(first.geometry.points.map((point) => point.positionMm)).toEqual(firstPoints);
  expect(second.geometry.points.map((point) => point.positionMm)).toEqual(secondPoints);
  for (const [actual, expected] of [[firstPoints, straight], [secondPoints, polyline]] as const) {
    actual.forEach((point, i) => point.forEach((value, axis) => expect(Math.abs(value - expected[i]![axis]! * 10)).toBeLessThan(0.1)));
  }
  expect(first.parameters).toEqual({ travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 });
  expect(second.parameters).toEqual({ travelSpeedMmPerS: 10, currentTargetA: 110, voltageTargetV: 24 });
  const ids = [result.job.jobId, result.job.workpiece.id, ...result.job.seams.flatMap((seam) => [seam.id, ...seam.geometry.points.map((point) => point.id)])];
  expect(new Set(ids).size).toBe(ids.length);
  expect(result.job.review.warnings).toContainEqual(expect.objectContaining({ code: 'TURN_ANGLE_HIGH', seamId: second.id }));
  await page.getByRole('button', { name: 'Close review' }).click();
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  await clickPlate(page, [0, 0, 5]);
  await expect(page.getByTestId('draft-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('An unfinished seam is excluded');
  expect((await downloadJob(page)).text).toBe(result.text);
  await page.getByRole('button', { name: 'Close review' }).click();
  await expect(page.getByTestId('draft-count')).toHaveText('1');
  await page.getByRole('button', { name: /Cancel.*Esc/ }).click();
  expect(errors).toEqual([]);
});

test('gestures, cancellation, duplicate picks and invalid parameter text do not commit unintended changes', async ({ page }) => {
  await importPlate(page);
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  await expect(page.getByRole('button', { name: /Finish seam/ })).toBeDisabled();
  await clickPlate(page, [0, 0, 5]);
  await clickPlate(page, [0, 0, 5]);
  await expect(page.getByRole('alert')).toContainText('coincides');
  await expect(page.getByTestId('draft-count')).toHaveText('1');
  const position = await plateScreenPoint(page, [0, 0, 5]);
  await page.mouse.move(position.x, position.y); await page.mouse.down();
  await page.mouse.move(position.x + 70, position.y + 25, { steps: 8 }); await page.mouse.up();
  await page.mouse.down({ button: 'right' }); await page.mouse.move(position.x + 90, position.y + 60, { steps: 6 }); await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, -120);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.keyboard.down('Shift'); await clickPlate(page, [10, 5, 5]); await page.keyboard.up('Shift');
  const rect = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(rect.x + 8, rect.y + rect.height / 2);
  await expect(page.getByRole('alert')).toContainText('No surface');
  await expect(page.getByTestId('draft-count')).toHaveText('1');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('draft-count')).toHaveText('0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draft-count')).toHaveCount(0);
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 0');
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  await clickPlate(page, [-5, 0, 5]); await clickPlate(page, [15, 0, 5]);
  await page.keyboard.press('Enter');
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 1');
  for (const value of ['-', '0', '-1', 'Infinity', '1e', '1e999']) {
    await page.getByLabel('Travel speed').fill(value);
    await expect(page.getByLabel('Travel speed')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Apply parameters', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Review & Export', exact: true })).toBeDisabled();
    await expect(page.locator('.seam-panel-footer')).toContainText('Revision 1');
  }
  await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(page.getByLabel('Travel speed')).toHaveValue('');
  await configureSeam(page, '5', '80', '20');
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 2');
  await page.getByLabel('Travel speed').fill('5.0');
  await page.getByRole('button', { name: 'Apply parameters', exact: true }).click();
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 2');
  await page.getByLabel('Current target').fill('');
  await page.getByRole('button', { name: 'Apply parameters', exact: true }).click();
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 3');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.locator('.review-errors li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Download weld job' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close review' }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete seam', exact: true }).click();
  await expect(page.locator('.seam-list > li')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete seam', exact: true }).click();
  await expect(page.locator('.seam-list > li')).toHaveCount(0);
  await expect(page.locator('.seam-panel-footer')).toContainText('Revision 4');
});

test('populated plan survives failed/cancelled imports and replacement releases overlay and workpiece resources', async ({ page }) => {
  await importPlate(page, true);
  for (let cycle = 0; cycle < 3; cycle++) {
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(1);
    await createSeam(page, [[-5, 0, 5], [15, 0, 5]], 'Keep me');
    await configureSeam(page, '5', '80', '20');
    // One workpiece + one line + two marker geometries + selected direction line.
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(5);
    const frame = await page.evaluate(() => window.__weldDebug!.snapshot());
    await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
    const before = await downloadJob(page);
    await page.getByRole('button', { name: 'Close review' }).click();
    await page.getByRole('button', { name: 'Add seam', exact: true }).click();
    await clickPlate(page, [0, 10, 5]);
    await page.getByLabel('Import STL file').setInputFiles({ name: 'bad.stl', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
    await expect(page.getByRole('alert')).toContainText('Could not import');
    await page.getByRole('button', { name: 'Dismiss import error' }).click();
    await select(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByTestId('draft-count')).toHaveText('1');
    await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
    expect((await downloadJob(page)).text).toBe(before.text);
    await page.getByRole('button', { name: 'Close review' }).click();
    await select(page);
    await page.getByRole('radio', { name: 'mm', exact: true }).check();
    await page.getByRole('button', { name: 'Confirm & replace model' }).click();
    await expect.poll(() => page.evaluate((previous) => {
      const snapshot = window.__weldDebug?.snapshot();
      return snapshot && snapshot.geometryRevision !== previous && snapshot.geometryRevision === snapshot.renderedGeometryRevision ? snapshot.geometries : null;
    }, frame.geometryRevision)).toBe(1);
    await expect(page.locator('.seam-list > li')).toHaveCount(0);
    await expect(page.getByTestId('draft-count')).toHaveCount(0);
    await expect(page.getByLabel('Selected seam', { exact: true })).toHaveCount(0);
    await expect(page.locator('.seam-panel-footer')).toContainText('Revision 0');
  }
});

test('production authoring picks the nearest reverse-wound surface through the real worker and BVH', async ({ page }) => {
  // 50k spatially distributed triangles reach the real acceleration threshold.
  // The upper surface faces away from the reset camera; an overlapping lower
  // surface must never win the pick. No debug API participates in this test.
  const buffer = binaryStl(50_000, 'solid layered binary');
  const bytes = new DataView(buffer);
  let face = 0;
  for (const z of [0, 5]) for (let x = 0; x < 250; x++) for (let y = 0; y < 50; y++) {
    const left = -10 + 40 * x / 250, right = -10 + 40 * (x + 1) / 250;
    const bottom = -20 + 60 * y / 50, top = -20 + 60 * (y + 1) / 50;
    for (const triangle of [[left, bottom, z, left, top, z, right, bottom, z], [right, bottom, z, left, top, z, right, top, z]]) {
      triangle.forEach((value, i) => bytes.setFloat32(84 + face * 50 + 12 + i * 4, value, true));
      face++;
    }
  }
  await page.goto('/');
  await page.getByLabel('Import STL file').setInputFiles({ name: 'layered.stl', mimeType: 'application/octet-stream', buffer: Buffer.from(buffer) });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Interactive 3D model', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  const rect = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(rect.x + rect.width / 2 - 30, rect.y + rect.height / 2);
  await expect(page.getByTestId('draft-count')).toHaveText('1');
  await page.mouse.click(rect.x + rect.width / 2 + 30, rect.y + rect.height / 2);
  await expect(page.getByTestId('draft-count')).toHaveText('2');
  await page.getByRole('button', { name: /Finish seam/ }).click();
  const points = await visiblePointCoordinates(page);
  points.forEach((point) => expect(point[2]).toBeCloseTo(5, 10));
  await configureSeam(page, '5', '80', '20');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const { job } = await downloadJob(page);
  expect(job.workpiece.source.encoding).toBe('binary');
  expect(job.workpiece.source.inputTriangles).toBe(50_000);
  expect(job.seams[0]!.geometry.points.map((point) => point.positionMm)).toEqual(points);
});
