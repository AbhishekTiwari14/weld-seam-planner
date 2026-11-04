import { chromium } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Run against the local dev server; separate from correctness tests and their tracing overhead.
await mkdir('.local/evidence', { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const tasks: { start: number; duration: number }[] = [];
    (window as unknown as { __longTasks: typeof tasks }).__longTasks = tasks;
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => {
      tasks.push({ start: entry.startTime, duration: entry.duration });
    })).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('http://127.0.0.1:5173/?inspect=1');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const results = [];
  const names = (await readdir('.local/models')).filter((name) => /stl$/i.test(name));
  // Real holdouts first, then the two acceptance-envelope cases, then best effort.
  names.sort((a, b) => Number(a.includes('750000')) - Number(b.includes('750000')) || a.localeCompare(b));
  for (const name of names) {
    await page.evaluate(() => { (window as unknown as { __longTasks: unknown[] }).__longTasks.length = 0; });
    const started = performance.now();
    await page.getByLabel('Import STL file').setInputFiles(path.resolve('.local/models', name));
    const outcome = await Promise.race([
      page.getByRole('dialog').waitFor({ timeout: 65_000 }).then(() => 'preview'),
      page.getByRole('alert').waitFor({ timeout: 65_000 }).then(() => 'error'),
    ]);
    if (outcome === 'error') {
      results.push({ name, error: await page.getByRole('alert').innerText() });
      await page.getByLabel('Dismiss import error').click();
      continue;
    }
    const previewMs = performance.now() - started;
    await page.getByRole('button', { name: /Confirm & (open|replace) model/ }).click();
    await page.waitForFunction((filename) => window.__weldDebug && JSON.parse(window.__weldDebug.snapshot().frame).source.filename === filename && window.__weldDebug.snapshot().triangles > 0, name, { timeout: 65_000 });
    const visibleMs = performance.now() - started;
    const canvas = page.locator('canvas');
    const rect = (await canvas.boundingBox())!;
    const gpu = await canvas.evaluate((node) => {
      const gl = (node as HTMLCanvasElement).getContext('webgl2')!;
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
    });
    const picks = await page.evaluate(({ x, y }) => {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        window.__weldDebug!.pick(x + i, y);
        samples.push(window.__weldDebug!.snapshot().pickMs);
      }
      return samples;
    }, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    // RAF intervals during actual orbit input, not an artificial render-only loop.
    await page.evaluate(() => {
      const samples: number[] = [];
      (window as unknown as { __frames: number[] }).__frames = samples;
      let previous = performance.now();
      const frame = (now: number) => { samples.push(now - previous); previous = now; if (samples.length < 90) requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 180, rect.y + rect.height / 2 + 50, { steps: 60 });
    await page.mouse.up();
    const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames);
    const metrics = await cdp.send('Performance.getMetrics');
    const snapshot = await page.evaluate(() => window.__weldDebug!.snapshot());
    const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks);
    const entry = { name, previewMs, visibleMs, gpu, snapshot, picks, frames, longTasks,
      jsHeapUsed: metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value,
      jsHeapTotal: metrics.metrics.find((metric) => metric.name === 'JSHeapTotalSize')?.value };
    results.push(entry);
    console.log(JSON.stringify({ name, previewMs, visibleMs, parse: snapshot.timings, pickMax: Math.max(...picks), triangles: snapshot.triangles, geometries: snapshot.geometries }));
    await page.screenshot({ path: `.local/evidence/${name}.png` });
  }
  const report = { capturedAt: new Date().toISOString(), node: process.version, browser: browser.version(),
    cpu: os.cpus()[0]?.model, ramBytes: os.totalmem(), platform: `${os.platform()} ${os.release()}`,
    provenance: JSON.parse(await readFile('.local/models/provenance.json', 'utf8')), errors, results };
  await writeFile('.local/evidence/profile.json', JSON.stringify(report, null, 2) + '\n');
  if (errors.length || results.some((result) => 'error' in result)) throw new Error('Model acceptance failed; inspect .local/evidence/profile.json.');
} finally { await browser.close(); }
