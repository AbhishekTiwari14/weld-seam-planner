import type { SourceUnit } from '../domain/contracts.ts';

export interface SampleModel {
  id: string;
  name: string;
  filename: string;
  path: string;
  sha256: string;
  byteLength: number;
  defaultUnit: SourceUnit;
  description: string;
  dimensionsMm: [number, number, number];
  triangles: number;
  weldingContext: string;
  features: string[];
  badge: string;
}

export const SAMPLE_MODELS: readonly SampleModel[] = [
  {
    id: 't-joint',
    name: 'T-Joint Fillet Assembly',
    filename: 't-joint.stl',
    path: '/samples/t-joint.stl',
    sha256: 'a400959843fe0bebb0d3781dfe3c2cb93d7356643cf51f40d747230a287248a5',
    byteLength: 1284,
    defaultUnit: 'mm',
    description: 'Two perpendicular structural plates forming twin longitudinal fillet weld joints.',
    dimensionsMm: [120, 150, 80],
    triangles: 24,
    weldingContext: 'Double-sided longitudinal fillet weld along the web-to-flange junction.',
    features: ['120 × 150 × 10 mm base flange', '10 × 130 × 70 mm vertical web', 'Two 130 mm straight fillet seams'],
    badge: 'Structural / Fillet',
  },
  {
    id: 'gusset-bracket',
    name: 'Gusseted Mounting Bracket',
    filename: 'gusset-bracket.stl',
    path: '/samples/gusset-bracket.stl',
    sha256: 'f8dc49374e914a3943a1bcaff5c799f77f5bf54cbeafcfd90bc5ff600487b5d3',
    byteLength: 1684,
    defaultUnit: 'mm',
    description: 'Heavy bracket with a vertical backplate, base flange and a triangular stiffener rib.',
    dimensionsMm: [100, 120, 120],
    triangles: 32,
    weldingContext: 'Multi-joint structural assembly requiring sequenced horizontal and vertical fillet welds.',
    features: ['100 × 15 × 120 mm backplate', '100 × 105 × 15 mm base flange', 'Triangular stiffener rib (90 × 90 mm)'],
    badge: 'Multi-Joint / Bracket',
  },
  {
    id: 'pipe-on-plate',
    name: 'Pipe-on-Plate Nozzle Joint',
    filename: 'pipe-on-plate.stl',
    path: '/samples/pipe-on-plate.stl',
    sha256: '0a1c36d89df52e8cdc1cb0b6b91a78fdb39c3f4e5a4d1c33fb30379481544c70',
    byteLength: 15084,
    defaultUnit: 'mm',
    description: 'Cylindrical hollow pipe mounted to a square baseplate for circumferential weld planning.',
    dimensionsMm: [150, 150, 90],
    triangles: 300,
    weldingContext: '360° circumferential nozzle-to-plate weld requiring circular point sequencing.',
    features: ['150 × 150 × 15 mm square base', 'Ø70 mm OD × 10 mm wall pipe', 'Curved surface picking demonstration'],
    badge: 'Curved / Circumferential',
  },
] as const;

export async function fetchSampleFile(sample: SampleModel, signal?: AbortSignal, maxBytes?: number): Promise<File> {
  const options: RequestInit = signal ? { signal } : {};
  const response = await fetch(sample.path, options);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Failed to load sample model "${sample.name}" (${response.status} ${response.statusText}).`);
  }
  if (maxBytes === undefined) {
    const blob = await response.blob();
    return new File([blob], sample.filename, { type: 'model/stl', lastModified: Date.now() });
  }
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Bundled sample exceeds its expected size.');
  }
  if (!response.body) throw new Error('Bundled sample could not be read safely.');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Bundled sample exceeds its expected size.'); }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  return new File(chunks, sample.filename, { type: 'model/stl', lastModified: Date.now() });
}
