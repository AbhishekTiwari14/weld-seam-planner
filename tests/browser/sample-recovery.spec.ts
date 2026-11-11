import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_MODELS, type SampleModel } from '../../src/samples/manifest.ts';
import { parseStl } from '../../src/import/parse-stl.ts';
import { prepareAsset } from '../../src/import/prepare-asset.ts';
import { PROCESS_PROFILE, type PlanningDocument, type Vec3 } from '../../src/domain/contracts.ts';
import { commitDraft } from '../../src/planning/draft.ts';
import { updateSeamParameters } from '../../src/domain/operations.ts';
import { exportPlanningDocument } from '../../src/export/job.ts';
import { configureSeam, downloadJob } from '../helpers/planning-browser.ts';

async function fixture(sample: SampleModel, rename = sample.filename, override?: Buffer) {
  const bytes = override ?? await readFile(`public${sample.path}`);
  const parsed = parseStl(new Uint8Array(bytes).buffer);
  const asset = prepareAsset(parsed, { filename: rename, byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), encoding: parsed.encoding,
    inputTriangles: parsed.inputTriangles, omittedDegenerateTriangles: parsed.omittedDegenerateTriangles,
    bounds: parsed.bounds, warnings: [], parseMs: 0 }, 'mm');
  let document: PlanningDocument = { jobId: crypto.randomUUID(), revision: 0,
    content: { workpiece: asset.workpiece, processProfile: PROCESS_PROFILE, seamsById: {}, sequence: [] } };
  const seamId = crypto.randomUUID();
  const point = (offset: number) => Array.from(parsed.positions.slice(offset, offset + 3)) as Vec3;
  document = commitDraft(document, [{ id: crypto.randomUUID(), positionMm: point(0) }, { id: crypto.randomUUID(), positionMm: point(3) }], seamId, 'Saved sample seam');
  document = updateSeamParameters(document, seamId, { travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 });
  return { bytes, text: exportPlanningDocument(document), document };
}

async function selectJson(page: Page, text: string) {
  await page.getByLabel('Saved weld-job JSON').setInputFiles({ name: 'saved.weld-job.v1.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('a browser-authored sample plan survives JSON-only restore after reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  const box = await page.locator('canvas').boundingBox(); if (!box) throw new Error('Canvas unavailable');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.52);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.52);
  await page.getByRole('button', { name: /Finish seam/ }).click();
  await configureSeam(page, '5', '80', '20');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const saved = await downloadJob(page);
  await page.reload(); await page.getByRole('button', { name: 'Restore Plan' }).click();
  await selectJson(page, saved.text);
  await expect(page.getByRole('status').filter({ hasText: 'Matched T-Joint Fillet Assembly' })).toBeVisible();
  await page.getByRole('button', { name: 'Verify files' }).click();
  await page.getByRole('button', { name: 'Confirm & restore plan' }).click();
  await expect(page.locator('.statusbar')).toContainText('Restored t-joint.stl');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  expect((await downloadJob(page)).text).toBe(saved.text);
});

for (const sample of SAMPLE_MODELS) {
  test(`restores ${sample.name} using only a saved JSON and re-exports identical bytes`, async ({ page }) => {
    const saved = await fixture(sample, sample.id === 't-joint' ? 'renamed-original.stl' : sample.filename);
    await page.goto('/'); await page.getByRole('button', { name: 'Restore Plan' }).click();
    await selectJson(page, saved.text);
    await expect(page.getByRole('status').filter({ hasText: `Matched ${sample.name}` })).toBeVisible();
    await expect(page.getByLabel('Original STL')).toHaveValue('');
    await page.getByRole('button', { name: 'Verify files' }).click();
    await expect(page.getByRole('dialog')).toContainText('Source fingerprint and geometry match');
    await page.getByRole('button', { name: 'Confirm & restore plan' }).click();
    await expect(page.locator('.statusbar')).toContainText(`Restored ${saved.document.content.workpiece.source.filename}`);
    await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
    expect((await downloadJob(page)).text).toBe(saved.text);
  });
}

test('same filename with different bytes requires its original STL and a mismatched file cannot replace the plan', async ({ page }) => {
  const sample = SAMPLE_MODELS[0]!; const original = await readFile(`public${sample.path}`);
  const custom = Buffer.from(original); custom[0] = custom[0]! ^ 1;
  const saved = await fixture(sample, sample.filename, custom);
  await page.goto('/'); await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  const revision = await page.locator('.seam-panel-footer').innerText();
  await page.getByRole('button', { name: 'Restore Plan' }).click(); await selectJson(page, saved.text);
  await expect(page.getByText('No bundled sample matches this plan. Select its original STL.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify files' })).toBeDisabled();
  await page.getByLabel('Original STL').setInputFiles({ name: sample.filename, mimeType: 'model/stl', buffer: original });
  await page.getByRole('button', { name: 'Verify files' }).click();
  await expect(page.getByRole('alert')).toContainText('SHA-256 mismatch');
  expect(await page.locator('.seam-panel-footer').innerText()).toBe(revision);
  await page.getByRole('button', { name: 'Dismiss import error' }).click();
  await page.getByRole('button', { name: 'Restore Plan' }).click(); await selectJson(page, saved.text);
  await page.getByLabel('Original STL').setInputFiles({ name: 'original.stl', mimeType: 'model/stl', buffer: custom });
  await page.getByRole('button', { name: 'Verify files' }).click();
  await page.getByRole('button', { name: 'Confirm & restore plan' }).click();
  await expect(page.locator('.statusbar')).toContainText('Restored t-joint.stl');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  expect((await downloadJob(page)).text).toBe(saved.text);
});

