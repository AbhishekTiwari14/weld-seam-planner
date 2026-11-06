import { useEffect, useRef } from 'react';
import type { PlanningDocument, Seam } from '../domain/contracts.ts';
import type { PlanningAnalysis } from '../validation/planning.ts';
import type { GeometrySelection } from '../planning/selection.ts';
import { formatDimension } from './ImportDialog.tsx';
import { GeometryDiagnostics } from './GeometryDiagnostics.tsx';

export function PointInspector({ document, seam, analysis, selection, disabled, canInsert, onSelect, onReplace, onInsert, onRemove }: {
  document: PlanningDocument; seam: Seam; analysis: PlanningAnalysis; selection: GeometrySelection | null;
  disabled: boolean; canInsert: boolean; onSelect: (target: GeometrySelection | null) => void;
  onReplace: (pointId: string) => void; onInsert: (startId: string, endId: string) => void; onRemove: (pointId: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const points = seam.geometry.points;
  const metrics = analysis.seams[seam.id];
  const point = selection?.kind === 'point' ? points.find((item) => item.id === selection.pointId) : undefined;
  const segmentIndex = selection?.kind === 'segment' ? points.findIndex((item) => item.id === selection.startPointId) : -1;
  useEffect(() => {
    if (!selection || !ref.current) return;
    ref.current.open = true;
    ref.current.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    ref.current.querySelector<HTMLElement>('.point-edit-actions')?.scrollIntoView({ block: 'nearest' });
  }, [selection]);
  return <details ref={ref} className="point-inspector"><summary>Ordered points & geometry</summary>
    <p className="small muted">Select a point or segment to edit. Workpiece XYZ in mm; hover coordinates for full precision.</p>
    {selection && <div className="point-edit-actions">
      <div className="section-heading"><strong>{point ? `Selected point ${points.indexOf(point) + 1}` : `Selected segment ${segmentIndex + 1}`}</strong>
        <button className="text-button" disabled={disabled} onClick={() => onSelect(null)}>Clear highlight</button></div>
      {point && <><code className="selected-coordinates" data-testid="selected-coordinates">{point.positionMm.join(', ')} mm</code>
        <div className="compact-actions"><button disabled={disabled} onClick={() => onReplace(point.id)}>Replace on surface</button>
          <button disabled={disabled || points.length <= 2} title={points.length <= 2 ? 'A seam must retain at least two points.' : 'Remove this point; Undo is available.'} onClick={() => onRemove(point.id)}>Remove point</button></div></>}
      {selection.kind === 'segment' && <div className="compact-actions"><button disabled={disabled || !canInsert}
        title={!canInsert ? 'Point capacity reached (1,000 per seam / 10,000 per plan).' : 'Pick a surface position between the selected endpoints in traversal order.'}
        onClick={() => onInsert(selection.startPointId, selection.endPointId)}>Insert point on surface</button></div>}
    </div>}
    <ol>{points.map((item, i) => <li key={item.id} data-testid="path-point" data-point-id={item.id} className={point?.id === item.id ? 'point-selected' : ''}>
      <button className="point-select" disabled={disabled} aria-label={`Select point ${i + 1}`} aria-pressed={point?.id === item.id}
        onClick={() => onSelect({ kind: 'point', seamId: seam.id, pointId: item.id })}>{i + 1}{i === 0 ? ' · Start' : i === points.length - 1 ? ' · End' : ''}</button>
      <code title={item.positionMm.join(', ')}>{item.positionMm.map((value) => Number(value.toPrecision(9))).join(', ')}</code>
      {i > 0 && <button className="segment-select" disabled={disabled} aria-label={`Select segment ${i}`} aria-pressed={segmentIndex === i - 1}
        onClick={() => onSelect({ kind: 'segment', seamId: seam.id, startPointId: points[i - 1]!.id, endPointId: item.id })}>
        Segment {i}: {formatDimension(metrics?.segmentLengthsMm[i - 1] ?? 0)} mm · {i} → {i + 1}</button>}
      {metrics?.turnAnglesDeg[i] != null && <small>Turn: {formatDimension(metrics.turnAnglesDeg[i]!)}°</small>}
    </li>)}</ol>
    <GeometryDiagnostics findings={analysis.findings.filter((finding) => 'seamId' in finding.target && finding.target.seamId === seam.id)} document={document} disabled={disabled} onInspect={onSelect} />
    <p className="small muted">Short segments (&lt; 1 mm) and turns (&gt; 45°) are inspection heuristics, not process limits. Segments remain straight chords.</p>
  </details>;
}
