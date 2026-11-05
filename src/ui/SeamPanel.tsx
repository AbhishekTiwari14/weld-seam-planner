import { useState } from 'react';
import { LIMITS, type PathPoint, type PlanningDocument, type Seam } from '../domain/contracts.ts';
import { removeSeam, renameSeam, setSequence, updateSeamParameters } from '../domain/operations.ts';
import type { PlanningAnalysis } from '../validation/planning.ts';
import { ParameterEditor } from './ParameterEditor.tsx';
import { formatDimension } from './ImportDialog.tsx';

export type PlanEdit = (operation: (document: PlanningDocument) => PlanningDocument) => boolean;
export const displayTime = (seconds: number | null | undefined) => seconds == null ? 'Unavailable' : `${formatDimension(seconds)} s`;

function SeamName({ seam, edit, disabled }: { seam: Seam; edit: PlanEdit; disabled: boolean }) {
  const [name, setName] = useState(seam.name);
  return <form className="rename-form" onSubmit={(event) => { event.preventDefault(); if (edit((document) => renameSeam(document, seam.id, name))) setName(name.trim()); }}>
    <label htmlFor="seam-name">Seam name</label><div><input id="seam-name" required maxLength={80} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} />
      <button disabled={disabled || name.trim() === seam.name || !name.trim()}>Rename</button></div>
  </form>;
}

