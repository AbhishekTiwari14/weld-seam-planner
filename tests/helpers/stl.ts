import type { Vec3 } from '../../src/domain/contracts.ts';

export type Triangle = [Vec3, Vec3, Vec3];
export const analyticTriangles: Triangle[] = [
  [[-10, -20, 5], [30, -20, 5], [-10, 40, 5]],
  [[30, -20, 5], [30, 40, 5], [-10, 40, 5]],
];

export function asciiStl(triangles: Triangle[]): string {
  return `solid analytic\n${triangles.map((triangle) =>
    `facet normal 0 0 1\nouter loop\n${triangle.map((point) => `vertex ${point.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid analytic\n`;
}

export function binaryStl(count: number, header = 'analytic', triangle: Triangle = analyticTriangles[0]!): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50 * count);
  new Uint8Array(buffer).set(new TextEncoder().encode(header).subarray(0, 80));
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  for (let face = 0; face < count; face++) {
    view.setFloat32(84 + face * 50 + 8, 1, true);
    for (let point = 0; point < 3; point++) for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(84 + face * 50 + 12 + (point * 3 + axis) * 4, triangle[point]![axis]!, true);
    }
  }
  return buffer;
}
