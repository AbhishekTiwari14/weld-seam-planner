import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanningDocument } from '../domain/contracts.ts';
import type { Finding } from '../domain/findings.ts';
import { downloadWeldJob } from '../export/download.ts';
import { NOT_ASSESSED } from '../export/schema.ts';
import { validatePlanning } from '../validation/planning.ts';
import { formatDimension } from './ImportDialog.tsx';
import { displayTime } from './SeamPanel.tsx';
import { PARAMETER_FIELDS } from './ParameterEditor.tsx';

const limitations: Record<typeof NOT_ASSESSED[number], string> = {
  surface_conformance: 'Segments following the workpiece surface', process_suitability: 'Material, joint and process suitability',
  torch_orientation: 'Torch orientation', workpiece_to_robot_registration: 'Workpiece-to-robot registration',
  robot_kinematics: 'Robot reachability and kinematics', collision_avoidance: 'Collision avoidance',
  motion_timing: 'Motion timing and acceleration', inter_seam_transfers: 'Travel between seams',
};
function findingText(finding: Finding, document: PlanningDocument) {
  const { target } = finding;
  const seam = 'seamId' in target ? document.content.seamsById[target.seamId] : undefined;
  const field = target.kind === 'parameter' ? PARAMETER_FIELDS.find((item) => item.key === target.field) : undefined;
  return `${seam ? `${seam.name}: ` : ''}${field ? `${field.label} (${field.unit}) is required.` : finding.message}`;
}

export function ReviewDialog({ document, draftPending, getCurrentDocument, onClose }: {
  document: PlanningDocument; draftPending: boolean; getCurrentDocument: () => PlanningDocument; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const review = useMemo(() => validatePlanning(document, 'export'), [document]);
  const planning = useMemo(() => validatePlanning(document), [document]);
  const errors = review.findings.filter((finding) => finding.severity === 'error');
  const warnings = review.findings.filter((finding) => finding.severity === 'warning');
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="review-dialog" aria-labelledby="review-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="review-heading"><div><span className="eyebrow">03 / ENGINEERING REVIEW</span><h2 id="review-title">Review & Export</h2></div><button onClick={onClose} aria-label="Close review">Close</button></div>
    <p className="small muted">Committed plan · revision {document.revision} · workpiece coordinates in millimetres</p>
    {draftPending && <p className="notice">An unfinished seam is excluded. This review and download contain committed seams only.</p>}
    <div className="review-metrics"><div><span>Seams</span><strong>{document.content.sequence.length}</strong></div>
      <div><span>Total path length</span><strong>{planning.totalLengthMm == null ? 'Unavailable' : `${formatDimension(planning.totalLengthMm)} mm`}</strong></div>
      <div><span>Nominal arc-on time</span><strong>{displayTime(planning.totalNominalArcOnTimeSeconds)}</strong></div></div>
    <p className="small muted">Arc-on time is length ÷ constant travel speed. It excludes approach, transfers, acceleration and process start/stop delays.</p>
    <section><h3>Execution sequence</h3><ol className="review-sequence">{document.content.sequence.map((id) => {
      const seam = document.content.seamsById[id]!;
      return <li key={id}><strong>{seam.name}</strong><span>{seam.geometry.points.length} points · {formatDimension(planning.seams[id]?.lengthMm ?? 0)} mm</span></li>;
    })}</ol>{!document.content.sequence.length && <p className="small">No committed seams yet.</p>}</section>
    <section><h3>Validation {errors.length ? `· ${errors.length} blocking issues` : '· Ready to export'}</h3>
      {!!errors.length && <ul className="review-errors">{errors.map((finding, i) => <li key={i}>{findingText(finding, document)}</li>)}</ul>}
      {!!warnings.length && <><h3>Engineering warnings · {warnings.length}</h3><ul className="diagnostic-list">{warnings.map((finding, i) => <li key={i}>{findingText(finding, document)}</li>)}</ul></>}
      {!warnings.length && <p className="small muted">No warnings from the current geometry rules. This does not certify weld feasibility.</p>}
    </section>
    <section className="review-limitations"><h3>Weld plan — not an executable robot program</h3>
      <p className="small">Ordered points define straight polyline segments. The following remain unassessed:</p>
      <ul>{NOT_ASSESSED.map((item) => <li key={item}>{limitations[item]}</li>)}</ul>
    </section>
    {error && <p role="alert" className="planning-error">{error}</p>}
    {notice && <p role="status" className="small">{notice}</p>}
    <div className="dialog-actions"><button onClick={onClose}>Back to planning</button><button className="primary" disabled={errors.length > 0} onClick={() => {
      try { setError(''); const current = getCurrentDocument(); setNotice(`Downloaded ${downloadWeldJob(current)}`); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'The current plan could not be exported.'); }
    }}>Download weld job</button></div>
  </dialog>;
}
