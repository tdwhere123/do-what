import type {
  ApprovalDecisionRequest,
  ApprovalProbe,
  CoreCommandAck,
  CoreCommandRequest,
  CoreProbeResult,
  CreateRunRequest,
  CreateWorkspaceRequest,
  DriftResolutionRequest,
  InspectorSnapshot,
  IntegrationGateDecisionRequest,
  MemoryEditRequest,
  MemoryPinRequest,
  MemoryProbe,
  MemoryProposalReviewRequest,
  MemorySupersedeRequest,
  RunMessageRequest,
  SettingsPatchRequest,
  SettingsSnapshot,
  TemplateDescriptor,
  TimelinePage,
  WorkbenchSnapshot,
} from '@do-what/protocol';
import {
  normalizeCoreProbeResult,
  parseApprovalProbe,
  parseCoreCommandAck,
  parseInspectorSnapshot,
  parseMemoryProbe,
  parseSettingsSnapshot,
  parseTemplateDescriptors,
  parseTimelinePage,
  parseWorkbenchSnapshot,
} from '../contracts';
import type { RuntimeCoreConfig } from '../runtime/runtime-config';
import { CoreHttpError, createCoreHttpClient } from './core-http-client';
import type { CoreApiAdapter, TimelinePageQuery } from './core-api-adapter';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  throw new CoreHttpError(
    {
      code: 'invalid_command_payload',
      details: { fieldName, value },
      message: 'Command payload is missing the required string field: ' + fieldName,
    },
    400,
  );
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function buildTimelinePath(query: TimelinePageQuery): string {
  const params = new URLSearchParams();
  if (typeof query.beforeRevision === 'number') {
    params.set('beforeRevision', String(query.beforeRevision));
  }
  if (typeof query.limit === 'number') {
    params.set('limit', String(query.limit));
  }

  const search = params.toString();
  const basePath = '/api/runs/' + encodeURIComponent(query.runId) + '/timeline';
  return search ? basePath + '?' + search : basePath;
}

function extractCommandBody(command: CoreCommandRequest): Record<string, unknown> {
  return asRecord(command.payload);
}

function omitKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

export class HttpCoreApiAdapter implements CoreApiAdapter {
  private readonly client: ReturnType<typeof createCoreHttpClient>;

  constructor(
    config: RuntimeCoreConfig,
    _templateRegistry: unknown,
    fetchImpl?: typeof fetch,
  ) {
    this.client = createCoreHttpClient({
      baseUrl: config.baseUrl,
      fetchImpl,
      sessionToken: () => config.readFreshSessionToken?.() ?? config.sessionToken,
    });
  }

  async getApprovalProbe(approvalId: string): Promise<ApprovalProbe> {
    return parseApprovalProbe(
      await this.client.get('/api/approvals/' + encodeURIComponent(approvalId)),
    );
  }

