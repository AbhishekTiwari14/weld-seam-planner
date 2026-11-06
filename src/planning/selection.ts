import type { PlanningDocument, Seam, Vec3 } from '../domain/contracts.ts';
import type { FindingTarget } from '../domain/findings.ts';
import { insertSeamPoint, replaceSeamPoint } from '../domain/point-operations.ts';

export type GeometrySelection = Extract<FindingTarget, { kind: 'point' | 'segment' }>;
export type SurfaceEdit = { workpieceId: string; revision: number; seamId: string } & (
  { kind: 'replace'; pointId: string } |
  { kind: 'insert'; startPointId: string; endPointId: string; newPointId: string }
);

export function selectionExists(seam: Seam | undefined, selection: GeometrySelection | null): boolean {
  if (!seam || !selection || seam.id !== selection.seamId) return false;
  const points = seam.geometry.points;
  if (selection.kind === 'point') return points.some((point) => point.id === selection.pointId);
  return points.some((point, i) => point.id === selection.startPointId && points[i + 1]?.id === selection.endPointId);
}

/** Used for preview and commit alike; obsolete picks cannot target a later revision. */
export function applySurfaceEdit(document: PlanningDocument, intent: SurfaceEdit, positionMm: Vec3): PlanningDocument {
  if (document.content.workpiece.id !== intent.workpieceId || document.revision !== intent.revision) {
    throw new Error('The plan changed. Cancel and start this point edit again.');
  }
  return intent.kind === 'replace'
    ? replaceSeamPoint(document, intent.seamId, intent.pointId, positionMm)
    : insertSeamPoint(document, intent.seamId, intent.startPointId, intent.endPointId, { id: intent.newPointId, positionMm });
}
