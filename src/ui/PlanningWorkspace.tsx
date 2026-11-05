import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PathPoint, PlanningDocument, Vec3 } from '../domain/contracts.ts';
import type { createImportController } from '../import/store.ts';
import type { ActiveWorkpiece } from '../import/types.ts';
import { appendDraftPoint, commitDraft, remainingPointCapacity } from '../planning/draft.ts';
import { validatePlanning } from '../validation/planning.ts';
import { WorkpiecePanel } from './WorkpiecePanel.tsx';
import { SeamPanel } from './SeamPanel.tsx';
import { ReviewDialog } from './ReviewDialog.tsx';

const Viewport = lazy(() => import('../viewport/Viewport.tsx').then((module) => ({ default: module.Viewport })));

export function PlanningWorkspace({ active, controller, onReplace }: {
  active: ActiveWorkpiece; controller: ReturnType<typeof createImportController>; onReplace: () => void;
}) {
  const { asset, document } = active;
  const container = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<PathPoint[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parameterDirty, setParameterDirty] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // Preserve the renderer/camera owner across imports; reset only editor state before paint.
  useLayoutEffect(() => { setDraft(null); setSelectedId(null); setError(null); setParameterDirty(false); setReviewing(false); }, [asset.workpiece.id]);
  const analysis = useMemo(() => validatePlanning(document), [document]);
  const seams = useMemo(() => document.content.sequence.map((id) => document.content.seamsById[id]!), [document]);
  const edit = useCallback((operation: (current: PlanningDocument) => PlanningDocument) => {
    try { controller.editPlan(asset.workpiece.id, operation); setError(null); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The edit could not be applied.'); return false; }
  }, [asset.workpiece.id, controller]);
  const place = useCallback((point: Vec3) => {
    if (draft === null) return;
    try { setDraft(appendDraftPoint(document, draft, point, crypto.randomUUID())); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This point could not be added.'); }
  }, [document, draft]);
  const select = useCallback((id: string | null) => { if (draft === null && !parameterDirty) { setSelectedId(id); setError(null); } }, [draft, parameterDirty]);
  const miss = useCallback(() => setError('No surface at this location. Click a visible part of the workpiece.'), []);
  const finish = () => {
    if (draft === null) return;
    const id = crypto.randomUUID();
    if (edit((current) => commitDraft(current, draft, id, `Seam ${current.content.sequence.length + 1}`))) { setDraft(null); setSelectedId(id); }
  };
  const cancel = () => { setDraft(null); setError(null); };
  const removeLast = () => { setDraft((points) => points?.slice(0, -1) ?? null); setError(null); };
  const planning = useMemo(() => ({ seams, selectedId, draft, interactionEnabled: !parameterDirty && !reviewing,
    onPlace: place, onSelect: select, onMiss: miss }), [seams, selectedId, draft, parameterDirty, reviewing, place, select, miss]);
  return <div className="planning-workspace" ref={container}>
    <WorkpiecePanel asset={asset} onReplace={onReplace} />
    <Suspense fallback={<div className="viewport">Starting 3D viewport…</div>}>
      <Viewport asset={asset} planning={planning} onFinish={finish} onCancel={cancel} onRemoveLast={removeLast} />
    </Suspense>
    <SeamPanel document={document} analysis={analysis} selectedId={selectedId} draft={draft} error={error} edit={edit}
      parameterDirty={parameterDirty} onParameterDirty={setParameterDirty} onSelect={select} onFinish={finish} onCancel={cancel} onRemoveLast={removeLast}
      onReview={() => setReviewing(true)} onAdd={() => {
        if (remainingPointCapacity(document) < 2) { setError('Fewer than two points remain within the 10,000-point plan limit.'); return; }
        setError(null); setDraft([]); container.current?.querySelector<HTMLElement>('.viewport')?.focus();
      }} />
    {reviewing && <ReviewDialog document={document} draftPending={draft !== null} onClose={() => setReviewing(false)} getCurrentDocument={() => {
      const latest = controller.store.getState().active;
      if (!latest || latest.asset.workpiece.id !== asset.workpiece.id) throw new Error('The workpiece changed. Review the new plan before exporting.');
      return latest.document;
    }} />}
  </div>;
}
