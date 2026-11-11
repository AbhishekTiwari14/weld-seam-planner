import { useState, type ReactNode } from 'react';
import { LIMITS, type PathPoint, type PlanningDocument, type Seam, type Vec3 } from '../domain/contracts.ts';
import { removeSeam, renameSeam, reverseSeam, setSequence, updateSeamParameters } from '../domain/operations.ts';
import type { PlanningAnalysis } from '../validation/planning.ts';
import { ParameterEditor } from './ParameterEditor.tsx';
import { formatDimension } from './ImportDialog.tsx';
import { removeSeamPoint } from '../domain/point-operations.ts';
import { remainingPointCapacity } from '../planning/draft.ts';
import type { GeometrySelection, SurfaceEdit } from '../planning/selection.ts';
import type { HistoryDirection, HistorySummary } from '../planning/history.ts';
import { PointInspector } from './PointInspector.tsx';

export type PlanEdit = (operation: (document: PlanningDocument) => PlanningDocument) => boolean;
export const displayTime = (seconds: number | null | undefined) => seconds == null ? 'Unavailable' : `${formatDimension(seconds)} s`;

function SeamName({ seam, edit, disabled }: { seam: Seam; edit: PlanEdit; disabled: boolean }) {
  const [name, setName] = useState(seam.name);
  return <form className="rename-form" onSubmit={(event) => { event.preventDefault(); if (edit((document) => renameSeam(document, seam.id, name))) setName(name.trim()); }}>
    <label htmlFor="seam-name">Seam name</label><div><input id="seam-name" required maxLength={80} value={name} disabled={disabled} onChange={(event) => setName(event.target.value)} />
      <button disabled={disabled || name.trim() === seam.name || !name.trim()}>Rename</button></div>
  </form>;
}

