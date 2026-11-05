import type { MeshAsset } from '../import/types.ts';
import { formatDimension } from './ImportDialog.tsx';

export function WorkpiecePanel({ asset, onReplace }: { asset: MeshAsset; onReplace: () => void }) {
  const { workpiece } = asset;
  const source = workpiece.source;
  return <aside className="workpiece-panel"><div className="panel-heading"><span className="eyebrow">01 / WORKPIECE</span><span className="ready-dot">Ready</span></div>
    <h2 title={source.filename}>{source.filename}</h2><p className="small muted">{source.encoding.toUpperCase()} STL · {(source.byteLength / 1024 ** 2).toFixed(2)} MiB</p>
    <div className="panel-section"><h3>Physical dimensions</h3><p className="small muted">Bounding extents in millimetres</p>
      <dl className="dimensions">{workpiece.boundsMm.max.map((value, axis) => <div key={axis}><dt>{['X', 'Y', 'Z'][axis]}</dt><dd>{formatDimension(value - workpiece.boundsMm.min[axis]!)} <span>mm</span></dd></div>)}</dl></div>
    <div className="panel-section"><h3>Model information</h3><dl className="metadata"><div><dt>Source units</dt><dd>{source.unit}</dd></div><div><dt>Displayed triangles</dt><dd>{(source.inputTriangles - source.omittedDegenerateTriangles).toLocaleString()}</dd></div><div><dt>Planning frame</dt><dd>Source XYZ</dd></div><div><dt>Planning units</dt><dd>mm</dd></div></dl></div>
    <div className="coordinate-note"><span className="coordinate-mark">↗</span><p>Source origin preserved.<br /><span>Centered for viewing only.</span></p></div>
    {asset.warnings.length > 0 && <div className="panel-section"><h3>Import observations</h3><ul className="warnings">{asset.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul></div>}
    <details className="provenance"><summary>Source provenance & precision</summary><p>SHA-256</p><code>{source.sha256}</code><p>Maximum display rounding per coordinate: {formatDimension(asset.maxDisplayErrorMm)} mm. This is a display measurement, not manufacturing accuracy.</p><p>Open surfaces and disconnected shells are allowed. Topology and weld suitability have not been certified.</p></details>
    <button className="replace-button" onClick={onReplace}>Replace model <span>↗</span></button>
  </aside>;
}
