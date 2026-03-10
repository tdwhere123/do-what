import type {
  CoreCommandAck,
  CoreCommandRequest,
  CoreProbeResult,
  InspectorSnapshot,
  SettingsSnapshot,
  TemplateDescriptor,
  TimelinePage,
  WorkbenchSnapshot,
} from '@do-what/protocol';
import { parseCoreCommandAck } from '../contracts';
import type { CoreApiAdapter, TimelinePageQuery } from '../core-http-client/core-api-adapter';
import type { TemplateRegistryAdapter } from '../template-registry/template-registry-adapter';
import {
  ACTIVE_INSPECTOR_FIXTURE,
  ACTIVE_TIMELINE_FIXTURE,
  ACTIVE_WORKBENCH_FIXTURE,
  DEFAULT_SETTINGS_FIXTURE,
  DESYNCED_WORKBENCH_FIXTURE,
  EMPTY_INSPECTOR_FIXTURE,
  EMPTY_TIMELINE_FIXTURE,
  EMPTY_WORKBENCH_FIXTURE,
  LEASE_LOCKED_SETTINGS_FIXTURE,
  TEMPLATE_FIXTURES,
} from '../../test/fixtures';

export type MockScenarioName =
  | 'active'
  | 'desynced'
  | 'empty'
  | 'lease_locked';

export interface MockCoreApiAdapterOptions {
  ackStatus?: CoreProbeResult['status'];
  scenario?: MockScenarioName;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getWorkbenchFixture(scenario: MockScenarioName): WorkbenchSnapshot {
  switch (scenario) {
    case 'desynced':
      return DESYNCED_WORKBENCH_FIXTURE;
    case 'empty':
      return EMPTY_WORKBENCH_FIXTURE;
    default:
      return ACTIVE_WORKBENCH_FIXTURE;
  }
}

function getTimelineFixture(scenario: MockScenarioName): TimelinePage {
  return scenario === 'empty' ? EMPTY_TIMELINE_FIXTURE : ACTIVE_TIMELINE_FIXTURE;
}

function getInspectorFixture(scenario: MockScenarioName): InspectorSnapshot {
  return scenario === 'empty' ? EMPTY_INSPECTOR_FIXTURE : ACTIVE_INSPECTOR_FIXTURE;
}

function getSettingsFixture(scenario: MockScenarioName): SettingsSnapshot {
  return scenario === 'lease_locked'
    ? LEASE_LOCKED_SETTINGS_FIXTURE
    : DEFAULT_SETTINGS_FIXTURE;
}

export class MockTemplateRegistryAdapter implements TemplateRegistryAdapter {
  async listTemplates(): Promise<readonly TemplateDescriptor[]> {
    return clone(TEMPLATE_FIXTURES);
  }
}

export class MockCoreApiAdapter implements CoreApiAdapter {
  private readonly ackStatus: CoreProbeResult['status'];
  private readonly scenario: MockScenarioName;
  private readonly templates: MockTemplateRegistryAdapter;
  private readonly probeState = new Map<string, CoreProbeResult>();

  constructor(options: MockCoreApiAdapterOptions = {}) {
    this.ackStatus = options.ackStatus ?? 'committed';
    this.scenario = options.scenario ?? 'active';
    this.templates = new MockTemplateRegistryAdapter();
  }

  async getWorkbenchSnapshot(): Promise<WorkbenchSnapshot> {
    return clone(getWorkbenchFixture(this.scenario));
  }

  async getTimelinePage(query: TimelinePageQuery): Promise<TimelinePage> {
    const timeline = clone(getTimelineFixture(this.scenario));
    return {
      ...timeline,
      limit: query.limit ?? timeline.limit,
      nextBeforeRevision: query.beforeRevision ?? timeline.nextBeforeRevision,
      runId: query.runId,
    };
  }

  async getInspectorSnapshot(runId: string): Promise<InspectorSnapshot> {
    const fixture = clone(getInspectorFixture(this.scenario));
    return {
      ...fixture,
      runId,
    };
  }

  async getSettingsSnapshot(): Promise<SettingsSnapshot> {
    return clone(getSettingsFixture(this.scenario));
  }

  async listTemplates(): Promise<readonly TemplateDescriptor[]> {
    return this.templates.listTemplates();
  }

  async postCommand(command: CoreCommandRequest): Promise<CoreCommandAck> {
    const snapshot = getWorkbenchFixture(this.scenario);
    const revision = snapshot.revision + this.probeState.size + 1;
    const ackId = `ack-${command.clientCommandId}`;
    this.probeState.set(ackId, {
      ackId,
      createdAt: new Date('2026-03-10T00:00:00.000Z').toISOString(),
      entityId: command.runId ?? command.workspaceId ?? command.clientCommandId,
      entityType: command.runId ? 'run' : 'event',
      ok: this.ackStatus !== 'failed',
      revision,
      status: this.ackStatus,
      ...(this.ackStatus === 'failed' ? { error: 'Mock command rejected' } : {}),
    });

    return parseCoreCommandAck({
      ackId,
      ok: true,
      revision,
    });
  }

  async probeCommand(ackId: string): Promise<CoreProbeResult> {
    return (
      this.probeState.get(ackId) ?? {
        ackId,
        error: 'Ack not found in mock adapter',
        ok: false,
        status: 'failed',
      }
    );
  }
}

export function createMockCoreApiAdapter(
  options?: MockCoreApiAdapterOptions,
): MockCoreApiAdapter {
  return new MockCoreApiAdapter(options);
}
