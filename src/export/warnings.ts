import type { Finding } from '../domain/findings.ts';
import type { ExportWarning } from './schema.ts';

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
