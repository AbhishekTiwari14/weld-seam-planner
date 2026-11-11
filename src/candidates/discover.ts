import type { Bounds, Vec3 } from '../domain/contracts.ts';
import { candidateSchema, type SeamCandidate } from './contracts.ts';

// This first detector deliberately handles a bounded class of edge-on-face contacts.
// Larger meshes remain available to manual planning until worker analysis is added.
export const DISCOVERY_TRIANGLE_LIMIT = 4_000;
export const DISCOVERY_CANDIDATE_LIMIT = 64;
const PLANE_ANGLE_DEG = 5;

type Face = { vertices: [number, number, number]; normal: Vec3; box: Bounds; component: number; sourceTriangle: number };
type Edge = { vertices: [number, number]; faces: number[] };
type Tree = { box: Bounds; faces?: number[]; left?: Tree; right?: Tree };

export interface DiscoveryInput {
  positionsMm: Float64Array;
  boundsMm: Bounds;
  workpieceId: string;
  geometryRevision: string;
  /** Minimum physical contact length. Default: 15% of workpiece diagonal. */
  minLengthMm?: number;
  /** Minimum unsigned corner angle, in degrees (45-89). Default: 70. */
  minCornerAngleDeg?: number;
}
export interface DiscoveryResult { candidates: SeamCandidate[]; limitations: string[] }

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const boxOf = (points: readonly Vec3[]): Bounds => ({
  min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as Vec3,
  max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as Vec3,
});
const overlaps = (a: Bounds, b: Bounds, tolerance: number) =>
  [0, 1, 2].every((axis) => a.min[axis]! <= b.max[axis]! + tolerance && b.min[axis]! <= a.max[axis]! + tolerance);

function spatialTree(ids: number[], faces: Face[]): Tree {
  const box = boxOf(ids.flatMap((id) => [faces[id]!.box.min, faces[id]!.box.max]));
  if (ids.length <= 12) return { box, faces: ids };
  const axis = [0, 1, 2].sort((a, b) => (box.max[b]! - box.min[b]!) - (box.max[a]! - box.min[a]!))[0]!;
  ids.sort((a, b) => (faces[a]!.box.min[axis]! + faces[a]!.box.max[axis]!) -
    (faces[b]!.box.min[axis]! + faces[b]!.box.max[axis]!) || a - b);
  const middle = Math.floor(ids.length / 2);
  return { box, left: spatialTree(ids.slice(0, middle), faces), right: spatialTree(ids.slice(middle), faces) };
}

function nearby(node: Tree, box: Bounds, tolerance: number, output: number[]): void {
  if (!overlaps(node.box, box, tolerance)) return;
  if (node.faces) { output.push(...node.faces); return; }
  if (node.left) nearby(node.left, box, tolerance, output);
  if (node.right) nearby(node.right, box, tolerance, output);
}

/** Segment interval covered by one coplanar triangle, using 2D half-plane clipping. */
function coveredInterval(a: Vec3, b: Vec3, triangle: readonly Vec3[], normal: Vec3, tolerance: number): [number, number] | null {
  const drop = [0, 1, 2].sort((i, j) => Math.abs(normal[j]!) - Math.abs(normal[i]!))[0]!;
  const axes = [0, 1, 2].filter((axis) => axis !== drop);
  const xy = (p: Vec3): [number, number] => [p[axes[0]!]!, p[axes[1]!]!];
  const p = xy(a), q = xy(b), corners = triangle.map(xy);
  const area = (u: number[], v: number[], w: number[]) => (v[0]! - u[0]!) * (w[1]! - u[1]!) - (v[1]! - u[1]!) * (w[0]! - u[0]!);
  const sign = Math.sign(area(corners[0]!, corners[1]!, corners[2]!));
  if (!sign) return null;
  let low = 0, high = 1;
  for (let i = 0; i < 3; i++) {
    const u = corners[i]!, v = corners[(i + 1) % 3]!;
    const allowance = tolerance * Math.hypot(v[0]! - u[0]!, v[1]! - u[1]!);
    const start = sign * area(u, v, p) + allowance;
    const slope = sign * (area(u, v, q) - area(u, v, p));
    if (Math.abs(slope) <= Number.EPSILON * Math.max(1, Math.abs(start))) {
      if (start < 0) return null;
      continue;
    }
    const boundary = -start / slope;
    if (slope > 0) low = Math.max(low, boundary);
    else high = Math.min(high, boundary);
    if (low > high) return null;
  }
  return [low, high];
}

