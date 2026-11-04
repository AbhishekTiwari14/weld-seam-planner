import { WORKPIECE_FRAME, type SourceUnit } from '../domain/contracts.ts';
import { createViewTransform, MILLIMETRES_PER_UNIT } from '../geometry/coordinates.ts';
import { GUARANTEED_IMPORT_ENVELOPE } from '../domain/contracts.ts';
import type { ImportPreview, MeshAsset, ParsedStl } from './types.ts';

export function prepareAsset(parsed: ParsedStl, preview: ImportPreview, unit: SourceUnit): MeshAsset {
  const started = performance.now();
  const scale = MILLIMETRES_PER_UNIT[unit];
  const boundsMm = { min: parsed.bounds.min.map((n) => n * scale) as [number, number, number],
    max: parsed.bounds.max.map((n) => n * scale) as [number, number, number] };
  const view = createViewTransform(boundsMm);
  const positionsMm = new Float64Array(parsed.positions.length);
  const displayPositions = new Float32Array(parsed.positions.length);
  const displayNormals = new Float32Array(parsed.positions.length);
  let maxDisplayErrorMm = 0;
  let collapsedTriangles = 0;
  for (let i = 0; i < parsed.positions.length; i++) {
    const value = parsed.positions[i]! * scale;
    if (!Number.isFinite(value)) throw new Error('Physical dimensions exceed safe numeric arithmetic.');
    positionsMm[i] = value;
    displayPositions[i] = (value - view.centerMm[i % 3]!) / view.scaleMm;
    maxDisplayErrorMm = Math.max(maxDisplayErrorMm, Math.abs(displayPositions[i]! * view.scaleMm + view.centerMm[i % 3]! - value));
  }
  for (let i = 0; i < displayPositions.length; i += 9) {
    const ax = displayPositions[i + 3]! - displayPositions[i]!;
    const ay = displayPositions[i + 4]! - displayPositions[i + 1]!;
    const az = displayPositions[i + 5]! - displayPositions[i + 2]!;
    const bx = displayPositions[i + 6]! - displayPositions[i]!;
    const by = displayPositions[i + 7]! - displayPositions[i + 1]!;
    const bz = displayPositions[i + 8]! - displayPositions[i + 2]!;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) collapsedTriangles++;
    for (let vertex = 0; vertex < 3; vertex++) {
      displayNormals.set(length === 0 ? [0, 0, 1] : [nx / length, ny / length, nz / length], i + vertex * 3);
    }
  }
  if (collapsedTriangles === displayPositions.length / 9) throw new Error('No triangles remain visible at the available display precision.');
  const warnings = [...preview.warnings];
  if (collapsedTriangles) warnings.push({ code: 'display-collapse', message: `${collapsedTriangles.toLocaleString()} extremely small triangles collapse at display precision and cannot be picked. Authoritative coordinates are retained.` });
  if (maxDisplayErrorMm > 0.01) warnings.push({ code: 'display-precision', message: `Display rounding reaches ${maxDisplayErrorMm.toPrecision(3)} mm per coordinate. Zoom cannot recover sub-display features; source coordinates remain double precision.` });
  if (preview.byteLength > GUARANTEED_IMPORT_ENVELOPE.bytes || preview.inputTriangles > GUARANTEED_IMPORT_ENVELOPE.triangles) {
    warnings.push({ code: 'best-effort', message: 'This model exceeds the 500,000-triangle / 50 MiB tested-support target. Responsiveness is best effort.' });
  }
  return { geometryRevision: crypto.randomUUID(), positionsMm, displayPositions, displayNormals, view,
    maxDisplayErrorMm, warnings, acceleration: null, timings: { parseMs: preview.parseMs, prepareMs: performance.now() - started, accelerationMs: 0 },
    workpiece: { id: crypto.randomUUID(), frame: { ...WORKPIECE_FRAME }, boundsMm,
      source: { filename: preview.filename, byteLength: preview.byteLength, sha256: preview.sha256,
        encoding: preview.encoding, unit, inputTriangles: preview.inputTriangles,
        omittedDegenerateTriangles: preview.omittedDegenerateTriangles } } };
}