for (const mode of ['missing', 'corrupt'] as const) {
  test(`${mode} bundled sample offers a manual fallback`, async ({ page }) => {
    const sample = SAMPLE_MODELS[0]!; const saved = await fixture(sample);
    await page.route(`**${sample.path}`, (route) => mode === 'missing' ? route.fulfill({ status: 404 }) :
      route.fulfill({ status: 200, body: Buffer.alloc(sample.byteLength) }));
    await page.goto('/'); await page.getByRole('button', { name: 'Restore Plan' }).click(); await selectJson(page, saved.text);
    await expect(page.getByRole('alert')).toContainText('Select the original STL manually');
    await page.getByLabel('Original STL').setInputFiles({ name: 'original.stl', mimeType: 'model/stl', buffer: saved.bytes });
    await page.getByRole('button', { name: 'Verify files' }).click();
    await page.getByRole('button', { name: 'Confirm & restore plan' }).click();
    await expect(page.locator('.statusbar')).toContainText('Restored t-joint.stl');
  });
}

test('invalid JSON is rejected in the dialog without changing the active project', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  const before = await page.locator('.seam-panel-footer').innerText();
  await page.getByRole('button', { name: 'Restore Plan' }).click();
  await selectJson(page, '{'); await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  await expect(page.getByRole('button', { name: 'Verify files' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.locator('.seam-panel-footer').innerText()).toBe(before);
  await expect(page.locator('.workpiece-panel h2')).toHaveText('t-joint.stl');
});

test('reselection, cancellation and a concurrent import isolate a pending sample fetch', async ({ page }) => {
  const first = await fixture(SAMPLE_MODELS[0]!); const second = await fixture(SAMPLE_MODELS[1]!);
  let release!: () => void; let requested!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { requested = resolve; });
  await page.route('**/samples/t-joint.stl', async (route) => { requested(); await gate; try { await route.fulfill({ body: first.bytes }); } catch { /* Aborted request. */ } });
  await page.goto('/'); await page.getByRole('button', { name: 'Restore Plan' }).click();
  await selectJson(page, first.text); await started;
  await selectJson(page, second.text);
  await expect(page.getByRole('status').filter({ hasText: 'Matched Gusseted Mounting Bracket' })).toBeVisible();
  release();
  await expect(page.getByRole('dialog')).not.toContainText('Matched T-Joint');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.empty-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Restore Plan' }).click(); await selectJson(page, second.text);
  await page.getByLabel('Import STL file').setInputFiles({ name: 'external.stl', mimeType: 'model/stl', buffer: first.bytes });
  await expect(page.getByRole('dialog')).toContainText('external.stl');
  await expect(page.getByRole('dialog')).not.toContainText('Restore a saved plan');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.empty-workspace')).toBeVisible();
});

test('closing during a sample fetch preserves the current unsaved plan and history', async ({ page }) => {
  const saved = await fixture(SAMPLE_MODELS[0]!);
  await page.goto('/'); await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  const box = await page.locator('canvas').boundingBox(); if (!box) throw new Error('Canvas unavailable');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.52);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.52);
  await page.getByRole('button', { name: /Finish seam/ }).click();
  const before = await page.locator('.seam-panel-footer').innerText();
  const history = await page.locator('.history-actions button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title')));
  let release!: () => void; let requested!: () => void; let settled!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { requested = resolve; });
  const done = new Promise<void>((resolve) => { settled = resolve; });
  await page.route('**/samples/t-joint.stl', async (route) => {
    requested(); await gate;
    try { await route.fulfill({ body: saved.bytes }); } catch { /* Aborted request. */ } finally { settled(); }
  });
  await page.getByRole('button', { name: 'Restore Plan' }).click(); await selectJson(page, saved.text); await started;
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); release(); await done;
  expect(await page.locator('.seam-panel-footer').innerText()).toBe(before);
  expect(await page.locator('.history-actions button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('title')))).toEqual(history);
  await expect(page.locator('.local-badge')).toContainText('Unsaved changes');
  await expect(page.locator('.seam-list li')).toHaveCount(1);
});

test('a manual STL can take over a slow automatic sample fetch', async ({ page }) => {
  const saved = await fixture(SAMPLE_MODELS[0]!);
  let release!: () => void; let requested!: () => void; let settled!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { requested = resolve; });
  const done = new Promise<void>((resolve) => { settled = resolve; });
  await page.route('**/samples/t-joint.stl', async (route) => {
    requested(); await gate;
    try { await route.fulfill({ body: saved.bytes }); } catch { /* Aborted request. */ } finally { settled(); }
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Restore Plan' }).click();
  await selectJson(page, saved.text); await started;
  await page.getByLabel('Original STL').setInputFiles({ name: 'manual.stl', mimeType: 'model/stl', buffer: saved.bytes });
  await expect(page.getByRole('button', { name: 'Verify files' })).toBeEnabled();
  release(); await done;
  await page.getByRole('button', { name: 'Verify files' }).click();
  await page.getByRole('button', { name: 'Confirm & restore plan' }).click();
  await expect(page.locator('.statusbar')).toContainText('Restored t-joint.stl');
});
