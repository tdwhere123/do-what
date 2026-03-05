import { z } from 'zod';

import { CueRefSchema } from '../types/cue.js';
import { BaseEventSchema } from './base.js';

export const MemorySearchEventSchema = BaseEventSchema.extend({
  operation: z.literal('search'),
  query: z.string(),
  results: z.array(CueRefSchema),
  budgetUsed: z.number().nonnegative().optional(),
}).passthrough();

export const MemoryOpenEventSchema = BaseEventSchema.extend({
  operation: z.literal('open'),
  pointer: z.string(),
  level: z.enum(['hint', 'excerpt', 'full']),
  tokensUsed: z.number().nonnegative(),
}).passthrough();

export const MemoryProposeEventSchema = BaseEventSchema.extend({
  operation: z.literal('propose'),
  proposalId: z.string(),
  cueDraft: z.record(z.unknown()),
  requiresCheckpoint: z.boolean(),
}).passthrough();

export const MemoryCommitEventSchema = BaseEventSchema.extend({
  operation: z.literal('commit'),
  proposalId: z.string(),
  cueId: z.string().optional(),
  commitSha: z.string().optional(),
}).passthrough();

export const MemoryOperationEventSchema = z.discriminatedUnion('operation', [
  MemorySearchEventSchema,
  MemoryOpenEventSchema,
  MemoryProposeEventSchema,
  MemoryCommitEventSchema,
]);

export type MemorySearchEvent = z.infer<typeof MemorySearchEventSchema>;
export type MemoryOpenEvent = z.infer<typeof MemoryOpenEventSchema>;
export type MemoryProposeEvent = z.infer<typeof MemoryProposeEventSchema>;
export type MemoryCommitEvent = z.infer<typeof MemoryCommitEventSchema>;
export type MemoryOperationEvent = z.infer<typeof MemoryOperationEventSchema>;
