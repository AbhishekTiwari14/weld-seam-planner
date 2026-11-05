import { describe, expect, it } from 'vitest';
import { renameSeam, removeSeam, setSequence, updateSeamParameters } from '../src/domain/operations.ts';
import { appendDraftPoint, commitDraft } from '../src/planning/draft.ts';
import { parseParameterInput } from '../src/planning/parameter-input.ts';
import { createWeldJob, exportPlanningDocument, serializeWeldJob, validateWeldJob } from '../src/export/job.ts';
import { validatePlanning } from '../src/validation/planning.ts';
import { samplePlan, testId } from './helpers.ts';
import type { PathPoint } from '../src/domain/contracts.ts';

function emptyPlan() {
  const plan = samplePlan();
  plan.revision = 0;
  plan.content.seamsById = {};
  plan.content.sequence = [];
  return plan;
}
function twoSeams() {
  let plan = emptyPlan();
  for (let seam = 0; seam < 2; seam++) {
    const first = appendDraftPoint(plan, [], [0, 0, 1], testId(100 + seam * 10));
    const points = appendDraftPoint(plan, first, [10, 0, 1], testId(101 + seam * 10));
    plan = commitDraft(plan, points, testId(102 + seam * 10), `Seam ${seam + 1}`);
  }
  return plan;
}

describe('manual planning operations', () => {
  it('keeps drafts separate and creates unique ordered seams with unset parameters', () => {
    const empty = emptyPlan(); const saved = structuredClone(empty);
    const first = appendDraftPoint(empty, [], [0, 0, 1], testId(100));
    expect(() => commitDraft(empty, first, testId(102), 'Draft')).toThrow(/two/);
    const points = appendDraftPoint(empty, first, [10, 0, 1], testId(101));
    const plan = commitDraft(empty, points, testId(102), 'New seam');
    expect(empty).toEqual(saved);
    expect(plan.revision).toBe(1);
    expect(plan.content.sequence).toEqual([testId(102)]);
    expect(plan.content.seamsById[testId(102)]!.geometry.points).toEqual(points);
    points[0]!.positionMm[0] = 99;
    expect(plan.content.seamsById[testId(102)]!.geometry.points[0]!.positionMm).toEqual([0, 0, 1]);
    expect(validatePlanning(plan).findings.some((f) => f.severity === 'error')).toBe(false);
    expect(validatePlanning(plan, 'export').findings.filter((f) => f.code === 'PARAMETER_REQUIRED')).toHaveLength(3);
    expect(() => exportPlanningDocument(plan)).toThrow();
    expect(() => exportPlanningDocument(empty)).toThrow();
  });
  it('rejects coincident, nonfinite, out-of-bounds and duplicate-ID points', () => {
    const plan = emptyPlan(); const points = appendDraftPoint(plan, [], [0, 0, 1], testId(100));
    expect(() => appendDraftPoint(plan, points, [0, 0, 1], testId(101))).toThrow(/coincides/);
    expect(() => appendDraftPoint(plan, points, [2, 0, 1], testId(100))).toThrow(/identifier/);
    expect(() => appendDraftPoint(plan, [], [NaN, 0, 1], testId(101))).toThrow();
    expect(() => appendDraftPoint(plan, [], [1e10, 0, 1], testId(101))).toThrow(/current workpiece/);
    expect(() => appendDraftPoint(plan, [], [0, 0, 1], plan.jobId)).toThrow(/identifier/);
    expect(() => appendDraftPoint(plan, Array<PathPoint>(1000).fill(points[0]!), [2, 0, 1], testId(101))).toThrow(/limit/);
  });
  it('renames and deletes without mutating geometry or leaving sequence references', () => {
    const plan = twoSeams(); const saved = structuredClone(plan); const id = plan.content.sequence[0]!;
    const renamed = renameSeam(plan, id, '  Root pass  ');
    expect(renamed.revision).toBe(3);
    expect(renamed.content.seamsById[id]!.name).toBe('Root pass');
    expect(renameSeam(renamed, id, 'Root pass').revision).toBe(3);
    expect(() => renameSeam(plan, id, '  ')).toThrow();
    expect(() => removeSeam(plan, testId(999))).toThrow(/Unknown/);
    const removed = removeSeam(renamed, id);
    expect(removed.revision).toBe(4);
    expect(removed.content.sequence).toEqual([plan.content.sequence[1]]);
    expect(removed.content.seamsById[id]).toBeUndefined();
    expect(plan).toEqual(saved);
  });
  it('configures independently, ignores unchanged edits and rejects invalid numeric commits', () => {
    const plan = twoSeams(); const id = plan.content.sequence[0]!;
    const parameters = { travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 };
    const edited = updateSeamParameters(plan, id, parameters);
    expect(edited.revision).toBe(3);
    expect(updateSeamParameters(edited, id, { ...parameters }).revision).toBe(3);
    expect(edited.content.seamsById[plan.content.sequence[1]!]!.parameters.travelSpeedMmPerS).toBeNull();
    for (const value of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
      expect(() => updateSeamParameters(plan, id, { ...parameters, travelSpeedMmPerS: value })).toThrow();
    }
    expect(plan.revision).toBe(2);
  });
  it('preserves IDs and points through sequencing and external-job round trips', () => {
    let plan = twoSeams();
    for (const id of plan.content.sequence) plan = updateSeamParameters(plan, id, { travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 });
    const reordered = setSequence(plan, [...plan.content.sequence].reverse());
    expect(reordered.revision).toBe(5);
    expect(reordered.content.seamsById).toEqual(plan.content.seamsById);
    expect(setSequence(reordered, reordered.content.sequence).revision).toBe(5);
    expect(() => setSequence(plan, [plan.content.sequence[0]!, plan.content.sequence[0]!])).toThrow();
    expect(() => setSequence(plan, [testId(999), plan.content.sequence[0]!])).toThrow();
    expect(() => setSequence(plan, [])).toThrow();
    const json = exportPlanningDocument(reordered);
    expect(serializeWeldJob(validateWeldJob(JSON.parse(json)))).toBe(json);
    expect(createWeldJob(reordered).sequence).toEqual(reordered.content.sequence);
  });
});

it.each(['-', '+', '1e', '1e-', '0', '-2', 'Infinity', 'NaN', '1e999', '0x20', '1,5', '1 2', '1e-999'])('keeps invalid/intermediate input %s out of the document', (text) => {
  expect(parseParameterInput(text).valid).toBe(false);
});
it.each([['', null], ['  ', null], ['.5', 0.5], ['1e2', 100], ['12.', 12], ['+2.5', 2.5]] as const)('parses positive or unset input %s', (text, value) => {
  expect(parseParameterInput(text)).toEqual({ valid: true, value });
});
