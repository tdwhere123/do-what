import type {
  ApprovalProbe,
  CoreCommandAck,
  CoreCommandRequest,
  CoreProbeResult,
  InspectorSnapshot,
  MemoryProbe,
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
  getApprovalProbe(approvalId: string): Promise<ApprovalProbe>;
  getInspectorSnapshot(runId: string): Promise<InspectorSnapshot>;
  getMemoryProbe(memoryId: string): Promise<MemoryProbe>;
  getSettingsSnapshot(): Promise<SettingsSnapshot>;
  getTimelinePage(query: TimelinePageQuery): Promise<TimelinePage>;
  getWorkbenchSnapshot(): Promise<WorkbenchSnapshot>;
  listTemplates(): Promise<readonly TemplateDescriptor[]>;
  postCommand(command: CoreCommandRequest): Promise<CoreCommandAck>;
  probeCommand(ackId: string): Promise<CoreProbeResult>;
}
