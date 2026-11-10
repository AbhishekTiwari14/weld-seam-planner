import { describe, expect, it } from 'vitest';
import { inspectWeldJob } from '../examples/inspect-weld-job.ts';
import { resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('downstream consumer inspect-weld-job validation', () => {
  const fixturePath = resolve('fixtures/weld-job.v1.json');
  const validFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

  it('successfully inspects and returns validated job for canonical fixture', () => {
    const job = inspectWeldJob(fixturePath, { quiet: true });
    expect(job.schemaVersion).toBe('1.0.0');
    expect(job.jobId).toBe('00000000-0000-4000-8000-000000000001');
    expect(job.seams).toHaveLength(1);
    expect(job.sequence).toHaveLength(1);
  });

  it('rejects malformed JSON syntax', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weld-test-'));
    const badPath = join(dir, 'malformed.json');
    try {
      await writeFile(badPath, '{ "schemaVersion": "1.0.0", invalid syntax');
      expect(() => inspectWeldJob(badPath, { quiet: true })).toThrow(/Malformed JSON input/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects sequence containing missing seam ID', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weld-test-'));
    const badPath = join(dir, 'missing-seam.json');
    try {
      const badJob = structuredClone(validFixture);
      badJob.sequence = ['00000000-0000-4000-8000-999999999999'];
      await writeFile(badPath, JSON.stringify(badJob, null, 2));
      expect(() => inspectWeldJob(badPath, { quiet: true })).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects duplicate sequence entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weld-test-'));
    const badPath = join(dir, 'duplicate-sequence.json');
    try {
      const badJob = structuredClone(validFixture);
      const seamId = badJob.seams[0].id;
      badJob.sequence = [seamId, seamId];
      await writeFile(badPath, JSON.stringify(badJob, null, 2));
      expect(() => inspectWeldJob(badPath, { quiet: true })).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid welding parameters (e.g. zero or negative travel speed)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weld-test-'));
    const badPath = join(dir, 'invalid-speed.json');
    try {
      const badJob = structuredClone(validFixture);
      badJob.seams[0].parameters.travelSpeedMmPerS = 0;
      await writeFile(badPath, JSON.stringify(badJob, null, 2));
      expect(() => inspectWeldJob(badPath, { quiet: true })).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-existent file path with descriptive error', () => {
    expect(() => inspectWeldJob('nonexistent/path/to/job.json', { quiet: true })).toThrow(/Failed to read file/);
  });

  it('rejects forged heuristic warnings through the production semantic validator', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weld-test-'));
    try {
      const badJob = structuredClone(validFixture);
      badJob.review.warnings = [];
      const path = join(dir, 'forged.json');
      await writeFile(path, JSON.stringify(badJob));
      expect(() => inspectWeldJob(path, { quiet: true })).toThrow(/warnings do not match/i);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('runs the CLI from another working directory and exits nonzero on invalid input', () => {
    const script = resolve('examples/inspect-weld-job.ts');
    const valid = spawnSync(process.execPath, [script, fixturePath], { cwd: tmpdir(), encoding: 'utf8' });
    expect(valid.status, valid.stderr).toBe(0);
    expect(valid.stdout).toContain('JOB IDENTIFICATION');
    expect(valid.stdout).toContain(validFixture.jobId);
    const invalid = spawnSync(process.execPath, [script, join(tmpdir(), 'missing-weld-plan.json')], { cwd: tmpdir(), encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Failed to read file');
  });
});
