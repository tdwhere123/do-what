import { z } from 'zod';

import { BaseEventSchema } from './base.js';

export const EngineTokenStreamEventSchema = BaseEventSchema.extend({
  type: z.literal('token_stream'),
  text: z.string(),
  isComplete: z.boolean(),
}).passthrough();

export const EnginePlanNodeEventSchema = BaseEventSchema.extend({
  type: z.literal('plan_node'),
  nodeId: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'active', 'done', 'failed']),
}).passthrough();

export const EngineDiffEventSchema = BaseEventSchema.extend({
  type: z.literal('diff'),
  path: z.string(),
  patch: z.string(),
  hunks: z.number().int().nonnegative(),
}).passthrough();

export const EngineOutputEventSchema = z.discriminatedUnion('type', [
  EngineTokenStreamEventSchema,
  EnginePlanNodeEventSchema,
  EngineDiffEventSchema,
]);

export type EngineTokenStreamEvent = z.infer<typeof EngineTokenStreamEventSchema>;
export type EnginePlanNodeEvent = z.infer<typeof EnginePlanNodeEventSchema>;
export type EngineDiffEvent = z.infer<typeof EngineDiffEventSchema>;
export type EngineOutputEvent = z.infer<typeof EngineOutputEventSchema>;
