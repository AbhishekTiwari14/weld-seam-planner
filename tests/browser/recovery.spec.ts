import { expect, test } from '@playwright/test';
import { clickPlate, downloadJob, visiblePointCoordinates } from '../helpers/planning-browser.ts';
import { confirmRestore, createRecoverablePlan, recoveryPlate, stageRestore } from '../helpers/recovery-browser.ts';
import { validatePlanning } from '../../src/validation/planning.ts';
import { parseSavedPlan } from '../../src/recovery/restore.ts';

test('export, refresh, real-worker restore, edit and deterministic re-export preserve exact saved plan identity', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const saved = await createRecoverablePlan(page);
  expect(saved.job.review.warnings.length).toBeGreaterThan(0);
  await expect(page.locator('.local-badge')).not.toContainText('Unsaved');
  await page.reload(); await stageRestore(page, saved.text);
  await expect(page.getByRole('dialog')).toContainText('saved cm source units');
  await confirmRestore(page);
  await expect(page.locator('.statusbar')).toContainText(`Restored recovery-plate.stl · 2 seams · revision ${saved.job.revision}`);
  expect(JSON.parse(await page.evaluate(() => window.__weldDebug!.snapshot().frame))).toEqual(saved.job.workpiece);
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const restored = await downloadJob(page); expect(restored.text).toBe(saved.text); expect(restored.job).toEqual(saved.job);
  await page.screenshot({ path: info.outputPath('restored-review.png') });
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  await page.getByRole('button', { name: 'Select Second pass', exact: true }).click();
  await visiblePointCoordinates(page);
  await page.getByRole('button', { name: 'Select point 2', exact: true }).click();
  await page.getByRole('button', { name: 'Replace on surface', exact: true }).click();
  await clickPlate(page, [20, -5, 5]); await page.getByRole('button', { name: /^Apply point/ }).click();
  const points = await visiblePointCoordinates(page);
  await expect(page.locator('.local-badge')).toContainText('Unsaved changes');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const edited = await downloadJob(page);
  const oldSeam = saved.job.seams.find((seam) => seam.name === 'Second pass')!;
  expect(edited.job.seams.find((seam) => seam.id === oldSeam.id)!.geometry.points).toEqual(oldSeam.geometry.points.map((point, i) => ({ id: point.id, positionMm: points[i] })));
  expect(edited.job.revision).toBe(saved.job.revision + 1); expect(edited.job.sequence).toEqual(saved.job.sequence);
  expect(edited.job.jobId).toBe(saved.job.jobId); expect(edited.job.workpiece).toEqual(saved.job.workpiece);
  expect(errors).toEqual([]);
});

