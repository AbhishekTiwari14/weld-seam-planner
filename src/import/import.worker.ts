/// <reference lib="webworker" />
import { parseStl } from './parse-stl.ts';
import { prepareAsset } from './prepare-asset.ts';
import { IMPORT_SAFETY_LIMITS, type ImportPreview, type ParsedStl, type WorkerRequest, type WorkerResponse } from './types.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
let parsed: ParsedStl | undefined;
let preview: ImportPreview | undefined;
scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === 'read') {
      const file = event.data.file;
      if (file.size > IMPORT_SAFETY_LIMITS.bytes) throw new Error('File exceeds the 64 MiB resource safety limit.');
      send({ type: 'status', message: 'Reading local file…' });
      const buffer = await file.arrayBuffer();
      send({ type: 'status', message: 'Checking STL geometry and source fingerprint…' });
      const start = performance.now();
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      parsed = parseStl(buffer);
      preview = { filename: file.name, byteLength: file.size,
        sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
        encoding: parsed.encoding, bounds: parsed.bounds, inputTriangles: parsed.inputTriangles,
        omittedDegenerateTriangles: parsed.omittedDegenerateTriangles, parseMs: performance.now() - start,
        warnings: parsed.omittedDegenerateTriangles ? [{ code: 'degenerate', message: `${parsed.omittedDegenerateTriangles.toLocaleString()} zero-area triangles were omitted.` }] : [] };
      send({ type: 'preview', preview });
    } else {
      if (!parsed || !preview) throw new Error('No parsed model is available. Import the file again.');
      send({ type: 'status', message: 'Preparing millimetre geometry and display buffers…' });
      const asset = prepareAsset(parsed, preview, event.data.unit);
      send({ type: 'ready', asset }, [asset.positionsMm.buffer, asset.displayPositions.buffer, asset.displayNormals.buffer]);
      parsed = undefined;
      preview = undefined;
    }
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Unable to process this STL.' }); }
};
