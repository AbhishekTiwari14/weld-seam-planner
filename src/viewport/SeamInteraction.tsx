import { useEffect, useRef, useState, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { Mesh, Raycaster } from 'three';
import type { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { PathPoint, Seam, Vec3 } from '../domain/contracts.ts';
import type { MeshAsset } from '../import/types.ts';
import { ClickGuard, pickSurface, pointerToNdc } from './picking.ts';
import { SeamLayer } from './SeamLayer.tsx';

export interface ViewportPlanning {
  seams: readonly Seam[];
  selectedId: string | null;
  draft: readonly PathPoint[] | null;
  interactionEnabled: boolean;
  onPlace: (point: Vec3) => void;
  onSelect: (id: string) => void;
  onMiss: () => void;
}
const NO_SEAMS: readonly Seam[] = [];

export function SeamInteraction({ asset, mesh, planning }: { asset: MeshAsset; mesh: RefObject<Mesh | null>; planning: ViewportPlanning }) {
  const { gl, camera } = useThree();
  const selectable = useRef<Line2[]>([]);
  const transient = useRef<Line2[]>([]);
  const [preview, setPreview] = useState<Vec3 | null>(null);
  const creating = planning.draft !== null;
  const { interactionEnabled, onPlace, onSelect, onMiss } = planning;
  useEffect(() => {
    const canvas = gl.domElement;
    const guard = new ClickGuard();
    let hoverFrame = 0;
    const surface = (x: number, y: number) => {
      const ndc = pointerToNdc(x, y, canvas.getBoundingClientRect());
      return ndc && mesh.current ? pickSurface(ndc, camera, mesh.current, asset) : null;
    };
    const clear = () => { cancelAnimationFrame(hoverFrame); hoverFrame = 0; setPreview(null); };
    const down = (event: PointerEvent) => {
      clear();
      guard.begin(event.pointerId, event.clientX, event.clientY, event.button, event.timeStamp, event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
      // Keep shortcuts local to the viewport; never intercept typing in panels.
      canvas.closest<HTMLElement>('.viewport')?.focus({ preventScroll: true });
    };
    const move = (event: PointerEvent) => {
      guard.move(event.pointerId, event.clientX, event.clientY);
      if (!creating || !interactionEnabled || event.buttons) { clear(); return; }
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => { hoverFrame = 0; setPreview(surface(event.clientX, event.clientY)?.pointMm ?? null); });
    };
    const up = (event: PointerEvent) => {
      clear();
      if (!interactionEnabled || !guard.end(event.pointerId, event.clientX, event.clientY, event.timeStamp)) return;
      if (creating) {
        const hit = surface(event.clientX, event.clientY);
        if (hit) onPlace(hit.pointMm); else onMiss();
      } else {
        const ndc = pointerToNdc(event.clientX, event.clientY, canvas.getBoundingClientRect());
        if (!ndc) return;
        camera.updateMatrixWorld();
        const ray = new Raycaster(); ray.params.Line2 = { threshold: 5 }; ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(selectable.current, false)[0];
        if (hit && typeof hit.object.userData.seamId === 'string') onSelect(hit.object.userData.seamId);
      }
    };
    const cancel = () => { guard.cancel(); clear(); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('pointerleave', clear); canvas.addEventListener('wheel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      cancel(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('pointerleave', clear); canvas.removeEventListener('wheel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [asset, mesh, camera, gl, creating, interactionEnabled, onPlace, onSelect, onMiss]);
  return <><SeamLayer seams={planning.seams} selectedId={planning.selectedId} draft={null} preview={null} view={asset.view} selectable={selectable} />
    {creating && <SeamLayer seams={NO_SEAMS} selectedId={null} draft={planning.draft} preview={preview} view={asset.view} selectable={transient} />}</>;
}