export function SeamPanel({ document, analysis, selectedId, draft, error, parameterDirty, onParameterDirty, edit, onSelect, onAdd, onFinish, onCancel, onRemoveLast, onReview }: {
  document: PlanningDocument; analysis: PlanningAnalysis; selectedId: string | null; draft: PathPoint[] | null;
  error: string | null; parameterDirty: boolean; onParameterDirty: (dirty: boolean) => void; edit: PlanEdit;
  onSelect: (id: string | null) => void; onAdd: () => void; onFinish: () => void; onCancel: () => void; onRemoveLast: () => void; onReview: () => void;
}) {
  const { sequence, seamsById } = document.content;
  const selected = selectedId ? seamsById[selectedId] : undefined;
  const metrics = selected ? analysis.seams[selected.id] : undefined;
  const disabled = draft !== null || parameterDirty;
  const move = (id: string, offset: number) => edit((current) => {
    const order = [...current.content.sequence]; const i = order.indexOf(id);
    if (i < 0 || i + offset < 0 || i + offset >= order.length) return current;
    [order[i], order[i + offset]] = [order[i + offset]!, order[i]!];
    return setSequence(current, order);
  });
  return <aside className="seam-panel" aria-label="Weld seams">
    <div className="seam-panel-header"><div><span className="eyebrow">02 / PLAN</span><h2>Weld seams <span>{sequence.length}</span></h2></div>
      <button className="primary" onClick={onAdd} disabled={disabled || sequence.length >= LIMITS.seams}>Add seam</button></div>
    <div className="seam-panel-scroll">
      {draft !== null && <section className="draft-card" aria-label="Draft seam">
        <span className="eyebrow">CREATING SEAM</span><h3><span data-testid="draft-count">{draft.length}</span> surface points</h3>
        <p>Click the model to place points. Drag to orbit; scroll to zoom.</p>
        <div className="compact-actions"><button className="primary" disabled={draft.length < 2} onClick={onFinish}>Finish seam <kbd>Enter</kbd></button><button onClick={onCancel}>Cancel <kbd>Esc</kbd></button></div>
        <button className="text-button" disabled={!draft.length} onClick={onRemoveLast}>Remove last point <kbd>⌫</kbd></button>
        <p className="small">Only clicked points lie on surfaces. Connecting segments are straight chords.</p>
      </section>}
      {error && <div className="planning-error" role="alert">{error}</div>}
      {!sequence.length && <div className="seam-empty"><h3>Define the first weld path.</h3><p>Use Add seam, then select at least two points on the workpiece. Configure welding targets after finishing.</p></div>}
      <ol className="seam-list" aria-label="Execution sequence">
        {sequence.map((id, index) => {
          const seam = seamsById[id]!; const metric = analysis.seams[id];
          const missing = Object.values(seam.parameters).some((value) => value === null);
          const warnings = analysis.findings.some((finding) => 'seamId' in finding.target && finding.target.seamId === id);
          return <li key={id} data-seam-id={id} className={selectedId === id ? 'selected' : ''}>
            <button className="seam-select" aria-label={`Select ${seam.name}`} aria-pressed={selectedId === id} disabled={disabled} onClick={() => onSelect(id)}>
              <span className="sequence-number">{index + 1}</span><span className="seam-summary"><strong>{seam.name}</strong>
                <span>{seam.geometry.points.length} points · {formatDimension(metric?.lengthMm ?? 0)} mm · {displayTime(metric?.nominalArcOnTimeSeconds)}</span>
                <small>{missing ? 'Parameters required' : warnings ? 'Review geometry warnings' : 'Ready for review'}</small></span>
            </button>
            <div className="sequence-actions"><button aria-label={`Move ${seam.name} earlier`} disabled={disabled || index === 0} onClick={() => move(id, -1)}>↑</button>
              <button aria-label={`Move ${seam.name} later`} disabled={disabled || index === sequence.length - 1} onClick={() => move(id, 1)}>↓</button></div>
          </li>;
        })}
      </ol>
      {selected && draft === null && <section className="seam-details" aria-label="Selected seam">
        <div className="section-heading"><h3>Selected seam · {sequence.indexOf(selected.id) + 1}</h3>
          <button className="text-button" disabled={parameterDirty} onClick={() => {
            if (window.confirm(`Delete “${selected.name}”? This action cannot be undone.`) && edit((current) => removeSeam(current, selected.id))) onSelect(null);
          }}>Delete seam</button></div>
        <SeamName key={`${selected.id}:${selected.name}`} seam={selected} edit={edit} disabled={parameterDirty} />
        <div className="metric-pair"><div><span>Path length</span><strong>{formatDimension(metrics?.lengthMm ?? 0)} mm</strong></div>
          <div><span>Nominal arc-on</span><strong>{displayTime(metrics?.nominalArcOnTimeSeconds)}</strong></div></div>
        <ParameterEditor key={selected.id} seam={selected} onApply={(parameters) => edit((current) => updateSeamParameters(current, selected.id, parameters))} onDirtyChange={onParameterDirty} />
        <details className="point-inspector"><summary>Ordered points & geometry</summary>
          <p className="small muted">Workpiece XYZ in mm. Point order defines travel direction. Hover a coordinate for full stored precision.</p>
          <ol>{selected.geometry.points.map((point, i) => <li key={point.id} data-testid="path-point"><span>{i + 1}{i === 0 ? ' · Start' : i === selected.geometry.points.length - 1 ? ' · End' : ''}</span>
            <code title={point.positionMm.join(', ')}>{point.positionMm.map((value) => Number(value.toPrecision(9))).join(', ')}</code>
            {i > 0 && <small>Segment {i}: {formatDimension(metrics?.segmentLengthsMm[i - 1] ?? 0)} mm</small>}
            {metrics?.turnAnglesDeg[i] != null && <small>Turn: {formatDimension(metrics.turnAnglesDeg[i]!)}°</small>}
          </li>)}</ol>
          <ul className="diagnostic-list">{analysis.findings.filter((finding) => 'seamId' in finding.target && finding.target.seamId === selected.id).map((finding, i) => <li key={i}>{finding.message}</li>)}</ul>
          <p className="small muted">Short segments (&lt; 1 mm) and turns (&gt; 45°) are inspection heuristics, not process limits.</p>
        </details>
      </section>}
    </div>
    <div className="seam-panel-footer"><span>Revision {document.revision} · {sequence.length} / 100 seams</span>
      <button className="primary" onClick={onReview} disabled={parameterDirty}>Review & Export</button>
      {parameterDirty && <p className="small">Apply or discard parameter edits before review.</p>}
    </div>
  </aside>;
}
