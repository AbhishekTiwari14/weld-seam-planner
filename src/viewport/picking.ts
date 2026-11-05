import { Camera, Mesh, Raycaster, Vector2, Vector3 } from 'three';
import type { Vec3 } from '../domain/contracts.ts';
import { viewToWorkpiece } from '../geometry/coordinates.ts';
import type { MeshAsset } from '../import/types.ts';

export interface CanvasRect { left: number; top: number; width: number; height: number }
export function pointerToNdc(x: number, y: number, rect: CanvasRect): Vector2 | null {
  if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(x + y + rect.width + rect.height)) return null;
  const u = (x - rect.left) / rect.width, v = (y - rect.top) / rect.height;
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : new Vector2(u * 2 - 1, 1 - v * 2);
}
export interface SurfaceHit { pointMm: Vec3; triangleIndex: number; distanceView: number }

/** Mesh is identity-transformed in the defined view frame. Material must be DoubleSide. */
export function pickSurface(ndc: Vector2, camera: Camera, mesh: Mesh, asset: MeshAsset): SurfaceHit | null {
  camera.updateMatrixWorld();
  mesh.updateMatrixWorld();
  const raycaster = new Raycaster();
  raycaster.firstHitOnly = true;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(mesh, false)[0];
  if (!hit || hit.faceIndex == null) return null;
  // Reintersect the chosen visible triangle using authoritative doubles, before returning mm.
  const points = [0, 1, 2].map((vertex) => {
    const offset = hit.faceIndex! * 9 + vertex * 3;
    return new Vector3(...[0, 1, 2].map((axis) =>
      (asset.positionsMm[offset + axis]! - asset.view.centerMm[axis]!) / asset.view.scaleMm) as Vec3);
  });
  const precise = raycaster.ray.intersectTriangle(points[0]!, points[1]!, points[2]!, false, new Vector3());
  // A rounded boundary may hit the display triangle but miss its precise counterpart.
  if (!precise) return null;
  return { pointMm: viewToWorkpiece(precise.toArray(), asset.view), triangleIndex: hit.faceIndex,
    distanceView: precise.distanceTo(raycaster.ray.origin) };
}

/** Track maximum movement, not just release distance (a drag may return to its start). */
export class ClickGuard {
  private down: { id: number; x: number; y: number; time: number; moved: boolean } | null = null;
  private pointers = new Set<number>();
  begin(id: number, x: number, y: number, button: number, time: number, modified = false) {
    this.pointers.add(id);
    if (this.pointers.size > 1 || button !== 0 || modified) { this.down = null; return; }
    this.down = { id, x, y, time, moved: false };
  }
  move(id: number, x: number, y: number) {
    if (this.down?.id === id && Math.hypot(x - this.down.x, y - this.down.y) > 4) this.down.moved = true;
  }
  end(id: number, x: number, y: number, time: number): boolean {
    this.move(id, x, y);
    const valid = this.down?.id === id && !this.down.moved && time - this.down.time < 600;
    this.pointers.delete(id);
    this.down = null;
    return valid;
  }
  cancel() { this.down = null; this.pointers.clear(); }
}
