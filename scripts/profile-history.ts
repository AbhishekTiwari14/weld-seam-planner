import os from 'node:os';
import { readFileSync } from 'node:fs';
import { PlanHistory } from '../src/planning/history.ts';
import { renameSeam } from '../src/domain/operations.ts';
import { requireValidPlanning } from '../src/validation/planning.ts';

// Reproducible upper-limit history probe; separate from browser/GPU measurements.
// Run with node --expose-gc scripts/profile-history.ts. No files are generated.
const testId = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
let document = requireValidPlanning(JSON.parse(readFileSync('fixtures/planning-document.json', 'utf8')));
const template = Object.values(document.content.seamsById)[0]!;
document.content.seamsById = {}; document.content.sequence = [];
for (let s = 0; s < 100; s++) {
  const id = testId(100 + s); document.content.sequence.push(id);
  document.content.seamsById[id] = { ...template, id, geometry: { type: 'polyline', points: Array.from({ length: 100 }, (_, p) => ({
    id: testId(1000 + s * 100 + p), positionMm: [p, s, 0],
  })) } };
}
document = requireValidPlanning(document);
const history = new PlanHistory();
const heap = () => { globalThis.gc?.(); return process.memoryUsage().heapUsed; };
const baselineHeap = heap();
const samples: { operations: number; heapBytes: number; retainedBytes: number; states: number }[] = [];
const editMs: number[] = [], undoMs: number[] = [], redoMs: number[] = [];
for (let i = 0; i < 100; i++) {
  const started = performance.now();
  const changed = renameSeam(document, testId(100), `Measured change ${i}`);
  history.record(document.content); document = changed;
  editMs.push(performance.now() - started);
  if ((i + 1) % 20 === 0) samples.push({ operations: i + 1, heapBytes: heap(), retainedBytes: history.summary().retainedBytes, states: history.summary().undoCount });
}
for (let i = 0; i < 30; i++) {
  let started = performance.now(); document = history.restore(document, 'undo'); undoMs.push(performance.now() - started);
  started = performance.now(); document = history.restore(document, 'redo'); redoMs.push(performance.now() - started);
}
const timing = (values: number[]) => ({ median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values) });
console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model, memoryGiB: os.totalmem() / 1024 ** 3,
  forcedGc: !!globalThis.gc, seams: 100, points: 10_000, baselineHeap, samples, finalHeap: heap(), history: history.summary(),
  editMs: timing(editMs), undoMs: timing(undoMs), redoMs: timing(redoMs), revision: document.revision,
  note: 'Node heap snapshots after optional GC; not browser peak/RSS or a latency guarantee. Edits measure pure operation plus history recording, excluding UI rendering.',
}, null, 2));
