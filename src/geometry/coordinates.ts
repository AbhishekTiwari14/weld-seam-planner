import type { Bounds, SourceUnit, Vec3 } from '../domain/contracts.ts';

export const MILLIMETRES_PER_UNIT: Readonly<Record<SourceUnit, number>> = {
  mm: 1, cm: 10, m: 1_000, in: 25.4,
};

export function finiteVector(point: readonly number[]): Vec3 {
  if (point.length !== 3 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2])) {
    throw new RangeError('Expected three finite coordinates.');
  }
  return [point[0]!, point[1]!, point[2]!];
}

export function sourceToWorkpiece(point: readonly number[], unit: SourceUnit): Vec3 {
  const scale = MILLIMETRES_PER_UNIT[unit];
  return finiteVector(finiteVector(point).map((value) => value * scale));
}

export function workpieceToSource(pointMm: readonly number[], unit: SourceUnit): Vec3 {
  const scale = MILLIMETRES_PER_UNIT[unit];
  return finiteVector(finiteVector(pointMm).map((value) => value / scale));
}

export interface ViewTransform {
  centerMm: Vec3;
  scaleMm: number;
}

export function createViewTransform(bounds: Bounds): ViewTransform {
  finiteVector(bounds.min);
  finiteVector(bounds.max);
  const extents = finiteVector(bounds.max.map((value, axis) => value - bounds.min[axis]!));
  const scaleMm = Math.hypot(...extents);
  if (extents.some((value) => value < 0) || !Number.isFinite(scaleMm) || scaleMm <= 0) {
    throw new RangeError('Workpiece bounds must have finite, positive extent.');
  }
  const centerMm = finiteVector(bounds.min.map((value, axis) => value + extents[axis]! / 2));
  return { centerMm, scaleMm };
}

function checkTransform(transform: ViewTransform): void {
  finiteVector(transform.centerMm);
  if (!Number.isFinite(transform.scaleMm) || transform.scaleMm <= 0) {
    throw new RangeError('View scale must be finite and positive.');
  }
}

export function workpieceToView(pointMm: readonly number[], transform: ViewTransform): Vec3 {
  checkTransform(transform);
  return finiteVector(finiteVector(pointMm).map((value, axis) =>
    (value - transform.centerMm[axis]!) / transform.scaleMm));
}

/** Input is in the defined view frame, not an arbitrary Three.js world frame. */
export function viewToWorkpiece(point: readonly number[], transform: ViewTransform): Vec3 {
  checkTransform(transform);
  return finiteVector(finiteVector(point).map((value, axis) =>
    value * transform.scaleMm + transform.centerMm[axis]!));
}

/** Validation policy, not a claim of mesh or manufacturing accuracy. */
export function coincidenceToleranceMm(diagonalMm: number): number {
  if (!Number.isFinite(diagonalMm) || diagonalMm <= 0) throw new RangeError('Invalid diagonal.');
  return Math.max(1e-6, 32 * Number.EPSILON * diagonalMm);
}
