import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector2 } from 'three';
import { ClickGuard, pointerToNdc, pickSurface } from '../src/viewport/picking.ts';
import { parseStl } from '../src/import/parse-stl.ts';
import { prepareAsset } from '../src/import/prepare-asset.ts';
import { asciiStl } from './helpers/stl.ts';
import { updateClipping } from '../src/viewport/camera.ts';

it('maps canvas offsets and CSS pixels to NDC, excluding outside/invalid points', () => {
  const rect = { left: 300, top: 70, width: 800, height: 600 };
  expect(pointerToNdc(700, 370, rect)?.toArray()).toEqual([0, 0]);
  expect(pointerToNdc(300, 70, rect)?.toArray()).toEqual([-1, 1]);
  expect(pointerToNdc(299, 70, rect)).toBeNull();
  expect(pointerToNdc(0, 0, { ...rect, width: 0 })).toBeNull();
});
it('rejects drags returning to origin, alternate buttons, modifiers and long presses', () => {
  const guard = new ClickGuard();
  guard.begin(1, 0, 0, 0, 0); expect(guard.end(1, 2, 2, 100)).toBe(true);
  guard.begin(1, 0, 0, 0, 0); guard.move(1, 10, 0); expect(guard.end(1, 0, 0, 100)).toBe(false);
  guard.begin(1, 0, 0, 2, 0); expect(guard.end(1, 0, 0, 100)).toBe(false);
  guard.begin(1, 0, 0, 0, 0, true); expect(guard.end(1, 0, 0, 100)).toBe(false);
  guard.begin(1, 0, 0, 0, 0); expect(guard.end(1, 0, 0, 800)).toBe(false);
  guard.begin(1, 0, 0, 0, 0); guard.cancel(); expect(guard.end(1, 0, 0, 100)).toBe(false);
  guard.begin(1, 0, 0, 0, 0); guard.begin(2, 0, 0, 0, 0); guard.begin(3, 0, 0, 0, 0);
  expect(guard.end(3, 0, 0, 100)).toBe(false); expect(guard.end(2, 0, 0, 100)).toBe(false); expect(guard.end(1, 0, 0, 100)).toBe(false);
});
it('keeps visible model depths within clipping planes after orbit and pan', () => {
  const camera = new PerspectiveCamera(40, 1, 0.01, 100);
  camera.position.set(0, 0, 3); camera.lookAt(0.5, 0, 0);
  updateClipping(camera);
  expect(camera.near).toBeGreaterThan(2);
  expect(camera.near).toBeLessThan(2.5);
  expect(camera.far).toBeGreaterThan(3.5);
});
it('picks the nearest surface, including reverse-wound faces, using actual Three.js rays', () => {
  const text = asciiStl([[[-2, -2, 0], [2, -2, 0], [0, 2, 0]], [[-2, -2, 1], [0, 2, 1], [2, -2, 1]]]);
  const parsed = parseStl(new TextEncoder().encode(text).buffer);
  const asset = prepareAsset(parsed, { filename: 'occlusion.stl', byteLength: text.length, sha256: 'a'.repeat(64),
    encoding: 'ascii', bounds: parsed.bounds, inputTriangles: 2, omittedDegenerateTriangles: 0, warnings: [], parseMs: 0 }, 'mm');
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(asset.displayPositions, 3));
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  const camera = new PerspectiveCamera(40, 1, 0.01, 100); camera.position.set(0, 0, 2); camera.lookAt(0, 0, 0);
  expect(pickSurface(new Vector2(0, 0), camera, mesh, asset)?.pointMm[2]).toBeCloseTo(1, 12);
  camera.position.set(0, 0, -2); camera.lookAt(0, 0, 0);
  expect(pickSurface(new Vector2(0, 0), camera, mesh, asset)?.pointMm[2]).toBeCloseTo(0, 12);
  material.dispose(); geometry.dispose();
});
