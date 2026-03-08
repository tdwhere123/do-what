import { z } from 'zod';
import { CoreFocusSurfaceSchema } from './focus-surface.js';
import { DriftKindSchema } from './drift.js';

export const ConflictKindSchema = z.enum([
  'path_overlap',
  'schema_conflict',
  'migration_conflict',
]);

export const ConflictResolutionSchema = z.enum(['serialize', 'allow_soft', 'block']);

export const ConflictConclusionSchema = z
  .object({
    conflicting_surface_ids: z.array(z.string().min(1)),
    conflict_kind: ConflictKindSchema,
    resolution: ConflictResolutionSchema,
  })
  .passthrough();

export const InvalidationTriggerSchema = z.enum([
  'main_commit',
  'schema_change',
  'migration_added',
]);

export const InvalidationConditionSchema = z
  .object({
    trigger: InvalidationTriggerSchema,
    affected_paths: z.array(z.string().min(1)),
  })
  .passthrough();

export const GovernanceLeaseStatusSchema = z.enum([
  'active',
  'invalidated',
  'expired',
  'released',
]);

export const GovernanceLeaseSchema = z
  .object({
    lease_id: z.string().min(1),
    run_id: z.string().min(1),
    workspace_id: z.string().min(1),
    surface_id: z.string().min(1),
    valid_snapshot: CoreFocusSurfaceSchema,
    conflict_conclusions: z.array(ConflictConclusionSchema),
    invalidation_conditions: z.array(InvalidationConditionSchema),
    issued_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    status: GovernanceLeaseStatusSchema,
  })
  .passthrough();

export const SurfaceReportStatusSchema = z.enum([
  'aligned',
  'shadowed',
  'conflicting',
]);

export const SurfaceStatusSchema = z
  .object({
    surface_id: z.string().min(1),
    run_id: z.string().min(1),
    status: SurfaceReportStatusSchema,
    lease_id: z.string().min(1).optional(),
    drift_kind: DriftKindSchema.optional(),
  })
  .passthrough();

export const NativeSurfaceReportSchema = z
  .object({
    report_id: z.string().min(1),
    workspace_id: z.string().min(1),
    generated_at: z.string().datetime(),
    surfaces: z.array(SurfaceStatusSchema),
  })
  .passthrough();

export type ConflictKind = z.infer<typeof ConflictKindSchema>;
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;
export type ConflictConclusion = z.infer<typeof ConflictConclusionSchema>;
export type InvalidationTrigger = z.infer<typeof InvalidationTriggerSchema>;
export type InvalidationCondition = z.infer<typeof InvalidationConditionSchema>;
export type GovernanceLeaseStatus = z.infer<typeof GovernanceLeaseStatusSchema>;
export type GovernanceLease = z.infer<typeof GovernanceLeaseSchema>;
export type SurfaceReportStatus = z.infer<typeof SurfaceReportStatusSchema>;
export type SurfaceStatus = z.infer<typeof SurfaceStatusSchema>;
export type NativeSurfaceReport = z.infer<typeof NativeSurfaceReportSchema>;
