import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
