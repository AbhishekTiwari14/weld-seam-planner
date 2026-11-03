import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { createWeldJob, exportPlanningDocument, serializeWeldJob, validateWeldJob, weldJobFilename } from '../src/export/job';
import { weldJobJsonSchema } from '../src/export/schema';
import { addSeam } from '../src/domain/operations';
import { acceptCandidate } from '../src/candidates/accept';
import { samplePlan, sampleSeamId, testId } from './helpers';

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateStructure = ajv.compile(weldJobJsonSchema());
const fixtureText = readFileSync(new URL('../fixtures/weld-job.v1.json', import.meta.url), 'utf8');
const invalidFixture = JSON.parse(readFileSync(new URL('../fixtures/invalid-zero-speed.v1.json', import.meta.url), 'utf8')) as unknown;

describe('versioned weld-job contract', () => {
  it('agrees with independent JSON Schema validation and the checked-in schema', () => {
    const schema = JSON.parse(readFileSync(new URL('../schemas/weld-job.v1.schema.json', import.meta.url), 'utf8')) as unknown;
    expect(schema).toEqual(weldJobJsonSchema());
    expect(validateStructure(JSON.parse(fixtureText)), JSON.stringify(validateStructure.errors)).toBe(true);
    expect(() => validateWeldJob(JSON.parse(fixtureText))).not.toThrow();
    expect(validateStructure(invalidFixture)).toBe(false);
    expect(() => validateWeldJob(invalidFixture)).toThrow();
  });

  it('matches a representative fixture exactly, without mutating the document', () => {
    const plan = samplePlan(); const saved = structuredClone(plan);
    expect(exportPlanningDocument(plan)).toBe(fixtureText);
    expect(plan).toEqual(saved);
  });

  it('preserves precision and does not apply source-unit scaling a second time', () => {
    const plan = samplePlan(); plan.content.workpiece.source.unit = 'in';
    plan.content.seamsById[sampleSeamId]!.geometry.points[0]!.positionMm[0] = 0.123456789012345;
    const parsed = validateWeldJob(JSON.parse(exportPlanningDocument(plan)));
    expect(parsed.seams[0]!.geometry.points[0]!.positionMm[0]).toBe(0.123456789012345);
    expect(parsed.seams[0]!.geometry.points[1]!.positionMm[0]).toBe(10);
  });

  it('sorts seam records independently of authoritative sequence and object insertion order', () => {
    const plan = samplePlan(); const second = structuredClone(plan.content.seamsById[sampleSeamId]!);
    second.id = testId(20); second.geometry.points.forEach((point, i) => { point.id = testId(21 + i); });
    const two = addSeam(plan, second); two.content.sequence.reverse();
    const reverseKeys = structuredClone(two);
    reverseKeys.content.seamsById = Object.fromEntries(Object.entries(two.content.seamsById).reverse());
    expect(exportPlanningDocument(reverseKeys)).toBe(exportPlanningDocument(two));
    const job = createWeldJob(two);
    expect(job.seams.map((seam) => seam.id)).toEqual([sampleSeamId, testId(20)]);
    expect(job.sequence).toEqual([testId(20), sampleSeamId]);
    job.seams.reverse(); job.review.warnings.reverse();
    expect(serializeWeldJob(job)).toBe(exportPlanningDocument(two));
  });

  it('distinguishes structural schema checks from semantic checks', () => {
    const job = createWeldJob(samplePlan()); job.sequence = [testId(99)];
    expect(validateStructure(job)).toBe(true);
    expect(() => validateWeldJob(job)).toThrow();
  });

  it('rejects duplicate seams before conversion to a map could hide them', () => {
    const job = createWeldJob(samplePlan()); job.seams.push(structuredClone(job.seams[0]!));
    expect(() => validateWeldJob(job)).toThrow(/unique/);
  });

  it('rejects unsupported versions, unknown fields, and non-finite values before stringify', () => {
    const job = createWeldJob(samplePlan());
    expect(() => serializeWeldJob({ ...job, schemaVersion: '2.0.0' })).toThrow();
    expect(() => serializeWeldJob({ ...job, robotCalibration: {} })).toThrow();
    job.seams[0]!.geometry.points[0]!.positionMm[0] = NaN;
    expect(() => serializeWeldJob(job)).toThrow();
  });

  it('rejects missing, stale, duplicate, and forged warning evidence', () => {
    for (const modification of ['missing', 'value', 'reference', 'duplicate']) {
      const job = createWeldJob(samplePlan());
      if (modification === 'missing') job.review.warnings = [];
      if (modification === 'duplicate') job.review.warnings.push(job.review.warnings[0]!);
      const warning = job.review.warnings[0];
      if (warning?.code === 'SHORT_SEGMENT') {
        if (modification === 'value') warning.valueMm = 0.1;
        if (modification === 'reference') warning.startPointId = testId(99);
      }
      expect(() => serializeWeldJob(job)).toThrow(/Review warnings/);
    }
  });

  it('carries omitted-triangle evidence and explicit downstream limitations', () => {
    const plan = samplePlan(); plan.content.workpiece.source.omittedDegenerateTriangles = 1;
    const job = createWeldJob(plan);
    expect(job.review.warnings).toContainEqual({ code: 'DEGENERATE_TRIANGLES_OMITTED', count: 1 });
    expect(job.review.notAssessed).toContain('workpiece_to_robot_registration');
    expect(job.review.notAssessed).toContain('torch_orientation');
    expect(serializeWeldJob(job)).not.toContain('orientationQuaternion');
  });

  it('exports accepted geometry only after configuration and never exports detection metadata', () => {
    const plan = samplePlan(); const original = exportPlanningDocument(plan);
    const candidate = { candidateId: 'proposal:1', workpieceId: testId(2), geometryRevision: 'mesh-1',
      path: [[0, 0, 1], [20, 0, 1]], method: { name: 'feature-paths', version: '1' },
      evidence: { summary: 'Fixture evidence', sourceElementIds: [], measurements: [], limitations: [] },
      review: { state: 'suggested' } };
    expect(exportPlanningDocument(plan)).toBe(original);
    let nextId = 30;
    const accepted = acceptCandidate(plan, candidate, { geometryRevision: 'mesh-1', name: 'Accepted', createId: () => testId(nextId++) });
    expect(() => exportPlanningDocument(accepted.document)).toThrow();
    accepted.document.content.seamsById[testId(30)]!.parameters = { travelSpeedMmPerS: 4, currentTargetA: 100, voltageTargetV: 20 };
    const output = exportPlanningDocument(accepted.document);
    expect(validateWeldJob(JSON.parse(output)).seams).toHaveLength(2);
    for (const detectorField of ['candidateId', 'geometryRevision', 'evidence', 'feature-paths']) {
      expect(output).not.toContain(detectorField);
    }
  });

  it('constructs a filename without exporting a local path', () => {
    expect(weldJobFilename('C:\\parts\\test part.STL')).toBe('test-part.weld-job.v1.json');
    expect(weldJobFilename('')).toBe('workpiece.weld-job.v1.json');
  });
});
