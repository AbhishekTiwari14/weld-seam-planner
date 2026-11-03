import { emptyParameters } from '../domain/contracts';
import type { PlanningDocument, Seam } from '../domain/contracts';
import { addSeam } from '../domain/operations';
import { candidateSchema } from './contracts';
import type { SeamCandidate } from './contracts';

/**
 * Caller must commit BOTH returned values atomically as one undoable transaction.
 * Geometry revision is supplied by the runtime asset owner, never by a detector.
 */
export function acceptCandidate(document: PlanningDocument, input: unknown, options: {
  geometryRevision: string;
  name: string;
  createId?: () => string;
}): { document: PlanningDocument; candidate: SeamCandidate } {
  const candidate = candidateSchema.parse(input);
  if (candidate.review.state !== 'suggested') throw new Error('Only a suggested candidate can be accepted.');
  if (candidate.workpieceId !== document.content.workpiece.id ||
      candidate.geometryRevision !== options.geometryRevision) {
    throw new Error('Candidate belongs to a different or stale workpiece geometry.');
  }
  const createId = options.createId ?? (() => crypto.randomUUID());
  const seam: Seam = {
    id: createId(), name: options.name,
    geometry: { type: 'polyline', points: candidate.path.map((positionMm) => ({
      id: createId(), positionMm: [...positionMm],
    })) },
    parameters: emptyParameters(),
  };
  const next = addSeam(document, seam);
  return { document: next, candidate: { ...candidate, review: { state: 'accepted', seamId: seam.id } } };
}
