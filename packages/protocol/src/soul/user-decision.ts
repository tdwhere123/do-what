import { z } from 'zod';
import { FormationKindSchema } from './memory-cue.js';

export const UserDecisionTypeSchema = z.enum([
  'accept',
  'reject',
  'modify',
  'supersede',
]);

export const UserDecisionContextSnapshotSchema = z.object({
  workspace_id: z.string(),
  run_id: z.string().optional(),
  cue_gist: z.string(),
  formation_kind: FormationKindSchema,
}).passthrough();

export const UserDecisionSchema = z.object({
  decision_id: z.string(),
  timestamp: z.string().datetime(),
  decision_type: UserDecisionTypeSchema,
  linked_memory_id: z.string(),
  linked_capsule_id: z.string().optional(),
  claim_draft_id: z.string().optional(),
  user_note: z.string().max(500).optional(),
  context_snapshot: UserDecisionContextSnapshotSchema,
}).passthrough();

export const UserDecisionFilterSchema = z.object({
  decision_type: UserDecisionTypeSchema.optional(),
  linked_memory_id: z.string().optional(),
  since: z.string().datetime().optional(),
}).passthrough();

export type UserDecisionType = z.infer<typeof UserDecisionTypeSchema>;
export type UserDecisionContextSnapshot = z.infer<typeof UserDecisionContextSnapshotSchema>;
export type UserDecision = z.infer<typeof UserDecisionSchema>;
export type UserDecisionFilter = z.infer<typeof UserDecisionFilterSchema>;
