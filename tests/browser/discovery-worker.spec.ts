import { expect, test } from '@playwright/test';
import { generateTJoint } from '../../scripts/generate-samples.ts';

test('a real discovery worker analyzes a T-joint without transferring the active geometry', async ({ page }) => {
  await page.goto('/');
  const bytes = Array.from(new Uint8Array(generateTJoint()));
  const result = await page.evaluate(async (data) => {
    // Import the actual Vite modules; no discovery UI is present at this milestone.
    const parsePath = '/src/import/parse-stl.ts';
    const preparePath = '/src/import/prepare-asset.ts';
    const sourcePath = '/src/import/store.ts';
    const discoveryPath = '/src/candidates/discovery-controller.ts';
    const { parseStl } = await import(/* @vite-ignore */ parsePath);
    const { prepareAsset } = await import(/* @vite-ignore */ preparePath);
    const { createImportController } = await import(/* @vite-ignore */ sourcePath);
    const { createDiscoveryController } = await import(/* @vite-ignore */ discoveryPath);
    const parsed = parseStl(new Uint8Array(data).buffer);
    const asset = prepareAsset(parsed, { filename: 't.stl', byteLength: data.length, sha256: 'a'.repeat(64),
      encoding: parsed.encoding, inputTriangles: parsed.inputTriangles, omittedDegenerateTriangles: 0,
      bounds: parsed.bounds, warnings: [], parseMs: 0 }, 'mm');
    const source = createImportController(() => { throw new Error('Unexpected import'); });
    const document = { marker: 'unchanged' };
    source.store.setState({ active: { asset, document } });
    const original = Array.from(asset.positionsMm);
    const controller = createDiscoveryController(source.store);
    const finished = new Promise<{ phase: string; count: number; error: string | null }>((resolve) => {
      controller.store.subscribe((state: { phase: string; result: { candidates: unknown[] } | null; error: string | null }) => {
        if (state.phase === 'ready' || state.phase === 'error') resolve({ phase: state.phase, count: state.result?.candidates.length ?? 0, error: state.error });
      });
    });
    controller.start();
    const state = await finished;
    const intact = asset.positionsMm.length === original.length && Array.from(asset.positionsMm).every((value, index) => value === original[index]);
    const unchanged = source.store.getState().active.document === document;
    controller.dispose(); source.dispose();
    return { ...state, intact, unchanged };
  }, bytes);
  expect(result).toEqual({ phase: 'ready', count: 2, error: null, intact: true, unchanged: true });
});
