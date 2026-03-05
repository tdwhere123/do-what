import { z } from 'zod';

import { BaseEventSchema } from './base.js';

export const ToolRequestedEventSchema = BaseEventSchema.extend({
  status: z.literal('requested'),
  toolName: z.string(),
  args: z.record(z.unknown()),
}).passthrough();

export const ToolApprovedEventSchema = BaseEventSchema.extend({
  status: z.literal('approved'),
  approvedBy: z.enum(['policy', 'user']),
}).passthrough();

export const ToolDeniedEventSchema = BaseEventSchema.extend({
  status: z.literal('denied'),
  reason: z.string(),
}).passthrough();

export const ToolExecutingEventSchema = BaseEventSchema.extend({
  status: z.literal('executing'),
  pid: z.number().int().positive().optional(),
}).passthrough();

export const ToolCompletedEventSchema = BaseEventSchema.extend({
  status: z.literal('completed'),
  output: z.string(),
  exitCode: z.number().int(),
}).passthrough();

export const ToolFailedEventSchema = BaseEventSchema.extend({
  status: z.literal('failed'),
  error: z.string(),
}).passthrough();

export const ToolExecutionEventSchema = z.discriminatedUnion('status', [
  ToolRequestedEventSchema,
  ToolApprovedEventSchema,
  ToolDeniedEventSchema,
  ToolExecutingEventSchema,
  ToolCompletedEventSchema,
  ToolFailedEventSchema,
]);

export type ToolRequestedEvent = z.infer<typeof ToolRequestedEventSchema>;
export type ToolApprovedEvent = z.infer<typeof ToolApprovedEventSchema>;
export type ToolDeniedEvent = z.infer<typeof ToolDeniedEventSchema>;
export type ToolExecutingEvent = z.infer<typeof ToolExecutingEventSchema>;
export type ToolCompletedEvent = z.infer<typeof ToolCompletedEventSchema>;
export type ToolFailedEvent = z.infer<typeof ToolFailedEventSchema>;
export type ToolExecutionEvent = z.infer<typeof ToolExecutionEventSchema>;
