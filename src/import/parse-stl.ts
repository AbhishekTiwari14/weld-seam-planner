import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { Bounds } from '../domain/contracts.ts';
import { IMPORT_SAFETY_LIMITS, type ParsedStl } from './types.ts';

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const triple = '(\\S+)\\s+(\\S+)\\s+(\\S+)';
// Narrow ASCII adaptation: capture numeric text before STLLoader's Float32BufferAttribute.
// Recognizes standard facet blocks; does not repair topology or infer CAD structure.
const facetPattern = `facet\\s+normal\\s+${triple}\\s+outer\\s+loop\\s+vertex\\s+${triple}\\s+vertex\\s+${triple}\\s+vertex\\s+${triple}\\s+endloop\\s+endfacet`;

function parseAscii(text: string): Float64Array {
  const count = text.match(/\bfacet\s+normal\b/gi)?.length ?? 0;
  if (count === 0) throw new Error('ASCII STL contains no triangles.');
  checkCount(count);
  const positions = new Float64Array(count * 9);
  const facet = new RegExp(facetPattern, 'iy');
  const solid = /solid(?:[^\r\n]*)?(?:\r?\n|$)/iy;
  const end = /endsolid(?:[^\r\n]*)?(?:\r?\n|$)/iy;
  let cursor = 0;
  let written = 0;
  let inside = false;
  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++;
    if (cursor === text.length) break;
    if (!inside) {
      solid.lastIndex = cursor;
      if (!solid.exec(text)) throw new Error('Expected an ASCII STL solid header.');
      cursor = solid.lastIndex;
      inside = true;
      continue;
    }
    end.lastIndex = cursor;
    if (end.exec(text)) { cursor = end.lastIndex; inside = false; continue; }
    facet.lastIndex = cursor;
    const match = facet.exec(text);
    if (!match) throw new Error('Malformed ASCII STL facet: expected a normal and exactly three vertices.');
    for (let i = 1; i <= 12; i++) {
      const token = match[i]!;
      const value = Number(token);
      if (!DECIMAL.test(token) || !Number.isFinite(value)) throw new Error('STL contains an invalid or non-finite number.');
      if (i > 3) positions[written++] = value;
    }
    cursor = facet.lastIndex;
  }
  if (inside || written !== positions.length) throw new Error('Incomplete ASCII STL: missing endsolid or facet data.');
  return positions;
}

function checkCount(count: number): void {
  if (count < 1) throw new Error('STL contains no triangles.');
  if (count > IMPORT_SAFETY_LIMITS.triangles) throw new Error(`Model exceeds the safety limit of ${IMPORT_SAFETY_LIMITS.triangles.toLocaleString()} triangles.`);
}

function compactUsable(positions: Float64Array): { positions: Float64Array; bounds: Bounds; omitted: number } {
  const bounds: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let written = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3]! - positions[i]!;
    const ay = positions[i + 4]! - positions[i + 1]!;
    const az = positions[i + 5]! - positions[i + 2]!;
    const bx = positions[i + 6]! - positions[i]!;
    const by = positions[i + 7]! - positions[i + 1]!;
    const bz = positions[i + 8]! - positions[i + 2]!;
    const scale = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az), Math.abs(bx), Math.abs(by), Math.abs(bz));
    if (!Number.isFinite(scale)) throw new Error('Coordinate range exceeds safe numeric arithmetic.');
    // Scaling avoids overflow/underflow when testing area. No tolerance removes thin triangles.
    const cross = scale === 0 ? 0 : Math.hypot(
      (ay / scale) * (bz / scale) - (az / scale) * (by / scale),
      (az / scale) * (bx / scale) - (ax / scale) * (bz / scale),
      (ax / scale) * (by / scale) - (ay / scale) * (bx / scale));
    if (cross === 0) continue;
    for (let j = 0; j < 9; j++) {
      const value = positions[i + j]!;
      const axis = j % 3;
      positions[written++] = value;
      bounds.min[axis] = Math.min(bounds.min[axis]!, value);
      bounds.max[axis] = Math.max(bounds.max[axis]!, value);
    }
  }
  if (written === 0) throw new Error('All triangles have zero area; no usable surface remains.');
  return { positions: positions.subarray(0, written), bounds, omitted: (positions.length - written) / 9 };
}

export function parseStl(buffer: ArrayBuffer): ParsedStl {
  if (buffer.byteLength === 0) throw new Error('The selected file is empty.');
  if (buffer.byteLength > IMPORT_SAFETY_LIMITS.bytes) throw new Error('File exceeds the 64 MiB resource safety limit.');
  const data = new DataView(buffer);
  const count = buffer.byteLength >= 84 ? data.getUint32(80, true) : 0;
  const binary = buffer.byteLength >= 84 && 84 + 50 * count === buffer.byteLength;
  let positions: Float64Array;
  if (binary) {
    checkCount(count);
    // Validate before the established loader allocates. Ignore optional color attributes.
    for (let face = 0; face < count; face++) for (let coordinate = 0; coordinate < 12; coordinate++) {
      if (!Number.isFinite(data.getFloat32(84 + face * 50 + coordinate * 4, true))) {
        throw new Error('Binary STL contains a non-finite coordinate or normal.');
      }
    }
    const geometry = new STLLoader().parse(buffer);
    try { positions = new Float64Array(geometry.getAttribute('position').array); }
    finally { geometry.dispose(); }
  } else {
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(256, buffer.byteLength)));
    if (!/^\s*solid\b/i.test(header)) throw new Error('Unrecognized or truncated STL. Binary STL must contain exactly 84 + 50 × triangle-count bytes; trailing data is unsupported.');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('Malformed STL: invalid ASCII text or noncanonical binary length.'); }
    positions = parseAscii(text);
  }
  const inputTriangles = positions.length / 9;
  const usable = compactUsable(positions);
  return { positions: usable.positions, bounds: usable.bounds, encoding: binary ? 'binary' : 'ascii',
    inputTriangles, omittedDegenerateTriangles: usable.omitted };
}
