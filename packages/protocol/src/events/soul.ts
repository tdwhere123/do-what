import { z } from 'zod';
import { BaseEventSchema } from './base.js';

export const RunCheckpointEventSchema = BaseEventSchema.extend({
  event: z.literal('run_checkpoint'),
  checkpointId: z.string().optional(),
  projectId: z.string().optional(),
}).passthrough();

export const MemoryCueAcceptedEventSchema = BaseEventSchema.extend({
  event: z.literal('memory_cue_accepted'),
  cueId: z.string(),
  projectId: z.string().optional(),
  proposalId: z.string().optional(),
  claimDraftId: z.string().optional(),
  impactLevel: z.enum(['working', 'consolidated', 'canon']).optional(),
  resolver: z.enum(['auto', 'user', 'checkpoint']).optional(),
}).passthrough();

export const MemoryCueRejectedEventSchema = BaseEventSchema.extend({
  event: z.literal('memory_cue_rejected'),
  cueId: z.string().optional(),
  projectId: z.string().optional(),
  proposalId: z.string(),
  reason: z.string().optional(),
  resolver: z.enum(['auto', 'user', 'checkpoint']).optional(),
}).passthrough();

export const ContextCueUsedEventSchema = BaseEventSchema.extend({
  event: z.literal('context_cue_used'),
  cueId: z.string(),
  projectId: z.string().optional(),
  trigger: z.enum(['hint', 'excerpt', 'full']),
}).passthrough();

export const ClaimSupersededEventSchema = BaseEventSchema.extend({
  event: z.literal('claim_superseded'),
  cueId: z.string(),
  draftId: z.string(),
  supersededByDraftId: z.string().optional(),
}).passthrough();

export const MemoryCueModifiedEventSchema = BaseEventSchema.extend({
  event: z.literal('memory_cue_modified'),
  cueId: z.string(),
  projectId: z.string().optional(),
  changedFields: z.array(z.string()).default([]),
}).passthrough();

export const SoulEventSchema = z.discriminatedUnion('event', [
  RunCheckpointEventSchema,
  MemoryCueAcceptedEventSchema,
  MemoryCueRejectedEventSchema,
  ContextCueUsedEventSchema,
  ClaimSupersededEventSchema,
  MemoryCueModifiedEventSchema,
]);

export type RunCheckpointEvent = z.infer<typeof RunCheckpointEventSchema>;
export type MemoryCueAcceptedEvent = z.infer<typeof MemoryCueAcceptedEventSchema>;
export type MemoryCueRejectedEvent = z.infer<typeof MemoryCueRejectedEventSchema>;
export type ContextCueUsedEvent = z.infer<typeof ContextCueUsedEventSchema>;
export type ClaimSupersededEvent = z.infer<typeof ClaimSupersededEventSchema>;
export type MemoryCueModifiedEvent = z.infer<typeof MemoryCueModifiedEventSchema>;
export type SoulEvent = z.infer<typeof SoulEventSchema>;
