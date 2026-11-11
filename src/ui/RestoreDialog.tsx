import { useEffect, useRef, useState } from 'react';
import type { PlanningDocument } from '../domain/contracts.ts';
import { MAX_PLAN_FILE_BYTES, parseSavedPlan, recoveryError } from '../recovery/restore.ts';
import { findBundledSample, loadVerifiedSample } from '../recovery/sample-source.ts';
import type { SampleModel } from '../samples/manifest.ts';
import { DialogClose } from './DialogClose.tsx';

type CheckedPlan = { document: PlanningDocument; sample: SampleModel | null; automatic: File | null; warning: string | null };

export function RestoreDialog({ onRestore, onClose }: { onRestore: (stl: File, document: PlanningDocument) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const manualInput = useRef<HTMLInputElement | null>(null);
  const ticket = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const manual = useRef<File | null>(null);
  const checked = useRef<CheckedPlan | null>(null);
  const [stl, setStl] = useState<File | null>(null);
  const [plan, setPlan] = useState<CheckedPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => { ticket.current++; abort.current?.abort(); abort.current = null; };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current; dialog?.showModal();
    return () => { invalidate(); dialog?.close(); opener?.focus(); };
  }, []);
  useEffect(() => { if (manualVisible) manualInput.current?.focus(); }, [manualVisible]);

  async function selectPlan(file: File | null) {
    invalidate(); const current = ticket.current;
    checked.current = null;
    setManualVisible(false);
    setPlan(null); setError(null); setPending(false);
    if (!file) return;
    setPending(true);
    let document: PlanningDocument | null = null;
    let sample: SampleModel | null = null;
    try {
      if (!file.size) throw new Error('The plan JSON is empty.');
      if (file.size > MAX_PLAN_FILE_BYTES) throw new Error('Plan JSON exceeds the 16 MiB recovery limit.');
      const text = await file.text();
      if (ticket.current !== current) return;
      document = parseSavedPlan(text);
      sample = findBundledSample(document) ?? null;
      const initial = { document, sample, automatic: null, warning: null };
      checked.current = initial;
      setPlan(initial);
      if (!sample || manual.current) return;
      const ac = new AbortController(); abort.current = ac;
      const automatic = await loadVerifiedSample(sample, ac.signal);
      if (ticket.current !== current || ac.signal.aborted) return;
      setPlan({ document, sample, automatic, warning: null });
    } catch (cause) {
      if (ticket.current !== current) return;
      if (document && sample) setPlan({ document, sample, automatic: null,
        warning: `Could not verify bundled sample ${sample.name}: ${recoveryError(cause)} Select the original STL manually.` });
      else setError(recoveryError(cause));
    } finally {
      if (ticket.current === current) { abort.current = null; setPending(false); }
    }
  }

  const source = stl ?? plan?.automatic ?? null;
  const showManual = manualVisible || !!stl || !!(plan && (!plan.sample || plan.warning));
  return <dialog ref={ref} className="import-dialog restore-dialog" aria-labelledby="restore-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <span className="eyebrow">RECOVER / LOCAL FILES</span><h2 id="restore-title">Restore a saved plan.</h2>
    <p>Select your weld-job JSON first. Matching bundled samples can be loaded automatically; other plans require their original STL. Nothing is uploaded.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!pending && source && plan) onRestore(source, plan.document); }}>
      <label className="restore-file">Saved weld-job JSON<input autoFocus type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0] ?? null; void selectPlan(file); }} /></label>
      {pending && <p className="small" role="status">Checking the saved plan and bundled source…</p>}
      {error && <p className="planning-error" role="alert">{error}</p>}
      {plan?.automatic && <p className="notice" role="status"><strong>Matched {plan.sample!.name}.</strong> No STL upload required. The verified bundled model will be loaded automatically.</p>}
      {plan?.sample && !plan.automatic && !pending && !plan.warning && <p className="small">Matched {plan.sample.name}; the selected STL will be verified.</p>}
      {plan && !plan.sample && <p className="small">No bundled sample matches this plan. Select its original STL.</p>}
      {plan?.warning && <p className="notice" role="alert">{plan.warning}</p>}
      {plan?.sample && !showManual && <button className="text-button" type="button" onClick={() => setManualVisible(true)}>Use original STL instead</button>}
      {showManual && <label className="restore-file">Original STL<input ref={manualInput} type="file" accept=".stl" onChange={(event) => {
        const file = event.target.files?.[0] ?? null; manual.current = file; setStl(file);
        if (file && pending && checked.current?.sample) { invalidate(); setPending(false); setPlan({ ...checked.current, warning: 'Automatic sample loading cancelled. The selected STL will be verified.' }); }
      }} /></label>}
      <p className="small muted">The selected source is verified against the saved fingerprint, units, metadata and bounds before confirmation. Your current workspace stays unchanged until then.</p>
      <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={pending || !source || !plan}>Verify files</button></div>
    </form>
    <DialogClose label="Close restore dialog" onClose={onClose} />
  </dialog>;
}
