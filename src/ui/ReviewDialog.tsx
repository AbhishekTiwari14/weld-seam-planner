import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlanningDocument } from '../domain/contracts.ts';
import type { Finding } from '../domain/findings.ts';
import { downloadWeldJob } from '../export/download.ts';
import { NOT_ASSESSED } from '../export/schema.ts';
import { validatePlanning } from '../validation/planning.ts';
import { formatDimension } from './ImportDialog.tsx';
import { displayTime } from './SeamPanel.tsx';
import { PARAMETER_FIELDS } from './ParameterEditor.tsx';
import { GeometryDiagnostics } from './GeometryDiagnostics.tsx';
import type { GeometrySelection } from '../planning/selection.ts';
import { findingIdentity, groupFindings, type FindingGroup, type ReviewSnapshot } from '../planning/review.ts';

function ReviewGroup({ group, expanded, children }: { group: FindingGroup; expanded: boolean; children: () => ReactNode }) {
  const [open, setOpen] = useState(expanded);
  return <details className="finding-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{group.name} · {group.findings.length}</summary>{open && children()}
  </details>;
}

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

export function ReviewDialog({ document, draftPending, getCurrentDocument, onClose, onInspect, onDownloaded, previousReview, onCorrectParameter }: {
  document: PlanningDocument; draftPending: boolean; getCurrentDocument: () => PlanningDocument; onClose: () => void;
  onInspect: (target: GeometrySelection) => void;
  onDownloaded: (revision: number) => void;
  previousReview: ReviewSnapshot | null;
  onCorrectParameter: (seamId: string, field: string) => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const review = useMemo(() => validatePlanning(document, 'export'), [document]);
  const planning = useMemo(() => validatePlanning(document), [document]);
  const errors = review.findings.filter((finding) => finding.severity === 'error');
  const warnings = review.findings.filter((finding) => finding.severity === 'warning');
  const currentIdentities = new Set(review.findings.map(findingIdentity));
  const resolved = previousReview && document.revision > previousReview.revision ? previousReview.identities.filter((id) => !currentIdentities.has(id)).length : 0;
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="review-dialog" aria-labelledby="review-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="review-heading"><div><span className="eyebrow">03 / ENGINEERING REVIEW</span><h2 id="review-title">Review & Export</h2></div><button onClick={onClose} aria-label="Close review">Close</button></div>
    <p className="small muted">Committed plan · revision {document.revision} · workpiece coordinates in millimetres</p>
    <p className="review-readiness" role="status">{errors.length ? 'Corrections required before export.' : 'Valid for export — robot safety and feasibility are not verified.'}</p>
    {resolved > 0 && <p className="notice" role="status">{resolved} previously reported {resolved === 1 ? 'finding is' : 'findings are'} no longer present at revision {document.revision}. Review the remaining findings below.</p>}
    {draftPending && <p className="notice">An unfinished seam is excluded. This review and download contain committed seams only.</p>}
    <div className="review-metrics"><div><span>Seams</span><strong>{document.content.sequence.length}</strong></div>
      <div><span>Total path length</span><strong>{planning.totalLengthMm == null ? 'Unavailable' : `${formatDimension(planning.totalLengthMm)} mm`}</strong></div>
      <div><span>Nominal arc-on time</span><strong>{displayTime(planning.totalNominalArcOnTimeSeconds)}</strong></div></div>
    <p className="small muted">Nominal arc-on time is not total cycle time. It is length ÷ constant travel speed and excludes approach, transfers, acceleration and process start/stop delays.</p>
    <section><h3>Execution sequence</h3><ol className="review-sequence">{document.content.sequence.map((id) => {
      const seam = document.content.seamsById[id]!;
      return <li key={id}><strong>{seam.name}</strong><span>{seam.geometry.points.length} points · {formatDimension(planning.seams[id]?.lengthMm ?? 0)} mm</span></li>;
    })}</ol>{!document.content.sequence.length && <p className="small">No committed seams yet.</p>}</section>
    <section aria-label="Blocking errors"><h3>Blocking errors · <span data-testid="review-error-count">{errors.length}</span></h3>
      {groupFindings(document, errors).map((group) => <ReviewGroup group={group} expanded={errors.length <= 100} key={group.id}>{() =>
        <ul className="review-errors">{group.findings.map((finding, i) => <li key={i}>{finding.target.kind === 'parameter' ?
          <button className="diagnostic-action" disabled={draftPending} onClick={() => { if (finding.target.kind === 'parameter') onCorrectParameter(finding.target.seamId, finding.target.field); }}>{findingText(finding, document)}</button> : findingText(finding, document)}</li>)}</ul>}</ReviewGroup>)}
      {!errors.length && <p className="small muted">All current structural, parameter and planning checks pass.</p>}
    </section>
    <section aria-label="Engineering warnings"><h3>Engineering warnings · <span data-testid="review-warning-count">{warnings.length}</span></h3>
      {groupFindings(document, warnings).map((group) => <ReviewGroup group={group} expanded={warnings.length <= 100} key={group.id}>{() =>
        <GeometryDiagnostics findings={group.findings} document={document} disabled={draftPending} onInspect={onInspect} />}</ReviewGroup>)}
      {draftPending && <p className="small">Finish or cancel the draft before navigating to a finding.</p>}
      {!!warnings.length && <p className="small muted">Inspection heuristics only; these thresholds are not manufacturing limits.</p>}
      {!warnings.length && <p className="small muted">No warnings from the current geometry rules. This does not certify weld feasibility.</p>}
    </section>
    <section className="review-limitations" aria-label="Not assessed"><h3>Not-assessed constraints · <span data-testid="review-unassessed-count">{NOT_ASSESSED.length}</span></h3><p className="small">Weld plan — not an executable robot program.</p>
      <p className="small">Ordered points define straight polyline segments. The following remain unassessed:</p>
      <ul>{NOT_ASSESSED.map((item) => <li key={item}>{limitations[item]}</li>)}</ul>
    </section>
    {error && <p role="alert" className="planning-error">{error}</p>}
    {notice && <p role="status" className="small">{notice}</p>}
    <p className="save-explanation">Save the weld plan by downloading JSON. This does not save the STL. Keep the original STL and this JSON together to Restore Plan after a refresh. There is no autosave.</p>
    <div className="dialog-actions"><button onClick={onClose}>Back to planning</button><button className="primary" disabled={errors.length > 0} onClick={() => {
      try { setError(''); const current = getCurrentDocument(); const filename = downloadWeldJob(current); onDownloaded(current.revision); setNotice(`Download requested: ${filename} · revision ${current.revision}. Check your downloads and keep the original STL.`); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'The current plan could not be exported.'); }
    }}>Download weld job</button></div>
  </dialog>;
}
