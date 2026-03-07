import {
  EngineDiffEventSchema,
  EnginePlanNodeEventSchema,
  EngineTokenStreamEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  ToolCompletedEventSchema,
  ToolFailedEventSchema,
  ToolRequestedEventSchema,
  ToolsApiSchemas,
  type BaseEvent,
  type ToolsApiName,
} from '@do-what/protocol';

type JsonMap = Record<string, unknown>;

type ToolSchemaMap = typeof ToolsApiSchemas;

const PLAN_STATUS_MAP: Record<string, 'active' | 'done' | 'failed' | 'pending'> = {
  active: 'active',
  completed: 'done',
  doing: 'active',
  done: 'done',
  error: 'failed',
  failed: 'failed',
  in_progress: 'active',
  pending: 'pending',
  running: 'active',
  todo: 'pending',
};

export interface EventNormalizerOptions {
  now?: () => string;
  runId: string;
  source?: string;
}

function asObject(value: unknown): JsonMap | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonMap)
    : null;
}

function coerceArgs(value: unknown): Readonly<Record<string, unknown>> {
  return asObject(value) ?? {};
}

function countDiffHunks(patch: string): number {
  const matches = patch.match(/^@@/gm);
  return matches?.length ?? 0;
}

function getBoolean(source: JsonMap, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return undefined;
}

function getNumber(source: JsonMap, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function getString(source: JsonMap, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function getStringArray(source: JsonMap, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return [...value];
    }
  }
  return undefined;
}

function isToolName(value: string): value is ToolsApiName {
  return value in ToolsApiSchemas;
}

function normalizePlanStatus(rawStatus: string | undefined): 'active' | 'done' | 'failed' | 'pending' {
  if (!rawStatus) {
    return 'pending';
  }

  const normalized = PLAN_STATUS_MAP[rawStatus.toLowerCase()];
  if (!normalized) {
    console.warn('[codex][event-normalizer] unknown plan node status', {
      rawStatus,
    });
    return 'pending';
  }

  return normalized;
}

function parseTimestamp(source: JsonMap, fallback: () => string): string {
  const candidate = getString(source, 'timestamp', 'time');
  if (candidate && !Number.isNaN(Date.parse(candidate))) {
    return candidate;
  }

  return fallback();
}

export class EventNormalizer {
  private readonly now: () => string;
  private readonly runId: string;
  private readonly source: string;

  constructor(options: EventNormalizerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.runId = options.runId;
    this.source = options.source ?? 'engine.codex';
  }

  normalize(raw: unknown): BaseEvent | null {
    const payload = asObject(raw);
    if (!payload) {
      console.warn('[codex][event-normalizer] ignoring non-object payload');
      return null;
    }

    const rawType = getString(payload, 'type', 'event');
    if (!rawType) {
      console.warn('[codex][event-normalizer] missing type field', payload);
      return null;
    }

    switch (rawType) {
      case 'approval_request':
        return this.normalizeApprovalRequest(payload);
      case 'diff':
        return this.normalizeDiff(payload);
      case 'fixture_meta':
        return null;
      case 'plan_node':
        return this.normalizePlanNode(payload);
      case 'run_complete':
        return this.normalizeRunComplete(payload);
      case 'run_failed':
        return this.normalizeRunFailed(payload);
      case 'token_stream':
        return this.normalizeTokenStream(payload);
      case 'tool_failed':
        return this.normalizeToolFailed(payload);
      case 'tool_result':
        return this.normalizeToolResult(payload);
      default:
        console.warn('[codex][event-normalizer] unknown event type', {
          rawType,
        });
        return null;
    }
  }

  private buildBase(payload: JsonMap): Pick<BaseEvent, 'revision' | 'runId' | 'source' | 'timestamp'> {
    return {
      revision: 0,
      runId: getString(payload, 'runId', 'run_id') ?? this.runId,
      source: this.source,
      timestamp: parseTimestamp(payload, this.now),
    };
  }

