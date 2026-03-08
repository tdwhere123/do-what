import { z } from 'zod';

export const DriftKindSchema = z.enum(['ignore', 'soft_stale', 'hard_stale']);

export const DriftAssessmentSchema = z
  .object({
    drift_kind: DriftKindSchema,
    overlapping_files: z.array(z.string().min(1)),
    assessment_reason: z.string().min(1),
  })
  .passthrough();

export const MergeDecisionSchema = z
  .object({
    allowed: z.boolean(),
    reason: z.enum([
      'no_drift',
      'soft_stale_ok',
      'hard_stale_reconcile',
      'hard_stale_serialize',
      'already_reconciled',
    ]),
    reconcile_count: z.number().int().nonnegative(),
  })
  .passthrough();

export type DriftKind = z.infer<typeof DriftKindSchema>;
export type DriftAssessment = z.infer<typeof DriftAssessmentSchema>;
export type MergeDecision = z.infer<typeof MergeDecisionSchema>;