test('bad files, provenance mismatch and cancelled restoration preserve document, history and staged edits', async ({ page }) => {
  const saved = await createRecoverablePlan(page);
  await page.getByRole('button', { name: 'Reverse direction', exact: true }).click();
  await page.getByRole('button', { name: /^Undo / }).click();
  const history = await page.locator('.history-actions button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('title')));
  await visiblePointCoordinates(page); await page.getByRole('button', { name: 'Select point 1', exact: true }).click();
  await page.getByRole('button', { name: 'Replace on surface', exact: true }).click(); await clickPlate(page, [-5, -5, 5]);
  const candidate = await page.getByTestId('candidate-coordinates').textContent();
  const frame = await page.evaluate(() => window.__weldDebug!.snapshot().geometryRevision);
  const unitMismatch = JSON.parse(saved.text); unitMismatch.workpiece.source.unit = 'mm';
  const forged = JSON.parse(saved.text); forged.review.warnings = [];
  const metadata = JSON.parse(saved.text); metadata.workpiece.source.byteLength += 1;
  for (const [text, bytes, message] of [
    ['{', recoveryPlate, 'Invalid JSON'],
    ['{"schemaVersion":"2.0.0"}', recoveryPlate, 'Unsupported'],
    [JSON.stringify(forged), recoveryPlate, 'warnings do not match'],
    [JSON.stringify(unitMismatch), recoveryPlate, 'bounds/source-unit mismatch'],
    [JSON.stringify(metadata), recoveryPlate, 'byteLength'],
    [saved.text, Buffer.concat([recoveryPlate, Buffer.from('\n')]), 'SHA-256 mismatch'],
    [' '.repeat(16 * 1024 ** 2 + 1), recoveryPlate, '16 MiB'],
  ] as const) {
    await stageRestore(page, text, bytes);
    await expect(page.getByRole('alert')).toContainText(message);
    if (await page.getByRole('dialog').isVisible()) await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    else await page.getByRole('button', { name: 'Dismiss import error', exact: true }).click();
    expect(await page.evaluate(() => window.__weldDebug!.snapshot().geometryRevision)).toBe(frame);
    expect(await page.getByTestId('candidate-coordinates').textContent()).toBe(candidate);
    expect(await page.locator('.history-actions button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('title')))).toEqual(history);
  }
  await stageRestore(page, saved.text);
  await expect(page.getByRole('dialog')).toContainText('Unsaved committed changes');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.getByTestId('candidate-coordinates').textContent()).toBe(candidate);
  await page.getByRole('button', { name: /^Cancel point edit/ }).click();
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const unchanged = await downloadJob(page);
  expect(unchanged.job.seams).toEqual(saved.job.seams); expect(unchanged.job.sequence).toEqual(saved.job.sequence);
  expect(unchanged.job.revision).toBe(saved.job.revision + 2);
});

test('same-ID repeated restores reset drafts, candidates and history while disposing real GPU resources', async ({ page }) => {
  const saved = await createRecoverablePlan(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Select Second pass', exact: true }).click();
    if (i === 0) {
      await page.getByRole('button', { name: 'Add seam', exact: true }).click(); await clickPlate(page, [5, 5, 5]);
    } else {
      await visiblePointCoordinates(page); await page.getByRole('button', { name: 'Select point 1', exact: true }).click();
      await page.getByRole('button', { name: 'Replace on surface', exact: true }).click(); await clickPlate(page, [-5, -5, 5]);
    }
    const old = await page.evaluate(() => window.__weldDebug!.snapshot().geometryRevision);
    await stageRestore(page, saved.text); await confirmRestore(page, old);
    await expect(page.getByTestId('candidate-coordinates')).toHaveCount(0); await expect(page.getByTestId('draft-count')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '3D workpiece viewport', exact: true })).toHaveAttribute('data-highlight-kind', 'none');
    await expect(page.getByLabel('Selected seam', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Review & Export', exact: true }).click(); expect((await downloadJob(page)).text).toBe(saved.text);
    await page.getByRole('button', { name: 'Close review', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().geometries)).toBe(7);
  }
});

test('review categories, correction feedback, warning navigation, focus framing and keyboard recovery are coherent', async ({ page }, info) => {
  const saved = await createRecoverablePlan(page);
  await page.getByLabel('Travel speed').fill(''); await page.getByRole('button', { name: 'Apply parameters', exact: true }).click();
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.getByTestId('review-error-count')).toHaveText('1');
  await expect(page.getByTestId('review-warning-count')).toHaveText(String(saved.job.review.warnings.length));
  await expect(page.getByTestId('review-unassessed-count')).toHaveText('8');
  await expect(page.getByRole('button', { name: 'Download weld job', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Second pass: Travel speed (mm/s) is required.', exact: true }).click();
  await expect(page.getByLabel('Travel speed')).toBeFocused();
  await page.keyboard.type('10'); await page.getByRole('button', { name: 'Apply parameters', exact: true }).click();
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await expect(page.getByTestId('review-error-count')).toHaveText('0');
  await expect(page.getByRole('dialog')).toContainText('1 previously reported finding is no longer present');
  await expect(page.getByRole('dialog')).toContainText('Valid for export — robot safety and feasibility are not verified');
  const document = parseSavedPlan(saved.text), findings = validatePlanning(document, 'export').findings;
  const warning = findings.find((finding) => finding.target.kind === 'point')!;
  if (warning.target.kind !== 'point') throw new Error('Expected a turn warning fixture.');
  await page.getByRole('dialog').getByRole('button', { name: 'Inspect turn at point 2 in Root pass with short segment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select point 2', exact: true })).toBeFocused();
  await expect(page.locator('.viewport')).toHaveAttribute('data-highlight-ids', warning.target.pointId);
  const before = await page.evaluate(() => window.__weldDebug!.snapshot());
  await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__weldDebug!.snapshot().camera)).not.toEqual(before.camera);
  expect(await page.evaluate(() => window.__weldDebug!.snapshot().frame)).toBe(before.frame);
  await page.screenshot({ path: info.outputPath('focused-diagnostic.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  await page.screenshot({ path: info.outputPath('review-1440.png') });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore Plan', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Saved weld-job JSON', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByLabel('Original STL', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Restore Plan', exact: true })).toBeFocused();
});
