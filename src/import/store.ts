import { createStore } from 'zustand/vanilla';
import { PROCESS_PROFILE, type SourceUnit, type PlanningDocument } from '../domain/contracts.ts';
import { requireValidPlanning } from '../validation/planning.ts';
import { IMPORT_SAFETY_LIMITS, type ActiveWorkpiece, type ImportPreview, type WorkerRequest, type WorkerResponse } from './types.ts';
import { PlanHistory, type HistoryDirection, type HistorySummary } from '../planning/history.ts';

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
}

export function createImportController(createPort: () => ImportPort) {
  const history = new PlanHistory();
  const store = createStore<ImportState>(() => ({ active: null, preview: null, phase: 'idle', status: 'Ready to import', error: null, history: history.summary() }));
  let generation = 0;
  let port: ImportPort | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let confirmed = false;
  function stop() { clearTimeout(timer); port?.stop(); port = null; confirmed = false; generation++; }
  function fail(message: string) {
    stop();
    store.setState({ preview: null, phase: 'idle', status: 'Import unsuccessful', error: message });
  }
  function deadline() {
    clearTimeout(timer);
    timer = setTimeout(() => fail('Import exceeded 60 seconds and was stopped. The existing model is unchanged.'), 60_000);
  }
  return {
    store,
    editPlan(workpieceId: string, operation: (document: PlanningDocument) => PlanningDocument) {
      const active = store.getState().active;
      if (!active || active.asset.workpiece.id !== workpieceId) throw new Error('The workpiece changed. Start this edit again.');
      const document = requireValidPlanning(operation(requireValidPlanning(active.document)));
      if (document.jobId !== active.document.jobId || JSON.stringify(document.content.workpiece) !== JSON.stringify(active.document.content.workpiece)) {
        throw new Error('Plan edits cannot replace the workpiece or job identity.');
      }
      if (JSON.stringify(document.content) === JSON.stringify(active.document.content)) return;
      if (document.revision !== active.document.revision + 1) throw new Error('Plan edits must increment revision exactly once.');
      history.record(active.document.content);
      store.setState({ active: { asset: active.asset, document }, history: history.summary() });
    },
    travelHistory(workpieceId: string, direction: HistoryDirection) {
      const active = store.getState().active;
      if (!active || active.asset.workpiece.id !== workpieceId) throw new Error('The workpiece changed. Start this edit again.');
      const document = history.restore(active.document, direction);
      if (document === active.document) return;
      store.setState({ active: { asset: active.asset, document }, history: history.summary() });
    },
    start(file: File) {
      stop();
      store.setState({ preview: null, phase: 'processing', error: null, status: 'Starting import…' });
      if (file.size > IMPORT_SAFETY_LIMITS.bytes) { fail('File exceeds the 64 MiB resource safety limit.'); return; }
      if (!file.name || file.name.length > 255 || /[/\\\u0000-\u001f]/.test(file.name)) { fail('The source filename is invalid. Rename the file and try again.'); return; }
      const ticket = generation;
      try {
        port = createPort();
        port.listen((response) => {
          if (ticket !== generation) return;
          if (response.type === 'error') { fail(response.message); return; }
          if (response.type === 'status') { store.setState({ status: response.message }); return; }
          if (response.type === 'preview') {
            clearTimeout(timer);
            store.setState({ preview: response.preview, phase: 'confirming', status: 'Confirm physical units' });
            return;
          }
          if (!confirmed) { fail('Unexpected import completion before unit confirmation.'); return; }
          try {
            const document = requireValidPlanning({ jobId: crypto.randomUUID(), revision: 0,
              content: { workpiece: response.asset.workpiece, processProfile: PROCESS_PROFILE, seamsById: {}, sequence: [] } });
            stop();
            history.clear();
            store.setState({ active: { asset: response.asset, document }, preview: null, phase: 'idle', error: null, status: 'Model ready', history: history.summary() });
          } catch (error) { fail(error instanceof Error ? error.message : 'Invalid workpiece metadata.'); }
        }, (message) => { if (ticket === generation) fail(message); });
        deadline();
        port.send({ type: 'read', file });
      } catch (error) { fail(error instanceof Error ? error.message : 'The browser could not start the import worker.'); }
    },
    confirm(unit: SourceUnit) {
      if (store.getState().phase !== 'confirming' || !port) return;
      store.setState({ phase: 'processing', status: 'Preparing display…' });
      confirmed = true;
      deadline();
      try { port.send({ type: 'prepare', unit }); }
      catch { fail('The browser could not prepare this model. Try importing again.'); }
    },
    cancel() {
      stop();
      store.setState({ preview: null, phase: 'idle', error: null, status: 'Import cancelled' });
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
