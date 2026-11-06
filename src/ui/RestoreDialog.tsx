import { useEffect, useRef, useState } from 'react';

export function RestoreDialog({ onRestore, onClose }: { onRestore: (stl: File, json: File) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [stl, setStl] = useState<File | null>(null);
  const [json, setJson] = useState<File | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current; dialog?.showModal();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={ref} className="import-dialog restore-dialog" aria-labelledby="restore-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <span className="eyebrow">RECOVER / LOCAL FILES</span><h2 id="restore-title">Restore a saved plan.</h2>
    <p>Select the original STL and its exported weld-job JSON. The JSON contains your weld plan, not the model. Both files are required; nothing is uploaded.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (stl && json) onRestore(stl, json); }}>
      <label className="restore-file">Original STL<input autoFocus type="file" accept=".stl" onChange={(event) => setStl(event.target.files?.[0] ?? null)} /></label>
      <label className="restore-file">Saved weld-job JSON<input type="file" accept=".json,application/json" onChange={(event) => setJson(event.target.files?.[0] ?? null)} /></label>
      <p className="small muted">We verify the saved plan, source fingerprint, units and dimensions before asking you to activate it. Cancel or failure preserves your current workspace.</p>
      <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={!stl || !json}>Verify files</button></div>
    </form>
  </dialog>;
}
