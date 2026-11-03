export type FindingCode =
  | 'STRUCTURE_INVALID' | 'BOUNDS_INVALID' | 'SOURCE_INCONSISTENT'
  | 'DUPLICATE_ID' | 'SEAM_KEY_MISMATCH' | 'SEAM_LIMIT' | 'POINT_LIMIT'
  | 'SEQUENCE_INVALID' | 'NAME_INVALID' | 'POINT_OUTSIDE_BOUNDS'
  | 'COINCIDENT_POINTS' | 'NUMERIC_RANGE' | 'PARAMETER_REQUIRED' | 'NO_SEAMS'
  | 'TURN_ANGLE_HIGH' | 'SHORT_SEGMENT' | 'DEGENERATE_TRIANGLES_OMITTED'
  | 'REVIEW_MISMATCH';

export type FindingTarget =
  | { kind: 'document'; field?: string }
  | { kind: 'workpiece' }
  | { kind: 'seam'; seamId: string }
  | { kind: 'parameter'; seamId: string; field: string }
  | { kind: 'point'; seamId: string; pointId: string }
  | { kind: 'segment'; seamId: string; startPointId: string; endPointId: string };

export interface Finding {
  code: FindingCode;
  severity: 'error' | 'warning';
  message: string;
  target: FindingTarget;
  measurement?: { value: number; unit: 'mm' | 'deg' | 'count'; threshold?: number };
}

export class PlanValidationError extends Error {
  public readonly findings: readonly Finding[];
  constructor(findings: readonly Finding[]) {
    super(findings.map((finding) => finding.message).join(' '));
    this.findings = findings;
    this.name = 'PlanValidationError';
  }
}
