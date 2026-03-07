import { z } from 'zod';

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

export const IntegrationEventSchema = z.discriminatedUnion('event', [
  IntegrationGatePassedEventSchema,
  IntegrationGateFailedEventSchema,
  IntegrationConflictEventSchema,
  IntegrationReplayRequestedEventSchema,
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
export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;
