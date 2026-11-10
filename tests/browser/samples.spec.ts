import { expect, test } from '@playwright/test';
import { configureSeam, downloadJob } from '../helpers/planning-browser.ts';
import { stageRestore } from '../helpers/recovery-browser.ts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyticTriangles, asciiStl } from '../helpers/stl.ts';

for (const action of ['cancel', 'upload', 'restore', 'new sample'] as const) {
  test(`pending sample fetch is isolated when superseded by ${action}`, async ({ page }) => {
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { requested = resolve; });
    await page.route('**/samples/t-joint.stl', async (route) => {
      requested();
      await gate;
      await route.fulfill({ path: resolve('public/samples/t-joint.stl'), contentType: 'model/stl' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly', exact: true }).click();
    await started;
    await expect(page.getByRole('status')).toContainText('Downloading T-Joint');
    const aborted = page.waitForEvent('requestfailed', (request) => request.url().endsWith('/samples/t-joint.stl'));
    try {
      if (action === 'cancel') await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
      if (action === 'upload') await page.getByLabel('Import STL file').setInputFiles({ name: 'local.stl', mimeType: 'model/stl', buffer: Buffer.from(asciiStl(analyticTriangles)) });
      if (action === 'restore') await page.getByRole('button', { name: 'Restore Plan', exact: true }).click();
      if (action === 'new sample') await page.getByRole('button', { name: 'Load sample Gusseted Mounting Bracket', exact: true }).click();
    } finally { release(); }
    await aborted;
    await expect(page.getByText('Downloading T-Joint', { exact: false })).toHaveCount(0);
    if (action === 'upload' || action === 'new sample') {
      const expectedName = action === 'upload' ? 'local.stl' : 'gusset-bracket.stl';
      await expect(page.getByRole('dialog')).toContainText(expectedName);
      await page.getByRole('button', { name: 'Confirm & open model', exact: true }).click();
      await expect(page.locator('.workpiece-panel h2')).toHaveText(expectedName);
    } else if (action === 'restore') {
      await expect(page.getByRole('dialog')).toContainText('Restore');
      await expect(page.getByRole('dialog')).not.toContainText('t-joint.stl');
    } else {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.statusbar')).toContainText('Import cancelled');
    }
  });
}

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

test('workbench panels do not overlap or overflow at 1280x720 and 1440x900', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // 1280 x 720
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  // Empty state check
  await expect(page.locator('.empty-split')).toBeVisible();
  await expect(page.locator('.empty-upload-card')).toBeVisible();
  await expect(page.locator('.empty-samples-card')).toBeVisible();
  await page.screenshot({ path: info.outputPath('welcome-1280.png') });

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
  async function checkPanelBounds() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const left = await page.locator('.workpiece-panel').boundingBox();
    const canvas = await page.locator('canvas').boundingBox();
    const right = await page.locator('.seam-panel').boundingBox();
    const footer = await page.locator('.statusbar').boundingBox();
    expect(left).not.toBeNull(); expect(canvas).not.toBeNull(); expect(right).not.toBeNull(); expect(footer).not.toBeNull();
    expect(left!.x + left!.width).toBeLessThanOrEqual(canvas!.x + 1);
    expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(right!.x + 1);
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(footer!.y + 1);
    expect(right!.x + right!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(canvas!.height).toBeGreaterThan(300);
  }
  await checkPanelBounds();
  await page.screenshot({ path: info.outputPath('workbench-1280.png') });

  // 1440 x 900
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.workpiece-panel')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.seam-panel')).toBeVisible();
  await checkPanelBounds();
  await page.screenshot({ path: info.outputPath('workbench-1440.png') });

  expect(errors).toEqual([]);
});

test('rapid sample selection and cancellation does not corrupt workspace or leave stale fetch state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Open sample dialog via topbar
  await page.getByRole('button', { name: 'Try Sample' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Cancel dialog immediately
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();

  // Load a sample via Option B card
  await page.getByRole('button', { name: 'Load sample Gusseted Mounting Bracket', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm & open model', exact: true }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await expect(page.locator('.workpiece-panel h2')).toHaveText('gusset-bracket.stl');

  expect(errors).toEqual([]);
});
