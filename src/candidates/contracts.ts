import { z } from 'zod';
import { finiteSchema, idSchema, LIMITS, vec3Schema } from '../domain/contracts.ts';

export const candidateSchema = z.strictObject({
  candidateId: z.string().min(1).max(200),
  workpieceId: idSchema,
  geometryRevision: z.string().min(1).max(200),
  path: z.array(vec3Schema).min(2).max(LIMITS.pointsPerSeam),
  method: z.strictObject({
    name: z.enum(['feature-paths', 'contact-paths', 'intersection-paths']),
    version: z.string().min(1).max(40),
  }),
  evidence: z.strictObject({
    summary: z.string().min(1).max(1000),
    sourceElementIds: z.array(z.string().min(1)).max(10_000),
    measurements: z.array(z.strictObject({
      name: z.string().min(1), value: finiteSchema, unit: z.enum(['mm', 'deg', 'count']),
    })).max(100),
    limitations: z.array(z.string().min(1)).max(100),
  }),
  review: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('suggested') }),
    z.strictObject({ state: z.literal('rejected') }),
    z.strictObject({ state: z.literal('accepted'), seamId: idSchema }),
  ]),
  // Ranking metadata only. The value is explicitly NOT a calibrated probability.
  heuristicScore: z.strictObject({ value: finiteSchema, definition: z.string().min(1) }).optional(),
});

export type SeamCandidate = z.infer<typeof candidateSchema>;
