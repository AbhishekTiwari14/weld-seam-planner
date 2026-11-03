import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from 'three';
import { binaryStl } from '../tests/helpers/stl.ts';

const count = 500_000;
const input = binaryStl(count);
// Tiled surface: realistic nearest-hit cost, rather than overlapping duplicates.
const view = new DataView(input);
for (let i = 0; i < count; i++) {
  const x = i % 1_000, y = Math.floor(i / 1_000);
  const vertices = [x, y, 0, x + 0.9, y, 0, x, y + 0.9, 0];
  vertices.forEach((n, j) => view.setFloat32(84 + i * 50 + 12 + j * 4, n, true));
}
const started = performance.now();
const geometry = new STLLoader().parse(input);
const parsed = performance.now();
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
const ray = new Raycaster(new Vector3(500.1, 250.1, 100), new Vector3(0, 0, -1));
const beforePick = performance.now();
const hits = ray.intersectObject(mesh);
console.log(JSON.stringify({ cpu: os.cpus()[0]?.model, ramGiB: os.totalmem() / 1024 ** 3,
  triangles: count, bytes: input.byteLength, parseMs: parsed - started,
  prepareMs: beforePick - parsed, pickMs: performance.now() - beforePick,
  hits: hits.length, memory: process.memoryUsage() }, null, 2));
geometry.dispose();
mesh.material.dispose();
