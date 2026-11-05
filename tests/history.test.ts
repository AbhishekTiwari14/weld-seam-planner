import { describe, expect, it } from 'vitest';
import type { PlanningDocument, Seam } from '../src/domain/contracts.ts';
import { addSeam, removeSeam, renameSeam, reverseSeam, setSequence, updateSeamParameters } from '../src/domain/operations.ts';
import { insertSeamPoint, removeSeamPoint, replaceSeamPoint } from '../src/domain/point-operations.ts';
import { HISTORY_LIMITS, PlanHistory } from '../src/planning/history.ts';
import { exportPlanningDocument, validateWeldJob } from '../src/export/job.ts';
import { controllerHarness } from './helpers/controller.ts';
import { samplePlan, testId } from './helpers.ts';

const seamId = testId(200);
const seam = (id = seamId, offset = 200): Seam => ({ id, name: 'Original', parameters: { travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 },
  geometry: { type: 'polyline', points: [[-5, -5, 5], [5, -5, 5], [5, 5, 5]].map((positionMm, i) => ({ id: testId(offset + i + 1), positionMm: positionMm as [number, number, number] })) } });

const operations: [string, (document: PlanningDocument) => PlanningDocument][] = [
  ['add', (d) => addSeam(d, seam(testId(400), 400))],
  ['delete', (d) => removeSeam(d, seamId)],
  ['rename', (d) => renameSeam(d, seamId, 'Renamed')],
  ['parameters', (d) => updateSeamParameters(d, seamId, { travelSpeedMmPerS: 12, currentTargetA: 90, voltageTargetV: 24 })],
  ['sequence', (d) => setSequence(d, [...d.content.sequence].reverse())],
  ['replace', (d) => replaceSeamPoint(d, seamId, testId(202), [7, -5, 5])],
  ['insert', (d) => insertSeamPoint(d, seamId, testId(201), testId(202), { id: testId(999), positionMm: [0, -5, 5] })],
  ['remove point', (d) => removeSeamPoint(d, seamId, testId(202))],
  ['reverse', (d) => reverseSeam(d, seamId)],
];
describe('controller document history', () => {
  it.each(operations)('undoes and redoes %s exactly, with increasing revisions and unchanged asset ownership', (_name, operation) => {
    const h = controllerHarness(); const id = h.asset.workpiece.id;
    h.controller.editPlan(id, (d) => addSeam(d, seam()));
    h.controller.editPlan(id, (d) => addSeam(d, seam(testId(300), 300)));
    const before = h.document();
    h.controller.editPlan(id, operation); const after = h.document();
    expect(h.controller.store.getState().history.undoCount).toBe(3);
    h.controller.travelHistory(id, 'undo');
    expect(h.document().content).toEqual(before.content);
    expect(h.document().revision).toBe(after.revision + 1);
    h.controller.travelHistory(id, 'redo');
    expect(h.document().content).toEqual(after.content);
    expect(h.document().revision).toBe(after.revision + 2);
    expect(h.document().jobId).toBe(before.jobId);
    expect(h.controller.store.getState().active!.asset).toBe(h.asset);
    expect(validateWeldJob(JSON.parse(exportPlanningDocument(h.document()))).sequence).toEqual(after.content.sequence);
    h.controller.dispose();
  });
  it('ignores no-op and invalid edits, retains redo on no-op and clears redo on a new change', () => {
    const h = controllerHarness(); const id = h.asset.workpiece.id;
    h.controller.editPlan(id, (d) => addSeam(d, seam()));
    h.controller.editPlan(id, (d) => renameSeam(d, seamId, 'Changed'));
    h.controller.travelHistory(id, 'undo');
    const before = h.controller.store.getState();
    h.controller.editPlan(id, (d) => renameSeam(d, seamId, 'Original'));
    h.controller.editPlan(id, (d) => ({ ...d, revision: d.revision + 1 }));
    expect(() => h.controller.editPlan(id, (d) => replaceSeamPoint(d, seamId, testId(202), [-5, -5, 5]))).toThrow();
    expect(h.controller.store.getState()).toBe(before);
    h.controller.editPlan(id, (d) => renameSeam(d, seamId, 'Different'));
    expect(h.controller.store.getState().history.redoCount).toBe(0);
    const current = h.document(); h.controller.travelHistory(id, 'redo'); expect(h.document()).toBe(current);
    h.controller.dispose();
  });
  it('preserves both stacks on failed/cancelled import and clears them on successful replacement', () => {
    const h = controllerHarness(); const id = h.asset.workpiece.id;
    h.controller.editPlan(id, (d) => addSeam(d, seam()));
    h.controller.editPlan(id, (d) => renameSeam(d, seamId, 'Changed'));
    h.controller.travelHistory(id, 'undo');
    const before = h.controller.store.getState();
    h.controller.start(h.file); h.receivers.at(-1)!({ type: 'error', message: 'broken' });
    expect(h.controller.store.getState().history).toEqual(before.history);
    h.controller.start(h.file); h.controller.cancel();
    expect(h.controller.store.getState().history).toEqual(before.history);
    expect(h.document()).toBe(before.active!.document);
    h.importModel();
    expect(h.controller.store.getState().history).toEqual({ undoCount: 0, redoCount: 0, retainedBytes: 0 });
    expect(() => h.controller.travelHistory(id, 'undo')).toThrow(/workpiece changed/);
    h.controller.dispose();
  });
  it('bounds entry count, restores only retained states, and never rewinds revision', () => {
    const h = controllerHarness(); const id = h.asset.workpiece.id;
    h.controller.editPlan(id, (d) => addSeam(d, seam()));
    for (let i = 0; i < 60; i++) h.controller.editPlan(id, (d) => renameSeam(d, seamId, `Name ${i}`));
    expect(h.controller.store.getState().history.undoCount).toBe(HISTORY_LIMITS.entries);
    const lastRevision = h.document().revision;
    for (let i = 0; i < 55; i++) h.controller.travelHistory(id, 'undo');
    expect(h.document().revision).toBe(lastRevision + 50);
    expect(h.document().content.seamsById[seamId]!.name).toBe('Name 9');
    expect(h.controller.store.getState().history.redoCount).toBe(50);
    h.controller.dispose();
  });
  it('validates restored revisions before changing stacks and keeps snapshots independent of caller objects', () => {
    const history = new PlanHistory(); const document = samplePlan();
    history.record(document.content);
    const saved = structuredClone(document.content);
    document.content.seamsById[document.content.sequence[0]!]!.name = 'Mutated by caller';
    const stats = history.summary();
    expect(() => history.restore({ ...document, revision: Number.MAX_SAFE_INTEGER }, 'undo')).toThrow();
    expect(history.summary()).toEqual(stats);
    expect(history.restore(document, 'undo').content).toEqual(saved);
  });
  it('bounds serialized storage on a 100-seam / 10,000-point document through repeated history traversal', () => {
    const history = new PlanHistory(); let document = samplePlan();
    const template = Object.values(document.content.seamsById)[0]!;
    document.content.seamsById = {}; document.content.sequence = [];
    for (let s = 0; s < 100; s++) {
      const id = testId(100 + s); document.content.sequence.push(id);
      document.content.seamsById[id] = { ...template, id, geometry: { type: 'polyline', points: Array.from({ length: 100 }, (_, p) => ({ id: testId(1000 + s * 100 + p), positionMm: [p, s, 0] })) } };
    }
    for (let i = 0; i < 60; i++) { history.record(document.content); document.content.seamsById[testId(100)]!.name = `Change ${i}`; }
    expect(history.summary().retainedBytes).toBeLessThanOrEqual(HISTORY_LIMITS.bytes);
    expect(history.summary().undoCount).toBeLessThan(50);
    expect(history.summary().undoCount).toBeGreaterThan(1);
    for (let i = 0; i < 5; i++) {
      document = history.restore(document, 'undo'); document = history.restore(document, 'redo');
      expect(history.summary().retainedBytes).toBeLessThanOrEqual(HISTORY_LIMITS.bytes);
    }
    expect(document.content.sequence).toHaveLength(100);
  });
});
