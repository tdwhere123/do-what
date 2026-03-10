import type {
  AnyEvent,
  CoreCommandAck,
  CoreCommandRequest,
  CoreProbeResult,
  InspectorSnapshot,
  SettingsSnapshot,
  TemplateDescriptor,
  TimelineEntry,
  TimelinePage,
  WorkbenchSnapshot,
} from '@do-what/protocol';
import {
  createEmptyInspectorSnapshot,
  createEmptySettingsSnapshot,
  createEmptyTimelinePage,
  normalizeCoreProbeResult,
  normalizeLegacyStateSnapshot,
  parseCoreCommandAck,
} from '../contracts';
import type { TemplateRegistryAdapter } from '../template-registry/template-registry-adapter';
import type { RuntimeCoreConfig } from '../runtime/runtime-config';
import { CoreHttpError, createCoreHttpClient } from './core-http-client';
import type { CoreApiAdapter, TimelinePageQuery } from './core-api-adapter';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function mapEventToTimelineEntry(event: AnyEvent): TimelineEntry {
  if ('type' in event && event.type === 'token_stream') {
    return {
      body: readString(event.text),
      id: `timeline-${event.revision}`,
      kind: 'message',
      meta: {
        isComplete: event.isComplete,
      },
      runId: event.runId,
      timestamp: event.timestamp,
      title: 'Engine Output',
    };
  }

  if ('status' in event && event.status === 'waiting_approval') {
    return {
      body: `Approval required for ${event.toolName}`,
      id: `timeline-${event.revision}`,
      kind: 'approval',
      meta: {
        approvalId: event.approvalId,
        toolName: event.toolName,
      },
      runId: event.runId,
      status: 'pending',
      timestamp: event.timestamp,
      title: 'Approval',
    };
  }

  if ('status' in event && 'toolName' in event) {
    return {
      body:
        'output' in event
          ? readString(event.output)
          : 'error' in event
            ? readString(event.error)
            : undefined,
      id: `timeline-${event.revision}`,
      kind: 'tool_call',
      meta: {
        status: event.status,
        toolName: readString(event.toolName) ?? 'unknown',
      },
      runId: event.runId,
      status: readString(event.status),
      timestamp: event.timestamp,
      title: readString(event.toolName) ?? 'Tool',
    };
  }

  return {
    body: JSON.stringify(event),
    id: `timeline-${event.revision}`,
    kind: 'system',
    runId: event.runId,
    timestamp: event.timestamp,
    title: event.source,
  };
}

export class HttpCoreApiAdapter implements CoreApiAdapter {
  private readonly client: ReturnType<typeof createCoreHttpClient>;
  private readonly config: RuntimeCoreConfig;
  private readonly templateRegistry: TemplateRegistryAdapter;

  constructor(
    config: RuntimeCoreConfig,
    templateRegistry: TemplateRegistryAdapter,
    fetchImpl?: typeof fetch,
  ) {
    this.client = createCoreHttpClient({
      baseUrl: config.baseUrl,
      fetchImpl,
      sessionToken: config.sessionToken,
    });
    this.config = config;
    this.templateRegistry = templateRegistry;
  }

  async getWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
    const rawState = await this.client.get('/state');
    return normalizeLegacyStateSnapshot(rawState, {
      connectionState: 'connected',
    });
  }

  async getTimelinePage(query: TimelinePageQuery): Promise<TimelinePage> {
    const snapshot = await this.getWorkbenchSnapshot();
    const entries = snapshot.recentEvents
      .filter((event) => event.runId === query.runId)
      .map(mapEventToTimelineEntry)
      .slice(-(query.limit ?? 50));

    return createEmptyTimelinePage(query.runId, {
      entries,
      limit: query.limit ?? 50,
      nextBeforeRevision: query.beforeRevision ?? null,
      revision: snapshot.revision,
    });
  }

  async getInspectorSnapshot(runId: string): Promise<InspectorSnapshot> {
    const snapshot = await this.getWorkbenchSnapshot();
    const eventCount = snapshot.recentEvents.filter((event) => event.runId === runId).length;

    return createEmptyInspectorSnapshot(runId, {
      overview: {
        baseUrl: this.config.baseUrl,
        eventCount,
      },
      revision: snapshot.revision,
    });
  }

  async getSettingsSnapshot(): Promise<SettingsSnapshot> {
    let version = 'unknown';

    try {
      const health = (await this.client.get('/health')) as Record<string, unknown>;
      version = typeof health.version === 'string' ? health.version : version;
    } catch {
      // Health is a convenience hint only; settings still render without it.
    }

    const snapshot = await this.getWorkbenchSnapshot();
    return createEmptySettingsSnapshot({
      coreSessionId: snapshot.coreSessionId,
      revision: snapshot.revision,
      sections: [
        {
          fields: [
            {
              fieldId: 'core.baseUrl',
              kind: 'text',
              label: 'Core Base URL',
              locked: true,
              value: this.config.baseUrl,
            },
            {
              fieldId: 'core.version',
              kind: 'text',
              label: 'Core Version',
              locked: true,
              value: version,
            },
          ],
          locked: true,
          sectionId: 'core',
          title: 'Core Connection',
        },
      ],
    });
  }

  async listTemplates(): Promise<readonly TemplateDescriptor[]> {
    return this.templateRegistry.listTemplates();
  }

  async postCommand(command: CoreCommandRequest): Promise<CoreCommandAck> {
    if (command.command === 'event.publish') {
      return parseCoreCommandAck(await this.client.post('/_dev/publish', command.payload));
    }

    throw new CoreHttpError(
      {
        code: 'command_not_supported',
        message: 'Real Core command routes are not available yet in T006.',
      },
      501,
    );
  }

  async probeCommand(ackId: string): Promise<CoreProbeResult> {
    return normalizeCoreProbeResult(await this.client.get(`/acks/${ackId}`));
  }
}
