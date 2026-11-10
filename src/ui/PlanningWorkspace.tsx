import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { PathPoint, PlanningDocument, Vec3 } from '../domain/contracts.ts';
import type { createImportController } from '../import/store.ts';
import type { ActiveWorkpiece } from '../import/types.ts';
import { appendDraftPoint, commitDraft, remainingPointCapacity } from '../planning/draft.ts';
import { validatePlanning } from '../validation/planning.ts';
import { WorkpiecePanel } from './WorkpiecePanel.tsx';
import { SeamPanel } from './SeamPanel.tsx';
import { ReviewDialog } from './ReviewDialog.tsx';
import { applySurfaceEdit, selectionExists, type GeometrySelection, type SurfaceEdit } from '../planning/selection.ts';
import type { HistoryDirection } from '../planning/history.ts';
import { isTextEditingTarget } from '../planning/shortcuts.ts';
import { findingIdentity, type ReviewSnapshot } from '../planning/review.ts';
import { createDiscoveryController } from '../candidates/discovery-controller.ts';
import { acceptCandidate } from '../candidates/accept.ts';
import type { SeamCandidate } from '../candidates/contracts.ts';
import { DiscoveryPanel } from './DiscoveryPanel.tsx';

const Viewport = lazy(() => import('../viewport/Viewport.tsx').then((module) => ({ default: module.Viewport })));

