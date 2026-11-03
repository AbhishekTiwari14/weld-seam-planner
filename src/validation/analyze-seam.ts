import type { Bounds, Seam } from '../domain/contracts.ts';
import type { Finding } from '../domain/findings.ts';
import { measurePath, nominalArcOnTimeSeconds, PATH_DIAGNOSTICS } from '../geometry/path.ts';
import type { PathMetrics } from '../geometry/path.ts';

export interface SeamAnalysis extends PathMetrics {
  nominalArcOnTimeSeconds: number | null;
}

export function analyzeSeam(seam: Seam, bounds: Bounds, epsilonMm: number): {
  findings: Finding[]; metrics: SeamAnalysis | null;
} {
  const findings: Finding[] = [];
  const points = seam.geometry.points;
  for (const point of points) {
    if (point.positionMm.some((value, axis) =>
      bounds.min[axis]! - value > epsilonMm || value - bounds.max[axis]! > epsilonMm)) {
      findings.push({ code: 'POINT_OUTSIDE_BOUNDS', severity: 'error',
        message: 'Point lies outside the workpiece bounds.',
        target: { kind: 'point', seamId: seam.id, pointId: point.id } });
    }
  }
  try {
    const metrics = measurePath(points.map((point) => point.positionMm), epsilonMm);
    metrics.segmentLengthsMm.forEach((length, index) => {
      const target = { kind: 'segment' as const, seamId: seam.id,
        startPointId: points[index]!.id, endPointId: points[index + 1]!.id };
      if (length <= epsilonMm) {
        findings.push({ code: 'COINCIDENT_POINTS', severity: 'error', target,
          message: 'Consecutive points are coincident within the validation tolerance.',
          measurement: { value: length, unit: 'mm', threshold: epsilonMm } });
      } else if (length < PATH_DIAGNOSTICS.shortSegmentMm) {
        findings.push({ code: 'SHORT_SEGMENT', severity: 'warning', target,
          message: 'Segment is shorter than the 1 mm inspection threshold.',
          measurement: { value: length, unit: 'mm', threshold: PATH_DIAGNOSTICS.shortSegmentMm } });
      }
    });
    metrics.turnAnglesDeg.forEach((angle, index) => {
      if (angle !== null && angle > PATH_DIAGNOSTICS.highTurnDeg + PATH_DIAGNOSTICS.angleComparisonToleranceDeg) {
        findings.push({ code: 'TURN_ANGLE_HIGH', severity: 'warning',
          message: 'Path direction changes by more than the 45 degree inspection threshold.',
          target: { kind: 'point', seamId: seam.id, pointId: points[index]!.id },
          measurement: { value: angle, unit: 'deg', threshold: PATH_DIAGNOSTICS.highTurnDeg } });
      }
    });
    const duration = nominalArcOnTimeSeconds(metrics.lengthMm, seam.parameters.travelSpeedMmPerS);
    return { findings, metrics: { ...metrics, nominalArcOnTimeSeconds: duration } };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    findings.push({ code: 'NUMERIC_RANGE', severity: 'error', message: error.message,
      target: { kind: 'seam', seamId: seam.id } });
    return { findings, metrics: null };
  }
}
