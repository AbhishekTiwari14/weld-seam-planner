import type { PlanningDocument } from '../domain/contracts.ts';
import { exportPlanningDocument, weldJobFilename } from './job.ts';

export function downloadWeldJob(document: PlanningDocument): string {
  // Validation/serialization runs before allocating a URL or initiating any download.
  const json = exportPlanningDocument(document);
  const filename = weldJobFilename(document.content.workpiece.source.filename);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = globalThis.document.createElement('a');
  link.href = url; link.download = filename;
  globalThis.document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
  return filename;
}
