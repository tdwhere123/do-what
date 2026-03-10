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

export interface TimelinePageQuery {
  beforeRevision?: number | null;
  limit?: number;
  runId: string;
}

export interface CoreApiAdapter {
  getInspectorSnapshot(runId: string): Promise<InspectorSnapshot>;
  getSettingsSnapshot(): Promise<SettingsSnapshot>;
  getTimelinePage(query: TimelinePageQuery): Promise<TimelinePage>;
  getWorkbenchSnapshot(): Promise<WorkbenchSnapshot>;
  listTemplates(): Promise<readonly TemplateDescriptor[]>;
  postCommand(command: CoreCommandRequest): Promise<CoreCommandAck>;
  probeCommand(ackId: string): Promise<CoreProbeResult>;
}
