import { expect, it } from 'vitest';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { asciiStl, type Triangle } from './helpers/stl.ts';

export const offsetTriangle: Triangle = [[1e9, -2, 3], [1e9 + 0.125, -2, 3], [1e9, -1.75, 3]];

it('captures upstream ASCII Float32 precision loss before local centering', () => {
  const geometry = new STLLoader().parse(asciiStl([offsetTriangle]));
  const position = geometry.getAttribute('position');
  expect(offsetTriangle[1][0] - offsetTriangle[0][0]).toBe(0.125);
  expect(position.getX(1) - position.getX(0)).toBe(0);
  geometry.dispose();
});
