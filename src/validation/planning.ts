import { LIMITS, planningDocumentSchema } from '../domain/contracts.ts';
import type { PlanningDocument } from '../domain/contracts.ts';
import { PlanValidationError } from '../domain/findings.ts';
import type { Finding, FindingTarget } from '../domain/findings.ts';
import { coincidenceToleranceMm, createViewTransform } from '../geometry/coordinates.ts';
import { analyzeSeam } from './analyze-seam.ts';
import type { SeamAnalysis } from './analyze-seam.ts';

export interface PlanningAnalysis {
  revision: number | null;
  document: PlanningDocument | null;
  findings: Finding[];
  seams: Record<string, SeamAnalysis>;
  totalLengthMm: number | null;
  totalNominalArcOnTimeSeconds: number | null;
}

export function validatePlanning(input: unknown, mode: 'planning' | 'export' = 'planning'): PlanningAnalysis {
  const result: PlanningAnalysis = { revision: null, document: null, findings: [], seams: {},
    totalLengthMm: null, totalNominalArcOnTimeSeconds: null };
  const parsed = planningDocumentSchema.safeParse(input);
  if (!parsed.success) {
    result.findings = parsed.error.issues.map((issue) => {
      const path = issue.path;
      const target: FindingTarget = path[1] === 'seamsById' && typeof path[2] === 'string' && path[3] === 'parameters'
        ? { kind: 'parameter', seamId: path[2], field: String(path[4] ?? 'parameters') }
        : { kind: 'document', field: path.map(String).join('.') };
      return { code: 'STRUCTURE_INVALID', severity: 'error', message: issue.message, target };
    });
    return result;
  }
  const document = parsed.data;
  const { workpiece, seamsById, sequence } = document.content;
  result.document = document;
  result.revision = document.revision;
  const error = (code: Finding['code'], message: string, target: FindingTarget = { kind: 'document' }) =>
    result.findings.push({ code, severity: 'error', message, target });
  const ids = new Set<string>();
  const checkId = (id: string, target: FindingTarget) => {
    if (ids.has(id)) error('DUPLICATE_ID', 'Identifiers must be unique across the document.', target);
    ids.add(id);
  };
  checkId(document.jobId, { kind: 'document' });
  checkId(workpiece.id, { kind: 'workpiece' });
  const source = workpiece.source;
  if (source.omittedDegenerateTriangles >= source.inputTriangles ||
      (source.encoding === 'binary' && (source.inputTriangles > 0xffffffff ||
        source.byteLength !== 84 + 50 * source.inputTriangles))) {
    error('SOURCE_INCONSISTENT', 'Source triangle counts or binary byte length are inconsistent.', { kind: 'workpiece' });
  }
  if (source.omittedDegenerateTriangles > 0) {
    result.findings.push({ code: 'DEGENERATE_TRIANGLES_OMITTED', severity: 'warning',
      message: 'Degenerate triangles were omitted during import.', target: { kind: 'workpiece' },
      measurement: { value: source.omittedDegenerateTriangles, unit: 'count' } });
  }
  let epsilonMm: number | null = null;
  try {
    epsilonMm = coincidenceToleranceMm(createViewTransform(workpiece.boundsMm).scaleMm);
  } catch (cause) {
    if (!(cause instanceof RangeError)) throw cause;
    error('BOUNDS_INVALID', cause.message, { kind: 'workpiece' });
  }
  const keys = Object.keys(seamsById).sort();
  if (keys.length > LIMITS.seams) error('SEAM_LIMIT', 'A plan can contain at most 100 seams.');
  if (mode === 'export' && keys.length === 0) error('NO_SEAMS', 'Add at least one seam before export.');
  if (sequence.length !== keys.length || new Set(sequence).size !== sequence.length ||
      sequence.some((id) => !Object.hasOwn(seamsById, id))) {
    error('SEQUENCE_INVALID', 'Sequence must contain each seam ID exactly once.');
  }
  let totalPoints = 0;
  for (const key of keys) {
    const seam = seamsById[key]!;
    const target = { kind: 'seam' as const, seamId: seam.id };
    checkId(seam.id, target);
    if (key !== seam.id) error('SEAM_KEY_MISMATCH', 'Seam map key must equal its seam ID.', target);
    if (seam.name.trim() !== seam.name || seam.name.trim().length === 0) {
      error('NAME_INVALID', 'Seam name must be nonempty and trimmed.', target);
    }
    totalPoints += seam.geometry.points.length;
    for (const point of seam.geometry.points) checkId(point.id, { kind: 'point', seamId: seam.id, pointId: point.id });
    if (mode === 'export') {
      for (const [field, value] of Object.entries(seam.parameters)) {
        if (value === null) error('PARAMETER_REQUIRED', 'Complete every welding parameter before export.',
          { kind: 'parameter', seamId: seam.id, field });
      }
    }
    if (epsilonMm !== null) {
      const analysis = analyzeSeam(seam, workpiece.boundsMm, epsilonMm);
      result.findings.push(...analysis.findings);
      if (analysis.metrics) result.seams[key] = analysis.metrics;
    }
  }
  if (totalPoints > LIMITS.totalPoints) error('POINT_LIMIT', 'A plan can contain at most 10,000 points.');
  if (result.findings.some((finding) => finding.severity === 'error')) return result;
  const metrics = Object.values(result.seams);
  result.totalLengthMm = metrics.reduce((sum, seam) => sum + seam.lengthMm, 0);
  result.totalNominalArcOnTimeSeconds = metrics.some((seam) => seam.nominalArcOnTimeSeconds === null)
    ? null : metrics.reduce((sum, seam) => sum + seam.nominalArcOnTimeSeconds!, 0);
  if (!Number.isFinite(result.totalLengthMm) ||
      (result.totalNominalArcOnTimeSeconds !== null && !Number.isFinite(result.totalNominalArcOnTimeSeconds))) {
    error('NUMERIC_RANGE', 'Plan totals exceed the numeric range.');
    result.totalLengthMm = null;
    result.totalNominalArcOnTimeSeconds = null;
  }
  return result;
}

export function requireValidPlanning(input: unknown, mode: 'planning' | 'export' = 'planning'): PlanningDocument {
  const analysis = validatePlanning(input, mode);
  if (!analysis.document || analysis.findings.some((finding) => finding.severity === 'error')) {
    throw new PlanValidationError(analysis.findings.filter((finding) => finding.severity === 'error'));
  }
  return analysis.document;
}
