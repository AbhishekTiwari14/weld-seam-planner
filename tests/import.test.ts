import { describe, expect, it, vi } from 'vitest';
import { parseStl } from '../src/import/parse-stl.ts';
import { prepareAsset } from '../src/import/prepare-asset.ts';
import { sourceToWorkpiece, viewToWorkpiece } from '../src/geometry/coordinates.ts';
import { createImportController, type ImportPort } from '../src/import/store.ts';
import type { ImportPreview, WorkerResponse } from '../src/import/types.ts';
import type { SourceUnit } from '../src/domain/contracts.ts';
import { analyticTriangles, asciiStl, binaryStl } from './helpers/stl.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
function sample(text = asciiStl(analyticTriangles), unit: SourceUnit = 'mm') {
  const buffer = bytes(text);
  const parsed = parseStl(buffer);
  const preview: ImportPreview = { filename: 'analytic.stl', byteLength: buffer.byteLength, sha256: 'a'.repeat(64),
    encoding: parsed.encoding, inputTriangles: parsed.inputTriangles, omittedDegenerateTriangles: parsed.omittedDegenerateTriangles,
    bounds: parsed.bounds, warnings: [], parseMs: 0 };
  return { preview, asset: prepareAsset(parsed, preview, unit) };
}

describe('STL content and geometry validation', () => {
  it('reads analytic ASCII with negative coordinates, open surfaces, and known bounds', () => {
    const { asset } = sample();
    expect(asset.workpiece.boundsMm).toEqual({ min: [-10, -20, 5], max: [30, 40, 5] });
    expect(asset.positionsMm.length).toBe(18);
  });
  it.each(['analytic', 'solid misleading header'])('reads canonical binary even when header is %s', (header) => {
    const parsed = parseStl(binaryStl(2, header));
    expect(parsed.encoding).toBe('binary');
    expect(parsed.inputTriangles).toBe(2);
    expect(Array.from(parsed.positions.slice(0, 9))).toEqual(analyticTriangles[0]!.flat());
  });
  it('allows multiple disconnected solids and inconsistent winding', () => {
    const parsed = parseStl(bytes(asciiStl(analyticTriangles) + asciiStl([[[100, 0, 0], [100, 1, 0], [101, 0, 0]]])));
    expect(parsed.inputTriangles).toBe(3);
    expect(parsed.bounds.max).toEqual([101, 40, 5]);
  });
  it('accepts a non-manifold edge without claiming topological repair', () => {
    const parsed = parseStl(bytes(asciiStl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[0, 0, 0], [1, 0, 0], [0, -1, 0]], [[0, 0, 0], [1, 0, 0], [0, 0, 1]]])));
    expect(parsed.inputTriangles).toBe(3);
    expect(parsed.omittedDegenerateTriangles).toBe(0);
  });
  it('omits exactly zero-area triangles, preserving thin usable triangles', () => {
    const parsed = parseStl(bytes(asciiStl([...analyticTriangles,
      [[1, 1, 1], [1, 1, 1], [1, 1, 1]], [[0, 0, 0], [1, 0, 0], [0, 1e-15, 0]]])));
    expect(parsed.omittedDegenerateTriangles).toBe(1);
    expect(parsed.positions.length).toBe(27);
  });
  it.each(['', 'not an STL', 'solid empty\nendsolid empty', 'solid truncated\nfacet normal 0 0 1',
    asciiStl(analyticTriangles).replace('vertex -10', 'vertex NaN'),
    asciiStl(analyticTriangles).replace('vertex -10', 'vertex 1e999'),
    asciiStl(analyticTriangles).replace('vertex -10', 'vertex 0x10'),
    asciiStl(analyticTriangles).replace('endloop', ''),
    asciiStl(analyticTriangles).replace('endsolid analytic', ''),
    asciiStl([[[0, 0, 0], [1, 1, 1], [2, 2, 2]]]),
  ])('rejects empty, malformed, or unusable text %#', (text) => expect(() => parseStl(bytes(text))).toThrow());
  it('rejects truncated binary, trailing bytes, and nonfinite binary data', () => {
    const valid = binaryStl(1);
    expect(() => parseStl(valid.slice(0, -1))).toThrow();
    const trailing = new Uint8Array(valid.byteLength + 1); trailing.set(new Uint8Array(valid));
    expect(() => parseStl(trailing.buffer)).toThrow(/trailing/);
    new DataView(valid).setFloat32(96, Infinity, true);
    expect(() => parseStl(valid)).toThrow(/non-finite/);
  });
  it('rejects excessive declared counts before allocating geometry', () => {
    const header = new ArrayBuffer(84); new DataView(header).setUint32(80, 0xffffffff, true);
    expect(() => parseStl(header)).toThrow();
  });
});

