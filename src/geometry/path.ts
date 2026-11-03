import type { Vec3 } from '../domain/contracts';
import { finiteVector } from './coordinates';

export const PATH_DIAGNOSTICS = {
  shortSegmentMm: 1,
  highTurnDeg: 45,
  angleComparisonToleranceDeg: 1e-6,
} as const;

export function distanceMm(a: readonly number[], b: readonly number[]): number {
  const start = finiteVector(a);
  const end = finiteVector(b);
  const length = Math.hypot(...end.map((value, axis) => value - start[axis]!));
  if (!Number.isFinite(length)) throw new RangeError('Segment length exceeds the numeric range.');
  return length;
}

/** 0 degrees is straight travel; 180 is a reversal. Degenerate turns are undefined. */
export function turnAngleDeg(
  before: Vec3, at: Vec3, after: Vec3, coincidenceMm = 1e-6,
): number | null {
  if (!Number.isFinite(coincidenceMm) || coincidenceMm < 0) throw new RangeError('Invalid tolerance.');
  const incomingLength = distanceMm(before, at);
  const outgoingLength = distanceMm(at, after);
  if (incomingLength <= coincidenceMm || outgoingLength <= coincidenceMm) return null;
  const a = at.map((value, axis) => (value - before[axis]!) / incomingLength);
  const b = after.map((value, axis) => (value - at[axis]!) / outgoingLength);
  // Normalize first to avoid overflowing dot/cross products on large coordinates.
  const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const cross = Math.hypot(
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  );
  return Math.atan2(cross, dot) * 180 / Math.PI;
}

export interface PathMetrics {
  segmentLengthsMm: number[];
  turnAnglesDeg: (number | null)[];
  lengthMm: number;
}

export function measurePath(points: readonly Vec3[], coincidenceMm = 1e-6): PathMetrics {
  if (points.length < 2) throw new RangeError('A path needs at least two points.');
  const segmentLengthsMm = points.slice(1).map((point, index) => distanceMm(points[index]!, point));
  const lengthMm = segmentLengthsMm.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(lengthMm)) throw new RangeError('Path length exceeds the numeric range.');
  const turnAnglesDeg = points.map((point, index) =>
    index === 0 || index === points.length - 1 ? null :
      turnAngleDeg(points[index - 1]!, point, points[index + 1]!, coincidenceMm));
  return { segmentLengthsMm, turnAnglesDeg, lengthMm };
}

export function nominalArcOnTimeSeconds(lengthMm: number, speedMmPerS: number | null): number | null {
  if (!Number.isFinite(lengthMm) || lengthMm < 0) throw new RangeError('Invalid path length.');
  if (speedMmPerS === null) return null;
  if (!Number.isFinite(speedMmPerS) || speedMmPerS <= 0) throw new RangeError('Invalid travel speed.');
  const seconds = lengthMm / speedMmPerS;
  if (!Number.isFinite(seconds)) throw new RangeError('Nominal duration exceeds the numeric range.');
  return seconds;
}
