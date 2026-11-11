import { expect, test, type Page } from '@playwright/test';
import { configureSeam } from '../helpers/planning-browser.ts';

const sizes = [
  { width: 1440, height: 900 }, { width: 1366, height: 768 },
  { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 390, height: 844 },
];

test('sample and restore dialogs are responsive, dismissible, and restore focus', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  expect((await page.request.get('/favicon.svg')).ok()).toBe(true);
  for (const size of sizes) {
    await page.setViewportSize(size);
    const opener = page.getByRole('button', { name: 'Try Sample', exact: true });
    await opener.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Select an engineering sample.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.sample-card')).toHaveCount(3);
    if (size.width >= 1024) expect(await dialog.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    for (const card of await dialog.locator('.sample-card').all()) {
      await expect(card.locator('svg')).toBeVisible();
      await expect(card).toContainText('Dimensions:');
      const button = card.getByRole('button', { name: /^Load / });
      await button.scrollIntoViewIfNeeded(); await expect(button).toBeInViewport({ ratio: 1 });
    }
    await dialog.screenshot({ path: info.outputPath(`sample-dialog-${size.width}.png`) });
    await dialog.getByRole('button', { name: 'Close sample dialog' }).click();
    await expect(dialog).not.toBeVisible(); await expect(opener).toBeFocused();
  }
  const sampleOpener = page.getByRole('button', { name: 'Try Sample', exact: true });
  await sampleOpener.click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(sampleOpener).toBeFocused();
  const restore = page.getByRole('button', { name: 'Restore Plan', exact: true });
  await restore.focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Close restore dialog' }).click();
  await expect(restore).toBeFocused();
  await restore.click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(restore).toBeFocused();
  await page.getByRole('button', { name: 'Try Sample', exact: true }).click();
  await page.getByRole('button', { name: 'Load T-Joint Fillet Assembly' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirm the source units.' })).toBeVisible();
  await page.getByRole('button', { name: 'Close import dialog' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.empty-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Sample', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Try Sample', exact: true }).click();
  await page.getByRole('button', { name: 'Load T-Joint Fillet Assembly' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirm the source units.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Sample', exact: true })).toBeFocused();
});

async function addSeam(page: Page) {
  await page.getByRole('button', { name: 'Add seam', exact: true }).click();
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Canvas unavailable');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.52);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.52);
  await expect(page.getByTestId('draft-count')).toHaveText('2');
  await page.getByRole('button', { name: /Finish seam/ }).click();
}

test('stepper reflects zero, one and multiple committed seams without a sequence confirmation', async ({ page }) => {
  await page.goto('/');
  const steps = page.locator('.workflow-stepper');
  const sequence = steps.locator('[data-step="4"]');
  const review = steps.locator('[data-step="5"]');
  await expect(sequence).toHaveClass(/is-upcoming/); await expect(review).toHaveClass(/is-upcoming/);
  await page.getByRole('button', { name: 'Load sample T-Joint Fillet Assembly' }).click();
  await page.getByRole('button', { name: 'Confirm & open model' }).click();
  await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
  await addSeam(page);
  await expect(sequence).toHaveClass(/is-upcoming/); await expect(review).toHaveClass(/is-upcoming/);
  await configureSeam(page, '5', '80', '20');
  await expect(sequence).toHaveClass(/is-completed/); await expect(review).toHaveClass(/is-ready/);
  const colors = await steps.evaluate((node) => {
    const connector = node.querySelector('[data-step="4"] .stepper-divider')!;
    const completed = node.querySelector('[data-step="3"] .stepper-divider')!;
    return [getComputedStyle(connector).backgroundColor, getComputedStyle(completed).backgroundColor];
  });
  expect(colors[0]).toBe(colors[1]);
  await addSeam(page);
  await expect(sequence).toHaveClass(/is-upcoming/); await expect(review).toHaveClass(/is-upcoming/);
  await configureSeam(page, '10', '100', '22');
  await expect(sequence).toHaveClass(/is-completed/); await expect(sequence).toContainText('2 in order');
  await expect(review).toHaveClass(/is-ready/);
  await page.getByRole('button', { name: 'Move Seam 2 earlier' }).click();
  await expect(sequence).toHaveClass(/is-completed/);
  await review.getByRole('button').click(); await expect(review).toHaveClass(/is-active/);
  await page.getByRole('button', { name: 'Close review' }).click(); await expect(review).toHaveClass(/is-ready/);
});
