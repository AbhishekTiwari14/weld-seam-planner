import { createStore } from 'zustand/vanilla';
import { PROCESS_PROFILE, type SourceUnit, type PlanningDocument } from '../domain/contracts.ts';
import { requireValidPlanning } from '../validation/planning.ts';
import { IMPORT_SAFETY_LIMITS, type ActiveWorkpiece, type ImportPreview, type WorkerRequest, type WorkerResponse } from './types.ts';
import { PlanHistory, type HistoryDirection, type HistorySummary } from '../planning/history.ts';
import { activateRestoredPlan, MAX_PLAN_FILE_BYTES, parseSavedPlan, recoveryError, verifyRestoreSource, type RestoreSummary } from '../recovery/restore.ts';

export interface ImportPort {
  send: (request: WorkerRequest) => void;
  stop: () => void;
  listen: (message: (response: WorkerResponse) => void, error: (message: string) => void) => void;
}
export interface ImportState {
  active: ActiveWorkpiece | null;
  preview: ImportPreview | null;
  phase: 'idle' | 'processing' | 'confirming';
  status: string;
  error: string | null;
  history: HistorySummary;
  restore: RestoreSummary | null;
  savedRevision: number | null;
}

export function createImportController(createPort: () => ImportPort) {
  const history = new PlanHistory();
  const store = createStore<ImportState>(() => ({ active: null, preview: null, phase: 'idle', status: 'Ready to import', error: null, history: history.summary(), restore: null, savedRevision: null }));
  let generation = 0;
  let port: ImportPort | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let confirmed = false;
  let restoreDocument: PlanningDocument | null = null;
  function stop() { clearTimeout(timer); port?.stop(); port = null; confirmed = false; restoreDocument = null; generation++; }
  function fail(message: string) {
    stop();
    store.setState({ preview: null, restore: null, phase: 'idle', status: 'Import unsuccessful', error: message });
  }
  function deadline() {
    clearTimeout(timer);
    timer = setTimeout(() => fail('Import exceeded 60 seconds and was stopped. The existing model is unchanged.'), 60_000);
  }
  function checkFile(file: File) {
    if (file.size > IMPORT_SAFETY_LIMITS.bytes) throw new Error('File exceeds the 64 MiB resource safety limit.');
    if (!file.name || file.name.length > 255 || /[/\\\u0000-\u001f]/.test(file.name)) throw new Error('The source filename is invalid. Rename the file and try again.');
  }
  function start(file: File, saved: PlanningDocument | null = null) {
    stop();
    restoreDocument = saved;
    const restore = saved ? { filename: saved.content.workpiece.source.filename, seamCount: saved.content.sequence.length, revision: saved.revision, unit: saved.content.workpiece.source.unit } : null;
    store.setState({ preview: null, restore, phase: 'processing', error: null, status: 'Starting import…' });
    const ticket = generation;
    try {
      checkFile(file);
      port = createPort();
      port.listen((response) => {
        if (ticket !== generation) return;
        if (response.type === 'error') { fail(response.message); return; }
        if (response.type === 'status') { store.setState({ status: response.message }); return; }
        if (response.type === 'preview') {
          try { if (saved) verifyRestoreSource(saved, response.preview, saved.content.workpiece.source.unit); }
          catch (cause) { fail(recoveryError(cause)); return; }
          clearTimeout(timer);
          store.setState({ preview: response.preview, phase: 'confirming', status: saved ? 'Verify and confirm restored plan' : 'Confirm physical units' });
          return;
        }
        if (!confirmed) { fail('Unexpected import completion before unit confirmation.'); return; }
        try {
          const active = saved ? activateRestoredPlan(saved, response.asset) : { asset: response.asset, document: requireValidPlanning({ jobId: crypto.randomUUID(), revision: 0,
            content: { workpiece: response.asset.workpiece, processProfile: PROCESS_PROFILE, seamsById: {}, sequence: [] } }) };
          stop(); history.clear();
          store.setState({ active, preview: null, restore: null, phase: 'idle', error: null,
            status: saved ? `Restored ${saved.content.workpiece.source.filename} · ${saved.content.sequence.length} seams · revision ${saved.revision}` : 'Model ready',
            history: history.summary(), savedRevision: active.document.revision });
        } catch (cause) { fail(recoveryError(cause)); }
      }, (message) => { if (ticket === generation) fail(message); });
      deadline(); port.send({ type: 'read', file });
    } catch (cause) { fail(recoveryError(cause)); }
  }
  return {
    store,
    editPlan(workpieceId: string, operation: (document: PlanningDocument) => PlanningDocument, activationId?: string) {
      const active = store.getState().active;
      if (!active || active.asset.workpiece.id !== workpieceId || (activationId && active.asset.geometryRevision !== activationId)) throw new Error('The workpiece changed. Start this edit again.');
      const document = requireValidPlanning(operation(requireValidPlanning(active.document)));
      if (document.jobId !== active.document.jobId || JSON.stringify(document.content.workpiece) !== JSON.stringify(active.document.content.workpiece)) {
        throw new Error('Plan edits cannot replace the workpiece or job identity.');
      }
      if (JSON.stringify(document.content) === JSON.stringify(active.document.content)) return;
      if (document.revision !== active.document.revision + 1) throw new Error('Plan edits must increment revision exactly once.');
      history.record(active.document.content);
      store.setState({ active: { asset: active.asset, document }, history: history.summary() });
    },
    travelHistory(workpieceId: string, direction: HistoryDirection, activationId?: string) {
      const active = store.getState().active;
      if (!active || active.asset.workpiece.id !== workpieceId || (activationId && active.asset.geometryRevision !== activationId)) throw new Error('The workpiece changed. Start this edit again.');
      const document = history.restore(active.document, direction);
      if (document === active.document) return;
      store.setState({ active: { asset: active.asset, document }, history: history.summary() });
    },
    start: (file: File) => start(file),
    async restore(stl: File, json: File) {
      stop(); store.setState({ preview: null, restore: null, phase: 'processing', error: null, status: 'Validating saved weld plan…' });
      const ticket = generation;
      try {
        checkFile(stl);
        if (json.size === 0) throw new Error('The plan JSON is empty.');
        if (json.size > MAX_PLAN_FILE_BYTES) throw new Error('Plan JSON exceeds the 16 MiB recovery limit.');
        deadline();
        const text = await json.text();
        if (ticket !== generation) return;
        const document = parseSavedPlan(text);
        start(stl, document);
      } catch (cause) { if (ticket === generation) fail(recoveryError(cause)); }
    },
    markDownloaded(activationId: string, revision: number) {
      const active = store.getState().active;
      if (active?.asset.geometryRevision === activationId && active.document.revision === revision) store.setState({ savedRevision: revision });
    },
    confirm(unit: SourceUnit) {
      if (store.getState().phase !== 'confirming' || !port) return;
      if (restoreDocument && unit !== restoreDocument.content.workpiece.source.unit) { fail(`Source-unit mismatch. This plan requires ${restoreDocument.content.workpiece.source.unit}.`); return; }
      store.setState({ phase: 'processing', status: 'Preparing display…' });
      confirmed = true;
      deadline();
      try { port.send({ type: 'prepare', unit }); }
      catch { fail('The browser could not prepare this model. Try importing again.'); }
    },
    cancel() {
      stop();
      store.setState({ preview: null, restore: null, phase: 'idle', error: null, status: 'Import cancelled' });
    },
    dismissError() { store.setState({ error: null }); },
    dispose: stop,
  };
}

export function createBrowserImportPort(): ImportPort {
  const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  return {
    send: (request) => worker.postMessage(request),
    stop: () => worker.terminate(),
    listen: (message, error) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => message(event.data);
      worker.onerror = (event) => { event.preventDefault(); error('Import worker failed. Try a smaller model or reload the application.'); };
      worker.onmessageerror = () => error('The browser could not transfer the processed geometry.');
    },
  };
}
