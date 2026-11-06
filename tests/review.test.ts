import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { findingIdentity, groupFindings } from '../src/planning/review.ts';
import { validatePlanning } from '../src/validation/planning.ts';
import { focusCamera } from '../src/viewport/camera.ts';
import { samplePlan } from './helpers.ts';

it('groups unchanged domain findings in execution order with exact identities and category counts', () => {
  const document = samplePlan();
  for (const seam of Object.values(document.content.seamsById)) seam.parameters.travelSpeedMmPerS = null;
  const findings = validatePlanning(document, 'export').findings;
  const groups = groupFindings(document, findings);
  expect(groups.flatMap((group) => group.findings).map(findingIdentity).sort()).toEqual(findings.map(findingIdentity).sort());
  expect(groups.filter((group) => group.id !== 'workpiece').map((group) => group.id)).toEqual(document.content.sequence);
  expect(groups.flatMap((group) => group.findings).filter((finding) => finding.severity === 'error')).toHaveLength(document.content.sequence.length);
});

it('handles workpiece-level findings, empty findings and unidentified groups gracefully', () => {
  const document = samplePlan();
  expect(groupFindings(document, [])).toEqual([]);
  const custom = groupFindings(document, [
    { code: 'BOUNDS_INVALID', message: 'Workpiece alert', severity: 'warning', target: { kind: 'workpiece' } },
    { code: 'STRUCTURE_INVALID', message: 'Other alert', severity: 'warning', target: { kind: 'seam', seamId: 'unknown-seam' } },
  ]);
  expect(custom).toHaveLength(2);
  expect(custom[0]!.id).toBe('workpiece');
  expect(custom[0]!.name).toBe('Plan & workpiece');
  expect(custom[1]!.id).toBe('unknown-seam');
  expect(custom[1]!.name).toBe('unknown-seam');
});

it('focuses normalized selected geometry in the frustum without modifying its points, preserving view direction', () => {
  const camera = new PerspectiveCamera(40, 0.8, 0.0001, 5000); camera.up.set(0, 0, 1); camera.position.set(1.2, -1.6, 1.1);
  const target = new Vector3();
  const controls = { target, update: () => { camera.lookAt(target); camera.updateMatrixWorld(); } } as OrbitControls;
  const direction = camera.position.clone().sub(target).normalize();
  const points: [number, number, number][] = [[-0.1, 0.2, 0.1], [0.3, 0.25, 0.2]];
  const before = structuredClone(points); focusCamera(camera, controls, points);
  expect(points).toEqual(before);
  expect(camera.position.clone().sub(target).normalize().distanceTo(direction)).toBeLessThan(1e-14);
  for (const point of points) { const screen = new Vector3(...point).project(camera); expect(Math.abs(screen.x)).toBeLessThan(1); expect(Math.abs(screen.y)).toBeLessThan(1); expect(Math.abs(screen.z)).toBeLessThan(1); }
  focusCamera(camera, controls, [[0.2, 0.1, 0]]); expect(camera.position.distanceTo(target)).toBeGreaterThan(0.002);
  expect(new Vector3(0.2, 0.1, 0).project(camera).length()).toBeLessThan(1);
  // Ignores empty or non-finite points without throwing
  const posBefore = camera.position.clone();
  focusCamera(camera, controls, []);
  expect(camera.position).toEqual(posBefore);
  focusCamera(camera, controls, [[NaN, 0, 0]]);
  expect(camera.position).toEqual(posBefore);
});
