import { describe, expect, it } from 'vitest';
import { insertSeamPoint, removeSeamPoint, replaceSeamPoint } from '../src/domain/point-operations.ts';
import { reverseSeam } from '../src/domain/operations.ts';
import { applySurfaceEdit, selectionExists } from '../src/planning/selection.ts';
import { samplePlan, sampleSeamId, testId } from './helpers.ts';

describe('precision point operations', () => {
  it('replaces coordinates while preserving IDs, targets, name, sequence and input immutability', () => {
    const plan = samplePlan(), saved = structuredClone(plan);
    const point = plan.content.seamsById[sampleSeamId]!.geometry.points[1]!;
    const next = replaceSeamPoint(plan, sampleSeamId, point.id, [2, 3, 4]);
    expect(next.revision).toBe(plan.revision + 1);
    const expected = structuredClone(plan.content);
    expected.seamsById[sampleSeamId]!.geometry.points[1]!.positionMm = [2, 3, 4];
    expect(next.content).toEqual(expected); expect(plan).toEqual(saved);
    expect(replaceSeamPoint(next, sampleSeamId, point.id, [2, 3, 4]).revision).toBe(next.revision);
  });
  it('inserts one identity between the selected endpoints and removes it without changing traversal', () => {
    const plan = samplePlan(); const [a, b] = plan.content.seamsById[sampleSeamId]!.geometry.points;
    const point = { id: testId(999), positionMm: [1, 2, 3] as [number, number, number] };
    const next = insertSeamPoint(plan, sampleSeamId, a!.id, b!.id, point);
    expect(next.content.seamsById[sampleSeamId]!.geometry.points.map((p) => p.id)).toEqual([a!.id, point.id, ...plan.content.seamsById[sampleSeamId]!.geometry.points.slice(1).map((p) => p.id)]);
    expect(removeSeamPoint(next, sampleSeamId, point.id).content).toEqual(plan.content);
    expect(() => insertSeamPoint(plan, sampleSeamId, b!.id, a!.id, point)).toThrow(/consecutive/);
    expect(() => insertSeamPoint(plan, sampleSeamId, a!.id, b!.id, { ...point, id: a!.id })).toThrow(/unique/);
  });
  it('rejects invalid, out-of-bounds and adjacent coincident edits without changing the plan', () => {
    const plan = samplePlan(), original = structuredClone(plan);
    const [a, b] = plan.content.seamsById[sampleSeamId]!.geometry.points;
    for (const position of [[NaN, 1, 1], [Infinity, 1, 1], [200, 1, 1], a!.positionMm] as [number, number, number][]) {
      expect(() => replaceSeamPoint(plan, sampleSeamId, b!.id, position)).toThrow();
    }
    expect(() => insertSeamPoint(plan, sampleSeamId, a!.id, b!.id, { id: testId(99), positionMm: a!.positionMm })).toThrow(/coincident/);
    expect(() => replaceSeamPoint(plan, sampleSeamId, testId(998), [1, 1, 1])).toThrow(/Unknown point/);
    expect(plan).toEqual(original);
  });
  it('preserves minimum point count and rejects a removal that creates coincident neighbors', () => {
    const plan = samplePlan(); const points = plan.content.seamsById[sampleSeamId]!.geometry.points;
    const two = removeSeamPoint(plan, sampleSeamId, points[1]!.id);
    expect(() => removeSeamPoint(two, sampleSeamId, points[0]!.id)).toThrow(/at least two/);
    points[2]!.positionMm = [...points[0]!.positionMm];
    expect(() => removeSeamPoint(plan, sampleSeamId, points[1]!.id)).toThrow(/coincident/);
  });
  it('reverses twice with stable identities and monotonically increasing revisions', () => {
    const plan = samplePlan(); const reversed = reverseSeam(plan, sampleSeamId);
    expect(reversed.content.seamsById[sampleSeamId]!.geometry.points).toEqual([...plan.content.seamsById[sampleSeamId]!.geometry.points].reverse());
    const twice = reverseSeam(reversed, sampleSeamId);
    expect(twice.content).toEqual(plan.content); expect(twice.revision).toBe(plan.revision + 2);
  });
  it('rejects stale surface intents and reconciles point/segment selection by stable IDs', () => {
    const plan = samplePlan(); const seam = plan.content.seamsById[sampleSeamId]!; const [a, b] = seam.geometry.points;
    const intent = { kind: 'replace' as const, seamId: seam.id, pointId: a!.id, workpieceId: plan.content.workpiece.id, revision: plan.revision };
    expect(() => applySurfaceEdit({ ...plan, revision: plan.revision + 1 }, intent, [1, 2, 3])).toThrow(/plan changed/);
    expect(() => applySurfaceEdit(plan, { ...intent, workpieceId: testId(999) }, [1, 2, 3])).toThrow(/plan changed/);
    expect(selectionExists(seam, { kind: 'point', seamId: seam.id, pointId: a!.id })).toBe(true);
    expect(selectionExists(seam, { kind: 'segment', seamId: seam.id, startPointId: a!.id, endPointId: b!.id })).toBe(true);
    expect(selectionExists(seam, { kind: 'segment', seamId: seam.id, startPointId: b!.id, endPointId: a!.id })).toBe(false);
    expect(selectionExists(undefined, { kind: 'point', seamId: seam.id, pointId: a!.id })).toBe(false);
  });
  it('enforces per-seam and total point capacities on insertion', () => {
    const plan = samplePlan(); const template = plan.content.seamsById[sampleSeamId]!;
    plan.content.seamsById = {}; plan.content.sequence = [];
    for (let s = 0; s < 10; s++) {
      const id = testId(100 + s);
      plan.content.sequence.push(id);
      plan.content.seamsById[id] = { ...template, id, geometry: { type: 'polyline', points: Array.from({ length: 1000 }, (_, p) => ({ id: testId(1000 + s * 1000 + p), positionMm: [p / 10, s, 0] })) } };
    }
    const first = plan.content.seamsById[plan.content.sequence[0]!]!;
    expect(() => insertSeamPoint(plan, first.id, first.geometry.points[0]!.id, first.geometry.points[1]!.id, { id: testId(99), positionMm: [0, 0.1, 0] })).toThrow();
    // Keep 10k total but move a point to another seam: inserting into the shorter
    // seam must still fail the global limit independently of its per-seam limit.
    const extra = { ...template, id: testId(99999), geometry: { type: 'polyline' as const, points: first.geometry.points.splice(998, 2) } };
    plan.content.seamsById[extra.id] = extra; plan.content.sequence.push(extra.id);
    expect(() => insertSeamPoint(plan, first.id, first.geometry.points[0]!.id, first.geometry.points[1]!.id, { id: testId(99), positionMm: [0, 0.1, 0] })).toThrow(/10,000/);
  });
});