export function PlanningWorkspace({
  active,
  controller,
  onReplace,
  onOpenSamples,
  onDraftingChange,
  onReviewingChange,
  onSelectedSeamChange,
  onReviewBlockedChange,
  reviewRequest = 0,
}: {
  active: ActiveWorkpiece;
  controller: ReturnType<typeof createImportController>;
  onReplace: () => void;
  onOpenSamples?: (() => void) | undefined;
  onDraftingChange?: ((drafting: boolean) => void) | undefined;
  onReviewingChange?: ((reviewing: boolean) => void) | undefined;
  onSelectedSeamChange?: ((hasSelected: boolean) => void) | undefined;
  onReviewBlockedChange?: ((blocked: boolean) => void) | undefined;
  reviewRequest?: number | undefined;
}) {
  const { asset, document } = active;
  const container = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<PathPoint[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parameterDirty, setParameterDirty] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selection, setSelection] = useState<GeometrySelection | null>(null);
  const [surfaceEdit, setSurfaceEdit] = useState<SurfaceEdit | null>(null);
  const [candidate, setCandidate] = useState<Vec3 | null>(null);
  const [lastReview, setLastReview] = useState<ReviewSnapshot | null>(null);
  const [parameterFocus, setParameterFocus] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<ReturnType<typeof createDiscoveryController> | null>(null);
  const [discoverySelection, setDiscoverySelection] = useState<SeamCandidate | null>(null);
  const [ledger, setLedger] = useState<Record<string, string[]>>({});
  const ledgerRef = useRef<Record<string, string[]>>({});
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const history = useStore(controller.store, (state) => state.history);
  const prevReviewReq = useRef(reviewRequest);

  useEffect(() => {
    const instance = createDiscoveryController(controller.store);
    setDiscovery(instance);
    return () => instance.dispose();
  }, [controller]);

  useEffect(() => {
    onDraftingChange?.(draft !== null);
  }, [draft, onDraftingChange]);

  useEffect(() => {
    onReviewingChange?.(reviewing);
  }, [reviewing, onReviewingChange]);

  useEffect(() => {
    onSelectedSeamChange?.(selectedId !== null);
  }, [selectedId, onSelectedSeamChange]);

  useEffect(() => {
    onReviewBlockedChange?.(parameterDirty || surfaceEdit !== null);
  }, [parameterDirty, surfaceEdit, onReviewBlockedChange]);

  useEffect(() => {
    if (reviewRequest > prevReviewReq.current) {
      // External navigation must respect the same uncommitted-edit guards as the inspector.
      if (!parameterDirty && !surfaceEdit) setReviewing(true);
    }
    prevReviewReq.current = reviewRequest;
  }, [reviewRequest, parameterDirty, surfaceEdit]);
  // Preserve the renderer/camera owner across imports; reset only editor state before paint.
  useLayoutEffect(() => {
    setDraft(null); setSelectedId(null); setError(null); setParameterDirty(false); setReviewing(false);
    setSelection(null); setSurfaceEdit(null); setCandidate(null);
    setLastReview(null); setParameterFocus(null);
    setDiscoverySelection(null); ledgerRef.current = {}; setLedger({}); setRejected({});
  }, [asset.geometryRevision]);
  useLayoutEffect(() => {
    const selected = selectedId ? document.content.seamsById[selectedId] : undefined;
    if (selectedId && !selected) setSelectedId(null);
    if (selection && !selectionExists(selected, selection)) setSelection(null);
    if (surfaceEdit && (surfaceEdit.revision !== document.revision || surfaceEdit.workpieceId !== asset.workpiece.id)) {
      setSurfaceEdit(null); setCandidate(null);
    }
  }, [document, selectedId, selection, surfaceEdit, asset.workpiece.id]);
  const analysis = useMemo(() => validatePlanning(document), [document]);
  useEffect(() => {
    if (!parameterFocus || reviewing) return;
    container.current?.querySelector<HTMLInputElement>(`input[name="${parameterFocus}"]`)?.focus();
    setParameterFocus(null);
  }, [parameterFocus, reviewing]);
  const closeReview = () => { setLastReview({ revision: document.revision, identities: validatePlanning(document, 'export').findings.map(findingIdentity) }); setReviewing(false); };
  const seams = useMemo(() => document.content.sequence.map((id) => document.content.seamsById[id]!), [document]);
  const edit = useCallback((operation: (current: PlanningDocument) => PlanningDocument) => {
    try { controller.editPlan(asset.workpiece.id, operation, asset.geometryRevision); setError(null); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The edit could not be applied.'); return false; }
  }, [asset.workpiece.id, asset.geometryRevision, controller]);
  const place = useCallback((point: Vec3) => {
    if (surfaceEdit) {
      try { applySurfaceEdit(document, surfaceEdit, point); setCandidate(point); setError(null); }
      catch (cause) { setCandidate(null); setError(cause instanceof Error ? cause.message : 'This point is invalid.'); }
      return;
    }
    if (draft === null) return;
    try { setDraft(appendDraftPoint(document, draft, point, crypto.randomUUID())); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This point could not be added.'); }
  }, [document, draft, surfaceEdit]);
  const select = useCallback((id: string | null) => { if (draft === null && !surfaceEdit && !parameterDirty) {
    setSelectedId(id); setSelection(null); setError(null);
  } }, [draft, surfaceEdit, parameterDirty]);
  const selectGeometry = useCallback((target: GeometrySelection | null) => {
    if (draft !== null || surfaceEdit || parameterDirty) return;
    if (target && !selectionExists(document.content.seamsById[target.seamId], target)) return;
    if (target) setSelectedId(target.seamId);
    setSelection(target); setError(null);
  }, [document, draft, surfaceEdit, parameterDirty]);
  const miss = useCallback(() => { setCandidate(null); setError('No surface at this location. Click a visible part of the workpiece.'); }, []);
  const finish = () => {
    if (surfaceEdit) {
      if (!candidate) { setError('Pick a valid surface position before applying this edit.'); return; }
      if (edit((current) => applySurfaceEdit(current, surfaceEdit, candidate))) {
        setSelection({ kind: 'point', seamId: surfaceEdit.seamId, pointId: surfaceEdit.kind === 'replace' ? surfaceEdit.pointId : surfaceEdit.newPointId });
        setSurfaceEdit(null); setCandidate(null);
      }
      return;
    }
    if (draft === null) return;
    const id = crypto.randomUUID();
    if (edit((current) => commitDraft(current, draft, id, `Seam ${current.content.sequence.length + 1}`))) { setDraft(null); setSelectedId(id); }
  };
  const cancel = useCallback(() => { setDraft(null); setSurfaceEdit(null); setCandidate(null); setError(null); }, []);
  const removeLast = () => { setDraft((points) => points?.slice(0, -1) ?? null); setError(null); };
  const travel = useCallback((direction: HistoryDirection) => {
    if (draft !== null || surfaceEdit || parameterDirty || reviewing) return;
    try { controller.travelHistory(asset.workpiece.id, direction, asset.geometryRevision); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'History could not be restored.'); }
  }, [asset.workpiece.id, asset.geometryRevision, controller, draft, surfaceEdit, parameterDirty, reviewing]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isTextEditingTarget(event.target) || globalThis.document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && surfaceEdit) { event.preventDefault(); cancel(); return; }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault(); if (event.repeat) return;
        travel(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [travel, cancel, surfaceEdit]);
  const begin = (intent: SurfaceEdit) => {
    if (draft !== null || surfaceEdit || parameterDirty) return;
    setSurfaceEdit(intent); setCandidate(null); setError(null);
    container.current?.querySelector<HTMLElement>('.seam-panel-scroll')?.scrollTo({ top: 0 });
    container.current?.querySelector<HTMLElement>('.viewport')?.focus();
  };
  const discoveryPath = discoverySelection?.geometryRevision === asset.geometryRevision && draft === null && !surfaceEdit ? discoverySelection.path : null;
  const planning = useMemo(() => ({ seams, selectedId, draft, selection, surfaceEdit, candidate, discoveryPath, interactionEnabled: !parameterDirty && !reviewing,
    onPlace: place, onSelect: select, onMiss: miss }), [seams, selectedId, draft, selection, surfaceEdit, candidate, discoveryPath, parameterDirty, reviewing, place, select, miss]);
  return <div className="planning-workspace" ref={container}>
    <WorkpiecePanel asset={asset} onReplace={onReplace} onOpenSamples={onOpenSamples} />
    <Suspense fallback={<div className="viewport">Starting 3D viewport…</div>}>
      <Viewport asset={asset} planning={planning} onFinish={finish} onCancel={cancel} onRemoveLast={removeLast} />
    </Suspense>
    <SeamPanel document={document} analysis={analysis} selectedId={selectedId} draft={draft} error={error} edit={edit}
      discoveryPanel={discovery && <DiscoveryPanel controller={discovery} document={document} selectedId={discoverySelection?.candidateId ?? null}
        ledger={ledger} rejected={rejected} disabled={draft !== null || !!surfaceEdit || parameterDirty || reviewing}
        onSelect={setDiscoverySelection} onStart={() => { setDiscoverySelection(null); discovery.start(); }}
        onReject={(id, value) => setRejected((previous) => ({ ...previous, [id]: value }))}
        onAccept={(suggestion) => {
          if (draft !== null || surfaceEdit || parameterDirty || reviewing || rejected[suggestion.candidateId]) return;
          const current = controller.store.getState().active;
          if (!current || (ledgerRef.current[suggestion.candidateId] ?? []).some((id) => !!current.document.content.seamsById[id])) return;
          let seamId: string | null = null;
          if (edit((plan) => {
            const accepted = acceptCandidate(plan, suggestion, { geometryRevision: asset.geometryRevision, name: `Seam ${plan.content.sequence.length + 1}` });
            if (accepted.candidate.review.state === 'accepted') seamId = accepted.candidate.review.seamId;
            return accepted.document;
          }) && seamId) {
            const next = { ...ledgerRef.current, [suggestion.candidateId]: [...(ledgerRef.current[suggestion.candidateId] ?? []), seamId] };
            ledgerRef.current = next; setLedger(next); setSelectedId(seamId); setSelection(null);
          }
        }} />}
      selection={selection} surfaceEdit={surfaceEdit} candidate={candidate} history={history} onHistory={travel} onSelectGeometry={selectGeometry}
      onReplacePoint={(pointId) => { if (selectedId) begin({ kind: 'replace', seamId: selectedId, pointId, workpieceId: asset.workpiece.id, revision: document.revision }); }}
      onInsertPoint={(startPointId, endPointId) => { if (selectedId) begin({ kind: 'insert', seamId: selectedId, startPointId, endPointId, newPointId: crypto.randomUUID(), workpieceId: asset.workpiece.id, revision: document.revision }); }}
      parameterDirty={parameterDirty} onParameterDirty={setParameterDirty} onSelect={select} onFinish={finish} onCancel={cancel} onRemoveLast={removeLast}
      onReview={() => setReviewing(true)} onAdd={() => {
        if (remainingPointCapacity(document) < 2) { setError('Fewer than two points remain within the 10,000-point plan limit.'); return; }
        setError(null); setSelection(null); setDraft([]); container.current?.querySelector<HTMLElement>('.viewport')?.focus();
      }} />
    {reviewing && <ReviewDialog document={document} draftPending={draft !== null} previousReview={lastReview} onClose={closeReview}
      onCorrectParameter={(seamId, field) => { select(seamId); closeReview(); setParameterFocus(field); }}
      onDownloaded={(revision) => controller.markDownloaded(asset.geometryRevision, revision)} onInspect={(target) => { selectGeometry(target); closeReview(); }} getCurrentDocument={() => {
      const latest = controller.store.getState().active;
      if (!latest || latest.asset.geometryRevision !== asset.geometryRevision) throw new Error('The workpiece changed. Review the new plan before exporting.');
      return latest.document;
    }} />}
  </div>;
}
