import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createBrowserImportPort, createImportController } from '../import/store.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { PlanningWorkspace } from './PlanningWorkspace.tsx';
import { RestoreDialog } from './RestoreDialog.tsx';

export function Workbench() {
  const [controller] = useState(() => createImportController(createBrowserImportPort));
  const state = useStore(controller.store);
  const input = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const unsaved = !!state.active && state.active.document.revision !== state.savedRevision;
  useEffect(() => () => controller.dispose(), [controller]);
  const choose = () => { setDropError(null); input.current?.click(); };
  return <div className="app-shell" onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setDragging(true); }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(e) => { e.preventDefault(); setDragging(false); if (restoring || document.querySelector('dialog[open]')) return; setDropError(null); if (e.dataTransfer.files.length === 1) controller.start(e.dataTransfer.files[0]!); else setDropError('Drop one STL file at a time.'); }}>
    <header className="topbar"><div className="brand-lockup"><img src="/brand/armatrix-horizontal-logo-light-sand-rgb.svg" alt="Armatrix" /><span className="brand-divider" /><div><strong>Weld Seam Planner</strong><span>Engineering workbench</span></div></div><div className="topbar-actions"><span className="local-badge" title="No autosave. Download JSON and keep the original STL for recovery.">Memory-only{unsaved ? ' · Unsaved changes' : ''}</span><button onClick={() => { controller.cancel(); setDropError(null); setRestoring(true); }}>Restore Plan</button><button className="primary" onClick={choose}>＋ Import STL</button></div></header>
    <input ref={input} className="file-input" type="file" accept=".stl,model/stl,application/sla" aria-label="Import STL file" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) controller.start(file); }} />
    <main className={`workspace ${state.active ? 'has-model' : ''}`}>
      {state.active ? <PlanningWorkspace active={state.active} controller={controller} onReplace={choose} /> :
        <section className="empty-workspace"><div className="empty-topline"><span className="eyebrow">WORKPIECE INSPECTION</span><span>01 — IMPORT</span></div><div className="empty-content"><div className="technical-mark" aria-hidden="true"><svg viewBox="0 0 120 120"><path d="M60 10 104 35 104 85 60 110 16 85 16 35Z M16 35 60 61 104 35 M60 61V110" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M60 10V61" stroke="currentColor" strokeDasharray="4 5" /><circle cx="60" cy="61" r="4" fill="var(--brand-bright-discovery)" /></svg></div><span className="eyebrow">FROM GEOMETRY TO ENGINEERING</span><h1>Start with the workpiece.</h1><p>Import an STL, confirm its physical scale,<br />and inspect the geometry in your source frame.</p><button className="primary large" onClick={choose}>Import STL model <span>↗</span></button><span className="drop-hint">or drop one file anywhere in the workspace</span></div><div className="empty-specs"><div><strong>ASCII & binary</strong><span>Content-validated STL</span></div><div><strong>Source coordinates</strong><span>Origin and axes preserved</span></div><div><strong>Private by design</strong><span>Model processing stays in your browser</span></div></div></section>}
    </main>
    {(state.error || dropError) && <div className="error-banner" role="alert"><div><strong>Could not import this model</strong><p>{dropError ?? state.error}{state.active && ' The current workpiece is unchanged.'}</p></div><button onClick={() => { controller.dismissError(); setDropError(null); }} aria-label="Dismiss import error">×</button></div>}
    {state.phase === 'processing' && <div className="processing-toast" role="status"><span className="spinner" /><div><strong>{state.status}</strong><span>The current workpiece stays available until you confirm the replacement.</span></div><button onClick={() => controller.cancel()}>Cancel import</button></div>}
    {state.phase === 'confirming' && state.preview && <ImportDialog key={state.preview.sha256} preview={state.preview} restore={state.restore} unsaved={unsaved} replacing={Boolean(state.active)} onConfirm={(unit) => controller.confirm(unit)} onCancel={() => controller.cancel()} />}
    {restoring && <RestoreDialog onClose={() => setRestoring(false)} onRestore={(stl, json) => { setRestoring(false); void controller.restore(stl, json); }} />}
    {dragging && <div className="drop-overlay"><strong>Drop one STL to inspect</strong><span>Your current model stays unchanged until confirmation.</span></div>}
    <footer className="statusbar"><span><i />{state.status}</span><span>Browser-based geometry workspace <b>·</b> No robot registration applied</span></footer>
  </div>;
}
