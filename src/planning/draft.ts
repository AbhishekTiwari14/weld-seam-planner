import { emptyParameters, LIMITS, pointSchema, type PathPoint, type PlanningDocument, type Vec3 } from '../domain/contracts.ts';
import { addSeam } from '../domain/operations.ts';
import { coincidenceToleranceMm, createViewTransform } from '../geometry/coordinates.ts';
import { distanceMm } from '../geometry/path.ts';

export function remainingPointCapacity(document: PlanningDocument): number {
  return LIMITS.totalPoints - Object.values(document.content.seamsById).reduce((sum, seam) => sum + seam.geometry.points.length, 0);
}

/** Drafts are transient, but every point must already satisfy selection/size constraints. */
export function appendDraftPoint(document: PlanningDocument, points: readonly PathPoint[], positionMm: Vec3, id: string): PathPoint[] {
  if (document.content.sequence.length >= LIMITS.seams) throw new Error('The plan already contains 100 seams.');
  if (points.length >= Math.min(LIMITS.pointsPerSeam, remainingPointCapacity(document))) {
    throw new Error('Point limit reached: 1,000 per seam and 10,000 per plan.');
  }
  const point = pointSchema.parse({ id, positionMm });
  const bounds = document.content.workpiece.boundsMm;
  const epsilon = coincidenceToleranceMm(createViewTransform(bounds).scaleMm);
  if (positionMm.some((value, axis) => bounds.min[axis]! - value > epsilon || value - bounds.max[axis]! > epsilon)) {
    throw new Error('Select a point on the current workpiece.');
  }
  const previous = points.at(-1);
  if (previous && distanceMm(previous.positionMm, positionMm) <= epsilon) throw new Error('Choose a different point; this point coincides with the previous one.');
  const usedIds = [document.jobId, document.content.workpiece.id, ...points.map((p) => p.id),
    ...Object.values(document.content.seamsById).flatMap((seam) => [seam.id, ...seam.geometry.points.map((p) => p.id)])];
  if (usedIds.includes(id)) throw new Error('Point identifier already exists.');
  return [...points, point];
}

export function commitDraft(document: PlanningDocument, points: readonly PathPoint[], id: string, name: string): PlanningDocument {
  if (points.length < 2) throw new Error('Place at least two distinct surface points before finishing.');
  return addSeam(document, { id, name, geometry: { type: 'polyline', points: [...points] }, parameters: emptyParameters() });
}
