import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ImportState } from '../import/store.ts';
import { candidateSchema } from './contracts.ts';
import { DISCOVERY_CANDIDATE_LIMIT, DISCOVERY_TRIANGLE_LIMIT, type DiscoveryResult } from './discover.ts';
import type { DiscoveryIdentity, DiscoveryRequest } from './discovery-protocol.ts';

const responseSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('result'), identity: z.strictObject({
    generation: z.number().int().nonnegative(), workpieceId: z.uuid(), geometryRevision: z.string().min(1).max(200),
  }), result: z.strictObject({ candidates: z.array(candidateSchema).max(DISCOVERY_CANDIDATE_LIMIT),
    limitations: z.array(z.string().min(1).max(1000)).max(100) }) }),
  z.strictObject({ type: z.literal('error'), identity: z.strictObject({
    generation: z.number().int().nonnegative(), workpieceId: z.uuid(), geometryRevision: z.string().min(1).max(200),
  }), message: z.string().min(1).max(1000) }),
]);

export interface DiscoveryPort {
  send(request: DiscoveryRequest, transfer: Transferable[]): void;
  listen(message: (response: unknown) => void, error: () => void): void;
  stop(): void;
}

export interface DiscoveryState {
  phase: 'idle' | 'running' | 'ready' | 'error';
  identity: DiscoveryIdentity | null;
  result: DiscoveryResult | null;
  error: string | null;
}

const sameGeometry = (a: Pick<DiscoveryIdentity, 'workpieceId' | 'geometryRevision'>, b: Pick<DiscoveryIdentity, 'workpieceId' | 'geometryRevision'>) =>
  a.workpieceId === b.workpieceId && a.geometryRevision === b.geometryRevision;

/** Owns discovery only; the source store remains the sole owner of the workpiece and plan. */
export function createDiscoveryController(source: Pick<StoreApi<ImportState>, 'getState' | 'subscribe'>,
  createPort: () => DiscoveryPort = createBrowserDiscoveryPort) {
  const store = createStore<DiscoveryState>(() => ({ phase: 'idle', identity: null, result: null, error: null }));
  let generation = 0;
  let port: DiscoveryPort | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  function stop() { generation++; clearTimeout(timer); timer = undefined; port?.stop(); port = null; }
  function reset() { stop(); store.setState({ phase: 'idle', identity: null, result: null, error: null }); }
  function fail(message: string) { stop(); store.setState({ phase: 'error', result: null, error: message }); }
  const unsubscribe = source.subscribe((state) => {
    const identity = store.getState().identity;
    const asset = state.active?.asset;
    if (identity && (!asset || !sameGeometry(identity, { workpieceId: asset.workpiece.id, geometryRevision: asset.geometryRevision }))) reset();
  });
  return {
    store,
    start() {
      if (disposed) throw new Error('Discovery controller has been disposed.');
      stop();
      const asset = source.getState().active?.asset;
      if (!asset) { store.setState({ phase: 'error', identity: null, result: null, error: 'Import a workpiece before analysis.' }); return; }
      const identity: DiscoveryIdentity = { generation, workpieceId: asset.workpiece.id, geometryRevision: asset.geometryRevision };
      store.setState({ phase: 'running', identity, result: null, error: null });
      if (asset.positionsMm.length === 0 || asset.positionsMm.length % 9 !== 0) { fail('Workpiece geometry is invalid for analysis.'); return; }
      if (asset.positionsMm.length / 9 > DISCOVERY_TRIANGLE_LIMIT) {
        fail(`Contact analysis supports at most ${DISCOVERY_TRIANGLE_LIMIT} triangles. Manual planning remains available.`); return;
      }
      try {
        // Transfer the bounded copy, never the active asset's authoritative buffer.
        const positionsMm = asset.positionsMm.slice();
        const request: DiscoveryRequest = { identity, input: { positionsMm, boundsMm: asset.workpiece.boundsMm,
          workpieceId: identity.workpieceId, geometryRevision: identity.geometryRevision } };
        port = createPort();
        port.listen((raw) => {
          if (disposed || generation !== identity.generation) return;
          const active = source.getState().active?.asset;
          if (!active || !sameGeometry(identity, { workpieceId: active.workpiece.id, geometryRevision: active.geometryRevision })) { reset(); return; }
          const parsed = responseSchema.safeParse(raw);
          if (!parsed.success) { fail('Discovery worker returned an invalid response.'); return; }
          const response = parsed.data;
          if (response.identity.generation !== identity.generation) return;
          if (!sameGeometry(response.identity, identity)) { fail('Discovery worker returned a mismatched workpiece.'); return; }
          if (response.type === 'error') { fail(`Geometry analysis failed: ${response.message}`); return; }
          const ids = new Set<string>();
          const bounds = active.workpiece.boundsMm;
          const invalid = response.result.candidates.some((candidate) => {
            if (!sameGeometry(candidate, identity) || candidate.review.state !== 'suggested' || ids.has(candidate.candidateId)) return true;
            ids.add(candidate.candidateId);
            return candidate.path.some((point) => point.some((value, axis) => value < bounds.min[axis]! || value > bounds.max[axis]!));
          });
          if (invalid) { fail('Discovery worker returned invalid candidate geometry or provenance.'); return; }
          stop(); store.setState({ phase: 'ready', result: response.result, error: null });
        }, () => { if (!disposed && generation === identity.generation) fail('Discovery worker failed. Manual planning remains available.'); });
        timer = setTimeout(() => { if (generation === identity.generation) fail('Geometry analysis timed out. Manual planning remains available.'); }, 30_000);
        port.send(request, [positionsMm.buffer as ArrayBuffer]);
      } catch { fail('Unable to start geometry analysis. Manual planning remains available.'); }
    },
    cancel: reset,
    dispose() { if (disposed) return; disposed = true; stop(); unsubscribe(); },
  };
}

export function createBrowserDiscoveryPort(): DiscoveryPort {
  const worker = new Worker(new URL('./discovery.worker.ts', import.meta.url), { type: 'module' });
  return {
    send: (request, transfer) => worker.postMessage(request, transfer),
    listen: (message, error) => {
      worker.onmessage = (event: MessageEvent<unknown>) => message(event.data);
      worker.onerror = (event) => { event.preventDefault(); error(); };
      worker.onmessageerror = error;
    },
    stop: () => worker.terminate(),
  };
}
