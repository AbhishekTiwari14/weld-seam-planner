import type { PathPoint, PlanningDocument, Vec3 } from './contracts.ts';
import { requireValidPlanning } from '../validation/planning.ts';

function editPoints(input: PlanningDocument, seamId: string, change: (points: PathPoint[]) => PathPoint[]): PlanningDocument {
  const document = requireValidPlanning(input);
  const seam = document.content.seamsById[seamId];
  if (!seam) throw new Error('Unknown seam ID.');
  const points = change(seam.geometry.points);
  const changed = JSON.stringify(points) !== JSON.stringify(seam.geometry.points);
  return requireValidPlanning({ ...document, revision: document.revision + (changed ? 1 : 0), content: {
    ...document.content, seamsById: { ...document.content.seamsById, [seamId]: {
      ...seam, geometry: { ...seam.geometry, points },
    } },
  } });
}

export function replaceSeamPoint(input: PlanningDocument, seamId: string, pointId: string, positionMm: Vec3): PlanningDocument {
  return editPoints(input, seamId, (points) => {
    if (!points.some((point) => point.id === pointId)) throw new Error('Unknown point ID.');
    return points.map((point) => point.id === pointId ? { ...point, positionMm } : point);
  });
}

export function insertSeamPoint(input: PlanningDocument, seamId: string, startPointId: string, endPointId: string, point: PathPoint): PlanningDocument {
  return editPoints(input, seamId, (points) => {
    const index = points.findIndex((item) => item.id === startPointId);
    if (index < 0 || points[index + 1]?.id !== endPointId) throw new Error('Select an existing consecutive segment.');
    return [...points.slice(0, index + 1), point, ...points.slice(index + 1)];
  });
}

export function removeSeamPoint(input: PlanningDocument, seamId: string, pointId: string): PlanningDocument {
  return editPoints(input, seamId, (points) => {
    if (!points.some((point) => point.id === pointId)) throw new Error('Unknown point ID.');
    if (points.length <= 2) throw new Error('A seam must retain at least two points.');
    return points.filter((point) => point.id !== pointId);
  });
}
