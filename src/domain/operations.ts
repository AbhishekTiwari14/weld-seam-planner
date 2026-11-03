import type { PlanningDocument, Seam } from './contracts.ts';
import { requireValidPlanning } from '../validation/planning.ts';

/** Pure operations: caller commits the returned document as one history transaction. */
export function addSeam(input: PlanningDocument, seam: Seam): PlanningDocument {
  const document = requireValidPlanning(input);
  if (Object.hasOwn(document.content.seamsById, seam.id)) throw new Error('Seam ID already exists.');
  return requireValidPlanning({ ...document, revision: document.revision + 1, content: {
    ...document.content,
    seamsById: { ...document.content.seamsById, [seam.id]: seam },
    sequence: [...document.content.sequence, seam.id],
  } });
}

export function setSequence(input: PlanningDocument, sequence: readonly string[]): PlanningDocument {
  const document = requireValidPlanning(input);
  const changed = sequence.length !== document.content.sequence.length ||
    sequence.some((id, index) => id !== document.content.sequence[index]);
  return requireValidPlanning({ ...document, revision: document.revision + (changed ? 1 : 0),
    content: { ...document.content, sequence: [...sequence] } });
}

export function reverseSeam(input: PlanningDocument, seamId: string): PlanningDocument {
  const document = requireValidPlanning(input);
  const seam = document.content.seamsById[seamId];
  if (!seam) throw new Error('Unknown seam ID.');
  return requireValidPlanning({ ...document, revision: document.revision + 1, content: {
    ...document.content,
    seamsById: { ...document.content.seamsById, [seamId]: {
      ...seam, geometry: { ...seam.geometry, points: [...seam.geometry.points].reverse() },
    } },
  } });
}
