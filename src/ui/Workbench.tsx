import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createBrowserImportPort, createImportController } from '../import/store.ts';
import { ImportDialog } from './ImportDialog.tsx';
import { PlanningWorkspace } from './PlanningWorkspace.tsx';
import { RestoreDialog } from './RestoreDialog.tsx';
import { WorkflowStepper } from './WorkflowStepper.tsx';
import { SampleDialog } from './SampleDialog.tsx';
import { SampleIcon } from './SampleIcons.tsx';
import { SAMPLE_MODELS, type SampleModel, fetchSampleFile } from '../samples/manifest.ts';

export function Workbench() {
  const [controller] = useState(() => createImportController(createBrowserImportPort));
  const state = useStore(controller.store);
  const input = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [hasSelectedSeam, setHasSelectedSeam] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(0);
  const [reviewBlocked, setReviewBlocked] = useState(false);
  const [fetchingSample, setFetchingSample] = useState<string | null>(null);

  const unsaved = !!state.active && state.active.document.revision !== state.savedRevision;
  const sampleAbortRef = useRef<AbortController | null>(null);
  const sampleTicketRef = useRef<number>(0);
  const importOpenerRef = useRef<HTMLElement | null>(null);
  const rememberImportOpener = () => { importOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };

  const cancelPendingSampleFetch = useCallback(() => {
    sampleTicketRef.current++;
    if (sampleAbortRef.current) {
      sampleAbortRef.current.abort();
      sampleAbortRef.current = null;
    }
    setFetchingSample(null);
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingSampleFetch();
      controller.dispose();
    };
  }, [controller, cancelPendingSampleFetch]);

  const openSamples = () => {
    rememberImportOpener();
    setRestoring(false);
    cancelPendingSampleFetch();
    controller.cancel();
    setDropError(null);
    setSampling(true);
  };

  const choose = () => {
    rememberImportOpener();
    setRestoring(false);
    cancelPendingSampleFetch();
    setDropError(null);
    input.current?.click();
  };

  const handleSelectSample = async (sample: SampleModel) => {
    if (!sampling) rememberImportOpener();
    setSampling(false);
    setDropError(null);
    cancelPendingSampleFetch();
    controller.cancel();
    setFetchingSample(sample.name);
    const ticket = sampleTicketRef.current;
    const ac = new AbortController();
    sampleAbortRef.current = ac;
    try {
      const file = await fetchSampleFile(sample, ac.signal);
      if (ticket !== sampleTicketRef.current || ac.signal.aborted) {
        return;
      }
      controller.start(file);
    } catch (err) {
      if (ac.signal.aborted || ticket !== sampleTicketRef.current) {
        return;
      }
      setDropError(err instanceof Error ? err.message : 'Could not load sample model.');
    } finally {
      if (sampleAbortRef.current === ac) {
        sampleAbortRef.current = null;
        setFetchingSample(null);
      }
    }
  };

  const doc = state.active?.document;
  const seq = doc?.content.sequence ?? [];
  const seamCount = seq.length;
  const allConfigured = seamCount > 0 && seq.every((id) => {
    const s = doc?.content.seamsById[id];
    return s && s.parameters.travelSpeedMmPerS !== null && s.parameters.currentTargetA !== null && s.parameters.voltageTargetV !== null;
  });

  return <div className="app-shell" onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setDragging(true); }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(e) => { e.preventDefault(); setDragging(false); if (restoring || sampling || document.querySelector('dialog[open]')) return; rememberImportOpener(); cancelPendingSampleFetch(); setDropError(null); if (e.dataTransfer.files.length === 1) controller.start(e.dataTransfer.files[0]!); else setDropError('Drop one STL file at a time.'); }}>
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/brand/armatrix-horizontal-logo-light-sand-rgb.svg" alt="Armatrix" />
        <span className="brand-divider" />
        <div><strong>Weld Seam Planner</strong><span>Engineering workbench</span></div>
      </div>
      <div className="topbar-actions">
        <span className="local-badge" title="No autosave. Download JSON and keep the original STL for recovery.">Memory-only{unsaved ? ' · Unsaved changes' : ''}</span>
        <button onClick={openSamples}>Try Sample</button>
        <button onClick={() => { rememberImportOpener(); cancelPendingSampleFetch(); controller.cancel(); setDropError(null); setRestoring(true); }}>Restore Plan</button>
        <button className="primary" onClick={choose}>＋ Import STL</button>
      </div>
    </header>

    <WorkflowStepper
      hasModel={Boolean(state.active)}
      seamCount={seamCount}
      isDrafting={isDrafting}
      hasSelectedSeam={hasSelectedSeam}
      allConfigured={allConfigured}
      isReviewing={isReviewing}
      reviewBlocked={reviewBlocked}
      onOpenReview={() => setReviewRequest((n) => n + 1)}
      onReplaceModel={openSamples}
    />

    <input ref={input} className="file-input" type="file" accept=".stl,model/stl,application/sla" aria-label="Import STL file" onChange={(e) => { setRestoring(false); cancelPendingSampleFetch(); const file = e.target.files?.[0]; e.target.value = ''; if (file) controller.start(file); }} />
    <main className={`workspace ${state.active ? 'has-model' : ''}`}>
      {state.active ? (
        <PlanningWorkspace
          active={state.active}
          controller={controller}
          onReplace={choose}
          onOpenSamples={openSamples}
          onDraftingChange={setIsDrafting}
          onReviewingChange={setIsReviewing}
          onSelectedSeamChange={setHasSelectedSeam}
          onReviewBlockedChange={setReviewBlocked}
          reviewRequest={reviewRequest}
        />
      ) : (
        <section className="empty-workspace">
          <div className="empty-topline"><span className="eyebrow">WORKPIECE INSPECTION</span><span>01 — IMPORT</span></div>
          <div className="empty-split">
            <div className="empty-upload-card">
              <div className="technical-mark" aria-hidden="true">
                <svg viewBox="0 0 120 120">
                  <path d="M60 10 104 35 104 85 60 110 16 85 16 35Z M16 35 60 61 104 35 M60 61V110" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M60 10V61" stroke="currentColor" strokeDasharray="4 5" />
                  <circle cx="60" cy="61" r="4" fill="var(--brand-bright-discovery)" />
                </svg>
              </div>
              <span className="eyebrow">OPTION A / YOUR CAD GEOMETRY</span>
              <h1>Import your workpiece.</h1>
              <p>Upload any ASCII or binary STL from your CAD system.<br />Processed locally in your browser with zero server uploads.</p>
              <button className="primary large" onClick={choose}>Import STL model <span>↗</span></button>
              <span className="drop-hint">or drop one file anywhere in the workspace</span>
            </div>

            <div className="empty-samples-card">
              <div className="samples-card-header">
                <span className="eyebrow">OPTION B / BUILT-IN SAMPLES</span>
                <h2>Or explore realistic 3D engineering parts.</h2>
                <p className="small muted">Self-authored 3D engineering assemblies designed to demonstrate weld seam planning immediately.</p>
              </div>
              <div className="sample-grid">
                {SAMPLE_MODELS.map((sample) => (
                  <article key={sample.id} className="sample-card" data-sample-id={sample.id}>
                    <div className="sample-card-preview">
                      <SampleIcon id={sample.id} />
                      <span className="sample-badge">{sample.badge}</span>
                    </div>
                    <div className="sample-card-body">
                      <h3>{sample.name}</h3>
                      <p className="small muted">{sample.description}</p>
                      <div className="sample-meta">
                        <span><strong>Dimensions:</strong> {sample.dimensionsMm.join(' × ')} mm</span>
                        <span><strong>Triangles:</strong> {sample.triangles}</span>
                      </div>
                      <p className="sample-context small"><em>Joint:</em> {sample.weldingContext}</p>
                    </div>
                    <div className="sample-card-action">
                      <button type="button" className="primary" onClick={() => handleSelectSample(sample)} aria-label={`Load sample ${sample.name}`}>
                        Load sample <span>→</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
          <div className="empty-specs">
            <div><strong>ASCII & binary</strong><span>Content-validated STL</span></div>
            <div><strong>Source coordinates</strong><span>Origin and axes preserved</span></div>
            <div><strong>Private by design</strong><span>Model processing stays in your browser</span></div>
          </div>
        </section>
      )}
    </main>
    {(state.error || dropError) && <div className="error-banner" role="alert"><div><strong>Could not import this model</strong><p>{dropError ?? state.error}{state.active && ' The current workpiece is unchanged.'}</p></div><button onClick={() => { controller.dismissError(); setDropError(null); }} aria-label="Dismiss import error">×</button></div>}
    {(fetchingSample || state.phase === 'processing') && <div className="processing-toast" role="status"><span className="spinner" /><div><strong>{fetchingSample ? `Downloading ${fetchingSample}…` : state.status}</strong><span>The current workpiece stays available until you confirm the replacement.</span></div><button onClick={() => { cancelPendingSampleFetch(); controller.cancel(); }}>Cancel import</button></div>}
    {state.phase === 'confirming' && state.preview && <ImportDialog key={state.preview.sha256} preview={state.preview} restore={state.restore} unsaved={unsaved} replacing={Boolean(state.active)} returnFocus={importOpenerRef.current} onConfirm={(unit) => controller.confirm(unit)} onCancel={() => controller.cancel()} />}
    {restoring && <RestoreDialog onClose={() => { cancelPendingSampleFetch(); setRestoring(false); }} onRestore={(stl, document) => { cancelPendingSampleFetch(); setRestoring(false); controller.restoreValidated(stl, document); }} />}
    {sampling && <SampleDialog unsaved={unsaved} onSelectSample={handleSelectSample} onClose={() => { cancelPendingSampleFetch(); setSampling(false); }} />}
    {dragging && <div className="drop-overlay"><strong>Drop one STL to inspect</strong><span>Your current model stays unchanged until confirmation.</span></div>}
    <footer className="statusbar"><span><i />{state.status}</span><span>Browser-based geometry workspace <b>·</b> No robot registration applied</span></footer>
  </div>;
}
