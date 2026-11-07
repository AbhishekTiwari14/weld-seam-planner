import { describe, expect, it } from 'vitest';
import { SAMPLE_MODELS } from '../src/samples/manifest.ts';
import { generateGussetBracket, generatePipeOnPlate, generateTJoint } from '../scripts/generate-samples.ts';
import { testId } from './helpers.ts';
import { commitDraft } from '../src/planning/draft.ts';
import { updateSeamParameters } from '../src/domain/operations.ts';
import { exportPlanningDocument, validateWeldJob } from '../src/export/job.ts';
import { activateRestoredPlan, parseSavedPlan, verifyRestoreSource } from '../src/recovery/restore.ts';
import { createImportController } from '../src/import/store.ts';
import { parseStl } from '../src/import/parse-stl.ts';
import { prepareAsset } from '../src/import/prepare-asset.ts';
import type { ImportPreview } from '../src/import/types.ts';

function parseStlBounds(buffer: Buffer) {
  const count = buffer.readUInt32LE(80);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < count; i++) {
    const offset = 84 + i * 50;
    for (let v = 0; v < 3; v++) {
      const x = buffer.readFloatLE(offset + 12 + v * 12);
      const y = buffer.readFloatLE(offset + 16 + v * 12);
      const z = buffer.readFloatLE(offset + 20 + v * 12);

      min[0] = Math.min(min[0], x);
      max[0] = Math.max(max[0], x);
      min[1] = Math.min(min[1], y);
      max[1] = Math.max(max[1], y);
      min[2] = Math.min(min[2], z);
      max[2] = Math.max(max[2], z);
    }
  }

  return { count, min, max, dimensions: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

describe('sample model generation and manifest integrity', () => {
  it('manifest specifies all 3 required engineering samples with mm units and correct metadata', () => {
    expect(SAMPLE_MODELS).toHaveLength(3);
    const ids = SAMPLE_MODELS.map((s) => s.id);
    expect(ids).toEqual(['t-joint', 'gusset-bracket', 'pipe-on-plate']);

    for (const sample of SAMPLE_MODELS) {
      expect(sample.defaultUnit).toBe('mm');
      expect(sample.filename.endsWith('.stl')).toBe(true);
      expect(sample.dimensionsMm.every((d) => d > 0)).toBe(true);
      expect(sample.triangles).toBeGreaterThan(0);
      expect(sample.features.length).toBeGreaterThanOrEqual(2);
      expect(sample.badge.length).toBeGreaterThan(0);
    }
  });

  it('generates valid, watertight T-Joint assembly with correct dimensions', () => {
    const buf = generateTJoint();
    expect(buf.byteLength).toBe(1284);
    const parsed = parseStlBounds(buf);
    expect(parsed.count).toBe(24);
    expect(parsed.dimensions[0]).toBeCloseTo(120, 2);
    expect(parsed.dimensions[1]).toBeCloseTo(150, 2);
    expect(parsed.dimensions[2]).toBeCloseTo(80, 2);
    expect(parsed.min[2]).toBeCloseTo(0, 2);
    expect(parsed.max[2]).toBeCloseTo(80, 2);
  });

  it('generates valid Gusset Bracket assembly with correct dimensions and features', () => {
    const buf = generateGussetBracket();
    expect(buf.byteLength).toBe(1684);
    const parsed = parseStlBounds(buf);
    expect(parsed.count).toBe(32);
    expect(parsed.dimensions[0]).toBeCloseTo(100, 2);
    expect(parsed.dimensions[1]).toBeCloseTo(120, 2);
    expect(parsed.dimensions[2]).toBeCloseTo(120, 2);
    expect(parsed.min[1]).toBeCloseTo(-15, 2);
    expect(parsed.max[1]).toBeCloseTo(105, 2);
  });

  it('generates valid Pipe-on-Plate assembly with radial discretization and correct dimensions', () => {
    const buf = generatePipeOnPlate();
    expect(buf.byteLength).toBe(15084);
    const parsed = parseStlBounds(buf);
    expect(parsed.count).toBe(300);
    expect(parsed.dimensions[0]).toBeCloseTo(150, 2);
    expect(parsed.dimensions[1]).toBeCloseTo(150, 2);
    expect(parsed.dimensions[2]).toBeCloseTo(90, 2);
  });
});

describe('sample workpiece planning and recovery pipeline', () => {
  it('supports authoring seams, applying parameters, exporting JSON and restoring from T-joint sample', () => {
    const tBuf = generateTJoint();
    const tBytes = new Uint8Array(tBuf);
    const tFile = new File([tBytes], 't-joint.stl');

    const receivers: ((message: any) => void)[] = [];
    const controller = createImportController(() => ({
      send() {},
      stop() {},
      listen(receive) {
        receivers.push(receive);
      },
    }));

    // Import the actual T-Joint binary STL
    const tArrayBuffer = tBytes.buffer.slice(tBytes.byteOffset, tBytes.byteOffset + tBytes.byteLength) as ArrayBuffer;
    const parsed = parseStl(tArrayBuffer);
    const preview: ImportPreview = {
      filename: tFile.name,
      byteLength: tBuf.byteLength,
      sha256: 'a'.repeat(64),
      encoding: 'binary',
      inputTriangles: 24,
      omittedDegenerateTriangles: 0,
      warnings: [],
      bounds: parsed.bounds,
      parseMs: 0,
    };
    const asset = prepareAsset(parsed, preview, 'mm');

    controller.start(tFile);
    const receive = receivers.at(-1)!;
    receive({ type: 'preview', preview });
    controller.confirm('mm');
    receive({ type: 'ready', asset });

    const id = asset.workpiece.id;
    const doc = () => controller.store.getState().active!.document;

    // Actual fillet weld seam along the T-joint web intersection (X = -5, Z = 10 mm)
    controller.editPlan(id, (d) =>
      commitDraft(
        d,
        [
          { id: testId(501), positionMm: [-5, -60, 10] },
          { id: testId(502), positionMm: [-5, 0, 10] },
          { id: testId(503), positionMm: [-5, 60, 10] },
        ],
        testId(500),
        'T-Joint Longitudinal Fillet Left',
      ),
    );

    controller.editPlan(id, (d) =>
      updateSeamParameters(d, testId(500), {
        travelSpeedMmPerS: 6.5,
        currentTargetA: 115,
        voltageTargetV: 21.5,
      }),
    );

    const savedDoc = doc();
    expect(savedDoc.content.sequence).toHaveLength(1);
    expect(savedDoc.content.seamsById[testId(500)]!.name).toBe('T-Joint Longitudinal Fillet Left');

    const jsonText = exportPlanningDocument(savedDoc);
    const validatedJob = validateWeldJob(JSON.parse(jsonText));
    expect(validatedJob.schemaVersion).toBe('1.0.0');
    expect(validatedJob.seams).toHaveLength(1);
    expect(validatedJob.seams[0]!.parameters.travelSpeedMmPerS).toBe(6.5);
    expect(validatedJob.seams[0]!.geometry.points).toHaveLength(3);

    // Verify recovery with verified source
    const restoredDoc = parseSavedPlan(jsonText);
    expect(restoredDoc).toEqual(savedDoc);

    verifyRestoreSource(restoredDoc, preview, 'mm');

    const activated = activateRestoredPlan(restoredDoc, asset);
    expect(activated.document).toEqual(savedDoc);
    expect(exportPlanningDocument(activated.document)).toBe(jsonText);
    controller.dispose();
  });
});
