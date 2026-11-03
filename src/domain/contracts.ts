import { z } from 'zod';

export const LIMITS = { seams: 100, pointsPerSeam: 1_000, totalPoints: 10_000 } as const;
// Tested-support target, not a parser safety limit or an export restriction.
export const GUARANTEED_IMPORT_ENVELOPE = { triangles: 500_000, bytes: 50 * 1024 ** 2 } as const;
export const PROCESS_PROFILE = 'generic-arc-targets-v1' as const;
export const idSchema = z.uuid();
export const finiteSchema = z.number().finite();
export const positiveSchema = finiteSchema.positive();
export const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const vec3Schema = z.tuple([finiteSchema, finiteSchema, finiteSchema]);
export const sourceUnitSchema = z.enum(['mm', 'cm', 'm', 'in']);

export const frameSchema = z.strictObject({
  id: z.literal('workpiece'),
  lengthUnit: z.literal('mm'),
  axes: z.literal('source_xyz'),
  origin: z.literal('source_origin'),
  handedness: z.literal('right'),
});

export const WORKPIECE_FRAME = frameSchema.parse({
  id: 'workpiece', lengthUnit: 'mm', axes: 'source_xyz', origin: 'source_origin', handedness: 'right',
});

export const boundsSchema = z.strictObject({ min: vec3Schema, max: vec3Schema });
export const workpieceSchema = z.strictObject({
  id: idSchema,
  source: z.strictObject({
    filename: z.string().min(1).max(255).regex(/^[^/\\\u0000-\u001f]+$/),
    byteLength: countSchema.min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    encoding: z.enum(['ascii', 'binary']),
    unit: sourceUnitSchema,
    inputTriangles: countSchema.min(1),
    omittedDegenerateTriangles: countSchema,
  }),
  frame: frameSchema,
  boundsMm: boundsSchema,
});

export const parametersSchema = z.strictObject({
  travelSpeedMmPerS: positiveSchema.nullable(),
  currentTargetA: positiveSchema.nullable(),
  voltageTargetV: positiveSchema.nullable(),
});
export const completeParametersSchema = z.strictObject({
  travelSpeedMmPerS: positiveSchema,
  currentTargetA: positiveSchema,
  voltageTargetV: positiveSchema,
});
export const pointSchema = z.strictObject({ id: idSchema, positionMm: vec3Schema });
export const geometrySchema = z.strictObject({
  type: z.literal('polyline'),
  points: z.array(pointSchema).min(2).max(LIMITS.pointsPerSeam),
});
export const seamSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(80),
  geometry: geometrySchema,
  parameters: parametersSchema,
});
export const planningContentSchema = z.strictObject({
  workpiece: workpieceSchema,
  processProfile: z.literal(PROCESS_PROFILE),
  seamsById: z.record(idSchema, seamSchema),
  sequence: z.array(idSchema).max(LIMITS.seams),
});
export const planningDocumentSchema = z.strictObject({
  jobId: idSchema,
  revision: countSchema,
  content: planningContentSchema,
});

export type Vec3 = z.infer<typeof vec3Schema>;
export type SourceUnit = z.infer<typeof sourceUnitSchema>;
export type Bounds = z.infer<typeof boundsSchema>;
export type Workpiece = z.infer<typeof workpieceSchema>;
export type PathPoint = z.infer<typeof pointSchema>;
export type WeldingParameters = z.infer<typeof parametersSchema>;
export type Seam = z.infer<typeof seamSchema>;
export type PlanningDocument = z.infer<typeof planningDocumentSchema>;

export function emptyParameters(): WeldingParameters {
  return { travelSpeedMmPerS: null, currentTargetA: null, voltageTargetV: null };
}
