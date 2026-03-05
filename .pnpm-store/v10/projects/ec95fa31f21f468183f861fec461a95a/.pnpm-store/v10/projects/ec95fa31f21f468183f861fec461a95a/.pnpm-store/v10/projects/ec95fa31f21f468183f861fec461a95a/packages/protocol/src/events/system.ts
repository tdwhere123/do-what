import { z } from 'zod';

import { BaseEventSchema } from './base.js';

export const SystemEngineConnectEventSchema = BaseEventSchema.extend({
  event: z.literal('engine_connect'),
  engineType: z.enum(['claude', 'codex']),
  version: z.string(),
}).passthrough();

export const SystemEngineDisconnectEventSchema = BaseEventSchema.extend({
  event: z.literal('engine_disconnect'),
  engineType: z.string(),
  reason: z.string(),
}).passthrough();

export const SystemCircuitBreakEventSchema = BaseEventSchema.extend({
  event: z.literal('circuit_break'),
  engineType: z.string(),
  failureCount: z.number().int().nonnegative(),
}).passthrough();

export const SystemNetworkStatusEventSchema = BaseEventSchema.extend({
  event: z.literal('network_status'),
  online: z.boolean(),
}).passthrough();

export const SystemHealthEventSchema = z.discriminatedUnion('event', [
  SystemEngineConnectEventSchema,
  SystemEngineDisconnectEventSchema,
  SystemCircuitBreakEventSchema,
  SystemNetworkStatusEventSchema,
]);

export type SystemEngineConnectEvent = z.infer<typeof SystemEngineConnectEventSchema>;
export type SystemEngineDisconnectEvent = z.infer<typeof SystemEngineDisconnectEventSchema>;
export type SystemCircuitBreakEvent = z.infer<typeof SystemCircuitBreakEventSchema>;
export type SystemNetworkStatusEvent = z.infer<typeof SystemNetworkStatusEventSchema>;
export type SystemHealthEvent = z.infer<typeof SystemHealthEventSchema>;
