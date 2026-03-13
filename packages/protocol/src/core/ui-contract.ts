import { z } from 'zod';
import { AnyEventSchema } from '../events/index.js';
import {
  ModuleKindSchema,
  ModulePhaseSchema,
  ModuleStatusSchema,
} from './module-status.js';

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const CoreConnectionStateSchema = z.enum([
  'connecting',
  'connected',
  'disconnected',
  'reconnecting',
]);

export const CoreHealthStatusSchema = z.enum([
  'unknown',
  'idle',
  'booting',
  'healthy',
  'running',
  'degraded',
  'offline',
  'rebooting',
]);

export const WorkbenchPendingApprovalSchema = z
  .object({
    approvalId: z.string(),
    createdAt: z.string().datetime(),
    runId: z.string(),
    summary: z.string().optional(),
    toolName: z.string(),
  })
  .passthrough();

export const WorkbenchHealthSnapshotSchema = z
  .object({
    claude: CoreHealthStatusSchema,
    codex: CoreHealthStatusSchema,
    core: CoreHealthStatusSchema,
    network: CoreHealthStatusSchema,
    soul: CoreHealthStatusSchema,
  })
  .passthrough();

export const ModuleStatusSnapshotSchema = z
  .object({
    kind: ModuleKindSchema,
    label: z.string(),
    meta: z.record(JsonValueSchema).optional(),
    moduleId: z.string(),
    phase: ModulePhaseSchema,
    reason: z.string().optional(),
    status: ModuleStatusSchema,
    updatedAt: z.string().datetime(),
  })
  .passthrough();

export const WorkbenchModulesSnapshotSchema = z
  .object({
    core: ModuleStatusSnapshotSchema,
    engines: z
      .object({
        claude: ModuleStatusSnapshotSchema,
        codex: ModuleStatusSnapshotSchema,
      })
      .passthrough(),
    soul: ModuleStatusSnapshotSchema,
  })
  .passthrough();

export const WorkbenchWorkspaceSummarySchema = z
  .object({
    lastEventAt: z.string().datetime().optional(),
    name: z.string(),
    runIds: z.array(z.string()),
    status: z.enum(['idle', 'running', 'attention']),
    workspaceId: z.string(),
  })
  .passthrough();

export const WorkbenchRunSummarySchema = z
  .object({
    activeNodeId: z.string().nullable().optional(),
    approvalIds: z.array(z.string()).default([]),
    engine: z.string().optional(),
    lastEventAt: z.string().datetime().optional(),
    status: z.enum([
      'created',
      'queued',
      'started',
      'running',
      'waiting_approval',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
      'governance_invalid',
    ]),
    title: z.string(),
    runId: z.string(),
    workspaceId: z.string().nullable().optional(),
  })
  .passthrough();

export const WorkbenchSnapshotSchema = z
  .object({
    connectionState: CoreConnectionStateSchema,
    coreSessionId: z.string().nullable(),
    health: WorkbenchHealthSnapshotSchema,
    modules: WorkbenchModulesSnapshotSchema,
    pendingApprovals: z.array(WorkbenchPendingApprovalSchema),
    recentEvents: z.array(AnyEventSchema),
    revision: z.number().int().nonnegative(),
    runs: z.array(WorkbenchRunSummarySchema),
    workspaces: z.array(WorkbenchWorkspaceSummarySchema),
  })
  .passthrough();

export const TimelineEntrySchema = z
  .object({
    body: z.string().optional(),
    causedBy: z
      .object({
        ackId: z.string().optional(),
        clientCommandId: z.string().optional(),
      })
      .passthrough()
      .optional(),
    id: z.string(),
    kind: z.enum([
      'message',
      'tool_call',
      'approval',
      'memory',
      'system',
      'plan',
      'diff',
      'checkpoint',
    ]),
    meta: z.record(JsonValueSchema).optional(),
    runId: z.string(),
    status: z.string().optional(),
    timestamp: z.string().datetime(),
    title: z.string().optional(),
  })
  .passthrough();

export const TimelinePageSchema = z
  .object({
    entries: z.array(TimelineEntrySchema),
    hasMore: z.boolean(),
    limit: z.number().int().positive(),
    nextBeforeRevision: z.number().int().nonnegative().nullable(),
    revision: z.number().int().nonnegative(),
    runId: z.string(),
  })
  .passthrough();

export const InspectorFileChangeSchema = z
  .object({
    path: z.string(),
    status: z.enum(['added', 'modified', 'deleted', 'renamed']),
    summary: z.string().optional(),
  })
  .passthrough();

export const InspectorPlanItemSchema = z
  .object({
    id: z.string(),
    status: z.enum(['pending', 'active', 'done', 'failed']),
    summary: z.string(),
  })
  .passthrough();

export const InspectorHistoryItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    timestamp: z.string().datetime(),
    type: z.enum(['run', 'checkpoint', 'memory', 'governance', 'git']),
  })
  .passthrough();

