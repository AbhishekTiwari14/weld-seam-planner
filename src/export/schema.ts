import { z } from 'zod';
import { completeParametersSchema, countSchema, finiteSchema, idSchema, LIMITS,
  PROCESS_PROFILE, seamSchema, workpieceSchema } from '../domain/contracts.ts';

export const SCHEMA_VERSION = '1.0.0' as const;
export const RULESET_VERSION = '1.0.0' as const;
export const NOT_ASSESSED = [
  'surface_conformance', 'process_suitability', 'torch_orientation',
  'workpiece_to_robot_registration', 'robot_kinematics', 'collision_avoidance',
  'motion_timing', 'inter_seam_transfers',
] as const;

export const warningSchema = z.discriminatedUnion('code', [
  z.strictObject({ code: z.literal('TURN_ANGLE_HIGH'), seamId: idSchema, pointId: idSchema,
    valueDeg: finiteSchema.min(0).max(180) }),
  z.strictObject({ code: z.literal('SHORT_SEGMENT'), seamId: idSchema, startPointId: idSchema,
    endPointId: idSchema, valueMm: finiteSchema.positive() }),
  z.strictObject({ code: z.literal('DEGENERATE_TRIANGLES_OMITTED'), count: countSchema.min(1) }),
]);

/** Structural schema only. Cross-field and geometric rules live in job.ts/planning.ts. */
export const weldJobSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  kind: z.literal('weld-plan'),
  jobId: idSchema,
  revision: countSchema,
  workpiece: workpieceSchema,
  processProfile: z.literal(PROCESS_PROFILE),
  seams: z.array(seamSchema.extend({ parameters: completeParametersSchema })).min(1).max(LIMITS.seams),
  sequence: z.array(idSchema).min(1).max(LIMITS.seams),
  review: z.strictObject({
    rulesetVersion: z.literal(RULESET_VERSION),
    warnings: z.array(warningSchema).max(20_000),
    notAssessed: z.tuple([
      z.literal(NOT_ASSESSED[0]), z.literal(NOT_ASSESSED[1]),
      z.literal(NOT_ASSESSED[2]), z.literal(NOT_ASSESSED[3]),
      z.literal(NOT_ASSESSED[4]), z.literal(NOT_ASSESSED[5]),
      z.literal(NOT_ASSESSED[6]), z.literal(NOT_ASSESSED[7]),
    ]),
  }),
});

export type WeldJob = z.infer<typeof weldJobSchema>;
export type ExportWarning = z.infer<typeof warningSchema>;

export function weldJobJsonSchema() {
  return { ...z.toJSONSchema(weldJobSchema, { target: 'draft-2020-12' }),
    $id: 'urn:weld-seam-planner:weld-job:1.0.0',
    title: 'Controller-neutral weld plan v1',
    description: 'Structural validation only; also apply the documented semantic rules. Not a robot trajectory.',
  };
}
