import type { Finding } from '../domain/findings.ts';
import type { PlanningDocument } from '../domain/contracts.ts';
import type { GeometrySelection } from '../planning/selection.ts';
import { formatDimension } from './ImportDialog.tsx';

export function GeometryDiagnostics({ findings, document, disabled = false, onInspect }: {
  findings: readonly Finding[]; document: PlanningDocument; disabled?: boolean; onInspect: (target: GeometrySelection) => void;
}) {
  return <ul className="diagnostic-list">{findings.map((finding, i) => {
    const target = finding.target;
    if (target.kind !== 'point' && target.kind !== 'segment') return <li key={i}>{finding.measurement && `${formatDimension(finding.measurement.value)} ${finding.measurement.unit} · `}{finding.message}</li>;
    const seam = document.content.seamsById[target.seamId];
    if (!seam) return null;
    const index = seam.geometry.points.findIndex((point) => point.id === (target.kind === 'point' ? target.pointId : target.startPointId));
    const label = target.kind === 'point' ? `turn at point ${index + 1}` : `segment ${index + 1} (points ${index + 1} → ${index + 2})`;
    const measurement = finding.measurement;
    return <li key={i}><button className="diagnostic-action" disabled={disabled} onClick={() => onInspect(target)}
      aria-label={`Inspect ${label} in ${seam.name}`}>
      <strong>{seam.name} · {label}</strong>
      <span>{measurement && `${formatDimension(measurement.value)} ${measurement.unit === 'deg' ? '°' : measurement.unit} · `}{finding.message}</span>
    </button></li>;
  })}</ul>;
}
