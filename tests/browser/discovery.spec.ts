import { expect, test, type Page } from '@playwright/test';
import { configureSeam, downloadJob } from '../helpers/planning-browser.ts';

async function loadSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
}

test('discovers, reviews, accepts, undoes, redoes and exports a T-joint candidate', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await loadSample(page);
  await page.getByRole('button', { name: 'Discover Seams' }).click();
  await expect(page.getByText('2 candidates found')).toBeVisible();
  const beforePreview = await page.locator('canvas').screenshot();
  const first = page.getByRole('button', { name: /Candidate 1.*Suggested/ });
  await first.click();
  const viewport = page.getByLabel('3D workpiece viewport');
  await expect(viewport).toHaveAttribute('data-candidate-preview', 'visible');
  await expect.poll(async () => (await page.locator('canvas').screenshot()).equals(beforePreview)).toBe(false);
  await expect(page.getByLabel('Selected candidate')).toContainText('does not establish welding intent');
  await page.getByRole('button', { name: 'Focus candidate' }).click();
  await page.getByRole('button', { name: 'Reject candidate' }).click();
  await expect(page.locator('.seam-list li')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Restore suggestion' }).click();
  await page.getByRole('button', { name: 'Accept candidate' }).click();
  await expect(page.locator('.seam-list li')).toHaveCount(1);
  const seamId = await page.locator('.seam-list li').getAttribute('data-seam-id');
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('.seam-list li')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeEnabled();
  await page.getByRole('button', { name: /Redo/ }).click();
  await expect(page.locator('.seam-list li')).toHaveAttribute('data-seam-id', seamId!);
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Discover Seams' }).click();
  await expect(page.getByRole('button', { name: /Candidate 1.*Accepted/ })).toBeVisible();
  await page.getByRole('button', { name: /Candidate 1.*Accepted/ }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select Seam 1' }).click();
  await expect(page.getByLabel('Travel speed')).toHaveValue('');
  await configureSeam(page, '6.5', '115', '21.5');
  await page.getByRole('button', { name: 'Review & Export', exact: true }).click();
  const { job, text } = await downloadJob(page);
  expect(job.seams).toHaveLength(1);
  expect(job.seams[0]!.id).toBe(seamId);
  expect(job.seams[0]!.geometry.points.map((point) => point.positionMm)).toEqual([[-5, -65, 10], [-5, 65, 10]]);
  expect(new Set([seamId, ...job.seams[0]!.geometry.points.map((point) => point.id)]).size).toBe(3);
  expect(text).not.toContain('candidateId');
  await page.getByRole('button', { name: 'Close review' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete seam' }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeEnabled();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  expect(workers.some((url) => url.includes('discovery.worker'))).toBe(true);
});

test('preserves manual editing and blocks candidate actions during drafts and parameter edits', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Discover Seams' }).click();
  await expect(page.getByText('2 candidates found')).toBeVisible();
  await page.getByRole('button', { name: /Candidate 1.*Suggested/ }).click();
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas unavailable');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.52);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.52);
  await page.getByRole('button', { name: /Finish seam/ }).click();
  await expect(page.locator('.seam-list li')).toHaveCount(1);
  await page.getByLabel('Travel speed').fill('5');
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  await page.getByRole('button', { name: 'Discard edits' }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeEnabled();
  await page.getByText('Ordered points & geometry').click();
  await page.getByRole('button', { name: 'Select point 1' }).click();
  await page.getByRole('button', { name: 'Replace on surface' }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeDisabled();
  await page.getByRole('button', { name: /Cancel point edit/ }).click();
  await expect(page.getByRole('button', { name: 'Accept candidate' })).toBeEnabled();
});

test('reports worker failure without affecting the manual plan', async ({ page }) => {
  await page.route('**/discovery.worker*', (route) => route.abort());
  await loadSample(page);
  await page.getByRole('button', { name: 'Discover Seams' }).click();
  await expect(page.getByRole('alert')).toContainText('worker failed');
  await expect(page.getByRole('button', { name: 'Add seam', exact: true })).toBeEnabled();
  await expect(page.locator('.seam-list li')).toHaveCount(0);
});

test('cancels pending analysis and ignores the terminated worker', async ({ page }) => {
  let requested!: () => void; let release!: () => void; let settled!: () => void;
  const requestStarted = new Promise<void>((resolve) => { requested = resolve; });
  const releaseRequest = new Promise<void>((resolve) => { release = resolve; });
  const requestSettled = new Promise<void>((resolve) => { settled = resolve; });
  await page.route('**/discovery.worker*', async (route) => {
    requested(); await releaseRequest;
    try { await route.abort(); } catch { /* Worker may already be terminated. */ } finally { settled(); }
  });
  await loadSample(page);
  await page.getByRole('button', { name: 'Discover Seams' }).click();
  await requestStarted;
  await page.getByRole('button', { name: 'Cancel analysis' }).click();
  release(); await requestSettled;
  await expect(page.getByRole('button', { name: 'Discover Seams' })).toBeEnabled();
  await expect(page.getByLabel('Candidate suggestions')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add seam', exact: true })).toBeEnabled();
});

test('replacing the workpiece cancels pending analysis and clears suggestions', async ({ page }) => {
  let requested!: () => void; let release!: () => void; let settled!: () => void;
  const requestStarted = new Promise<void>((resolve) => { requested = resolve; });
  const releaseRequest = new Promise<void>((resolve) => { release = resolve; });
  const requestSettled = new Promise<void>((resolve) => { settled = resolve; });
  await page.route('**/discovery.worker*', async (route) => {
    requested(); await releaseRequest;
    try { await route.abort(); } catch { /* Worker may already be terminated. */ } finally { settled(); }
  });
  await loadSample(page);
  await page.getByRole('button', { name: 'Discover Seams' }).click(); await requestStarted;
  await page.getByRole('button', { name: 'Try Sample', exact: true }).click();
  await page.getByRole('button', { name: 'Load Gusseted Mounting Bracket' }).click();
  await page.getByRole('button', { name: 'Confirm & replace model' }).click();
  await expect(page.locator('.workpiece-panel h2')).toHaveText('gusset-bracket.stl');
  release(); await requestSettled;
  await expect(page.getByRole('button', { name: 'Discover Seams' })).toBeEnabled();
  await expect(page.getByLabel('Candidate suggestions')).toHaveCount(0);
  await expect(page.getByLabel('3D workpiece viewport')).toHaveAttribute('data-candidate-preview', 'none');
});
