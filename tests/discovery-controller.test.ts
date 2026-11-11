import { describe, expect, it, vi } from 'vitest';
import { generateTJoint } from '../scripts/generate-samples.ts';
import { discoverJunctionCandidates, DISCOVERY_TRIANGLE_LIMIT } from '../src/candidates/discover.ts';
import { createDiscoveryController, type DiscoveryPort } from '../src/candidates/discovery-controller.ts';
import type { DiscoveryRequest } from '../src/candidates/discovery-protocol.ts';
import { createImportController } from '../src/import/store.ts';
import { parseStl } from '../src/import/parse-stl.ts';
import { prepareAsset } from '../src/import/prepare-asset.ts';
import { samplePlan } from './helpers.ts';

function harness() {
  const parsed = parseStl(new Uint8Array(generateTJoint()).buffer);
  const asset = prepareAsset(parsed, { filename: 't.stl', byteLength: 1284, sha256: 'a'.repeat(64),
    encoding: parsed.encoding, inputTriangles: parsed.inputTriangles, omittedDegenerateTriangles: 0,
    bounds: parsed.bounds, warnings: [], parseMs: 0 }, 'mm');
  const source = createImportController(() => { throw new Error('Unexpected import'); });
  const document = samplePlan();
  source.store.setState({ active: { asset, document } });
  const ports: { request?: DiscoveryRequest; receive: (message: unknown) => void; error: () => void; stopped: boolean; transfer?: Transferable[] }[] = [];
  const controller = createDiscoveryController(source.store, (): DiscoveryPort => {
    const port: (typeof ports)[number] = { receive() {}, error() {}, stopped: false };
    ports.push(port);
    return { listen(message, error) { port.receive = message; port.error = error; },
      send(request, transfer) { port.request = request; port.transfer = transfer; }, stop() { port.stopped = true; } };
  });
  const success = (index: number) => {
    const request = ports[index]!.request!;
    return { type: 'result', identity: request.identity, result: discoverJunctionCandidates(request.input) };
  };
  return { source, asset, document, controller, ports, success };
}

describe('discovery worker controller', () => {
  it('exposes validated results and preserves the source asset, plan and history', () => {
    const h = harness(); const active = h.source.store.getState().active; const history = h.source.store.getState().history;
    const original = h.asset.positionsMm.slice();
    h.controller.start();
    const port = h.ports[0]!;
    expect(port.request!.input.positionsMm).not.toBe(h.asset.positionsMm);
    expect(port.transfer).toEqual([port.request!.input.positionsMm.buffer]);
    port.receive(h.success(0));
    expect(h.controller.store.getState().result?.candidates).toHaveLength(2);
    expect(h.controller.store.getState().phase).toBe('ready');
    expect(port.stopped).toBe(true);
    expect(h.asset.positionsMm).toEqual(original);
    expect(h.source.store.getState().active).toBe(active);
    expect(h.source.store.getState().history).toBe(history);
    h.controller.dispose(); h.source.dispose();
  });
  it('terminates on replacement, cancellation and disposal and ignores late responses', () => {
    const h = harness(); h.controller.start(); const stale = h.success(0);
    h.source.store.setState({ active: { asset: { ...h.asset, geometryRevision: 'replacement' }, document: h.document } });
    expect(h.ports[0]!.stopped).toBe(true); h.ports[0]!.receive(stale);
    expect(h.controller.store.getState().phase).toBe('idle');
    h.controller.start(); const cancelled = h.success(1); h.controller.cancel(); h.ports[1]!.receive(cancelled);
    expect(h.ports[1]!.stopped).toBe(true); expect(h.controller.store.getState().phase).toBe('idle');
    h.controller.start(); const disposed = h.success(2); h.controller.dispose(); h.ports[2]!.receive(disposed);
    expect(h.ports[2]!.stopped).toBe(true); expect(h.controller.store.getState().result).toBeNull();
    expect(() => h.controller.start()).toThrow(/disposed/); h.source.dispose();
  });
  it('keeps only the latest analysis and invalidates completed results on replacement', () => {
    const h = harness(); h.controller.start(); const old = h.success(0); h.controller.start();
    expect(h.ports[0]!.stopped).toBe(true); h.ports[0]!.receive(old);
    expect(h.controller.store.getState().phase).toBe('running');
    h.source.store.setState({ active: { asset: h.asset, document: { ...h.document, revision: h.document.revision + 1 } } });
    expect(h.controller.store.getState().phase).toBe('running');
    h.ports[1]!.receive(h.success(1)); expect(h.controller.store.getState().phase).toBe('ready');
    h.source.store.setState({ active: null }); expect(h.controller.store.getState().result).toBeNull();
    h.controller.dispose(); h.source.dispose();
  });
  it('rejects malformed, mismatched, out-of-bounds and duplicate candidates', () => {
    const h = harness();
    for (const mutate of [
      (r: ReturnType<typeof h.success>) => { r.result.candidates[0]!.path[0]![0] = Infinity; },
      (r: ReturnType<typeof h.success>) => { r.result.candidates[0]!.workpieceId = '00000000-0000-4000-8000-000000000001'; },
      (r: ReturnType<typeof h.success>) => { r.result.candidates[0]!.path[0]![0] = h.asset.workpiece.boundsMm.max[0] + 1; },
      (r: ReturnType<typeof h.success>) => { r.result.candidates.push(r.result.candidates[0]!); },
    ]) {
      h.controller.start(); const index = h.ports.length - 1; const response = h.success(index); mutate(response);
      h.ports[index]!.receive(response);
      expect(h.controller.store.getState().phase).toBe('error'); expect(h.ports[index]!.stopped).toBe(true);
    }
    h.controller.dispose(); h.source.dispose();
  });
  it('handles worker errors, startup failure, timeout and oversized assets without modifying the plan', () => {
    vi.useFakeTimers(); const h = harness(); const active = h.source.store.getState().active;
    try {
      h.controller.start(); h.ports[0]!.error(); expect(h.controller.store.getState().phase).toBe('error');
      expect(h.source.store.getState().active).toBe(active);
      h.controller.start(); vi.advanceTimersByTime(30_000); expect(h.ports[1]!.stopped).toBe(true);
      expect(h.controller.store.getState().error).toMatch(/timed out/);
      h.source.store.setState({ active: { asset: { ...h.asset, positionsMm: new Float64Array((DISCOVERY_TRIANGLE_LIMIT + 1) * 9) }, document: h.document } });
      h.controller.start(); expect(h.ports).toHaveLength(2); expect(h.controller.store.getState().error).toMatch(/4000/);
      expect(h.source.store.getState().active?.document).toBe(active?.document);
      const failing = createDiscoveryController(h.source.store, () => { throw new Error('worker unavailable'); });
      h.source.store.setState({ active }); failing.start(); expect(failing.store.getState().phase).toBe('error'); failing.dispose();
    } finally { h.controller.dispose(); h.source.dispose(); vi.useRealTimers(); }
  });
  it('ignores an old generation and rejects a mismatched response identity', () => {
    const h = harness(); h.controller.start(); const response = h.success(0);
    h.ports[0]!.receive({ ...response, identity: { ...response.identity, generation: response.identity.generation - 1 } });
    expect(h.controller.store.getState().phase).toBe('running');
    h.ports[0]!.receive({ ...response, identity: { ...response.identity, geometryRevision: 'wrong' } });
    expect(h.controller.store.getState().error).toMatch(/mismatched workpiece/);
    expect(h.ports[0]!.stopped).toBe(true);
    h.controller.dispose(); h.source.dispose();
  });
});