function fullContact(a: Vec3, b: Vec3, support: Face, sourceComponent: number,
  faces: Face[], vertices: Vec3[], tree: Tree, tolerance: number): number[] | null {
  const hits: number[] = [];
  nearby(tree, boxOf([a, b]), tolerance, hits);
  const intervals: { range: [number, number]; face: number }[] = [];
  const parallel = Math.cos(PLANE_ANGLE_DEG * Math.PI / 180);
  for (const id of hits) {
    const witness = faces[id]!;
    if (witness.component === sourceComponent || Math.abs(dot(support.normal, witness.normal)) < parallel ||
      !overlaps(witness.box, boxOf([a, b]), tolerance)) continue;
    const origin = vertices[witness.vertices[0]!]!;
    if (Math.abs(dot(subtract(a, origin), witness.normal)) > tolerance ||
        Math.abs(dot(subtract(b, origin), witness.normal)) > tolerance) continue;
    const triangle = witness.vertices.map((vertex) => vertices[vertex]!) as [Vec3, Vec3, Vec3];
    const range = coveredInterval(a, b, triangle, witness.normal, tolerance);
    if (range) intervals.push({ range, face: id });
  }
  intervals.sort((x, y) => x.range[0] - y.range[0] || x.face - y.face);
  const supporting: number[] = [];
  let end = 0;
  const paramTolerance = tolerance / distance(a, b);
  for (const { range, face } of intervals) {
    if (range[0] > end + paramTolerance) break;
    if (range[1] > end) { end = range[1]; supporting.push(face); }
    if (end >= 1 - paramTolerance) return supporting;
  }
  return null;
}

