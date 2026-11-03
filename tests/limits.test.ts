import { describe, expect, it } from 'vitest';
import { exportPlanningDocument, validateWeldJob } from '../src/export/job';
import { validatePlanning } from '../src/validation/planning';
import type { Vec3 } from '../src/domain/contracts';
import { samplePlan, sampleSeamId, testId } from './helpers';

function populatedPlan(seamCount: number, pointsPerSeam: number) {
  const plan = samplePlan(); plan.content.seamsById = {}; plan.content.sequence = [];
  let nextId = 10;
  for (let index = 0; index < seamCount; index++) {
    const id = testId(nextId++);
    const points = Array.from({ length: pointsPerSeam }, (_, point) => ({
      id: testId(nextId++), positionMm: [point / 10, 0, 0] as Vec3,
    }));
    plan.content.seamsById[id] = { id, name: `Seam ${index + 1}`, geometry: { type: 'polyline', points },
      parameters: { travelSpeedMmPerS: 5, currentTargetA: 120, voltageTargetV: 22 } };
    plan.content.sequence.push(id);
  }
  return plan;
}

describe('document and numerical boundaries', () => {
  it('accepts 100 seams / 10,000 points and round trips every record', () => {
    const plan = populatedPlan(100, 100);
    const job = validateWeldJob(JSON.parse(exportPlanningDocument(plan)));
    expect(job.seams).toHaveLength(100);
    expect(job.seams.reduce((sum, seam) => sum + seam.geometry.points.length, 0)).toBe(10_000);
  });

  it('accepts 1,000 points per seam and rejects larger paths', () => {
    expect(validatePlanning(populatedPlan(10, 1_000)).findings.some((f) => f.severity === 'error')).toBe(false);
    expect(() => exportPlanningDocument(populatedPlan(1, 1_001))).toThrow();
  });

  it('rejects too many total points and too many seams', () => {
    expect(validatePlanning(populatedPlan(11, 1_000)).findings.map((f) => f.code)).toContain('POINT_LIMIT');
    expect(() => exportPlanningDocument(populatedPlan(101, 2))).toThrow();
  });

  it('rejects seam-key mismatches and source paths', () => {
    const plan = samplePlan(); plan.content.seamsById[sampleSeamId]!.id = testId(99);
    expect(validatePlanning(plan).findings.map((f) => f.code)).toContain('SEAM_KEY_MISMATCH');
    const pathPlan = samplePlan(); pathPlan.content.workpiece.source.filename = 'C:\\parts\\private.stl';
    expect(() => exportPlanningDocument(pathPlan)).toThrow();
  });

  it('rejects binary triangle counts outside the STL count field', () => {
    const plan = samplePlan(); plan.content.workpiece.source.inputTriangles = 2 ** 32;
    plan.content.workpiece.source.byteLength = 84 + 50 * 2 ** 32;
    expect(validatePlanning(plan).findings.map((f) => f.code)).toContain('SOURCE_INCONSISTENT');
  });

  it('does not reject a usable workpiece solely because it is far from the origin', () => {
    const plan = samplePlan();
    plan.content.workpiece.boundsMm.min[0] += 1e9;
    plan.content.workpiece.boundsMm.max[0] += 1e9;
    plan.content.seamsById[sampleSeamId]!.geometry.points.forEach((point) => { point.positionMm[0] += 1e9; });
    expect(validatePlanning(plan).totalLengthMm).toBe(10.5);
    expect(validateWeldJob(JSON.parse(exportPlanningDocument(plan))).seams[0]!.geometry.points[0]!.positionMm[0]).toBe(1e9);
  });

  it('rejects total-duration overflow even when every individual duration is finite', () => {
    const plan = populatedPlan(2, 2);
    Object.values(plan.content.seamsById).forEach((seam) => { seam.parameters.travelSpeedMmPerS = 1e-309; });
    expect(validatePlanning(plan).findings.map((f) => f.code)).toContain('NUMERIC_RANGE');
    expect(() => exportPlanningDocument(plan)).toThrow();
  });
});
