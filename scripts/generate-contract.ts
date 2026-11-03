import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { weldJobJsonSchema } from '../src/export/schema.ts';
import { createWeldJob, exportPlanningDocument } from '../src/export/job.ts';

const plan: unknown = JSON.parse(readFileSync(resolve('fixtures/planning-document.json'), 'utf8'));
mkdirSync(resolve('schemas'), { recursive: true });
writeFileSync(resolve('schemas/weld-job.v1.schema.json'), `${JSON.stringify(weldJobJsonSchema(), null, 2)}\n`);
writeFileSync(resolve('fixtures/weld-job.v1.json'), exportPlanningDocument(plan));
const invalid = createWeldJob(plan);
invalid.seams[0]!.parameters.travelSpeedMmPerS = 0;
writeFileSync(resolve('fixtures/invalid-zero-speed.v1.json'), `${JSON.stringify(invalid, null, 2)}\n`);
