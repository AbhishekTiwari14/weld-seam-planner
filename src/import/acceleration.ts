import { BufferAttribute, BufferGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { MeshAsset } from './types.ts';

export const ACCELERATION_TRIANGLES = 50_000;

/** Worker-owned construction. Indirect mode preserves the original triangle/point ordering. */
export function prepareAcceleration(asset: MeshAsset): void {
  if (asset.displayPositions.length / 9 < ACCELERATION_TRIANGLES) return;
  const started = performance.now();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(asset.displayPositions, 3));
  try {
    const tree = new MeshBVH(geometry, { indirect: true, useSharedArrayBuffer: false });
    asset.acceleration = MeshBVH.serialize(tree, { cloneBuffers: false });
    asset.timings.accelerationMs = performance.now() - started;
  } finally { geometry.dispose(); }
}

export function assetTransferList(asset: MeshAsset): ArrayBuffer[] {
  const buffers = [asset.positionsMm.buffer, asset.displayPositions.buffer, asset.displayNormals.buffer] as ArrayBuffer[];
  if (asset.acceleration) {
    buffers.push(...asset.acceleration.roots);
    if (asset.acceleration.index) buffers.push(asset.acceleration.index.buffer as ArrayBuffer);
    if (asset.acceleration.indirectBuffer) buffers.push(asset.acceleration.indirectBuffer.buffer as ArrayBuffer);
  }
  return [...new Set(buffers)];
}
