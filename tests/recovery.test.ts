import { describe, expect, it, vi } from 'vitest';
import { commitDraft } from '../src/planning/draft.ts';
import { reverseSeam, updateSeamParameters } from '../src/domain/operations.ts';
import { createWeldJob, exportPlanningDocument } from '../src/export/job.ts';
import { activateRestoredPlan, MAX_PLAN_FILE_BYTES, parseSavedPlan, verifyRestoreSource } from '../src/recovery/restore.ts';
import { controllerHarness } from './helpers/controller.ts';
import { testId } from './helpers.ts';
import type { ImportPreview } from '../src/import/types.ts';
import type { WeldJob } from '../src/export/schema.ts';

function setup() {
  const h = controllerHarness(); const id = h.asset.workpiece.id;
  h.controller.editPlan(id, (d) => commitDraft(d, [
    { id: testId(201), positionMm: [0, 0, 5] }, { id: testId(202), positionMm: [0.5, 0, 5] }, { id: testId(203), positionMm: [0.5, 10, 5] },
  ], testId(200), 'Recover this path'));
  h.controller.editPlan(id, (d) => updateSeamParameters(d, testId(200), { travelSpeedMmPerS: 5, currentTargetA: 80, voltageTargetV: 20 }));
  const saved = h.document(); const text = exportPlanningDocument(saved);
  const preview: ImportPreview = { ...h.asset.workpiece.source, filename: 'renamed.stl', bounds: h.asset.workpiece.boundsMm, parseMs: 0, warnings: [] };
  const prepared = { ...h.asset, geometryRevision: crypto.randomUUID(), workpiece: { ...h.asset.workpiece, id: crypto.randomUUID(), source: { ...h.asset.workpiece.source, filename: preview.filename } } };
  return { ...h, saved, text, preview, prepared, json: new File([text], 'saved.weld-job.v1.json'), id };
}

describe('saved plan validation and provenance', () => {
  it('round trips a nontrivial warned plan exactly without rounding, new IDs or mesh copies', () => {
    const h = setup();
    try {
      const document = parseSavedPlan(h.text); expect(document).toEqual(h.saved);
      verifyRestoreSource(document, h.preview, 'mm');
      const restored = activateRestoredPlan(document, h.prepared);
      expect(restored.document).toEqual(h.saved);
      expect(restored.asset.workpiece).toBe(restored.document.content.workpiece);
      expect(restored.asset.geometryRevision).toBe(h.prepared.geometryRevision);
      expect(restored.asset.positionsMm).toBe(h.prepared.positionsMm);
      expect(restored.asset.displayPositions).toBe(h.prepared.displayPositions);
      expect(restored.asset.acceleration).toBe(h.prepared.acceleration);
      expect(exportPlanningDocument(restored.document)).toBe(h.text);
    } finally { h.controller.dispose(); }
  });
  it.each<[string, (job: WeldJob) => void]>([
    ['duplicate point IDs', (j) => { j.seams[0]!.geometry.points[1]!.id = j.seams[0]!.geometry.points[0]!.id; }],
    ['invalid coordinates', (j) => { j.seams[0]!.geometry.points[1]!.positionMm[0] = 9999; }],
    ['missing parameters', (j) => { delete (j.seams[0]!.parameters as Partial<typeof j.seams[0]['parameters']>).currentTargetA; }],
    ['inconsistent sequence', (j) => { j.sequence = [testId(999)]; }],
    ['forged warnings', (j) => { j.review.warnings = []; }],
    ['invalid source frame', (j) => { Object.assign(j.workpiece.frame, { axes: 'robot_xyz' }); }],
  ])('rejects %s', (_name, mutate) => {
    const h = setup();
    try { const job = createWeldJob(h.saved); mutate(job); expect(() => parseSavedPlan(JSON.stringify(job))).toThrow(); }
    finally { h.controller.dispose(); }
  });
  it('rejects malformed JSON, unsupported versions and excessive arrays before cloning', () => {
    expect(() => parseSavedPlan('{')).toThrow(/Invalid JSON/);
    expect(() => parseSavedPlan('null')).toThrow(/object/);
    expect(() => parseSavedPlan('{"schemaVersion":"2.0.0"}')).toThrow(/Unsupported/);
    expect(() => parseSavedPlan(JSON.stringify({ schemaVersion: '1.0.0', seams: Array(101).fill(null) }))).toThrow(/100 seams/);
    expect(() => parseSavedPlan(JSON.stringify({ schemaVersion: '1.0.0', seams: [{ geometry: { points: Array(1001).fill(null) } }] }))).toThrow(/1,000/);
    expect(() => parseSavedPlan(JSON.stringify({ schemaVersion: '1.0.0', seams: Array(11).fill({ geometry: { points: Array(1000).fill(null) } }) }))).toThrow(/10,000/);
  });
  it.each(['sha256', 'byteLength', 'encoding', 'inputTriangles', 'omittedDegenerateTriangles'] as const)('rejects mismatched STL %s', (field) => {
    const h = setup();
    try {
      const altered = { ...h.preview, [field]: field === 'sha256' ? 'b'.repeat(64) : field === 'encoding' ? 'binary' : Number(h.preview[field]) + 1 };
      expect(() => verifyRestoreSource(h.saved, altered, 'mm')).toThrow(/mismatch/);
    } finally { h.controller.dispose(); }
  });
  it('checks units, normalized bounds and the final prepared metadata again', () => {
    const h = setup();
    try {
      expect(() => verifyRestoreSource(h.saved, h.preview, 'in')).toThrow(/unit mismatch/);
      const wrongUnit = structuredClone(h.saved); wrongUnit.content.workpiece.source.unit = 'cm';
      expect(() => verifyRestoreSource(wrongUnit, h.preview, 'cm')).toThrow(/bounds\/source-unit mismatch/);
      const wrongBounds = structuredClone(h.preview); wrongBounds.bounds.max[0] += 1;
      expect(() => verifyRestoreSource(h.saved, wrongBounds, 'mm')).toThrow(/bounds/);
      const prepared = { ...h.prepared, workpiece: { ...h.prepared.workpiece, source: { ...h.prepared.workpiece.source, unit: 'cm' as const } } };
      expect(() => activateRestoredPlan(h.saved, prepared)).toThrow(/metadata mismatch: unit/);
    } finally { h.controller.dispose(); }
  });
});