export const InspectorSnapshotSchema = z
  .object({
    files: z.array(InspectorFileChangeSchema),
    governance: z.record(JsonValueSchema).default({}),
    history: z.array(InspectorHistoryItemSchema),
    overview: z.record(JsonValueSchema).default({}),
    plans: z.array(InspectorPlanItemSchema),
    revision: z.number().int().nonnegative(),
    runId: z.string(),
  })
  .passthrough();

export const SettingsSectionSchema = z
  .object({
    fields: z.array(
      z
        .object({
          description: z.string().optional(),
          fieldId: z.string(),
          kind: z.enum(['text', 'textarea', 'toggle', 'select', 'number', 'path']),
          locked: z.boolean().default(false),
          options: z
            .array(
              z
                .object({
                  label: z.string(),
                  value: z.string(),
                })
                .passthrough(),
            )
            .optional(),
          value: JsonValueSchema,
        })
        .passthrough(),
    ),
    locked: z.boolean().default(false),
    sectionId: z.string(),
    title: z.string(),
  })
  .passthrough();

export const SettingsSnapshotSchema = z
  .object({
    coreSessionId: z.string().nullable(),
    lease: z
      .object({
        leaseId: z.string().nullable(),
        lockedFields: z.array(z.string()),
        status: z.enum(['none', 'active', 'stale', 'conflicting']),
      })
      .passthrough(),
    revision: z.number().int().nonnegative(),
    sections: z.array(SettingsSectionSchema),
  })
  .passthrough();

export const TemplateDescriptorInputSchema = z
  .object({
    defaultValue: JsonValueSchema.optional(),
    description: z.string().optional(),
    inputId: z.string(),
    kind: z.enum(['text', 'textarea', 'select', 'checkbox']),
    label: z.string(),
    options: z
      .array(
        z
          .object({
            label: z.string(),
            value: z.string(),
          })
          .passthrough(),
      )
      .optional(),
    required: z.boolean().default(false),
  })
  .passthrough();

export const TemplateDescriptorSchema = z
  .object({
    description: z.string(),
    inputs: z.array(TemplateDescriptorInputSchema),
    templateId: z.string(),
    title: z.string(),
  })
  .passthrough();

export const CreateRunRequestSchema = z
  .object({
    clientCommandId: z.string(),
    participants: z.array(z.string()).default([]),
    templateId: z.string(),
    templateInputs: z.record(JsonValueSchema).default({}),
    templateVersion: z.union([z.string(), z.number().int().nonnegative()]).optional(),
    workspaceId: z.string(),
  })
  .passthrough();

export const CreateWorkspaceRequestSchema = z
  .object({
    clientCommandId: z.string(),
    name: z.string().trim().min(1).max(120),
  })
  .passthrough();

export const OpenWorkspaceRequestSchema = z
  .object({
    clientCommandId: z.string(),
    name: z.string().trim().min(1).max(120).optional(),
    rootPath: z.string().trim().min(1),
  })
  .passthrough();

export const RunMessageRequestSchema = z
  .object({
    body: z.string().min(1),
    clientCommandId: z.string(),
  })
  .passthrough();

export const ApprovalDecisionRequestSchema = z
  .object({
    clientCommandId: z.string(),
    decision: z.enum(['allow_once', 'allow_session', 'reject']),
  })
  .passthrough();

export const SettingsPatchRequestSchema = z
  .object({
    clientCommandId: z.string(),
    fields: z.record(JsonValueSchema),
  })
  .passthrough();

export const MemoryProposalReviewRequestSchema = z
  .object({
    clientCommandId: z.string(),
    edits: z.record(JsonValueSchema).optional(),
    mode: z.enum(['accept', 'hint_only', 'reject']),
  })
  .passthrough();

export const MemoryPinRequestSchema = z
  .object({
    clientCommandId: z.string(),
    projectOverride: z.boolean().optional(),
  })
  .passthrough();

export const MemoryEditRequestSchema = z
  .object({
    clientCommandId: z.string(),
    patch: z.record(JsonValueSchema).default({}),
    projectOverride: z.boolean().optional(),
  })
  .passthrough();

export const MemorySupersedeRequestSchema = z
  .object({
    clientCommandId: z.string(),
    projectOverride: z.boolean().optional(),
    replacement: z.record(JsonValueSchema).default({}),
  })
  .passthrough();

export const DriftResolutionRequestSchema = z
  .object({
    clientCommandId: z.string(),
    mode: z.enum(['reconcile', 'rollback']),
  })
  .passthrough();

export const IntegrationGateDecisionRequestSchema = z
  .object({
    clientCommandId: z.string(),
    decision: z.enum(['approve', 'block']),
    gateId: z.string().optional(),
  })
  .passthrough();

