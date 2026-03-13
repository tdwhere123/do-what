import {
  ApprovalProbeSchema,
  AnyEventSchema,
  CoreCommandAckSchema,
  CoreErrorSchema,
  CoreProbeResultSchema,
  CoreSseEnvelopeSchema,
  InspectorSnapshotSchema,
  MemoryProbeSchema,
  SettingsSnapshotSchema,
  TemplateDescriptorSchema,
  TimelinePageSchema,
  WorkbenchSnapshotSchema,
  type ApprovalProbe,
  type AnyEvent,
  type CoreCommandAck,
  type CoreError,
  type CoreProbeResult,
  type CoreSseEnvelope,
  type InspectorSnapshot,
  type MemoryProbe,
  type SettingsSnapshot,
  type TemplateDescriptor,
  type TimelinePage,
  type WorkbenchSnapshot,
} from '@do-what/protocol';

const EMPTY_HEALTH = {
  claude: 'unknown',
  codex: 'unknown',
  core: 'healthy',
  network: 'unknown',
  soul: 'unknown',
} as const;

interface LegacyPendingApproval {
  approvalId?: unknown;
  createdAt?: unknown;
  runId?: unknown;
  summary?: unknown;
  toolName?: unknown;
}

interface LegacyStateSnapshot {
  pendingApprovals?: unknown;
  recentEvents?: unknown;
  revision?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorCode(value: unknown, fallback = 'core_error'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readErrorDetails(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asIsoDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function parseEventList(value: unknown): AnyEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((event) => {
    const parsed = AnyEventSchema.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  });
}

function parsePendingApprovals(value: unknown): WorkbenchSnapshot['pendingApprovals'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const approval = isRecord(entry) ? (entry as LegacyPendingApproval) : null;
    if (!approval) {
      return [];
    }

    const fallbackTimestamp = new Date(0).toISOString();
    const parsed = WorkbenchSnapshotSchema.shape.pendingApprovals.element.safeParse({
      approvalId:
        typeof approval.approvalId === 'string' && approval.approvalId.length > 0
          ? approval.approvalId
          : 'approval-unknown',
      createdAt: asIsoDate(approval.createdAt, fallbackTimestamp),
      runId: typeof approval.runId === 'string' ? approval.runId : 'run-unknown',
      summary: typeof approval.summary === 'string' ? approval.summary : undefined,
      toolName: typeof approval.toolName === 'string' ? approval.toolName : 'unknown',
    });

    return parsed.success ? [parsed.data] : [];
  });
}

export function createEmptyWorkbenchSnapshot(
  overrides: Partial<WorkbenchSnapshot> = {},
): WorkbenchSnapshot {
  return WorkbenchSnapshotSchema.parse({
    connectionState: 'connected',
    coreSessionId: null,
    health: EMPTY_HEALTH,
    pendingApprovals: [],
    recentEvents: [],
    revision: 0,
    runs: [],
    workspaces: [],
    ...overrides,
  });
}

export function normalizeLegacyStateSnapshot(
  input: unknown,
  options: {
    connectionState?: WorkbenchSnapshot['connectionState'];
    coreSessionId?: string | null;
  } = {},
): WorkbenchSnapshot {
  const snapshot = isRecord(input) ? (input as LegacyStateSnapshot) : {};
  const revision =
    typeof snapshot.revision === 'number' && Number.isInteger(snapshot.revision)
      ? snapshot.revision
      : 0;

  return createEmptyWorkbenchSnapshot({
    connectionState: options.connectionState ?? 'connected',
    coreSessionId: options.coreSessionId ?? null,
    pendingApprovals: parsePendingApprovals(snapshot.pendingApprovals),
    recentEvents: parseEventList(snapshot.recentEvents),
    revision,
  });
}

export function parseWorkbenchSnapshot(input: unknown): WorkbenchSnapshot {
  const parsed = WorkbenchSnapshotSchema.safeParse(input);
  return parsed.success ? parsed.data : normalizeLegacyStateSnapshot(input);
}

export function parseTimelinePage(input: unknown): TimelinePage {
  return TimelinePageSchema.parse(input);
}

export function createEmptyTimelinePage(
  runId: string,
  overrides: Partial<TimelinePage> = {},
): TimelinePage {
  return TimelinePageSchema.parse({
    entries: [],
    hasMore: false,
    limit: 50,
    nextBeforeRevision: null,
    revision: 0,
    runId,
    ...overrides,
  });
}

