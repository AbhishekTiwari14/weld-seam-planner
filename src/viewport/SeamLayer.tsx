import { useLayoutEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Group, Points, PointsMaterial, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { PathPoint, Seam, Vec3 } from '../domain/contracts.ts';
import { workpieceToView, type ViewTransform } from '../geometry/coordinates.ts';

export function SeamLayer({ seams, selectedId, draft, preview, view, selectable, pointHighlight = null, segmentHighlight = null, editPreview = null }: {
  seams: readonly Seam[]; selectedId: string | null; draft: readonly PathPoint[] | null; preview: Vec3 | null;
  view: ViewTransform; selectable: RefObject<Line2[]>;
  pointHighlight?: Vec3 | null; segmentHighlight?: readonly Vec3[] | null; editPreview?: readonly Vec3[] | null;
}) {
  const { scene, invalidate, size } = useThree();
  useLayoutEffect(() => {
    const group = new Group();
    const resources: { dispose: () => void }[] = [];
    const lines: Line2[] = [];
    const line = (points: number[][], color: string, width: number, seamId?: string) => {
      if (points.length < 2) return;
      const geometry = new LineGeometry().setPositions(points.flat());
      const material = new LineMaterial({ color, linewidth: width, depthTest: false, depthWrite: false, toneMapped: false });
      material.resolution.set(size.width, size.height);
      // A dark casing keeps both light and orange paths legible on shaded faces.
      // Share the geometry; only the material/draw is additional.
      const outlineMaterial = new LineMaterial({ color: '#030500', linewidth: width + 2, depthTest: false, depthWrite: false, toneMapped: false });
      outlineMaterial.resolution.set(size.width, size.height);
      const outline = new Line2(geometry, outlineMaterial); outline.renderOrder = 4;
      const object = new Line2(geometry, material);
      object.renderOrder = 5;
      if (seamId) { object.userData.seamId = seamId; lines.push(object); }
      group.add(outline, object); resources.push(geometry, material, outlineMaterial);
    };
    const markers = (points: number[][], color: string, pixels: number) => {
      if (!points.length) return;
      const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
      const material = new PointsMaterial({ color, size: pixels, sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false });
      const object = new Points(geometry, material); object.renderOrder = 6;
      group.add(object); resources.push(geometry, material);
    };
    for (const seam of seams) {
      const points = seam.geometry.points.map((point) => workpieceToView(point.positionMm, view));
      const selected = seam.id === selectedId;
      line(points, selected ? '#E97F01' : '#DFDFD7', selected ? 3 : 2, seam.id);
      markers([points[0]!], '#F6F6EE', selected ? 9 : 6);
      markers([points.at(-1)!], '#E97F01', selected ? 9 : 6);
      if (selected) {
        const end = new Vector3(...points.at(-1)!);
        const start = new Vector3(...points.at(-2)!);
        const direction = end.clone().sub(start).normalize();
        const length = Math.min(0.018, end.distanceTo(start) * 0.25);
        const tip = start.clone().lerp(end, 0.65);
        const side = new Vector3().crossVectors(direction, new Vector3(0, 0, 1));
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
        side.normalize().multiplyScalar(length * 0.6);
        const base = tip.clone().addScaledVector(direction, -length);
        line([base.clone().add(side).toArray(), tip.toArray(), base.clone().sub(side).toArray()], '#E97F01', 3);
      }
    }
    if (draft !== null) {
      const points = draft.map((point) => workpieceToView(point.positionMm, view));
      line(points, '#E97F01', 3); markers(points, '#E97F01', 7);
      if (preview) {
        const next = workpieceToView(preview, view);
        if (points.length) line([points.at(-1)!, next], '#ABABA5', 1.5);
        markers([next], '#F6F6EE', 6);
      }
    }
    if (segmentHighlight) {
      const points = segmentHighlight.map((point) => workpieceToView(point, view));
      line(points, '#F6F6EE', 6); markers(points, '#F6F6EE', 11);
    }
    if (pointHighlight) {
      const points = [workpieceToView(pointHighlight, view)];
      markers(points, '#030500', 20); markers(points, '#E97F01', 16); markers(points, '#F6F6EE', 8);
    }
    if (editPreview) {
      const points = editPreview.map((point) => workpieceToView(point, view));
      line(points, '#628047', 4); markers(points, '#F6F6EE', 7);
    }
    selectable.current = lines;
    scene.add(group); invalidate();
    return () => { selectable.current = []; scene.remove(group); for (const resource of resources) resource.dispose(); invalidate(); };
  }, [seams, selectedId, draft, preview, view, selectable, pointHighlight, segmentHighlight, editPreview, scene, invalidate, size.width, size.height]);
  return null;
}
