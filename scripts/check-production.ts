import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import path from 'node:path';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { windowsHide: true, stdio: 'pipe' });
let serverOutput = '';
server.stdout.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try { ready = (await fetch('http://127.0.0.1:4173')).ok; } catch { /* server is starting */ }
    if (ready) break;
    await setTimeout(100);
  }
  if (!ready) throw new Error(`Preview did not start: ${serverOutput}`);
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : 'chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    const clockWarnings: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.text().includes('THREE.Clock')) clockWarnings.push(message.text()); });
    await page.goto('http://127.0.0.1:4173/?inspect=1');
    await page.getByLabel('Import STL file').setInputFiles(path.resolve('fixtures/models/analytic-plate.stl'));
    await page.getByRole('dialog').waitFor();
    await page.getByRole('radio', { name: 'in', exact: true }).check();
    await page.getByRole('button', { name: 'Confirm & open model' }).click();
    await expect(page.getByText('Model ready', { exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.dimensions')).toContainText('1,016');
    await page.getByRole('button', { name: /Fit model/ }).click();
    expect(await page.evaluate(() => window.__weldDebug)).toBeUndefined();
    await mkdir('.local/evidence', { recursive: true });
    await page.screenshot({ path: '.local/evidence/production.png' });
    expect(errors).toEqual([]);
    expect(clockWarnings).toEqual([]);
    console.log('PASS: production worker, inches-to-mm dimensions, viewport, and development-diagnostic exclusion.');
  } finally { await browser.close(); }
} finally { server.kill(); }
