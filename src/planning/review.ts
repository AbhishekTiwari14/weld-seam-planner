import type { PlanningDocument } from '../domain/contracts.ts';
import type { Finding } from '../domain/findings.ts';

export interface FindingGroup { id: string; name: string; findings: Finding[] }
export interface ReviewSnapshot { revision: number; identities: string[] }
export const findingIdentity = (finding: Finding) => JSON.stringify([finding.code, finding.target]);

/** Presentation only: preserve findings and thresholds from the shared validator. */
export function groupFindings(document: PlanningDocument, findings: readonly Finding[]): FindingGroup[] {
  const buckets = new Map<string, Finding[]>();
  for (const finding of findings) {
    const id = 'seamId' in finding.target ? finding.target.seamId : 'workpiece';
    const group = buckets.get(id) ?? []; group.push(finding); buckets.set(id, group);
  }
  const known = new Set(['workpiece', ...document.content.sequence]);
  const ordered = [
    ...['workpiece', ...document.content.sequence].filter((id) => buckets.has(id)),
    ...Array.from(buckets.keys()).filter((id) => !known.has(id)),
  ];
  return ordered.map((id) => ({
    id, name: id === 'workpiece' ? 'Plan & workpiece' : (document.content.seamsById[id]?.name ?? id), findings: buckets.get(id)!,
  }));
}
