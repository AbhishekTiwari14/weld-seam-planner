import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector2 } from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { prepareAcceleration, assetTransferList } from '../src/import/acceleration.ts';
import { prepareAsset } from '../src/import/prepare-asset.ts';
import { parseStl } from '../src/import/parse-stl.ts';
import { pickSurface } from '../src/viewport/picking.ts';
import { binaryStl } from './helpers/stl.ts';
import { workpieceToView } from '../src/geometry/coordinates.ts';

it('transfers serialized BVH buffers and preserves face identity and authoritative picking', () => {
  const input = binaryStl(50_000);
  const bytes = new DataView(input);
  for (let face = 0; face < 50_000; face++) {
    const x = face % 250, y = Math.floor(face / 250);
    [x, y, 5, x + 0.9, y, 5, x, y + 0.9, 5].forEach((n, i) => bytes.setFloat32(84 + face * 50 + 12 + i * 4, n, true));
  }
  const parsed = parseStl(input);
  const asset = prepareAsset(parsed, { filename: 'accelerated.stl', byteLength: input.byteLength,
    sha256: '0'.repeat(64), bounds: parsed.bounds, encoding: 'binary', inputTriangles: 50_000,
    omittedDegenerateTriangles: 0, warnings: [], parseMs: 0 }, 'mm');
  prepareAcceleration(asset);
  expect(asset.acceleration).not.toBeNull();
  const received = structuredClone(asset, { transfer: assetTransferList(asset) });
  expect(asset.positionsMm.byteLength).toBe(0);
  expect(asset.displayPositions.byteLength).toBe(0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(received.displayPositions, 3));
  geometry.boundsTree = MeshBVH.deserialize(received.acceleration!, geometry, { setIndex: false });
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material); mesh.raycast = acceleratedRaycast;
  const target = workpieceToView([123.2, 128.2, 5], received.view);
  const camera = new PerspectiveCamera(40, 1, 0.01, 100); camera.position.set(target[0], target[1], 2); camera.lookAt(...target);
  const hit = pickSurface(new Vector2(0, 0), camera, mesh, received);
  expect(hit?.pointMm[2]).toBeCloseTo(5, 12);
  expect(hit?.triangleIndex).toBe(32_123);
  delete geometry.boundsTree; geometry.dispose(); material.dispose();
});
