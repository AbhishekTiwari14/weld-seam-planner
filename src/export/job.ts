import { completeParametersSchema } from '../domain/contracts.ts';
import { PlanValidationError } from '../domain/findings.ts';
import { requireValidPlanning, validatePlanning } from '../validation/planning.ts';
import { NOT_ASSESSED, RULESET_VERSION, SCHEMA_VERSION, weldJobSchema } from './schema.ts';
import type { WeldJob } from './schema.ts';
import { exportWarnings } from './warnings.ts';

/** Always recompute review from the committed document. No cached UI analysis is accepted. */
export function createWeldJob(input: unknown): WeldJob {
  const analysis = validatePlanning(input, 'export');
  if (!analysis.document || analysis.findings.some((finding) => finding.severity === 'error')) {
    throw new PlanValidationError(analysis.findings.filter((finding) => finding.severity === 'error'));
  }
  const { jobId, revision, content } = analysis.document;
  return weldJobSchema.parse({
    schemaVersion: SCHEMA_VERSION, kind: 'weld-plan', jobId, revision,
    workpiece: content.workpiece, processProfile: content.processProfile,
    seams: Object.keys(content.seamsById).sort().map((id) => {
      const seam = content.seamsById[id]!;
      return { ...seam, parameters: completeParametersSchema.parse(seam.parameters) };
    }),
    sequence: content.sequence,
    review: { rulesetVersion: RULESET_VERSION, warnings: exportWarnings(analysis.findings), notAssessed: [...NOT_ASSESSED] },
  });
}

/** Validates external jobs too; duplicates must be caught before conversion to a map. */
export function validateWeldJob(input: unknown): WeldJob {
  const job = weldJobSchema.parse(input);
  if (new Set(job.seams.map((seam) => seam.id)).size !== job.seams.length) {
    throw new PlanValidationError([{ code: 'DUPLICATE_ID', severity: 'error',
      message: 'Exported seam IDs must be unique.', target: { kind: 'document', field: 'seams' } }]);
  }
  const document = requireValidPlanning({ jobId: job.jobId, revision: job.revision, content: {
    workpiece: job.workpiece, processProfile: job.processProfile,
    seamsById: Object.fromEntries(job.seams.map((seam) => [seam.id, seam])), sequence: job.sequence,
  } }, 'export');
  const expected = createWeldJob(document);
  // Zod establishes property order; sorting makes warning order non-semantic.
  const actualWarnings = job.review.warnings.map((warning) => JSON.stringify(warning)).sort();
  const expectedWarnings = expected.review.warnings.map((warning) => JSON.stringify(warning)).sort();
  if (JSON.stringify(actualWarnings) !== JSON.stringify(expectedWarnings)) {
    throw new PlanValidationError([{ code: 'REVIEW_MISMATCH', severity: 'error',
      message: 'Review warnings do not match the current geometry and ruleset.',
      target: { kind: 'document', field: 'review.warnings' } }]);
  }
  return expected;
}

/** Fixed schema property order, ID-sorted seams, unmodified sequence, no coordinate rounding. */
export function serializeWeldJob(input: unknown): string {
  return `${JSON.stringify(validateWeldJob(input), null, 2)}\n`;
}

export function exportPlanningDocument(input: unknown): string {
  return serializeWeldJob(createWeldJob(input));
}

export function weldJobFilename(sourceFilename: string): string {
  const basename = sourceFilename.split(/[\\/]/).at(-1) ?? '';
  const stem = basename.replace(/\.stl$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80);
  return `${stem || 'workpiece'}.weld-job.v1.json`;
}
