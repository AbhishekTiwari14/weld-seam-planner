import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import type { MeshAsset } from '../import/types.ts';
import { workpieceToView } from '../geometry/coordinates.ts';
import { ClickGuard, pickSurface, pointerToNdc, type SurfaceHit } from './picking.ts';
import { fitCamera, focusCamera, updateClipping } from './camera.ts';
import type { Vec3 } from '../domain/contracts.ts';
import { SeamInteraction, type ViewportPlanning } from './SeamInteraction.tsx';

interface ViewportCommands { fit: () => void; reset: () => void; focus: (points: readonly Vec3[]) => void }
interface DebugApi {
  snapshot: () => { camera: number[]; geometries: number; triangles: number; frame: string; geometryRevision: string; renderedGeometryRevision: string | null; renderCalls: number; renderFrame: number; timings: MeshAsset['timings']; maxDisplayErrorMm: number; lastHit: SurfaceHit | null; pickMs: number };
  project: (pointMm: [number, number, number]) => { x: number; y: number };
  pick: (x: number, y: number) => SurfaceHit | null;
}
declare global { interface Window { __weldDebug?: DebugApi } }
const inspect = import.meta.env.DEV && new URLSearchParams(location.search).has('inspect');

function Orientation({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  return <svg ref={svgRef} className="orientation" viewBox="0 0 110 110" role="img" aria-label="Source X Y Z orientation">
    <circle cx="55" cy="55" r="44" fill="var(--brand-dark-forest-t3)" />
    {['X', 'Y', 'Z'].map((axis) => <g key={axis}><line data-axis={axis} x1="55" y1="55" x2="55" y2="55" stroke="currentColor" strokeWidth="1.5" /><text data-label={axis} x="55" y="55" fill="currentColor" fontSize="12">{axis}</text></g>)}
    <circle cx="55" cy="55" r="2.5" fill="var(--brand-bright-discovery)" />
  </svg>;
}

function Scene({ asset, commands, orientation, onHit, planning }: { asset: MeshAsset; commands: RefObject<ViewportCommands | null>; orientation: RefObject<SVGSVGElement | null>; onHit: (hit: SurfaceHit | null) => void; planning: ViewportPlanning }) {
  const { camera, gl, scene, invalidate, size } = useThree();
  const mesh = useRef<Mesh | null>(null);
  const renderedGeometryRevision = useRef<string | null>(null);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = false;
    orbit.screenSpacePanning = true;
    orbit.minDistance = 0.002;
    orbit.maxDistance = 1_000;
    const update = () => {
      updateClipping(camera);
      invalidate();
      const inverse = camera.quaternion.clone().invert();
      ['X', 'Y', 'Z'].forEach((axis, index) => {
        const d = new Vector3(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0).applyQuaternion(inverse);
        const line = orientation.current?.querySelector(`[data-axis=${axis}]`);
        const label = orientation.current?.querySelector(`[data-label=${axis}]`);
        line?.setAttribute('x2', String(55 + d.x * 28)); line?.setAttribute('y2', String(55 - d.y * 28));
        label?.setAttribute('x', String(51 + d.x * 40)); label?.setAttribute('y', String(59 - d.y * 40));
      });
    };
    orbit.addEventListener('change', update);
    const fit = (reset: boolean) => { fitCamera(camera, orbit, reset); update(); };
    commands.current = { fit: () => fit(false), reset: () => fit(true), focus: (points) => { focusCamera(camera, orbit, points); update(); } };
    fit(true);
    return () => { commands.current = null; orbit.dispose(); };
  }, [camera, gl, invalidate, commands, orientation]);

  useLayoutEffect(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(asset.displayPositions, 3));
    geometry.setAttribute('normal', new BufferAttribute(asset.displayNormals, 3));
    if (asset.acceleration) geometry.boundsTree = MeshBVH.deserialize(asset.acceleration, geometry, { setIndex: false });
    geometry.boundingSphere = new Sphere(new Vector3(), 0.500001);
    geometry.boundingBox = new Box3(new Vector3(-0.500001, -0.500001, -0.500001), new Vector3(0.500001, 0.500001, 0.500001));
    const material = new MeshStandardMaterial({ color: '#c5c5bd', roughness: 0.68, metalness: 0.15, side: DoubleSide });
    const object = new Mesh(geometry, material);
    if (asset.acceleration) object.raycast = acceleratedRaycast;
    renderedGeometryRevision.current = null;
    // Renderer statistics can still describe the previous frame after replacement.
    // Mark this revision only after its own draw; inspection adds no render scheduling.
    if (inspect) object.onAfterRender = () => { renderedGeometryRevision.current = asset.geometryRevision; };
    mesh.current = object;
    scene.add(object); invalidate();
    return () => { scene.remove(object); mesh.current = null; renderedGeometryRevision.current = null; delete geometry.boundsTree; geometry.dispose(); material.dispose(); invalidate(); };
  }, [asset, scene, invalidate]);
  useEffect(() => { commands.current?.reset(); }, [asset, commands]);
  useEffect(() => { commands.current?.fit(); }, [size.width, size.height, commands]);

  useEffect(() => {
    if (!inspect) return;
    const canvas = gl.domElement;
    const guard = new ClickGuard();
    let lastHit: SurfaceHit | null = null;
    let pickMs = 0;
    const pick = (x: number, y: number) => {
      const start = performance.now();
      const ndc = pointerToNdc(x, y, canvas.getBoundingClientRect());
      lastHit = ndc && mesh.current ? pickSurface(ndc, camera, mesh.current, asset) : null;
      pickMs = performance.now() - start; onHit(lastHit); return lastHit;
    };
    const down = (e: PointerEvent) => guard.begin(e.pointerId, e.clientX, e.clientY, e.button, e.timeStamp, e.shiftKey || e.ctrlKey || e.altKey || e.metaKey);
    const move = (e: PointerEvent) => guard.move(e.pointerId, e.clientX, e.clientY);
    const up = (e: PointerEvent) => { if (guard.end(e.pointerId, e.clientX, e.clientY, e.timeStamp)) pick(e.clientX, e.clientY); };
    const cancel = () => guard.cancel();
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('wheel', cancel);
    window.__weldDebug = {
      snapshot: () => ({ camera: camera.position.toArray(), geometries: gl.info.memory.geometries, triangles: gl.info.render.triangles,
        geometryRevision: asset.geometryRevision, renderedGeometryRevision: renderedGeometryRevision.current,
        renderCalls: gl.info.render.calls, renderFrame: gl.info.render.frame, frame: JSON.stringify(asset.workpiece), timings: asset.timings, maxDisplayErrorMm: asset.maxDisplayErrorMm, lastHit, pickMs }),
      project: (point) => {
        camera.updateMatrixWorld();
        const p = new Vector3(...workpieceToView(point, asset.view)).project(camera);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
      }, pick,
    };
    return () => {
      delete window.__weldDebug;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('wheel', cancel);
    };
  }, [asset, camera, gl, onHit]);
  return <><SeamInteraction asset={asset} mesh={mesh} planning={planning} /><ambientLight intensity={0.8} /><hemisphereLight args={['#f6f6ee', '#344425', 2]} />
    <directionalLight position={[3, -4, 5]} intensity={3} /><directionalLight position={[-3, 1, -2]} intensity={1.5} /></>;
}

class ViewportBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="viewport-fallback" role="alert"><h2>3D rendering is unavailable</h2><p>Enable hardware acceleration or try a WebGL 2 browser. Reload to retry.</p></div> : this.props.children; }
}

export function Viewport({ asset, planning, onFinish, onCancel, onRemoveLast }: {
  asset: MeshAsset; planning: ViewportPlanning; onFinish: () => void; onCancel: () => void; onRemoveLast: () => void;
}) {
  const commands = useRef<ViewportCommands | null>(null);
  const orientation = useRef<SVGSVGElement | null>(null);
  const [hit, setHit] = useState<SurfaceHit | null>(null);
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => setHit(null), [asset]);
  const target = planning.selection;
  const selected = planning.seams.find((seam) => seam.id === planning.selectedId);
  const index = target ? selected?.geometry.points.findIndex((point) => point.id === (target.kind === 'point' ? target.pointId : target.startPointId)) ?? -1 : -1;
  return <section className={`viewport${planning.draft !== null ? ' is-creating' : ''}`} aria-label="3D workpiece viewport" tabIndex={0}
    data-edit-mode={planning.surfaceEdit?.kind ?? (planning.draft !== null ? 'create' : 'navigate')}
    data-candidate-preview={planning.discoveryPath ? 'visible' : 'none'}
    data-highlight-kind={target?.kind ?? 'none'} data-highlight-ids={target ? target.kind === 'point' ? target.pointId : `${target.startPointId},${target.endPointId}` : ''}
    onKeyDown={(e) => {
      if (e.target !== e.currentTarget) return;
      if ((planning.draft !== null || planning.surfaceEdit) && ['Enter', 'Escape', 'Backspace'].includes(e.key)) {
        e.preventDefault(); if (e.repeat) return;
        if (e.key === 'Enter') onFinish(); else if (e.key === 'Escape') onCancel(); else if (planning.draft !== null) onRemoveLast();
      }
      if (e.key.toLowerCase() === 'f') commands.current?.fit(); if (e.key === 'Home') { e.preventDefault(); commands.current?.reset(); }
    }}>
    <div className="viewport-tools"><span className="viewport-caption">WORKPIECE / SOLID</span><div>{planning.discoveryPath && <button disabled={planning.draft !== null || !!planning.surfaceEdit} onClick={() => commands.current?.focus(planning.discoveryPath!.map((point) => workpieceToView(point, asset.view)))}>Focus candidate</button>}{selected && <button disabled={planning.draft !== null || !!planning.surfaceEdit} onClick={() => {
      const points = selected.geometry.points.filter((point) => !target || (target.kind === 'point' ? point.id === target.pointId : point.id === target.startPointId || point.id === target.endPointId));
      commands.current?.focus(points.map((point) => workpieceToView(point.positionMm, asset.view)));
    }}>Focus selection</button>}<button onClick={() => commands.current?.fit()} title="Fit model (F)">Fit model <kbd>F</kbd></button><button onClick={() => commands.current?.reset()} title="Reset camera (Home)">Reset view</button></div></div>
    <ViewportBoundary><Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 40, position: [1.2, -1.6, 1.1], up: [0, 0, 1], near: 0.0001, far: 5000 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      fallback={<div className="viewport-fallback" role="alert">WebGL 2 is unavailable. Enable hardware acceleration or use a supported desktop browser.</div>}
      onCreated={({ gl }) => { gl.setClearColor('#141e00'); gl.domElement.setAttribute('aria-label', 'Interactive 3D model'); gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setContextLost(true); }); }}>
      <Scene asset={asset} commands={commands} orientation={orientation} onHit={setHit} planning={planning} />
    </Canvas></ViewportBoundary>
    {contextLost && <div className="viewport-fallback" role="alert"><h2>Graphics context lost</h2><p>The browser ran out of graphics resources. Reload and try a smaller model.</p></div>}
    <Orientation svgRef={orientation} />
    <div className="viewport-mode" role="status">{planning.surfaceEdit ? `${planning.surfaceEdit.kind === 'replace' ? 'Replacing point' : 'Inserting point'} · ${planning.candidate ? 'Preview ready · Apply or pick again' : 'Click a surface to preview'} · Esc to cancel` :
      target ? `Inspecting ${target.kind} ${index + 1} · ${selected?.name ?? 'Seam'} · highlight does not modify geometry` :
      planning.draft !== null ? `Creating seam · ${planning.draft.length} points · Enter to finish / Esc to cancel` :
      planning.selectedId ? `Selected: ${planning.seams.find((seam) => seam.id === planning.selectedId)?.name ?? 'Seam'} · white start → orange end` : 'Navigate the model · Add seam to place surface points'}</div>
    {!!planning.seams.length && <div className="overlay-note">Path overlays remain visible through the model. Segments are straight chords.</div>}
    <div className="viewport-guidance">Drag to orbit <span>·</span> Right-drag to pan <span>·</span> Scroll to zoom</div>
    {inspect && <output className="pick-diagnostic" data-testid="pick-result">{hit ? `Hit mm: ${hit.pointMm.map((v) => v.toPrecision(9)).join(', ')} · triangle ${hit.triangleIndex}` : 'Development inspection: click a surface to verify workpiece coordinates'}</output>}
  </section>;
}
