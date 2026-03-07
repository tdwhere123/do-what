import { z } from 'zod';

import { BaseEventSchema } from './base.js';

const EngineTypeSchema = z.enum(['claude', 'codex']);

export const SystemEngineConnectEventSchema = BaseEventSchema.extend({
  event: z.literal('engine_connect'),
  engineType: EngineTypeSchema,
  version: z.string(),
}).passthrough();

export const SystemEngineDisconnectEventSchema = BaseEventSchema.extend({
  event: z.literal('engine_disconnect'),
  engineType: EngineTypeSchema,
  reason: z.string(),
}).passthrough();

export const SystemCircuitBreakEventSchema = BaseEventSchema.extend({
  event: z.literal('circuit_break'),
  engineType: EngineTypeSchema,
  failureCount: z.number().int().nonnegative(),
}).passthrough();

export const SystemNetworkStatusEventSchema = BaseEventSchema.extend({
  event: z.literal('network_status'),
  online: z.boolean(),
}).passthrough();

export const SystemCheckpointQueueEventSchema = BaseEventSchema.extend({
  event: z.literal('checkpoint_queue'),
  pendingCount: z.number().int().nonnegative(),
  projectId: z.string().optional(),
}).passthrough();

export const SystemSoulModeEventSchema = BaseEventSchema.extend({
  event: z.literal('soul_mode'),
  provider: z.string().optional(),
  reason: z.string().optional(),
  soul_mode: z.enum(['basic', 'enhanced']),
}).passthrough();

export const SystemHealthEventSchema = z.discriminatedUnion('event', [
  SystemEngineConnectEventSchema,
  SystemEngineDisconnectEventSchema,
  SystemCircuitBreakEventSchema,
  SystemNetworkStatusEventSchema,
  SystemCheckpointQueueEventSchema,
  SystemSoulModeEventSchema,
]);

export type SystemEngineConnectEvent = z.infer<typeof SystemEngineConnectEventSchema>;
export type SystemEngineDisconnectEvent = z.infer<typeof SystemEngineDisconnectEventSchema>;
export type SystemCircuitBreakEvent = z.infer<typeof SystemCircuitBreakEventSchema>;
export type SystemNetworkStatusEvent = z.infer<typeof SystemNetworkStatusEventSchema>;
export type SystemCheckpointQueueEvent = z.infer<typeof SystemCheckpointQueueEventSchema>;
export type SystemSoulModeEvent = z.infer<typeof SystemSoulModeEventSchema>;
export type SystemHealthEvent = z.infer<typeof SystemHealthEventSchema>;