export function parseInspectorSnapshot(input: unknown): InspectorSnapshot {
  return InspectorSnapshotSchema.parse(input);
}

export function createEmptyInspectorSnapshot(
  runId: string,
  overrides: Partial<InspectorSnapshot> = {},
): InspectorSnapshot {
  return InspectorSnapshotSchema.parse({
    files: [],
    governance: {},
    history: [],
    overview: {},
    plans: [],
    revision: 0,
    runId,
    ...overrides,
  });
}

export function parseSettingsSnapshot(input: unknown): SettingsSnapshot {
  return SettingsSnapshotSchema.parse(input);
}

export function createEmptySettingsSnapshot(
  overrides: Partial<SettingsSnapshot> = {},
): SettingsSnapshot {
  return SettingsSnapshotSchema.parse({
    coreSessionId: null,
    lease: {
      leaseId: null,
      lockedFields: [],
      status: 'none',
    },
    revision: 0,
    sections: [],
    ...overrides,
  });
}

export function parseTemplateDescriptors(input: unknown): readonly TemplateDescriptor[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((descriptor) => {
    const parsed = TemplateDescriptorSchema.safeParse(descriptor);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseCoreCommandAck(input: unknown): CoreCommandAck {
  return CoreCommandAckSchema.parse(input);
}

export function parseApprovalProbe(input: unknown): ApprovalProbe {
  return ApprovalProbeSchema.parse(input);
}

export function parseMemoryProbe(input: unknown): MemoryProbe {
  return MemoryProbeSchema.parse(input);
}

export function normalizeCoreProbeResult(input: unknown): CoreProbeResult {
  if (!isRecord(input)) {
    return CoreProbeResultSchema.parse({
      ackId: 'unknown',
      ok: false,
      status: 'failed',
      error: 'Invalid ack payload',
    });
  }

  return CoreProbeResultSchema.parse({
    ackId: typeof input.ackId === 'string' ? input.ackId : input.ack_id,
    committedAt: input.committedAt ?? input.committed_at,
    createdAt: input.createdAt ?? input.created_at,
    entityId: input.entityId ?? input.entity_id,
    entityType: input.entityType ?? input.entity_type,
    error: typeof input.error === 'string' ? input.error : undefined,
    ok: typeof input.ok === 'boolean' ? input.ok : true,
    revision: typeof input.revision === 'number' ? input.revision : undefined,
    status: input.status,
  });
}

export function normalizeCoreError(
  input: unknown,
  fallbackMessage = 'Unknown Core error',
): CoreError {
  if (isRecord(input) && isRecord(input.coreError)) {
    return CoreErrorSchema.parse({
      code: readErrorCode(input.coreError.code, readErrorCode(input.code)),
      details: readErrorDetails(input.coreError.details) ?? readErrorDetails(input.details),
      message:
        typeof input.coreError.message === 'string'
          ? input.coreError.message
          : typeof input.message === 'string'
            ? input.message
            : fallbackMessage,
    });
  }

  if (isRecord(input) && typeof input.error === 'string') {
    return CoreErrorSchema.parse({
      code: readErrorCode(input.code),
      details: readErrorDetails(input.details),
      message: input.error,
    });
  }

  if (isRecord(input) && isRecord(input.error)) {
    return CoreErrorSchema.parse({
      code: readErrorCode(input.error.code),
      details: readErrorDetails(input.error.details),
      message:
        typeof input.error.message === 'string' ? input.error.message : fallbackMessage,
    });
  }

  if (isRecord(input) && typeof input.message === 'string') {
    return CoreErrorSchema.parse({
      code: readErrorCode(input.code),
      details: readErrorDetails(input.details),
      message: input.message,
    });
  }

  if (input instanceof Error && input.message.length > 0) {
    return CoreErrorSchema.parse({
      code: 'core_error',
      message: input.message,
    });
  }

  return CoreErrorSchema.parse({
    code: 'core_error',
    message: fallbackMessage,
  });
}

export function normalizeCoreSseEnvelope(
  input: unknown,
  coreSessionId: string | null = null,
): CoreSseEnvelope {
  const parsedEnvelope = CoreSseEnvelopeSchema.safeParse(input);
  if (parsedEnvelope.success) {
    return parsedEnvelope.data;
  }

  const parsedEvent = AnyEventSchema.parse(input);
  return CoreSseEnvelopeSchema.parse({
    coreSessionId,
    event: parsedEvent,
    revision: parsedEvent.revision,
  });
}
