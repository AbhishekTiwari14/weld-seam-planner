import { expect, test } from '@playwright/test';
import { configureSeam, downloadJob } from '../helpers/planning-browser.ts';
import { stageRestore } from '../helpers/recovery-browser.ts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('loads each built-in sample via 1-click experience, verifying units, dimensions and stepper state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Initial stepper state
  const stepper = page.locator('.workflow-stepper');
  await expect(stepper).toBeVisible();
  await expect(stepper.locator('[data-step="1"]')).toHaveClass(/is-active/);
  await expect(stepper.locator('[data-step="2"]')).toHaveClass(/is-upcoming/);

  // Verify all 3 sample cards are visible on the empty homepage
  await expect(page.locator('.sample-card[data-sample-id="t-joint"]')).toBeVisible();
  await expect(page.locator('.sample-card[data-sample-id="gusset-bracket"]')).toBeVisible();
  await expect(page.locator('.sample-card[data-sample-id="pipe-on-plate"]')).toBeVisible();

  // 1. Load T-Joint
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('t-joint.stl');
  await expect(dialog.locator('.dimension-preview')).toContainText('120');
  await expect(dialog.locator('.dimension-preview')).toContainText('150');
  await expect(dialog.locator('.dimension-preview')).toContainText('80');
  await page.getByRole('button', { name: 'Confirm & open model', exact: true }).click();

  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect(page.locator('.workpiece-panel h2')).toHaveText('t-joint.stl');
  await expect(stepper.locator('[data-step="1"]')).toHaveClass(/is-completed/);
  await expect(stepper.locator('[data-step="2"]')).toHaveClass(/is-active/);

  // 2. Switch to Gusset Bracket via topbar Try Sample
  await page.getByRole('button', { name: 'Try Sample', exact: true }).click();
  const sampleDialog = page.locator('.sample-dialog');
  await expect(sampleDialog).toBeVisible();
  await sampleDialog.getByRole('button', { name: 'Load Gusseted Mounting Bracket', exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('gusset-bracket.stl');
  await expect(dialog.locator('.dimension-preview')).toContainText('100');
  await expect(dialog.locator('.dimension-preview')).toContainText('120');
  await page.getByRole('button', { name: 'Confirm & replace model', exact: true }).click();

  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect(page.locator('.workpiece-panel h2')).toHaveText('gusset-bracket.stl');

  // 3. Switch to Pipe-on-Plate via WorkpiecePanel button
  await page.getByRole('button', { name: 'Try another 3D sample', exact: true }).click();
  await expect(sampleDialog).toBeVisible();
  await sampleDialog.getByRole('button', { name: 'Load Pipe-on-Plate Nozzle Joint', exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('pipe-on-plate.stl');
  await expect(dialog.locator('.dimension-preview')).toContainText('150');
  await expect(dialog.locator('.dimension-preview')).toContainText('90');
  await page.getByRole('button', { name: 'Confirm & replace model', exact: true }).click();

  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect(page.locator('.workpiece-panel h2')).toHaveText('pipe-on-plate.stl');

  expect(errors).toEqual([]);
});

test('authors weld seam on sample T-joint, applies parameters, sequences, reviews and recovers plan', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Load T-Joint
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm & open model', exact: true }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();

  // Reset view to documented camera angle
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();

  // Step 2: Add seam
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  await expect(page.locator('.workflow-stepper [data-step="2"]')).toContainText('Drafting…');

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not visible');

  // Click two points on the model surface
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.52);
  await expect(page.getByTestId('draft-count')).toHaveText('1');

  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.52);
  await expect(page.getByTestId('draft-count')).toHaveText('2');

  await page.getByRole('button', { name: /Finish seam/ }).click();
  await expect(page.locator('.seam-list li')).toHaveCount(1);

  // Stepper updates to Step 3: Configure
  await expect(page.locator('.workflow-stepper [data-step="3"]')).toHaveClass(/is-active/);
  await expect(page.locator('.parameter-tip-banner')).toBeVisible();

  // Step 3: Configure parameters
  await configureSeam(page, '6.5', '115', '21.5');
  await expect(page.locator('.workflow-stepper [data-step="3"]')).toHaveClass(/is-completed/);
  await expect(page.locator('.workflow-stepper [data-step="5"]')).toHaveClass(/is-ready/);

  // Step 5: Review & Export via stepper click
  await page.locator('.workflow-stepper [data-step="5"] button').click();
  const reviewDialog = page.getByRole('dialog');
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog).toContainText('03 / ENGINEERING REVIEW');

  const { job, text } = await downloadJob(page);
  expect(job.schemaVersion).toBe('1.0.0');
  expect(job.workpiece.source.unit).toBe('mm');
  expect(job.seams).toHaveLength(1);
  expect(job.seams[0]!.parameters.travelSpeedMmPerS).toBe(6.5);
  expect(job.seams[0]!.parameters.currentTargetA).toBe(115);
  expect(job.seams[0]!.parameters.voltageTargetV).toBe(21.5);

  await page.getByRole('button', { name: 'Close review', exact: true }).click();

  // Test recovery: reload page, stage restore with original t-joint.stl and downloaded JSON
  await page.reload();
  const tJointBytes = await readFile(resolve('public/samples/t-joint.stl'));
  await stageRestore(page, text, tJointBytes, 't-joint.stl');

  await expect(page.getByRole('dialog')).toContainText('saved mm source units');
  await page.getByRole('button', { name: 'Confirm & restore plan', exact: true }).click();

  await expect(page.locator('.statusbar')).toContainText('Restored t-joint.stl · 1 seams');
  await expect(page.getByRole('button', { name: /^Undo / })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Redo / })).toBeDisabled();
  await expect(page.locator('.workpiece-panel h2')).toHaveText('t-joint.stl');

  // Re-export and verify exact identity
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const reExported = await downloadJob(page);
  expect(reExported.text).toBe(text);

  expect(errors).toEqual([]);
});

test('layout is fully usable and responsive at 1280x720 and 1440x900 without clipping', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // 1280 x 720
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  // Empty state check
  await expect(page.locator('.empty-split')).toBeVisible();
  await expect(page.locator('.empty-upload-card')).toBeVisible();
  await expect(page.locator('.empty-samples-card')).toBeVisible();

  // Load a sample
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm & open model', exact: true }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();

  // Check panels are visible without overlapping
  await expect(page.locator('.workpiece-panel')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.seam-panel')).toBeVisible();
  await expect(page.locator('.workflow-stepper')).toBeVisible();
  await expect(page.locator('.statusbar')).toBeVisible();

  // 1440 x 900
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.workpiece-panel')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.seam-panel')).toBeVisible();

  expect(errors).toEqual([]);
});
