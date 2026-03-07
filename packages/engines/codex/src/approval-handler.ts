import type {
  BaseEvent,
  ToolApprovedEvent,
  ToolDeniedEvent,
  ToolRequestedEvent,
} from '@do-what/protocol';

import type { JsonlMessage } from './jsonl-reader.js';

interface ApprovalDecisionEvent extends BaseEvent {
  approvalId?: string;
  input?: string;
  reason?: string;
  resolutionStatus?: string;
  status: string;
}

interface PendingApproval {
  runId: string;
}

export interface ApprovalQueueClient {
  enqueue: (item: {
    approvalId?: string;
    args: Readonly<Record<string, unknown>>;
    requestedAt?: string;
    runId: string;
    toolName: string;
  }) => Promise<{
    approved: boolean;
    input?: string;
    reason?: string;
    status: 'approved' | 'denied' | 'timeout';
  }>;
}

export interface ApprovalEventBus {
  off(eventType: string, listener: (event: BaseEvent) => void): void;
  on(eventType: string, listener: (event: BaseEvent) => void): void;
  publish<TEvent extends BaseEvent>(event: TEvent): TEvent;
}

export interface ApprovalHandlerOptions {
  approvalMachine?: ApprovalQueueClient;
  eventBus: ApprovalEventBus;
  now?: () => string;
  sendMessage: (runId: string, message: JsonlMessage) => void;
  source?: string;
}

function extractApprovalId(event: BaseEvent): string | undefined {
  const value = (event as BaseEvent & { approvalId?: unknown }).approvalId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractInput(event: BaseEvent): string | undefined {
  const value = (event as BaseEvent & { input?: unknown }).input;
  return typeof value === 'string' ? value : undefined;
}

export class ApprovalHandler {
  private readonly approvalMachine?: ApprovalQueueClient;
  private readonly eventBus: ApprovalEventBus;
  private readonly now: () => string;
  private readonly pending = new Map<string, PendingApproval>();
  private readonly sendMessage: (runId: string, message: JsonlMessage) => void;
  private readonly source: string;

  private readonly onApproved = (event: BaseEvent) => {
    this.handleApproved(event as ApprovalDecisionEvent);
  };

  private readonly onDenied = (event: BaseEvent) => {
    this.handleDenied(event as ApprovalDecisionEvent);
  };

  constructor(options: ApprovalHandlerOptions) {
    this.approvalMachine = options.approvalMachine;
    this.eventBus = options.eventBus;
    this.now = options.now ?? (() => new Date().toISOString());
    this.sendMessage = options.sendMessage;
    this.source = options.source ?? 'engine.codex.approval';

    this.eventBus.on('status:approved', this.onApproved);
    this.eventBus.on('status:denied', this.onDenied);
  }

  requestApproval(event: ToolRequestedEvent & { approvalId?: string }): void {
    const approvalId = event.approvalId;
    if (!approvalId) {
      console.warn('[codex][approval-handler] missing approvalId on tool request');
      return;
    }

    this.pending.set(approvalId, {
      runId: event.runId,
    });

    if (!this.approvalMachine) {
      return;
    }

    void this.approvalMachine
      .enqueue({
        approvalId,
        args: event.args,
        requestedAt: event.timestamp,
        runId: event.runId,
        toolName: event.toolName,
      })
      .then((resolution) => {
        this.publishResolution(event, resolution);
      })
      .catch((error) => {
        console.warn('[codex][approval-handler] approval queue failed', error);
      });
  }

  stop(): void {
    this.eventBus.off('status:approved', this.onApproved);
    this.eventBus.off('status:denied', this.onDenied);
    this.pending.clear();
  }

  private handleApproved(event: ApprovalDecisionEvent): void {
    const approvalId = extractApprovalId(event);
    if (!approvalId) {
      return;
    }

    const pending = this.pending.get(approvalId);
    if (!pending) {
      return;
    }

    const input = extractInput(event);
    this.sendMessage(pending.runId, {
      approved: true,
      ...(input ? { input } : {}),
      requestId: approvalId,
      type: 'approval_response',
    });
    this.pending.delete(approvalId);
  }

  private handleDenied(event: ApprovalDecisionEvent): void {
    const approvalId = extractApprovalId(event);
    if (!approvalId) {
      return;
    }

    const pending = this.pending.get(approvalId);
    if (!pending) {
      return;
    }

    this.sendMessage(pending.runId, {
      approved: false,
      requestId: approvalId,
      type: 'approval_response',
    });

    if (event.resolutionStatus === 'timeout' || event.reason === 'approval timeout') {
      this.sendMessage(pending.runId, {
        reason: event.reason ?? 'approval timeout',
        type: 'cancel',
      });
    }

    this.pending.delete(approvalId);
  }

  private publishResolution(
    request: ToolRequestedEvent & { approvalId?: string },
    resolution: Awaited<ReturnType<ApprovalQueueClient['enqueue']>>,
  ): void {
    const approvalId = request.approvalId;
    if (!approvalId) {
      return;
    }

    if (resolution.approved) {
      const event: ToolApprovedEvent & { approvalId: string; input?: string } = {
        approvalId,
        approvedBy: 'user',
        revision: 0,
        runId: request.runId,
        source: this.source,
        status: 'approved',
        timestamp: this.now(),
      };
      if (resolution.input) {
        event.input = resolution.input;
      }
      this.eventBus.publish(event);
      return;
    }

    const deniedEvent: ToolDeniedEvent & {
      approvalId: string;
      resolutionStatus: string;
    } = {
      approvalId,
      reason: resolution.reason ?? 'approval denied',
      resolutionStatus: resolution.status,
      revision: 0,
      runId: request.runId,
      source: this.source,
      status: 'denied',
      timestamp: this.now(),
    };
    this.eventBus.publish(deniedEvent);
  }
}
