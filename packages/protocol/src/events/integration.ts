import { z } from 'zod';
import { TopologyViolationSchema } from '../core/topology.js';

import { BaseEventSchema } from './base.js';

const TouchedPathsSchema = z.array(z.string());

export const IntegrationGatePassedEventSchema = BaseEventSchema.extend({
  event: z.literal('gate_passed'),
  afterErrorCount: z.number().int().nonnegative().optional(),
  baselineErrorCount: z.number().int().nonnegative().optional(),
  touchedPaths: TouchedPathsSchema.optional(),
  workspaceId: z.string(),
}).passthrough();

export const IntegrationGateFailedEventSchema = BaseEventSchema.extend({
  event: z.literal('gate_failed'),
  afterErrorCount: z.number().int().nonnegative(),
  baselineErrorCount: z.number().int().nonnegative(),
  newDiagnostics: z.array(z.string()),
  touchedPaths: TouchedPathsSchema,
  workspaceId: z.string(),
}).passthrough();

export const IntegrationConflictEventSchema = BaseEventSchema.extend({
  event: z.literal('conflict'),
  reason: z.string(),
  touchedPaths: TouchedPathsSchema,
  workspaceId: z.string(),
}).passthrough();

export const IntegrationReplayRequestedEventSchema = BaseEventSchema.extend({
  event: z.literal('replay_requested'),
  affectedRunIds: z.array(z.string()),
  touchedPaths: TouchedPathsSchema,
  workspaceId: z.string(),
}).passthrough();

export const IntegrationRunSerializedEventSchema = BaseEventSchema.extend({
  event: z.literal('run_serialized'),
  reason: z.enum(['hard_stale_serialize', 'governance_serialize']),
  reconcileCount: z.number().int().nonnegative(),
  touchedPaths: TouchedPathsSchema.optional(),
  workspaceId: z.string(),
}).passthrough();

export const IntegrationRunStartDeniedEventSchema = BaseEventSchema.extend({
  event: z.literal('run_start_denied'),
  conflictKind: z
    .enum(['path_overlap', 'schema_conflict', 'migration_conflict'])
    .optional(),
  reason: z.string(),
  surfaceId: z.string().optional(),
  workspaceId: z.string(),
}).passthrough();

export const IntegrationRunTopologyInvalidEventSchema = BaseEventSchema.extend({
  event: z.literal('run_topology_invalid'),
  topologyKind: z
    .enum(['linear', 'parallel_merge', 'revise_loop', 'bounded_fan_out', 'invalid'])
    .optional(),
  violations: z.array(TopologyViolationSchema),
  workspaceId: z.string(),
}).passthrough();

export const IntegrationEventSchema = z.discriminatedUnion('event', [
  IntegrationGatePassedEventSchema,
  IntegrationGateFailedEventSchema,
  IntegrationConflictEventSchema,
  IntegrationReplayRequestedEventSchema,
  IntegrationRunSerializedEventSchema,
  IntegrationRunStartDeniedEventSchema,
  IntegrationRunTopologyInvalidEventSchema,
]);

export type IntegrationGatePassedEvent = z.infer<
  typeof IntegrationGatePassedEventSchema
>;
export type IntegrationGateFailedEvent = z.infer<
  typeof IntegrationGateFailedEventSchema
>;
export type IntegrationConflictEvent = z.infer<typeof IntegrationConflictEventSchema>;
export type IntegrationReplayRequestedEvent = z.infer<
  typeof IntegrationReplayRequestedEventSchema
>;
export type IntegrationRunSerializedEvent = z.infer<
  typeof IntegrationRunSerializedEventSchema
>;
export type IntegrationRunStartDeniedEvent = z.infer<
  typeof IntegrationRunStartDeniedEventSchema
>;
export type IntegrationRunTopologyInvalidEvent = z.infer<
  typeof IntegrationRunTopologyInvalidEventSchema
>;
export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;
