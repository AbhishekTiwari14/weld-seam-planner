import type { Bounds, PlanningDocument, SourceUnit, Workpiece } from '../domain/contracts.ts';
import type { ViewTransform } from '../geometry/coordinates.ts';
import type { SerializedBVH } from 'three-mesh-bvh';

// Allocation guards, distinct from the 500k / 50 MiB tested-support target.
export const IMPORT_SAFETY_LIMITS = { bytes: 64 * 1024 ** 2, triangles: 750_000 } as const;
export interface ImportWarning { code: string; message: string }
export interface ParsedStl {
  positions: Float64Array;
  encoding: 'ascii' | 'binary';
  inputTriangles: number;
  omittedDegenerateTriangles: number;
  bounds: Bounds;
}
export interface ImportPreview {
  filename: string;
  byteLength: number;
  sha256: string;
  encoding: ParsedStl['encoding'];
  inputTriangles: number;
  omittedDegenerateTriangles: number;
  bounds: Bounds;
  warnings: ImportWarning[];
  parseMs: number;
}
export interface MeshAsset {
  geometryRevision: string;
  workpiece: Workpiece;
  positionsMm: Float64Array;
  displayPositions: Float32Array;
  displayNormals: Float32Array;
  view: ViewTransform;
  warnings: ImportWarning[];
  maxDisplayErrorMm: number;
  acceleration: SerializedBVH | null;
  timings: { parseMs: number; prepareMs: number; accelerationMs: number };
}
export interface ActiveWorkpiece { asset: MeshAsset; document: PlanningDocument }
export type WorkerRequest = { type: 'read'; file: File } | { type: 'prepare'; unit: SourceUnit };
export type WorkerResponse =
  | { type: 'status'; message: string }
  | { type: 'preview'; preview: ImportPreview }
  | { type: 'ready'; asset: MeshAsset }
  | { type: 'error'; message: string };
