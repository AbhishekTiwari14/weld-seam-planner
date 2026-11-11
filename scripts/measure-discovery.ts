import { cpus, totalmem } from 'node:os';
import { generateGussetBracket, generatePipeOnPlate, generateTJoint } from './generate-samples.ts';
import { parseStl } from '../src/import/parse-stl.ts';
import { discoverJunctionCandidates } from '../src/candidates/discover.ts';
import type { Bounds } from '../src/domain/contracts.ts';

const read = (bytes: Uint8Array) => parseStl(new Uint8Array(bytes).buffer);
const t = read(generateTJoint());
const copies = 100;
const grid = new Float64Array(t.positions.length * copies);
for (let copy = 0; copy < copies; copy++) {
  for (let i = 0; i < t.positions.length; i++) grid[copy * t.positions.length + i] = t.positions[i]! + (i % 3 === 0 ? (copy % 10) * 200 : i % 3 === 1 ? Math.floor(copy / 10) * 200 : 0);
}
const gridBounds: Bounds = { min: [...t.bounds.min], max: [t.bounds.max[0] + 1800, t.bounds.max[1] + 1800, t.bounds.max[2]] };
const cases = [
  { name: 'T-joint', parsed: t },
  { name: 'Gusset', parsed: read(generateGussetBracket()) },
  { name: 'Pipe-on-plate', parsed: read(generatePipeOnPlate()) },
  { name: '100 T-joints grid', parsed: { positions: grid, bounds: gridBounds }, minLengthMm: 20 },
];
console.log(`CPU: ${cpus()[0]?.model}; logical CPUs: ${cpus().length}; RAM: ${(totalmem() / 1024 ** 3).toFixed(1)} GiB; Node ${process.version}`);
for (const item of cases) {
  const input = { positionsMm: item.parsed.positions, boundsMm: item.parsed.bounds,
    workpieceId: '00000000-0000-4000-8000-000000000001', geometryRevision: 'benchmark',
    ...(item.minLengthMm === undefined ? {} : { minLengthMm: item.minLengthMm }) };
  const times: number[] = [];
  let expected = '';
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const start = performance.now(); const result = discoverJunctionCandidates(input); times.push(performance.now() - start);
    const signature = JSON.stringify(result);
    if (i && signature !== expected) throw new Error(`${item.name}: non-deterministic results`);
    expected = signature; count = result.candidates.length;
  }
  console.log(`${item.name}: ${input.positionsMm.length / 9} triangles; ${count} candidates; 5 runs ms: ${times.map((n) => n.toFixed(1)).join(', ')}; deterministic`);
}
