import { useStore } from 'zustand';
import type { SeamCandidate } from '../candidates/contracts.ts';
import type { createDiscoveryController } from '../candidates/discovery-controller.ts';
import type { PlanningDocument } from '../domain/contracts.ts';
import { formatDimension } from './ImportDialog.tsx';

export function DiscoveryPanel({ controller, document, selectedId, ledger, rejected, disabled, onSelect, onAccept, onReject, onStart }: {
  controller: ReturnType<typeof createDiscoveryController>; document: PlanningDocument; selectedId: string | null;
  ledger: Record<string, string[]>; rejected: Record<string, boolean>; disabled: boolean;
  onSelect: (candidate: SeamCandidate | null) => void; onAccept: (candidate: SeamCandidate) => void;
  onReject: (id: string, rejected: boolean) => void; onStart: () => void;
}) {
  const state = useStore(controller.store);
  const selected = state.result?.candidates.find((item) => item.candidateId === selectedId);
  const accepted = (id: string) => (ledger[id] ?? []).some((seamId) => !!document.content.seamsById[seamId]);
  return <section className="discovery-panel" aria-label="Seam discovery">
    <div className="section-heading"><h3>Guided discovery</h3>
      {state.phase === 'running' ? <button onClick={() => { controller.cancel(); onSelect(null); }}>Cancel analysis</button> :
        <button onClick={onStart} disabled={disabled}>Discover Seams</button>}</div>
    <p className="small">Unverified geometric candidates need engineer review. Contact does not establish welding intent. Limit: 4,000 triangles.</p>
    {state.phase === 'running' && <p role="status">Analyzing geometry…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.result && <><p className="small" role="status">{state.result.candidates.length} candidates found</p>
      {state.result.limitations.map((message) => <p className="small" key={message}>{message}</p>)}
      <ol className="discovery-list" aria-label="Candidate suggestions">{state.result.candidates.map((candidate, index) => {
        const status = accepted(candidate.candidateId) ? 'Accepted' : rejected[candidate.candidateId] ? 'Rejected' : 'Suggested';
        return <li key={candidate.candidateId}><button type="button" aria-pressed={selectedId === candidate.candidateId} disabled={disabled}
          onClick={() => onSelect(candidate)}>Candidate {index + 1} · {formatDimension(candidate.evidence.measurements.find((m) => m.name === 'contact length')?.value ?? 0)} mm · {status}</button></li>;
      })}</ol>
      {selected && <div className="discovery-detail" aria-label="Selected candidate">
        <strong>Unverified candidate</strong><p>{selected.evidence.summary}</p>
        <p className="small">Method: {selected.method.name} v{selected.method.version}</p>
        {selected.evidence.measurements.map((measurement) => <p className="small" key={measurement.name}>{measurement.name}: {formatDimension(measurement.value)} {measurement.unit}</p>)}
        {selected.evidence.limitations.map((limitation) => <p className="small" key={limitation}>{limitation}</p>)}
        <div className="compact-actions"><button className="primary" disabled={disabled || accepted(selected.candidateId) || !!rejected[selected.candidateId]}
          onClick={() => onAccept(selected)}>Accept candidate</button>
          <button disabled={disabled || accepted(selected.candidateId)} onClick={() => onReject(selected.candidateId, !rejected[selected.candidateId])}>
            {rejected[selected.candidateId] ? 'Restore suggestion' : 'Reject candidate'}</button></div>
        {accepted(selected.candidateId) && <p className="small">Accepted seam is in the plan. Undo or delete it to restore this suggestion.</p>}
      </div>}
    </>}
  </section>;
}
