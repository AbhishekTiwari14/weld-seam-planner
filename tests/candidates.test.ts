import { describe, expect, it } from 'vitest';
import { acceptCandidate } from '../src/candidates/accept';
import type { SeamCandidate } from '../src/candidates/contracts';
import { validatePlanning } from '../src/validation/planning';
import { samplePlan, testId } from './helpers';

function sampleCandidate(): SeamCandidate {
  return { candidateId: 'feature:fixture:001', workpieceId: testId(2), geometryRevision: 'asset-1',
    path: [[0, 10, 0], [20, 10, 0]], method: { name: 'feature-paths', version: '1' },
    evidence: { summary: 'Illustrative shared feature edge; no detector has run.', sourceElementIds: ['edge:1'],
      measurements: [{ name: 'face-plane angle', value: 90, unit: 'deg' }], limitations: ['Welding intent unknown'] },
    review: { state: 'suggested' } };
}

describe('candidate acceptance boundary', () => {
  it('creates an independent ordinary seam and review update without inferred process settings', () => {
    const plan = samplePlan(); const candidate = sampleCandidate(); const saved = structuredClone({ plan, candidate });
    let nextId = 30;
    const result = acceptCandidate(plan, candidate, { geometryRevision: 'asset-1', name: 'Reviewed feature',
      createId: () => testId(nextId++) });
    expect({ plan, candidate }).toEqual(saved);
    expect(result.candidate.review).toEqual({ state: 'accepted', seamId: testId(30) });
    expect(result.document.content.sequence.at(-1)).toBe(testId(30));
    const seam = result.document.content.seamsById[testId(30)]!;
    expect(Object.keys(seam).sort()).toEqual(['geometry', 'id', 'name', 'parameters']);
    expect(seam.parameters).toEqual({ travelSpeedMmPerS: null, currentTargetA: null, voltageTargetV: null });
    candidate.path[0]![0] = 99;
    expect(seam.geometry.points[0]!.positionMm[0]).toBe(0);
    expect(validatePlanning(result.document, 'export').findings.some((f) => f.code === 'PARAMETER_REQUIRED')).toBe(true);
    expect(() => acceptCandidate(result.document, result.candidate, { geometryRevision: 'asset-1', name: 'Again' })).toThrow();
  });

  it.each(['rejected', 'stale', 'wrong-workpiece', 'coincident', 'non-finite', 'outside'])(
    'rejects %s candidates without altering the planning document', (scenario) => {
      const plan = samplePlan(); const saved = structuredClone(plan); const candidate = sampleCandidate();
      if (scenario === 'rejected') candidate.review = { state: 'rejected' };
      if (scenario === 'stale') candidate.geometryRevision = 'asset-0';
      if (scenario === 'wrong-workpiece') candidate.workpieceId = testId(99);
      if (scenario === 'coincident') candidate.path[1] = [...candidate.path[0]!];
      if (scenario === 'non-finite') candidate.path[0]![0] = NaN;
      if (scenario === 'outside') candidate.path[0]![0] = -1;
      expect(() => acceptCandidate(plan, candidate, { geometryRevision: 'asset-1', name: 'Candidate' })).toThrow();
      expect(plan).toEqual(saved);
    },
  );
});
