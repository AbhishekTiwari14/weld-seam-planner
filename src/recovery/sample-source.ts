import type { PlanningDocument } from '../domain/contracts.ts';
import { SAMPLE_MODELS, fetchSampleFile, type SampleModel } from '../samples/manifest.ts';

export function findBundledSample(document: PlanningDocument): SampleModel | undefined {
  const source = document.content.workpiece.source;
  return SAMPLE_MODELS.find((sample) => sample.sha256 === source.sha256 && sample.byteLength === source.byteLength &&
    source.encoding === 'binary' && source.inputTriangles === sample.triangles && source.omittedDegenerateTriangles === 0);
}

export async function loadVerifiedSample(sample: SampleModel, signal: AbortSignal): Promise<File> {
  const file = await fetchSampleFile(sample, signal, sample.byteLength);
  if (file.size !== sample.byteLength) throw new Error('Bundled sample size does not match the saved source.');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== sample.sha256) throw new Error('Bundled sample SHA-256 does not match the saved source.');
  return file;
}