describe('authoritative coordinates and display precision', () => {
  it.each<SourceUnit>(['mm', 'cm', 'm', 'in'])('normalizes %s without changing source axes or origin', (unit) => {
    const { asset } = sample(undefined, unit);
    expect(Array.from(asset.positionsMm.slice(0, 3))).toEqual(sourceToWorkpiece([-10, -20, 5], unit));
    const roundTrip = viewToWorkpiece(Array.from(asset.displayPositions.slice(0, 3)), asset.view);
    roundTrip.forEach((n, axis) => expect(n).toBeCloseTo(asset.positionsMm[axis]!, 2));
  });
  it('preserves the offset regression edge before Float32 display conversion', () => {
    const { asset } = sample(asciiStl([[[1e9, -2, 3], [1e9 + 0.125, -2, 3], [1e9, -1.75, 3]]]));
    expect(asset.positionsMm[3]! - asset.positionsMm[0]!).toBe(0.125);
    expect(asset.displayPositions[3]! - asset.displayPositions[0]!).toBeGreaterThan(0.4);
    expect(viewToWorkpiece(Array.from(asset.displayPositions.slice(3, 6)), asset.view)[0]).toBe(1e9 + 0.125);
  });
  it('preserves a rotated model and its negative source origin', () => {
    const { asset } = sample(asciiStl([[[-10, -5, -20], [30, -5, -20], [-10, -5, 40]]]), 'in');
    expect(asset.workpiece.boundsMm.min).toEqual([-254, -127, -508]);
    expect(asset.workpiece.boundsMm.max).toEqual([762, -127, 1016]);
  });
  it.each([1e-12, 1e12])('frames unusual scale %s without rescaling planning geometry', (scale) => {
    const { asset } = sample(asciiStl([[[0, 0, 0], [scale, scale, 0], [-scale, scale, scale]]]));
    expect(asset.workpiece.boundsMm.max).toEqual([scale, scale, scale]);
    expect(Math.max(...asset.displayPositions)).toBeLessThanOrEqual(0.5);
    expect(asset.view.scaleMm).toBeCloseTo(Math.sqrt(6) * scale, scale < 1 ? 20 : -1);
  });
});

describe('atomic import lifecycle', () => {
  function harness() {
    const ports: { receive: (message: WorkerResponse) => void; stopped: boolean }[] = [];
    const controller = createImportController((): ImportPort => {
      const port = { receive: (_message: WorkerResponse) => {}, stopped: false };
      ports.push(port);
      return { send() {}, stop() { port.stopped = true; }, listen(message) { port.receive = message; } };
    });
    return { controller, ports, file: new File(['solid'], 'part.stl') };
  }
  it('requires confirmation, then installs asset and empty document together', () => {
    const { controller, ports, file } = harness();
    const { preview, asset } = sample();
    controller.start(file); ports[0]!.receive({ type: 'preview', preview });
    expect(controller.store.getState().active).toBeNull();
    controller.confirm('mm'); ports[0]!.receive({ type: 'ready', asset });
    expect(controller.store.getState().active?.document.content.workpiece).toEqual(asset.workpiece);
    expect(ports[0]!.stopped).toBe(true);
    controller.dispose();
  });
  it('preserves the old document after failure and ignores late results from cancelled/replaced workers', () => {
    const { controller, ports, file } = harness();
    const { asset, preview } = sample();
    controller.start(file); ports[0]!.receive({ type: 'preview', preview }); controller.confirm('mm'); ports[0]!.receive({ type: 'ready', asset });
    const original = controller.store.getState().active;
    controller.start(file); ports[1]!.receive({ type: 'error', message: 'Malformed file' });
    expect(controller.store.getState().active).toBe(original);
    controller.start(file); controller.start(file);
    ports[2]!.receive({ type: 'ready', asset: sample().asset });
    expect(controller.store.getState().active).toBe(original);
    controller.cancel(); ports[3]!.receive({ type: 'ready', asset: sample().asset });
    expect(controller.store.getState().active).toBe(original);
    expect(ports.every((port) => port.stopped)).toBe(true);
  });
  it('refuses oversized files before worker allocation and rejects unconfirmed completion', () => {
    const { controller, ports, file } = harness();
    const oversized = new File([], 'too-large.stl');
    Object.defineProperty(oversized, 'size', { value: 64 * 1024 ** 2 + 1 });
    controller.start(oversized);
    expect(ports).toHaveLength(0);
    expect(controller.store.getState().error).toContain('safety limit');
    controller.start(file); ports[0]!.receive({ type: 'ready', asset: sample().asset });
    expect(controller.store.getState().active).toBeNull();
    expect(ports[0]!.stopped).toBe(true);
    controller.dispose();
  });
  it('terminates stalled processing while allowing an engineer to leave unit review open', () => {
    vi.useFakeTimers();
    const { controller, ports, file } = harness();
    try {
      controller.start(file); vi.advanceTimersByTime(60_000);
      expect(ports[0]!.stopped).toBe(true);
      expect(controller.store.getState().error).toContain('60 seconds');
      controller.start(file); ports[1]!.receive({ type: 'preview', preview: sample().preview });
      vi.advanceTimersByTime(300_000);
      expect(controller.store.getState().phase).toBe('confirming');
      expect(ports[1]!.stopped).toBe(false);
    } finally { controller.dispose(); vi.useRealTimers(); }
  });
});