  async getWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
    return parseWorkbenchSnapshot(await this.client.get('/api/workbench/snapshot'));
  }

  async getTimelinePage(query: TimelinePageQuery): Promise<TimelinePage> {
    return parseTimelinePage(await this.client.get(buildTimelinePath(query)));
  }

  async getInspectorSnapshot(runId: string): Promise<InspectorSnapshot> {
    return parseInspectorSnapshot(
      await this.client.get('/api/runs/' + encodeURIComponent(runId) + '/inspector'),
    );
  }

  async getMemoryProbe(memoryId: string): Promise<MemoryProbe> {
    return parseMemoryProbe(
      await this.client.get('/api/memory/' + encodeURIComponent(memoryId)),
    );
  }

  async getSettingsSnapshot(): Promise<SettingsSnapshot> {
    return parseSettingsSnapshot(await this.client.get('/api/settings'));
  }

  async listTemplates(): Promise<readonly TemplateDescriptor[]> {
    return parseTemplateDescriptors(await this.client.get('/api/workflows/templates'));
  }

  async postCommand(command: CoreCommandRequest): Promise<CoreCommandAck> {
    switch (command.command) {
      case 'approval.resolve':
        return this.postApprovalDecision(command);
      case 'governance.decide_integration_gate':
        return this.postIntegrationGateDecision(command);
      case 'governance.resolve_drift':
        return this.postDriftResolution(command);
      case 'memory.govern':
        return this.postMemoryGovernance(command);
      case 'memory.proposal.review':
        return this.postMemoryProposalReview(command);
      case 'run.create':
        return this.postCreateRun(command);
      case 'run.message':
        return this.postRunMessage(command);
      case 'workspace.create':
        return this.postCreateWorkspace(command);
      case 'settings.update':
        return this.patchSettings(command);
      default:
        throw new CoreHttpError(
          {
            code: 'command_not_supported',
            details: {
              command: command.command,
            },
            message: 'Real Core adapter does not support command: ' + command.command,
          },
          501,
        );
    }
  }

  async probeCommand(ackId: string): Promise<CoreProbeResult> {
    return normalizeCoreProbeResult(
      await this.client.get('/acks/' + encodeURIComponent(ackId)),
    );
  }

  private async postApprovalDecision(
    command: CoreCommandRequest,
  ): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const approvalId = readRequiredString(payload.approvalId ?? payload.entityId, 'approvalId');
    const body: ApprovalDecisionRequest = {
      clientCommandId: command.clientCommandId,
      decision: readRequiredString(payload.decision, 'decision') as ApprovalDecisionRequest['decision'],
    };

    return parseCoreCommandAck(
      await this.client.post(
        '/api/approvals/' + encodeURIComponent(approvalId) + '/decide',
        body,
      ),
    );
  }

  private async postCreateRun(command: CoreCommandRequest): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const body: CreateRunRequest = {
      clientCommandId: command.clientCommandId,
      participants: readStringArray(payload.participants),
      templateId: readRequiredString(payload.templateId, 'templateId'),
      templateInputs: asRecord(payload.templateInputs),
      templateVersion:
        typeof payload.templateVersion === 'string' ||
        typeof payload.templateVersion === 'number'
          ? payload.templateVersion
          : undefined,
      workspaceId: readRequiredString(command.workspaceId ?? payload.workspaceId, 'workspaceId'),
    };

    return parseCoreCommandAck(await this.client.post('/api/runs', body));
  }

  private async postCreateWorkspace(
    command: CoreCommandRequest,
  ): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const body: CreateWorkspaceRequest = {
      clientCommandId: command.clientCommandId,
      name: readRequiredString(payload.name, 'name').trim(),
    };

    return parseCoreCommandAck(await this.client.post('/api/workspaces', body));
  }

  private async postDriftResolution(
    command: CoreCommandRequest,
  ): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const nodeId = readRequiredString(
      payload.nodeId ?? payload.actionId ?? payload.entityId,
      'nodeId',
    );
    const body: DriftResolutionRequest = {
      clientCommandId: command.clientCommandId,
      mode: readRequiredString(payload.mode, 'mode') as DriftResolutionRequest['mode'],
    };

    return parseCoreCommandAck(
      await this.client.post(
        '/api/nodes/' + encodeURIComponent(nodeId) + '/resolve-drift',
        body,
      ),
    );
  }

  private async postIntegrationGateDecision(
    command: CoreCommandRequest,
  ): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const runId = readRequiredString(command.runId ?? payload.runId, 'runId');
    const body: IntegrationGateDecisionRequest = {
      clientCommandId: command.clientCommandId,
      decision: readRequiredString(payload.decision, 'decision') as IntegrationGateDecisionRequest['decision'],
      gateId: readOptionalString(payload.gateId),
    };

    return parseCoreCommandAck(
      await this.client.post(
        '/api/runs/' + encodeURIComponent(runId) + '/integration-gate/decide',
        body,
      ),
    );
  }

  private async postMemoryGovernance(
    command: CoreCommandRequest,
  ): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const memoryId = readRequiredString(payload.memoryId ?? payload.entityId, 'memoryId');
    const mode = readRequiredString(payload.mode, 'mode');
    const projectOverride = payload.projectOverride === true;
    const dynamicPayload = omitKeys(payload, ['memoryId', 'mode', 'projectOverride']);

    if (mode === 'pin') {
      const body: MemoryPinRequest = {
        clientCommandId: command.clientCommandId,
        projectOverride,
      };
      return parseCoreCommandAck(
        await this.client.post(
          '/api/memory/' + encodeURIComponent(memoryId) + '/pin',
          body,
        ),
      );
    }

    if (mode === 'edit') {
      const body: MemoryEditRequest = {
        clientCommandId: command.clientCommandId,
        patch: isRecord(payload.patch) ? payload.patch : dynamicPayload,
        projectOverride,
      };
      return parseCoreCommandAck(
        await this.client.post(
          '/api/memory/' + encodeURIComponent(memoryId) + '/edit',
          body,
        ),
      );
    }

    if (mode === 'supersede') {
      const body: MemorySupersedeRequest = {
        clientCommandId: command.clientCommandId,
        projectOverride,
        replacement: isRecord(payload.replacement) ? payload.replacement : dynamicPayload,
      };
      return parseCoreCommandAck(
        await this.client.post(
          '/api/memory/' + encodeURIComponent(memoryId) + '/supersede',
          body,
        ),
      );
    }

    throw new CoreHttpError(
      {
        code: 'invalid_command_payload',
        details: { mode },
        message: 'Unsupported memory governance mode: ' + mode,
      },
      400,
    );
  }

  private async postMemoryProposalReview(
    command: CoreCommandRequest,
  ): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const proposalId = readRequiredString(payload.proposalId, 'proposalId');
    const body: MemoryProposalReviewRequest = {
      clientCommandId: command.clientCommandId,
      edits: isRecord(payload.edits) ? payload.edits : undefined,
      mode: readRequiredString(payload.mode, 'mode') as MemoryProposalReviewRequest['mode'],
    };

    return parseCoreCommandAck(
      await this.client.post(
        '/api/memory/proposals/' + encodeURIComponent(proposalId) + '/review',
        body,
      ),
    );
  }

  private async postRunMessage(command: CoreCommandRequest): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const runId = readRequiredString(command.runId ?? payload.runId, 'runId');
    const body: RunMessageRequest = {
      body: readRequiredString(payload.body, 'body'),
      clientCommandId: command.clientCommandId,
    };

    return parseCoreCommandAck(
      await this.client.post(
        '/api/runs/' + encodeURIComponent(runId) + '/messages',
        body,
      ),
    );
  }

  private async patchSettings(command: CoreCommandRequest): Promise<CoreCommandAck> {
    const payload = extractCommandBody(command);
    const body: SettingsPatchRequest = {
      clientCommandId: command.clientCommandId,
      fields: asRecord(payload.fields),
    };

    return parseCoreCommandAck(await this.client.patch('/api/settings', body));
  }
}

