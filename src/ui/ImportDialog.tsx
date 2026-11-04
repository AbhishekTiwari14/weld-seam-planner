import { useEffect, useRef, useState } from 'react';
import type { SourceUnit } from '../domain/contracts.ts';
import { MILLIMETRES_PER_UNIT } from '../geometry/coordinates.ts';
import type { ImportPreview } from '../import/types.ts';

export const formatDimension = (n: number) => n !== 0 && (Math.abs(n) < 0.001 || Math.abs(n) >= 1e9)
  ? n.toExponential(4) : n.toLocaleString('en-US', { maximumFractionDigits: 4 });

export function ImportDialog({ preview, replacing, onConfirm, onCancel }: {
  preview: ImportPreview; replacing: boolean; onConfirm: (unit: SourceUnit) => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [unit, setUnit] = useState<SourceUnit>('mm');
  const dimensions = preview.bounds.max.map((n, i) => (n - preview.bounds.min[i]!) * MILLIMETRES_PER_UNIT[unit]);
  const valid = dimensions.every(Number.isFinite) && Number.isFinite(Math.hypot(...dimensions));
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="import-dialog" onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="unit-title">
    <span className="eyebrow">IMPORT / PHYSICAL SCALE</span><h2 id="unit-title">Confirm the source units.</h2>
    <p>STL files do not contain units. Match the units used when this model was exported from CAD.</p>
    <div className="file-summary"><strong>{preview.filename}</strong><span>{preview.inputTriangles.toLocaleString()} triangles · {preview.encoding.toUpperCase()}</span></div>
    <fieldset><legend>One source unit represents</legend><div className="unit-options">{(['mm', 'cm', 'm', 'in'] as const).map((value) =>
      <label key={value} className={unit === value ? 'chosen' : ''}><input type="radio" name="unit" value={value} checked={unit === value} onChange={() => setUnit(value)} />{value}</label>)}</div></fieldset>
    <div className="dimension-preview"><span className="eyebrow">INTERPRETED DIMENSIONS · MM</span><div>{dimensions.map((n, i) => <div key={i}><span>{['X', 'Y', 'Z'][i]}</span><strong>{formatDimension(n)}</strong></div>)}</div></div>
    <p className="small">The source origin and axes are preserved. Camera centering changes only the view.</p>
    {preview.warnings.map((w) => <p className="notice" key={w.code}>{w.message}</p>)}
    {!valid && <p role="alert">These dimensions exceed safe numeric arithmetic. Choose the correct source unit or revise the source model.</p>}
    {replacing && <p className="small">Confirming replaces the current workpiece. Cancelling keeps it unchanged.</p>}
    <div className="dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary" disabled={!valid} onClick={() => onConfirm(unit)}>{replacing ? 'Confirm & replace model' : 'Confirm & open model'}</button></div>
  </dialog>;
}
