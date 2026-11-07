import type { SourceUnit } from '../domain/contracts.ts';

export interface SampleModel {
  id: string;
  name: string;
  filename: string;
  path: string;
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
    defaultUnit: 'mm',
    description: 'Cylindrical hollow pipe mounted to a square baseplate for circumferential weld planning.',
    dimensionsMm: [150, 150, 90],
    triangles: 300,
    weldingContext: '360° circumferential nozzle-to-plate weld requiring circular point sequencing.',
    features: ['150 × 150 × 15 mm square base', 'Ø70 mm OD × 10 mm wall pipe', 'Curved surface picking demonstration'],
    badge: 'Curved / Circumferential',
  },
] as const;

export async function fetchSampleFile(sample: SampleModel): Promise<File> {
  const response = await fetch(sample.path);
  if (!response.ok) {
    throw new Error(`Failed to load sample model "${sample.name}" (${response.status} ${response.statusText}).`);
  }
  const blob = await response.blob();
  return new File([blob], sample.filename, { type: 'model/stl', lastModified: Date.now() });
}