export function SeamPanel({ document, analysis, selectedId, draft, error, parameterDirty, onParameterDirty, edit, onSelect, onAdd, onFinish, onCancel, onRemoveLast, onReview,
  selection, surfaceEdit, candidate, history, onHistory, onSelectGeometry, onReplacePoint, onInsertPoint, discoveryPanel }: {
  document: PlanningDocument; analysis: PlanningAnalysis; selectedId: string | null; draft: PathPoint[] | null;
  error: string | null; parameterDirty: boolean; onParameterDirty: (dirty: boolean) => void; edit: PlanEdit;
  onSelect: (id: string | null) => void; onAdd: () => void; onFinish: () => void; onCancel: () => void; onRemoveLast: () => void; onReview: () => void;
  selection: GeometrySelection | null; surfaceEdit: SurfaceEdit | null; candidate: Vec3 | null; history: HistorySummary;
  onHistory: (direction: HistoryDirection) => void; onSelectGeometry: (target: GeometrySelection | null) => void;
  onReplacePoint: (pointId: string) => void; onInsertPoint: (startId: string, endId: string) => void;
  discoveryPanel: ReactNode;
}) {
  const { sequence, seamsById } = document.content;
  const selected = selectedId ? seamsById[selectedId] : undefined;
  const metrics = selected ? analysis.seams[selected.id] : undefined;
  const disabled = draft !== null || surfaceEdit !== null || parameterDirty;
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
      {discoveryPanel}
      {surfaceEdit && <section className="draft-card" aria-label="Surface point edit">
        <span className="eyebrow">{surfaceEdit.kind === 'replace' ? 'REPLACE POINT' : 'INSERT POINT'}</span>
        <p>Pick a visible surface position, inspect the preview, then Apply. Click again to change the candidate; drag to navigate.</p>
        {candidate ? <code className="selected-coordinates" data-testid="candidate-coordinates">{candidate.join(', ')} mm</code> : <p className="small">Waiting for a valid surface click.</p>}
        <div className="compact-actions"><button className="primary" disabled={!candidate} onClick={onFinish}>Apply point <kbd>Enter</kbd></button><button onClick={onCancel}>Cancel point edit <kbd>Esc</kbd></button></div>
        <p className="small">The committed plan is unchanged until Apply. New segments remain straight chords.</p>
      </section>}
      {draft !== null && <section className="draft-card" aria-label="Draft seam">
        <span className="eyebrow">CREATING SEAM</span><h3><span data-testid="draft-count">{draft.length}</span> surface points</h3>
        <p>Click the model to place points. Drag to orbit; scroll to zoom.</p>
        <div className="compact-actions"><button className="primary" disabled={draft.length < 2} onClick={onFinish}>Finish seam <kbd>Enter</kbd></button><button onClick={onCancel}>Cancel <kbd>Esc</kbd></button></div>
        <button className="text-button" disabled={!draft.length} onClick={onRemoveLast}>Remove last point <kbd>⌫</kbd></button>
        <p className="small">Only clicked points lie on surfaces. Connecting segments are straight chords.</p>
      </section>}
      {error && <div className="planning-error" role="alert">{error}</div>}
      {!sequence.length && <div className="seam-empty">
        <span className="empty-guide-badge">STEP 02 — DEFINE SEAMS</span>
        <h3>Define the first weld path.</h3>
        <ol className="empty-guide-steps">
          <li>Click <strong>Add seam</strong> above to start drafting.</li>
          <li>Click at least 2 points on the 3D model surface.</li>
          <li>Press <kbd>Enter</kbd> or click <strong>Finish seam</strong> to commit.</li>
        </ol>
        <p className="small muted">Points are placed directly on the workpiece surface. Connecting segments are straight chords.</p>
      </div>}
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
          <button className="text-button" disabled={disabled} onClick={() => {
            if (window.confirm(`Delete “${selected.name}”? You can restore it with Undo while it remains in history.`) && edit((current) => removeSeam(current, selected.id))) onSelect(null);
          }}>Delete seam</button></div>
        <SeamName key={`${selected.id}:${selected.name}`} seam={selected} edit={edit} disabled={disabled} />
        <button className="text-button" disabled={disabled} onClick={() => edit((current) => reverseSeam(current, selected.id))}>Reverse direction</button>
        <div className="metric-pair"><div><span>Path length</span><strong>{formatDimension(metrics?.lengthMm ?? 0)} mm</strong></div>
          <div><span>Nominal arc-on</span><strong>{displayTime(metrics?.nominalArcOnTimeSeconds)}</strong></div></div>
        {Object.values(selected.parameters).some((value) => value === null) && <div className="parameter-tip-banner" role="status">
          <strong>Step 03: Configure welding parameters</strong>
          <span>Set travel speed (mm/s), current (A) and voltage (V) targets, then click <strong>Apply parameters</strong>.</span>
        </div>}
        {!surfaceEdit && <ParameterEditor key={`${selected.id}:${JSON.stringify(selected.parameters)}`} seam={selected} onApply={(parameters) => edit((current) => updateSeamParameters(current, selected.id, parameters))} onDirtyChange={onParameterDirty} />}
        <PointInspector document={document} seam={selected} analysis={analysis} selection={selection} disabled={disabled}
          canInsert={selected.geometry.points.length < LIMITS.pointsPerSeam && remainingPointCapacity(document) > 0}
          onSelect={onSelectGeometry} onReplace={onReplacePoint} onInsert={onInsertPoint}
          onRemove={(pointId) => { if (edit((current) => removeSeamPoint(current, selected.id, pointId))) onSelectGeometry(null); }} />
      </section>}
    </div>
    <div className="seam-panel-footer"><span>Revision {document.revision} · {sequence.length} / 100 seams</span>
      <div className="history-actions" aria-label="Plan history"><button disabled={disabled || !history.undoCount} onClick={() => onHistory('undo')} title={`${history.undoCount} undo states available · Ctrl/Cmd+Z`}>Undo <kbd>Ctrl Z</kbd></button>
        <button disabled={disabled || !history.redoCount} onClick={() => onHistory('redo')} title={`${history.redoCount} redo states available · Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z`}>Redo <kbd>Ctrl Y</kbd></button></div>
      <button className="primary" onClick={onReview} disabled={parameterDirty || !!surfaceEdit}>Review & Export</button>
      {parameterDirty && <p className="small">Apply or discard parameter edits before review.</p>}
      {(draft !== null || surfaceEdit) && <p className="small">Finish or cancel the active edit to use Undo/Redo.</p>}
    </div>
  </aside>;
}