describe('atomic restoration controller', () => {
  it('requires confirmation and restores saved identity/revision with empty history, rejecting stale same-ID callbacks', async () => {
    const h = setup();
    try {
      h.controller.editPlan(h.id, (d) => reverseSeam(d, testId(200))); const before = h.controller.store.getState().active;
      await h.controller.restore(h.file, h.json); const receive = h.receivers.at(-1)!;
      receive({ type: 'preview', preview: h.preview });
      expect(h.controller.store.getState().active).toBe(before);
      h.controller.confirm('mm'); receive({ type: 'ready', asset: h.prepared });
      expect(h.document()).toEqual(h.saved);
      expect(h.controller.store.getState().active!.asset.workpiece.id).toBe(h.id);
      expect(h.controller.store.getState().history).toEqual({ undoCount: 0, redoCount: 0, retainedBytes: 0 });
      expect(h.controller.store.getState().savedRevision).toBe(h.saved.revision);
      expect(() => h.controller.editPlan(h.id, (d) => reverseSeam(d, testId(200)), h.asset.geometryRevision)).toThrow(/workpiece changed/);
      h.controller.editPlan(h.id, (d) => reverseSeam(d, testId(200)), h.prepared.geometryRevision);
      expect(h.document().revision).toBe(h.saved.revision + 1);
      h.controller.markDownloaded(h.asset.geometryRevision, h.document().revision);
      expect(h.controller.store.getState().savedRevision).toBe(h.saved.revision);
      h.controller.markDownloaded(h.prepared.geometryRevision, h.document().revision);
      expect(h.controller.store.getState().savedRevision).toBe(h.document().revision);
    } finally { h.controller.dispose(); }
  });
  it('preserves active plan, both history stacks and save marker on failure/cancel at each stage', async () => {
    const h = setup();
    try {
      h.controller.editPlan(h.id, (d) => reverseSeam(d, testId(200))); h.controller.travelHistory(h.id, 'undo');
      const before = h.controller.store.getState();
      const unchanged = () => {
        const current = h.controller.store.getState(); expect(current.active).toBe(before.active);
        expect(current.history).toEqual(before.history); expect(current.savedRevision).toBe(before.savedRevision);
      };
      await h.controller.restore(h.file, new File(['bad'], 'bad.json')); unchanged();
      await h.controller.restore(h.file, new File([], 'empty.json')); unchanged();
      expect(h.controller.store.getState().error).toContain('empty');
      await h.controller.restore(h.file, h.json); h.receivers.at(-1)!({ type: 'preview', preview: { ...h.preview, sha256: 'b'.repeat(64) } }); unchanged();
      await h.controller.restore(h.file, h.json); h.receivers.at(-1)!({ type: 'preview', preview: h.preview }); h.controller.confirm('cm');
      expect(h.controller.store.getState().error).toContain('unit mismatch'); unchanged();
      await h.controller.restore(h.file, h.json); const receive = h.receivers.at(-1)!;
      receive({ type: 'preview', preview: h.preview }); h.controller.confirm('mm'); h.controller.cancel();
      receive({ type: 'ready', asset: h.prepared }); unchanged();
      await h.controller.restore(h.file, h.json); h.receivers.at(-1)!({ type: 'preview', preview: h.preview }); h.controller.confirm('mm');
      h.receivers.at(-1)!({ type: 'ready', asset: { ...h.prepared, workpiece: { ...h.prepared.workpiece, boundsMm: { ...h.prepared.workpiece.boundsMm, max: [999, 999, 999] } } } });
      unchanged();
    } finally { h.controller.dispose(); }
  });
  it('checks file sizes before reads/worker allocation and isolates cancelled asynchronous JSON reads', async () => {
    const h = setup();
    try {
      const reads = vi.spyOn(h.json, 'text'); const ports = h.receivers.length;
      Object.defineProperty(h.json, 'size', { value: MAX_PLAN_FILE_BYTES + 1, configurable: true });
      await h.controller.restore(h.file, h.json); expect(reads).not.toHaveBeenCalled(); expect(h.receivers).toHaveLength(ports);
      Object.defineProperty(h.json, 'size', { value: h.text.length, configurable: true });
      const oversized = new File([], 'large.stl'); Object.defineProperty(oversized, 'size', { value: 64 * 1024 ** 2 + 1 });
      await h.controller.restore(oversized, h.json); expect(reads).not.toHaveBeenCalled();
      let finish!: (text: string) => void; reads.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
      const pending = h.controller.restore(h.file, h.json); h.controller.cancel(); finish(h.text); await pending;
      expect(h.receivers).toHaveLength(ports); expect(h.document()).toEqual(h.saved);
    } finally { h.controller.dispose(); }
  });
});
