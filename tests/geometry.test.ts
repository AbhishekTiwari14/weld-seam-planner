import { describe, expect, it } from 'vitest';
import type { SourceUnit, Vec3 } from '../src/domain/contracts';
import {
  coincidenceToleranceMm, createViewTransform, sourceToWorkpiece, viewToWorkpiece,
  workpieceToSource, workpieceToView,
} from '../src/geometry/coordinates';
import { distanceMm, measurePath, nominalArcOnTimeSeconds, turnAngleDeg } from '../src/geometry/path';

describe('units and workpiece/view frames', () => {
  it.each<[SourceUnit, number]>([['mm', 25.4], ['cm', 2.54], ['m', 0.0254], ['in', 1]])(
    'normalizes %s without changing axes or origin', (unit, value) => {
      const point = sourceToWorkpiece([value, -value, 0], unit);
      expect(point[0]).toBeCloseTo(25.4, 12);
      expect(point[1]).toBeCloseTo(-25.4, 12);
      expect(workpieceToSource(point, unit)[0]).toBeCloseTo(value, 12);
    },
  );

  it.each([0, -1_000, 1_000_000_000])('round trips at offset %s with a stable local frame', (offset) => {
    const transform = createViewTransform({ min: [offset, -10, 0], max: [offset + 100, 10, 100] });
    const point: Vec3 = [offset + 0.125, -5, 35];
    const local = workpieceToView(point, transform);
    expect(local.every((value) => Math.abs(value) <= 1)).toBe(true);
    viewToWorkpiece(local, transform).forEach((value, axis) => {
      const tolerance = Math.max(1e-12, 4 * Number.EPSILON * Math.abs(point[axis]!));
      expect(Math.abs(value - point[axis]!)).toBeLessThanOrEqual(tolerance);
    });
  });

  it('does not mistake Float32 promotion for preserved source precision', () => {
    const source = 1_000_000_000.125;
    expect(source - 1_000_000_000).toBe(0.125);
    expect(Number(Math.fround(source))).not.toBe(source);
    expect(Math.fround(source - 1_000_000_000)).toBe(0.125);
  });

  it('uses an extent-based tolerance, independent of origin', () => {
    const a = createViewTransform({ min: [0, 0, 0], max: [100, 100, 100] });
    const b = createViewTransform({ min: [1e9, 0, 0], max: [1e9 + 100, 100, 100] });
    expect(coincidenceToleranceMm(a.scaleMm)).toBe(coincidenceToleranceMm(b.scaleMm));
    expect(coincidenceToleranceMm(a.scaleMm)).toBe(1e-6);
  });

  it('rejects unusable transforms and normalization overflow', () => {
    expect(() => createViewTransform({ min: [0, 0, 0], max: [0, 0, 0] })).toThrow(RangeError);
    expect(() => createViewTransform({ min: [1, 0, 0], max: [0, 1, 1] })).toThrow(RangeError);
    expect(() => sourceToWorkpiece([Number.MAX_VALUE, 0, 0], 'm')).toThrow(RangeError);
    expect(() => viewToWorkpiece([0, 0, 0], { centerMm: [0, 0, 0], scaleMm: 0 })).toThrow(RangeError);
  });
});

describe('path measurements', () => {
  it('measures a 3-4-5 segment and a known polyline', () => {
    expect(distanceMm([0, 0, 0], [3, 4, 0])).toBe(5);
    const metrics = measurePath([[0, 0, 0], [10, 0, 0], [10, 0.5, 0]]);
    expect(metrics).toEqual({ segmentLengthsMm: [10, 0.5], lengthMm: 10.5, turnAnglesDeg: [null, 90, null] });
    expect(nominalArcOnTimeSeconds(metrics.lengthMm, 5)).toBe(2.1);
  });

  it.each<[Vec3, number]>([[[2, 0, 0], 0], [[1, 1, 0], 90], [[0, 0, 0], 180]])(
    'measures turn towards %s', (end, expected) => {
      expect(turnAngleDeg([0, 0, 0], [1, 0, 0], end)).toBe(expected);
    },
  );

  it('does not close paths implicitly and keeps length on reversal', () => {
    const points: Vec3[] = [[0, 0, 0], [3, 0, 0], [3, 4, 0]];
    expect(measurePath(points).lengthMm).toBe(7);
    expect(measurePath([...points].reverse()).lengthMm).toBe(7);
    expect(measurePath([...points, points[0]!]).lengthMm).toBe(12);
  });

  it('does not assign an angle to a coincident segment', () => {
    expect(turnAngleDeg([0, 0, 0], [0, 0, 0], [1, 0, 0])).toBeNull();
  });

  it('handles large finite directions without overflowing dot/cross products', () => {
    expect(turnAngleDeg([-1e200, 0, 0], [0, 0, 0], [0, 1e200, 0])).toBe(90);
  });

  it('reports unavailable time and rejects invalid or overflowing durations', () => {
    expect(nominalArcOnTimeSeconds(100, 5)).toBe(20);
    expect(nominalArcOnTimeSeconds(100, null)).toBeNull();
    for (const speed of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
      expect(() => nominalArcOnTimeSeconds(100, speed)).toThrow(RangeError);
    }
  });

  it('rejects non-finite geometry and overflowing distances', () => {
    expect(() => measurePath([[NaN, 0, 0], [1, 0, 0]])).toThrow(RangeError);
    expect(() => distanceMm([-Number.MAX_VALUE, 0, 0], [Number.MAX_VALUE, 0, 0])).toThrow(RangeError);
  });
});