  private normalizeApprovalRequest(payload: JsonMap): BaseEvent | null {
    const approvalId = getString(payload, 'requestId', 'id', 'request_id');
    const toolName = getString(payload, 'tool', 'toolName', 'name');
    if (!approvalId || !toolName) {
      console.warn('[codex][event-normalizer] invalid approval request payload', payload);
      return null;
    }

    const rawArgs = coerceArgs(payload.args ?? payload.arguments ?? payload.input);
    const args = this.normalizeToolArgs(toolName, rawArgs);

    const parsed = ToolRequestedEventSchema.safeParse({
      ...this.buildBase(payload),
      approvalId,
      args,
      status: 'requested',
      toolName,
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] approval_request failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizeDiff(payload: JsonMap): BaseEvent | null {
    const patch = getString(payload, 'patch', 'diff');
    const targetPath = getString(payload, 'path', 'file', 'filePath');
    if (!patch || !targetPath) {
      console.warn('[codex][event-normalizer] invalid diff payload', payload);
      return null;
    }

    const parsed = EngineDiffEventSchema.safeParse({
      ...this.buildBase(payload),
      hunks: getNumber(payload, 'hunks') ?? countDiffHunks(patch),
      patch,
      path: targetPath,
      type: 'diff',
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] diff failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizePlanNode(payload: JsonMap): BaseEvent | null {
    const nodeId = getString(payload, 'nodeId', 'id');
    const title = getString(payload, 'title', 'label', 'text');
    if (!nodeId || !title) {
      console.warn('[codex][event-normalizer] invalid plan node payload', payload);
      return null;
    }

    const parsed = EnginePlanNodeEventSchema.safeParse({
      ...this.buildBase(payload),
      nodeId,
      status: normalizePlanStatus(getString(payload, 'status')),
      title,
      type: 'plan_node',
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] plan_node failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizeRunComplete(payload: JsonMap): BaseEvent | null {
    const parsed = RunCompletedEventSchema.safeParse({
      ...this.buildBase(payload),
      artifactIds: getStringArray(payload, 'artifactIds', 'artifacts'),
      duration: getNumber(payload, 'duration', 'durationMs', 'duration_ms'),
      status: 'completed',
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] run_complete failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizeRunFailed(payload: JsonMap): BaseEvent | null {
    const error = getString(payload, 'error', 'message', 'reason');
    if (!error) {
      console.warn('[codex][event-normalizer] invalid run_failed payload', payload);
      return null;
    }

    const code = getString(payload, 'code', 'errorCode', 'error_code');
    const parsed = RunFailedEventSchema.safeParse({
      ...this.buildBase(payload),
      code,
      error,
      status: 'failed',
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] run_failed failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizeTokenStream(payload: JsonMap): BaseEvent | null {
    const text = getString(payload, 'text', 'token', 'delta', 'content');
    if (text === undefined) {
      console.warn('[codex][event-normalizer] invalid token stream payload', payload);
      return null;
    }

    const parsed = EngineTokenStreamEventSchema.safeParse({
      ...this.buildBase(payload),
      isComplete: getBoolean(payload, 'isComplete', 'is_complete', 'done', 'final') ?? false,
      text,
      type: 'token_stream',
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] token_stream failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizeToolArgs(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    if (!isToolName(toolName)) {
      return args;
    }

    const parsed = (ToolsApiSchemas as ToolSchemaMap)[toolName].safeParse(args);
    if (parsed.success) {
      return parsed.data;
    }

    console.warn('[codex][event-normalizer] tool args failed schema validation', {
      toolName,
    });
    return args;
  }

  private normalizeToolFailed(payload: JsonMap): BaseEvent | null {
    const error = getString(payload, 'error', 'message', 'reason');
    if (!error) {
      console.warn('[codex][event-normalizer] invalid tool_failed payload', payload);
      return null;
    }

    const parsed = ToolFailedEventSchema.safeParse({
      ...this.buildBase(payload),
      approvalId: getString(payload, 'requestId', 'id', 'request_id'),
      error,
      status: 'failed',
      toolName: getString(payload, 'tool', 'toolName', 'name'),
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] tool_failed failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }

  private normalizeToolResult(payload: JsonMap): BaseEvent | null {
    const output = getString(payload, 'output', 'result', 'content');
    if (!output) {
      console.warn('[codex][event-normalizer] invalid tool_result payload', payload);
      return null;
    }

    const parsed = ToolCompletedEventSchema.safeParse({
      ...this.buildBase(payload),
      approvalId: getString(payload, 'requestId', 'id', 'request_id'),
      exitCode: getNumber(payload, 'exitCode', 'exit_code', 'code') ?? 0,
      output,
      status: 'completed',
      toolName: getString(payload, 'tool', 'toolName', 'name'),
    });

    if (!parsed.success) {
      console.warn('[codex][event-normalizer] tool_result failed schema validation', parsed.error);
      return null;
    }

    return parsed.data;
  }
}
