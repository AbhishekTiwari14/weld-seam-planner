import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_MODELS } from '../src/samples/manifest.ts';
import { findBundledSample, loadVerifiedSample } from '../src/recovery/sample-source.ts';
import { samplePlan } from './helpers.ts';

afterEach(() => vi.unstubAllGlobals());

describe('bundled sample source resolution', () => {
  it.each(SAMPLE_MODELS)('pins exact checked-in bytes for $id and recognizes renamed sources', async (sample) => {
    const bytes = await readFile(`public${sample.path}`);
    expect(bytes.length).toBe(sample.byteLength);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sample.sha256);
    const document = samplePlan();
    Object.assign(document.content.workpiece.source, { filename: 'renamed.stl', sha256: sample.sha256,
      byteLength: sample.byteLength, encoding: 'binary', inputTriangles: sample.triangles, omittedDegenerateTriangles: 0 });
    expect(findBundledSample(document)?.id).toBe(sample.id);
    document.content.workpiece.source.byteLength++;
    expect(findBundledSample(document)).toBeUndefined();
    document.content.workpiece.source.byteLength--;
    document.content.workpiece.source.sha256 = '0'.repeat(64);
    document.content.workpiece.source.filename = sample.filename;
    expect(findBundledSample(document)).toBeUndefined();
  });

  it('verifies fetched bytes and rejects corruption, oversized data and missing assets', async () => {
    const sample = SAMPLE_MODELS[0]!;
    const bytes = new Uint8Array(await readFile(`public${sample.path}`));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    expect((await loadVerifiedSample(sample, new AbortController().signal)).size).toBe(sample.byteLength);
    const corrupt = bytes.slice(); corrupt[100] = corrupt[100]! ^ 1;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(corrupt)));
    await expect(loadVerifiedSample(sample, new AbortController().signal)).rejects.toThrow(/SHA-256/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(sample.byteLength + 1))));
    await expect(loadVerifiedSample(sample, new AbortController().signal)).rejects.toThrow(/size/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(loadVerifiedSample(sample, new AbortController().signal)).rejects.toThrow(/404/);
  });

  it('cancels an oversized advertised response without reading its body', async () => {
    const sample = SAMPLE_MODELS[0]!;
    const cancel = vi.fn();
    const stream = new ReadableStream({ cancel });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'content-length': String(sample.byteLength + 1) } })));
    await expect(loadVerifiedSample(sample, new AbortController().signal)).rejects.toThrow(/size/);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