/** Pure, bounded contact evidence for distinct mesh components. No welding intent is inferred. */
export function discoverJunctionCandidates(input: DiscoveryInput): DiscoveryResult {
  const { positionsMm, boundsMm } = input;
  if (positionsMm.length % 9 !== 0 || positionsMm.length === 0) throw new RangeError('Expected a nonempty triangle-position buffer.');
  const count = positionsMm.length / 9;
  if (count > DISCOVERY_TRIANGLE_LIMIT) return { candidates: [], limitations: [`Contact analysis currently supports at most ${DISCOVERY_TRIANGLE_LIMIT} triangles; use manual seam creation for this model.`] };
  const diagonal = distance(boundsMm.min, boundsMm.max);
  if (!Number.isFinite(diagonal) || diagonal <= 0) throw new RangeError('Invalid workpiece bounds.');
  const tolerance = Math.max(1e-9, Math.min(0.01, diagonal * 1e-7));
  const minimum = input.minLengthMm ?? diagonal * 0.15;
  const angle = input.minCornerAngleDeg ?? 70;
  if (!Number.isFinite(minimum) || minimum <= tolerance * 2 || minimum > diagonal ||
      !Number.isFinite(angle) || angle < 45 || angle > 89) throw new RangeError('Discovery thresholds are outside their supported ranges.');
  const vertices: Vec3[] = [], cells = new Map<string, number[]>(), faceVertices: [number, number, number][] = [];
  const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const vertexId = (p: Vec3): number => {
    const cell = p.map((value, axis) => Math.floor((value - boundsMm.min[axis]!) / tolerance));
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      for (const id of cells.get(cellKey(cell[0]! + x, cell[1]! + y, cell[2]! + z)) ?? []) {
        if (distance(p, vertices[id]!) <= tolerance) return id;
      }
    }
    const id = vertices.length;
    vertices.push(p);
    const key = cellKey(cell[0]!, cell[1]!, cell[2]!);
    cells.set(key, [...(cells.get(key) ?? []), id]);
    return id;
  };
  for (let i = 0; i < positionsMm.length; i += 9) {
    const ids: number[] = [];
    for (let j = 0; j < 9; j += 3) {
      const point: Vec3 = [positionsMm[i + j]!, positionsMm[i + j + 1]!, positionsMm[i + j + 2]!];
      if (point.some((value, axis) => !Number.isFinite(value) || value < boundsMm.min[axis]! - tolerance || value > boundsMm.max[axis]! + tolerance))
        throw new RangeError('Triangle coordinates are invalid or outside workpiece bounds.');
      ids.push(vertexId(point));
    }
    faceVertices.push(ids as [number, number, number]);
  }
  const parent = vertices.map((_, id) => id);
  const root = (id: number): number => { while (parent[id] !== id) id = parent[id]!; return id; };
  const faces: Face[] = [];
  const edges = new Map<string, Edge>();
  for (const [sourceTriangle, ids] of faceVertices.entries()) {
    const points = ids.map((id) => vertices[id]!) as [Vec3, Vec3, Vec3];
    const n = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
    const magnitude = Math.hypot(...n);
    if (magnitude <= tolerance * tolerance) continue;
    parent[root(ids[1])] = root(ids[0]); parent[root(ids[2])] = root(ids[0]);
    const face = faces.length;
    faces.push({ vertices: ids, normal: n.map((value) => value / magnitude) as Vec3,
      box: boxOf(points), component: 0, sourceTriangle });
    for (let e = 0; e < 3; e++) {
      const a = ids[e]!, b = ids[(e + 1) % 3]!;
      if (a === b) continue;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const edge = edges.get(key) ?? { vertices: [Math.min(a, b), Math.max(a, b)], faces: [] };
      edge.faces.push(face); edges.set(key, edge);
    }
  }
  for (const face of faces) face.component = root(face.vertices[0]);
  const components = new Set(faces.map((face) => face.component));
  if (components.size < 2) return { candidates: [], limitations: ['No distinct mesh bodies were found. Isolated sharp edges do not establish a weld junction.'] };
  const tree = spatialTree(faces.map((_, id) => id), faces);
  const candidates: SeamCandidate[] = [];
  const rank = (a: SeamCandidate, b: SeamCandidate) =>
    b.evidence.measurements[0]!.value - a.evidence.measurements[0]!.value || a.candidateId.localeCompare(b.candidateId, 'en');
  let truncated = false;
  const seen = new Set<string>();
  for (const edge of edges.values()) {
    if (edge.faces.length !== 2) continue; // open/nonmanifold edges are ambiguous
    const a = vertices[edge.vertices[0]]!, b = vertices[edge.vertices[1]]!;
    const length = distance(a, b);
    if (length < minimum) continue;
    const [first, second] = edge.faces.map((id) => faces[id]!) as [Face, Face];
    const cornerDeg = Math.acos(Math.min(1, Math.abs(dot(first.normal, second.normal)))) * 180 / Math.PI;
    if (cornerDeg < angle) continue;
    for (const support of [first, second]) {
      const witnesses = fullContact(a, b, support, first.component, faces, vertices, tree, tolerance);
      if (!witnesses) continue;
      const path = [a, b].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
      const key = path.flat().map((value, axis) => Math.round((value - boundsMm.min[axis % 3]!) / tolerance)).join(':');
      if (seen.has(key)) break;
      seen.add(key);
      candidates.push(candidateSchema.parse({
        candidateId: `contact:v1:${key}`, workpieceId: input.workpieceId, geometryRevision: input.geometryRevision,
        path, method: { name: 'contact-paths', version: '1' },
        evidence: { summary: 'A corner edge of one mesh body lies along a surface of another body.',
          sourceElementIds: [...edge.faces, ...witnesses].map((id) => `triangle:${faces[id]!.sourceTriangle}`),
          measurements: [{ name: 'contact length', value: length, unit: 'mm' },
            { name: 'corner angle (unsigned)', value: cornerDeg, unit: 'deg' },
            { name: 'contact tolerance', value: tolerance, unit: 'mm' }],
          limitations: ['Geometric contact does not establish welding intent, access or surface conformity.',
            'Only complete straight edge-on-face contacts are analyzed.'] },
        review: { state: 'suggested' },
      }));
      candidates.sort(rank);
      if (candidates.length > DISCOVERY_CANDIDATE_LIMIT) { candidates.pop(); truncated = true; }
      break;
    }
  }
  return { candidates,
    limitations: [
      ...(candidates.length === 0 ? ['No supported full-length edge-on-face contact was found; use manual seam creation.'] : []),
      'Suggestions cover straight edge-on-face contact between separate mesh bodies; other junctions may need manual planning.',
      ...(truncated ? [`Only the ${DISCOVERY_CANDIDATE_LIMIT} longest candidates are shown.`] : []),
    ] };
}
