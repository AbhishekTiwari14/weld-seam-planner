import { ZodError } from 'zod';
import { LIMITS, type PlanningDocument, type SourceUnit } from '../domain/contracts.ts';
import { validateWeldJob } from '../export/job.ts';
import { SCHEMA_VERSION } from '../export/schema.ts';
import { MILLIMETRES_PER_UNIT } from '../geometry/coordinates.ts';
import type { ActiveWorkpiece, ImportPreview, MeshAsset } from '../import/types.ts';
import { requireValidPlanning } from '../validation/planning.ts';

export const MAX_PLAN_FILE_BYTES = 16 * 1024 ** 2;
export interface RestoreSummary { filename: string; seamCount: number; revision: number; unit: SourceUnit }

export function recoveryError(cause: unknown): string {
  if (cause instanceof ZodError) return `Invalid weld-job fields: ${cause.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`).join('; ')}`;
  return cause instanceof Error ? cause.message : 'The saved plan could not be restored.';
}

/** Cap arrays before schema validation creates independent structured copies. */
function preflight(input: unknown): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The JSON must contain a weld-job object.');
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported weld-job schema version. Expected ${SCHEMA_VERSION}.`);
  if (Array.isArray(value.seams)) {
    if (value.seams.length > LIMITS.seams) throw new Error('A plan can contain at most 100 seams.');
    let total = 0;
    for (const seam of value.seams) {
      const points: unknown = seam?.geometry?.points;
      if (!Array.isArray(points)) continue;
      if (points.length > LIMITS.pointsPerSeam) throw new Error('A seam can contain at most 1,000 points.');
      total += points.length;
      if (total > LIMITS.totalPoints) throw new Error('A plan can contain at most 10,000 points.');
    }
  }
  const review = value.review;
  if (review && typeof review === 'object' && 'warnings' in review && Array.isArray(review.warnings) && review.warnings.length > 20_000) {
    throw new Error('The saved review exceeds the 20,000-finding limit.');
  }
}

export function parseSavedPlan(text: string): PlanningDocument {
  if (text.length > MAX_PLAN_FILE_BYTES) throw new Error('Plan JSON exceeds the 16 MiB recovery limit.');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error('Invalid JSON. Select an intact exported .weld-job.v1.json file.'); }
  preflight(input);
  // Includes semantic checks and the existing narrow derived-warning roundoff policy.
  const job = validateWeldJob(input);
  return requireValidPlanning({ jobId: job.jobId, revision: job.revision, content: {
    workpiece: job.workpiece, processProfile: job.processProfile,
    seamsById: Object.fromEntries(job.seams.map((seam) => [seam.id, seam])), sequence: job.sequence,
  } }, 'export');
}

export function verifyRestoreSource(document: PlanningDocument, preview: ImportPreview, unit: SourceUnit): void {
  const saved = document.content.workpiece;
  if (preview.sha256 !== saved.source.sha256) throw new Error('STL SHA-256 mismatch. Select the exact original STL bytes used by this saved plan.');
  if (unit !== saved.source.unit) throw new Error(`Source-unit mismatch. This plan requires ${saved.source.unit}; its saved coordinates must not be rescaled.`);
  for (const field of ['byteLength', 'encoding', 'inputTriangles', 'omittedDegenerateTriangles'] as const) {
    if (preview[field] !== saved.source[field]) throw new Error(`STL source metadata mismatch: ${field}. The saved plan does not describe this imported geometry.`);
  }
  const scale = MILLIMETRES_PER_UNIT[unit];
  for (const bound of ['min', 'max'] as const) for (let axis = 0; axis < 3; axis++) {
    if (preview.bounds[bound][axis]! * scale !== saved.boundsMm[bound][axis]) {
      throw new Error('Workpiece bounds/source-unit mismatch. Imported geometry does not match the saved millimetre frame.');
    }
  }
  // Basename is descriptive: renamed identical bytes are allowed. Saved provenance remains exact.
}

export function activateRestoredPlan(document: PlanningDocument, asset: MeshAsset): ActiveWorkpiece {
  const valid = requireValidPlanning(document, 'export');
  const actual = asset.workpiece;
  for (const field of ['sha256', 'byteLength', 'encoding', 'unit', 'inputTriangles', 'omittedDegenerateTriangles'] as const) {
    if (actual.source[field] !== valid.content.workpiece.source[field]) throw new Error(`Prepared workpiece metadata mismatch: ${field}.`);
  }
  if (JSON.stringify(actual.boundsMm) !== JSON.stringify(valid.content.workpiece.boundsMm) ||
      JSON.stringify(actual.frame) !== JSON.stringify(valid.content.workpiece.frame)) throw new Error('Prepared workpiece frame or bounds mismatch.');
  // Shallow asset header replacement: retain transferred typed arrays/BVH; no geometry clone.
  return { document: valid, asset: { ...asset, workpiece: valid.content.workpiece } };
}