export const CoreCommandRequestSchema = z
  .object({
    clientCommandId: z.string(),
    command: z.string(),
    payload: z.record(JsonValueSchema).default({}),
    runId: z.string().optional(),
    workspaceId: z.string().optional(),
  })
  .passthrough();

export const CoreCommandAckSchema = z
  .object({
    ackId: z.string(),
    entityId: z.string().optional(),
    entityType: z.string().optional(),
    ok: z.literal(true),
    revision: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const CoreProbeResultSchema = z
  .object({
    ackId: z.string(),
    committedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime().optional(),
    entityId: z.string().optional(),
    entityType: z.string().optional(),
    error: z.string().optional(),
    ok: z.boolean().default(true),
    revision: z.number().int().nonnegative().optional(),
    status: z.enum(['pending', 'committed', 'failed']),
  })
  .passthrough();

export const ApprovalProbeSchema = z
  .object({
    approvalId: z.string(),
    revision: z.number().int().nonnegative(),
    runId: z.string(),
    status: z.enum(['pending', 'approved', 'denied', 'timeout']),
    summary: z.string().optional(),
    toolName: z.string(),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

export const MemoryProbeSchema = z
  .object({
    claimSummary: z.string(),
    dimension: z.string().nullable().optional(),
    manifestationState: z.string(),
    memoryId: z.string(),
    retentionState: z.string(),
    revision: z.number().int().nonnegative(),
    scope: z.string(),
    slotStatus: z.enum(['bound', 'superseded', 'unbound']),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

export const CoreErrorSchema = z
  .object({
    code: z.string(),
    details: z.record(JsonValueSchema).optional(),
    message: z.string(),
  })
  .passthrough();

export const CoreSseCauseSchema = z
  .object({
    ackId: z.string().optional(),
    clientCommandId: z.string().optional(),
  })
  .passthrough();

export const CoreSseEnvelopeSchema = z
  .object({
    causedBy: CoreSseCauseSchema.optional(),
    coreSessionId: z.string().nullable().optional(),
    event: AnyEventSchema,
    revision: z.number().int().nonnegative(),
  })
  .passthrough();

export type CoreConnectionState = z.infer<typeof CoreConnectionStateSchema>;
export type CoreHealthStatus = z.infer<typeof CoreHealthStatusSchema>;
export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequestSchema>;
export type ApprovalProbe = z.infer<typeof ApprovalProbeSchema>;
export type CoreCommandAck = z.infer<typeof CoreCommandAckSchema>;
export type CoreCommandRequest = z.infer<typeof CoreCommandRequestSchema>;
export type CoreError = z.infer<typeof CoreErrorSchema>;
export type CoreProbeResult = z.infer<typeof CoreProbeResultSchema>;
export type CoreSseCause = z.infer<typeof CoreSseCauseSchema>;
export type CoreSseEnvelope = z.infer<typeof CoreSseEnvelopeSchema>;
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type DriftResolutionRequest = z.infer<typeof DriftResolutionRequestSchema>;
export type IntegrationGateDecisionRequest = z.infer<
  typeof IntegrationGateDecisionRequestSchema
>;
export type InspectorSnapshot = z.infer<typeof InspectorSnapshotSchema>;
export type MemoryEditRequest = z.infer<typeof MemoryEditRequestSchema>;
export type MemoryPinRequest = z.infer<typeof MemoryPinRequestSchema>;
export type MemoryProbe = z.infer<typeof MemoryProbeSchema>;
export type MemoryProposalReviewRequest = z.infer<typeof MemoryProposalReviewRequestSchema>;
export type MemorySupersedeRequest = z.infer<typeof MemorySupersedeRequestSchema>;
export type ModuleStatusSnapshot = z.infer<typeof ModuleStatusSnapshotSchema>;
export type OpenWorkspaceRequest = z.infer<typeof OpenWorkspaceRequestSchema>;
export type RunMessageRequest = z.infer<typeof RunMessageRequestSchema>;
export type SettingsPatchRequest = z.infer<typeof SettingsPatchRequestSchema>;
export type SettingsSnapshot = z.infer<typeof SettingsSnapshotSchema>;
export type TemplateDescriptor = z.infer<typeof TemplateDescriptorSchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
export type TimelinePage = z.infer<typeof TimelinePageSchema>;
export type WorkbenchHealthSnapshot = z.infer<typeof WorkbenchHealthSnapshotSchema>;
export type WorkbenchModulesSnapshot = z.infer<typeof WorkbenchModulesSnapshotSchema>;
export type WorkbenchPendingApproval = z.infer<typeof WorkbenchPendingApprovalSchema>;
export type WorkbenchRunSummary = z.infer<typeof WorkbenchRunSummarySchema>;
export type WorkbenchSnapshot = z.infer<typeof WorkbenchSnapshotSchema>;
export type WorkbenchWorkspaceSummary = z.infer<typeof WorkbenchWorkspaceSummarySchema>;
