import { describe, expect, it } from 'vitest';
import type { PlanningDocument } from '../src/domain/contracts';
import { validatePlanning } from '../src/validation/planning';
import { addSeam, reverseSeam, setSequence } from '../src/domain/operations';
import { samplePlan, sampleSeamId, testId } from './helpers';

const codes = (plan: unknown, mode: 'planning' | 'export' = 'export') =>
  validatePlanning(plan, mode).findings.map((finding) => finding.code);

describe('planning validation and derived analysis', () => {
  it('produces geometry-addressable warnings and correct totals', () => {
    const result = validatePlanning(samplePlan(), 'export');
    expect(result.findings.map((finding) => finding.code)).toEqual(['SHORT_SEGMENT', 'TURN_ANGLE_HIGH']);
    expect(result.findings[0]!.target).toEqual({ kind: 'segment', seamId: sampleSeamId,
      startPointId: testId(5), endPointId: testId(6) });
    expect(result.findings[1]!.target).toEqual({ kind: 'point', seamId: sampleSeamId, pointId: testId(5) });
    expect(result.totalLengthMm).toBe(10.5);
    expect(result.totalNominalArcOnTimeSeconds).toBe(2.1);
    expect(result.revision).toBe(0);
  });

  it('allows an empty planning document, but not an empty weld job', () => {
    const plan = samplePlan(); plan.content.seamsById = {}; plan.content.sequence = [];
    expect(codes(plan, 'planning')).toEqual([]);
    expect(codes(plan)).toContain('NO_SEAMS');
  });

  it('allows unset draft parameters but blocks export and does not invent a duration', () => {
    const plan = samplePlan(); plan.content.seamsById[sampleSeamId]!.parameters.travelSpeedMmPerS = null;
    expect(codes(plan, 'planning')).not.toContain('PARAMETER_REQUIRED');
    expect(codes(plan)).toContain('PARAMETER_REQUIRED');
    expect(validatePlanning(plan).totalNominalArcOnTimeSeconds).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid welding parameters: %s', (value) => {
    for (const field of ['travelSpeedMmPerS', 'currentTargetA', 'voltageTargetV'] as const) {
      const plan = samplePlan(); plan.content.seamsById[sampleSeamId]!.parameters[field] = value;
      const result = validatePlanning(plan);
      expect(result.findings[0]!.target).toEqual({ kind: 'parameter', seamId: sampleSeamId, field });
      expect(codes(plan)).toContain('STRUCTURE_INVALID');
    }
  });

  it.each<[string, (plan: PlanningDocument) => void]>([
    ['SEQUENCE_INVALID', (p) => { p.content.sequence = []; }],
    ['SEQUENCE_INVALID', (p) => { p.content.sequence = [sampleSeamId, sampleSeamId]; }],
    ['SEQUENCE_INVALID', (p) => { p.content.sequence = [testId(99)]; }],
    ['DUPLICATE_ID', (p) => { p.content.seamsById[sampleSeamId]!.geometry.points[1]!.id = testId(4); }],
    ['COINCIDENT_POINTS', (p) => { p.content.seamsById[sampleSeamId]!.geometry.points[1]!.positionMm = [0, 0, 0]; }],
    ['POINT_OUTSIDE_BOUNDS', (p) => { p.content.seamsById[sampleSeamId]!.geometry.points[0]!.positionMm = [-1, 0, 0]; }],
    ['NAME_INVALID', (p) => { p.content.seamsById[sampleSeamId]!.name = '  '; }],
    ['BOUNDS_INVALID', (p) => { p.content.workpiece.boundsMm.max = [0, 0, 0]; }],
    ['SOURCE_INCONSISTENT', (p) => { p.content.workpiece.source.byteLength = 1; }],
    ['SOURCE_INCONSISTENT', (p) => { p.content.workpiece.source.omittedDegenerateTriangles = 12; }],
    ['NUMERIC_RANGE', (p) => { p.content.seamsById[sampleSeamId]!.parameters.travelSpeedMmPerS = Number.MIN_VALUE; }],
  ])('reports %s for broken semantic invariants', (code, mutate) => {
    const plan = samplePlan(); mutate(plan); expect(codes(plan)).toContain(code);
  });

  it('treats short length and turn thresholds as warnings, not physical limits', () => {
    const plan = samplePlan(); const points = plan.content.seamsById[sampleSeamId]!.geometry.points;
    points[2]!.positionMm = [11, 1, 0];
    expect(codes(plan)).not.toContain('TURN_ANGLE_HIGH');
    points[2]!.positionMm = [10, 1, 0];
    expect(codes(plan)).not.toContain('SHORT_SEGMENT');
    points[2]!.positionMm = [10, 1e-6, 0];
    expect(codes(plan)).toContain('COINCIDENT_POINTS');
    expect(codes(plan)).not.toContain('SHORT_SEGMENT');
  });

  it('accepts metadata beyond the guaranteed import envelope without claiming parser support', () => {
    const plan = samplePlan(); const source = plan.content.workpiece.source;
    source.inputTriangles = 1_200_000; source.byteLength = 84 + 50 * source.inputTriangles;
    expect(validatePlanning(plan).findings.every((finding) => finding.severity !== 'error')).toBe(true);
  });

  it('rejects unknown document fields instead of silently discarding candidates', () => {
    expect(codes({ ...samplePlan(), candidates: [] })).toContain('STRUCTURE_INVALID');
  });

  it('allows an explicitly closed loop using distinct point IDs', () => {
    const plan = samplePlan(); const points = plan.content.seamsById[sampleSeamId]!.geometry.points;
    points.push({ id: testId(7), positionMm: [...points[0]!.positionMm] });
    expect(codes(plan)).not.toContain('COINCIDENT_POINTS');
  });
});

describe('immutable sequencing and direction operations', () => {
  it('preserves point IDs, sequence, parameters, and length when reversing', () => {
    const before = samplePlan(); const saved = structuredClone(before);
    const after = reverseSeam(before, sampleSeamId);
    expect(before).toEqual(saved);
    expect(after.revision).toBe(1);
    expect(after.content.sequence).toEqual(before.content.sequence);
    expect(after.content.seamsById[sampleSeamId]!.geometry.points.map((point) => point.id)).toEqual([testId(6), testId(5), testId(4)]);
    expect(validatePlanning(after).totalLengthMm).toBe(10.5);
  });

  it('appends a new seam once and permits only an exact sequence permutation', () => {
    const before = samplePlan(); const seam = structuredClone(before.content.seamsById[sampleSeamId]!);
    seam.id = testId(20); seam.geometry.points.forEach((point, index) => { point.id = testId(21 + index); });
    const added = addSeam(before, seam);
    expect(added.content.sequence).toEqual([sampleSeamId, testId(20)]);
    const reordered = setSequence(added, [testId(20), sampleSeamId]);
    expect(reordered.revision).toBe(2);
    expect(setSequence(reordered, reordered.content.sequence).revision).toBe(2);
    expect(() => setSequence(added, [sampleSeamId])).toThrow();
    expect(() => addSeam(added, seam)).toThrow();
  });
});
