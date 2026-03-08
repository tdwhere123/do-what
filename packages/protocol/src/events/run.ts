import { z } from 'zod';

import { BaseEventSchema } from './base.js';

export const RunCreatedEventSchema = BaseEventSchema.extend({
  status: z.literal('created'),
  workspaceId: z.string(),
  agentId: z.string().optional(),
  engineType: z.string(),
}).passthrough();

export const RunStartedEventSchema = BaseEventSchema.extend({
  status: z.literal('started'),
  worktreePath: z.string().optional(),
}).passthrough();

export const RunWaitingApprovalEventSchema = BaseEventSchema.extend({
  status: z.literal('waiting_approval'),
  approvalId: z.string(),
  toolName: z.string(),
}).passthrough();

export const RunCompletedEventSchema = BaseEventSchema.extend({
  status: z.literal('completed'),
  duration: z.number().nonnegative().optional(),
  artifactIds: z.array(z.string()).optional(),
}).passthrough();

export const RunFailedEventSchema = BaseEventSchema.extend({
  status: z.literal('failed'),
  error: z.string(),
  code: z.string().optional(),
}).passthrough();

export const RunCancelledEventSchema = BaseEventSchema.extend({
  status: z.literal('cancelled'),
  cancelledBy: z.string(),
}).passthrough();

export const RunInterruptedEventSchema = BaseEventSchema.extend({
  status: z.literal('interrupted'),
  reason: z.enum(['agent_stuck', 'core_restart', 'network_error']),
}).passthrough();

export const RunGovernanceInvalidEventSchema = BaseEventSchema.extend({
  status: z.literal('governance_invalid'),
  reason: z.string().optional(),
}).passthrough();

export const RunLifecycleEventSchema = z.discriminatedUnion('status', [
  RunCreatedEventSchema,
  RunStartedEventSchema,
  RunWaitingApprovalEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  RunCancelledEventSchema,
  RunInterruptedEventSchema,
  RunGovernanceInvalidEventSchema,
]);

export type RunCreatedEvent = z.infer<typeof RunCreatedEventSchema>;
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;
export type RunWaitingApprovalEvent = z.infer<typeof RunWaitingApprovalEventSchema>;
export type RunCompletedEvent = z.infer<typeof RunCompletedEventSchema>;
export type RunFailedEvent = z.infer<typeof RunFailedEventSchema>;
export type RunCancelledEvent = z.infer<typeof RunCancelledEventSchema>;
export type RunInterruptedEvent = z.infer<typeof RunInterruptedEventSchema>;
export type RunGovernanceInvalidEvent = z.infer<typeof RunGovernanceInvalidEventSchema>;
export type RunLifecycleEvent = z.infer<typeof RunLifecycleEventSchema>;
