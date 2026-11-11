import { useEffect, useRef, useState } from 'react';
import type { SourceUnit } from '../domain/contracts.ts';
import { MILLIMETRES_PER_UNIT } from '../geometry/coordinates.ts';
import type { ImportPreview } from '../import/types.ts';
import type { RestoreSummary } from '../recovery/restore.ts';
import { DialogClose } from './DialogClose.tsx';

export const formatDimension = (n: number) => n !== 0 && (Math.abs(n) < 0.001 || Math.abs(n) >= 1e9)
  ? n.toExponential(4) : n.toLocaleString('en-US', { maximumFractionDigits: 4 });

export function ImportDialog({ preview, replacing, onConfirm, onCancel, restore = null, unsaved = false, returnFocus = null }: {
  preview: ImportPreview; replacing: boolean; onConfirm: (unit: SourceUnit) => void; onCancel: () => void;
  restore?: RestoreSummary | null; unsaved?: boolean;
  returnFocus?: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [unit, setUnit] = useState<SourceUnit>(restore?.unit ?? 'mm');
  const dimensions = preview.bounds.max.map((n, i) => (n - preview.bounds.min[i]!) * MILLIMETRES_PER_UNIT[unit]);
  const valid = dimensions.every(Number.isFinite) && Number.isFinite(Math.hypot(...dimensions));
  useEffect(() => {
    const node = dialog.current; const opener = returnFocus ?? (document.activeElement as HTMLElement | null);
    node?.showModal();
    return () => { node?.close(); if (opener?.isConnected) opener.focus(); };
  }, [returnFocus]);
  return <dialog ref={dialog} className="import-dialog" onCancel={(e) => { e.preventDefault(); onCancel(); }} aria-labelledby="unit-title">
    <span className="eyebrow">{restore ? 'RESTORE / VERIFIED SOURCE' : 'IMPORT / PHYSICAL SCALE'}</span><h2 id="unit-title">{restore ? 'Confirm plan restoration.' : 'Confirm the source units.'}</h2>
    <p>{restore ? `Source fingerprint and geometry match. Restore ${restore.seamCount} seams at revision ${restore.revision} using saved ${restore.unit} source units. Saved coordinates remain unchanged.` : 'STL files do not contain units. Match the units used when this model was exported from CAD.'}</p>
    <div className="file-summary"><strong>{preview.filename}</strong><span>{preview.inputTriangles.toLocaleString()} triangles · {preview.encoding.toUpperCase()}</span></div>
    <fieldset><legend>One source unit represents</legend><div className="unit-options">{(['mm', 'cm', 'm', 'in'] as const).map((value) =>
      <label key={value} className={unit === value ? 'chosen' : ''}><input type="radio" name="unit" value={value} disabled={!!restore} checked={unit === value} onChange={() => setUnit(value)} />{value}</label>)}</div></fieldset>
    <div className="dimension-preview"><span className="eyebrow">INTERPRETED DIMENSIONS · MM</span><div>{dimensions.map((n, i) => <div key={i}><span>{['X', 'Y', 'Z'][i]}</span><strong>{formatDimension(n)}</strong></div>)}</div></div>
    <p className="small">The source origin and axes are preserved. Camera centering changes only the view.</p>
    {preview.warnings.map((w) => <p className="notice" key={w.code}>{w.message}</p>)}
    {!valid && <p role="alert">These dimensions exceed safe numeric arithmetic. Choose the correct source unit or revise the source model.</p>}
    {replacing && <p className="small">Confirming replaces the current workpiece and clears its weld plan and draft. Cancelling keeps them unchanged.</p>}
    {unsaved && <p className="notice" role="status">Unsaved committed changes will be lost. Cancel and download the current weld plan first if you need to keep them. Keep its original STL too.</p>}
    {restore && <p className="small">This starts an empty undo history. Recovery uses your saved plan; it does not establish robot safety or feasibility.</p>}
    <div className="dialog-actions"><button onClick={onCancel}>Cancel</button><button className="primary" disabled={!valid} onClick={() => onConfirm(unit)}>{restore ? 'Confirm & restore plan' : replacing ? 'Confirm & replace model' : 'Confirm & open model'}</button></div>
    <DialogClose label="Close import dialog" onClose={onCancel} />
  </dialog>;
}
