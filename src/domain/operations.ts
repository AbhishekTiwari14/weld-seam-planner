import type { PlanningDocument, Seam, WeldingParameters } from './contracts.ts';
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

export function renameSeam(input: PlanningDocument, seamId: string, name: string): PlanningDocument {
  const document = requireValidPlanning(input);
  const seam = document.content.seamsById[seamId];
  if (!seam) throw new Error('Unknown seam ID.');
  const trimmed = name.trim();
  return requireValidPlanning({ ...document, revision: document.revision + (trimmed === seam.name ? 0 : 1),
    content: { ...document.content, seamsById: { ...document.content.seamsById, [seamId]: { ...seam, name: trimmed } } } });
}

export function removeSeam(input: PlanningDocument, seamId: string): PlanningDocument {
  const document = requireValidPlanning(input);
  if (!document.content.seamsById[seamId]) throw new Error('Unknown seam ID.');
  const seamsById = { ...document.content.seamsById };
  delete seamsById[seamId];
  return requireValidPlanning({ ...document, revision: document.revision + 1, content: {
    ...document.content, seamsById, sequence: document.content.sequence.filter((id) => id !== seamId),
  } });
}

export function updateSeamParameters(input: PlanningDocument, seamId: string, parameters: WeldingParameters): PlanningDocument {
  const document = requireValidPlanning(input);
  const seam = document.content.seamsById[seamId];
  if (!seam) throw new Error('Unknown seam ID.');
  const changed = (Object.keys(seam.parameters) as (keyof WeldingParameters)[])
    .some((key) => seam.parameters[key] !== parameters[key]);
  return requireValidPlanning({ ...document, revision: document.revision + (changed ? 1 : 0), content: {
    ...document.content, seamsById: { ...document.content.seamsById, [seamId]: { ...seam, parameters } },
  } });
}
