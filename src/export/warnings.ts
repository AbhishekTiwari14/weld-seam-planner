import type { Finding } from '../domain/findings.ts';
import type { ExportWarning } from './schema.ts';

function warningKey(warning: ExportWarning): string {
  switch (warning.code) {
    case 'SHORT_SEGMENT': return JSON.stringify([warning.code, warning.seamId, warning.startPointId, warning.endPointId]);
    case 'TURN_ANGLE_HIGH': return JSON.stringify([warning.code, warning.seamId, warning.pointId]);
    case 'DEGENERATE_TRIANGLES_OMITTED': return warning.code;
  }
}

/** Compare derived measurements with a floating-point evaluation allowance,
 * not a manufacturing tolerance. Warning membership and references stay exact. */
export function warningsMatch(actual: readonly ExportWarning[], expected: readonly ExportWarning[]): boolean {
  if (actual.length !== expected.length) return false;
  const remaining = new Map(expected.map((warning) => [warningKey(warning), warning]));
  const close = (a: number, b: number) => Math.abs(a - b) <= 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  for (const warning of actual) {
    const key = warningKey(warning);
    const other = remaining.get(key);
    if (!other) return false; // Missing, changed reference, or duplicate identity.
    remaining.delete(key);
    if (warning.code === 'SHORT_SEGMENT' && other.code === 'SHORT_SEGMENT' && !close(warning.valueMm, other.valueMm)) return false;
    if (warning.code === 'TURN_ANGLE_HIGH' && other.code === 'TURN_ANGLE_HIGH' && !close(warning.valueDeg, other.valueDeg)) return false;
    if (warning.code === 'DEGENERATE_TRIANGLES_OMITTED' && other.code === 'DEGENERATE_TRIANGLES_OMITTED' && warning.count !== other.count) return false;
  }
  return remaining.size === 0;
}

export function exportWarnings(findings: readonly Finding[]): ExportWarning[] {
  return findings.filter((finding) => finding.severity === 'warning').map((finding): ExportWarning => {
    const { target, measurement } = finding;
    if (finding.code === 'SHORT_SEGMENT' && target.kind === 'segment' && measurement?.unit === 'mm') {
      return { code: 'SHORT_SEGMENT', seamId: target.seamId, startPointId: target.startPointId,
        endPointId: target.endPointId, valueMm: measurement.value };
    }
    if (finding.code === 'TURN_ANGLE_HIGH' && target.kind === 'point' && measurement?.unit === 'deg') {
      return { code: 'TURN_ANGLE_HIGH', seamId: target.seamId, pointId: target.pointId, valueDeg: measurement.value };
    }
    if (finding.code === 'DEGENERATE_TRIANGLES_OMITTED' && measurement?.unit === 'count') {
      return { code: 'DEGENERATE_TRIANGLES_OMITTED', count: measurement.value };
    }
    throw new Error(`No export mapping for warning ${finding.code}.`);
  });
}
