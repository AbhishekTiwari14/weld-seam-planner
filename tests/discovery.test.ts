import { describe, expect, it } from 'vitest';
import { generateTJoint } from '../scripts/generate-samples.ts';
import { discoverJunctionCandidates, DISCOVERY_CANDIDATE_LIMIT, DISCOVERY_TRIANGLE_LIMIT } from '../src/candidates/discover.ts';
import { candidateSchema } from '../src/candidates/contracts.ts';
import { parseStl } from '../src/import/parse-stl.ts';
import { testId } from './helpers.ts';

const sample = generateTJoint();
const parsed = parseStl(new Uint8Array(sample).buffer);

function bounds(positions: Float64Array) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis]!, positions[i]!);
    max[axis] = Math.max(max[axis]!, positions[i]!);
  }
  return { min, max };
}
function discover(positionsMm: Float64Array, overrides: { minLengthMm?: number; minCornerAngleDeg?: number } = {}) {
  return discoverJunctionCandidates({ positionsMm, boundsMm: bounds(positionsMm),
    workpieceId: testId(10), geometryRevision: 'geometry-1', ...overrides });
}

describe('bounded edge-on-face junction discovery', () => {
  it('finds the two long T-joint plate-to-web contact lines with candidate evidence', () => {
    const result = discover(parsed.positions);
    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates) {
      expect(candidateSchema.parse(candidate)).toEqual(candidate);
      expect(candidate.method.name).toBe('contact-paths');
      expect(candidate.review.state).toBe('suggested');
      expect(candidate.path[0]![1]).toBe(-65);
      expect(candidate.path[1]![1]).toBe(65);
      expect(candidate.path.map((point) => point[2])).toEqual([10, 10]);
      expect(candidate.evidence.measurements[0]).toEqual({ name: 'contact length', value: 130, unit: 'mm' });
      expect(candidate.evidence.sourceElementIds.length).toBeGreaterThanOrEqual(3);
      expect(candidate.evidence.limitations.join(' ')).toMatch(/does not establish welding intent/i);
    }
    expect(result.candidates.map((candidate) => candidate.path[0]![0]).sort()).toEqual([-5, 5]);
  });

  it('is deterministic and does not alter authoritative positions', () => {
    const original = parsed.positions.slice();
    const first = discover(parsed.positions);
    expect(discover(parsed.positions)).toEqual(first);
    expect(parsed.positions).toEqual(original);
    expect(new Set(first.candidates.map((candidate) => candidate.candidateId)).size).toBe(2);
  });

  it('uses source workpiece millimetres even with large offsets and reversed winding', () => {
    const moved = parsed.positions.slice();
    for (let i = 0; i < moved.length; i += 3) {
      moved[i] = moved[i]! + 1_000_000;
      moved[i + 1] = moved[i + 1]! - 2_000_000;
      moved[i + 2] = moved[i + 2]! + 100_000;
    }
    for (let i = 12 * 9; i < moved.length; i += 18) {
      for (let axis = 0; axis < 3; axis++) {
        const tmp = moved[i + 3 + axis]!;
        moved[i + 3 + axis] = moved[i + 6 + axis]!;
        moved[i + 6 + axis] = tmp;
      }
    }
    const result = discover(moved);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.path[0]![0]).sort((a, b) => a - b)).toEqual([999_995, 1_000_005]);
    expect(result.candidates[0]!.path[0]![2]).toBe(100_010);
  });

  it('tolerates tiny numeric contact error but does not invent a path over a gap', () => {
    const almost = parsed.positions.slice();
    const gap = parsed.positions.slice();
    for (let i = 12 * 9 + 2; i < almost.length; i += 3) {
      almost[i] = almost[i]! + 1e-6;
      gap[i] = gap[i]! + 0.01;
    }
    expect(discover(almost).candidates).toHaveLength(2);
    const separated = discover(gap);
    expect(separated.candidates).toHaveLength(0);
    expect(separated.limitations.join(' ')).toMatch(/manual seam creation/);
  });

  it('does not label an isolated cube, coplanar triangulation or distant bodies as welds', () => {
    expect(discover(parsed.positions.slice(0, 12 * 9)).candidates).toEqual([]);
    expect(discover(parsed.positions.slice(0, 2 * 9)).candidates).toEqual([]);
    const distant = parsed.positions.slice();
    for (let i = 12 * 9 + 2; i < distant.length; i += 3) distant[i] = distant[i]! + 100;
    expect(discover(distant).candidates).toEqual([]);
  });

  it('skips a degenerate input triangle while retaining original triangle evidence indices', () => {
    const withDegenerate = new Float64Array(parsed.positions.length + 9);
    withDegenerate.set([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    withDegenerate.set(parsed.positions, 9);
    const candidates = discover(withDegenerate).candidates;
    expect(candidates).toHaveLength(2);
    const sourceIds = discover(parsed.positions).candidates.flatMap((candidate) => candidate.evidence.sourceElementIds);
    expect(candidates.flatMap((candidate) => candidate.evidence.sourceElementIds))
      .toEqual(sourceIds.map((id) => `triangle:${Number(id.slice(9)) + 1}`));
  });

  it('rejects bad thresholds and malformed coordinates and bounds large analysis', () => {
    expect(() => discover(parsed.positions, { minCornerAngleDeg: 20 })).toThrow(/thresholds/);
    expect(() => discover(parsed.positions, { minLengthMm: 0 })).toThrow(/thresholds/);
    expect(discover(parsed.positions, { minLengthMm: 140 }).candidates).toHaveLength(0);
    const invalid = parsed.positions.slice(); invalid[0] = NaN;
    expect(() => discover(invalid)).toThrow();
    const tooLarge = new Float64Array((DISCOVERY_TRIANGLE_LIMIT + 1) * 9);
    const result = discoverJunctionCandidates({ positionsMm: tooLarge, boundsMm: parsed.bounds,
      workpieceId: testId(10), geometryRevision: 'geometry-1' });
    expect(result.candidates).toEqual([]);
    expect(result.limitations.join(' ')).toMatch(/manual seam creation/);
  });

  it('retains only the longest bounded set when many separated T-joints are present', () => {
    const copies = 33;
    const positions = new Float64Array(parsed.positions.length * copies);
    for (let copy = 0; copy < copies; copy++) {
      for (let i = 0; i < parsed.positions.length; i++)
        positions[copy * parsed.positions.length + i] = parsed.positions[i]! + (i % 3 === 0 ? 200 * copy : 0);
    }
    const result = discover(positions, { minLengthMm: 20 });
    expect(result.candidates).toHaveLength(DISCOVERY_CANDIDATE_LIMIT);
    expect(result.limitations.join(' ')).toMatch(/longest candidates/);
    expect(new Set(result.candidates.map((candidate) => candidate.candidateId)).size).toBe(DISCOVERY_CANDIDATE_LIMIT);
  });
});
