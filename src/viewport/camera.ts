import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../domain/contracts.ts';

/** Tight clipping around the normalized workpiece improves depth precision, including after pan. */
export function updateClipping(camera: PerspectiveCamera): void {
  camera.updateMatrixWorld();
  const depth = -new Vector3().applyMatrix4(camera.matrixWorldInverse).z;
  camera.near = Math.max(1e-6, depth - 0.6);
  camera.far = Math.max(1, depth + 0.6);
  camera.updateProjectionMatrix();
}

export function fitCamera(camera: PerspectiveCamera, controls: OrbitControls, reset: boolean): void {
  const direction = reset ? new Vector3(1.2, -1.6, 1.1).normalize() : camera.position.clone().sub(controls.target).normalize();
  const vertical = camera.fov * Math.PI / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = 0.5 / Math.sin(Math.min(vertical, horizontal) / 2) * 1.12;
  camera.up.set(0, 0, 1);
  camera.near = 0.0001;
  camera.far = 5_000;
  camera.position.copy(direction.multiplyScalar(distance));
  controls.target.set(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.update();
}

/** View-space framing only. A point gets a practical minimum inspection radius. */
export function focusCamera(camera: PerspectiveCamera, controls: OrbitControls, points: readonly Vec3[]): void {
  if (!points.length || points.some((point) => point.some((value) => !Number.isFinite(value)))) return;
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const point of points) { min.min(new Vector3(...point)); max.max(new Vector3(...point)); }
  const center = min.add(max).multiplyScalar(0.5);
  let radius = 0.015;
  for (const point of points) radius = Math.max(radius, center.distanceTo(new Vector3(...point)));
  const angle = Math.min(camera.fov * Math.PI / 180, 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (direction.lengthSq() === 0) direction.set(1.2, -1.6, 1.1).normalize();
  camera.position.copy(center).addScaledVector(direction, radius * 1.12 / Math.sin(angle / 2));
  controls.target.copy(center); controls.update(); updateClipping(camera);
}
