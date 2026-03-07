import type {
  BaseEvent,
  RunFailedEvent,
  RunWaitingApprovalEvent,
  SystemEngineConnectEvent,
  SystemEngineDisconnectEvent,
  ToolRequestedEvent,
} from '@do-what/protocol';

import { ApprovalHandler, type ApprovalEventBus, type ApprovalQueueClient } from './approval-handler.js';
import { CodexProcessManager, type CodexProcessManagerOptions } from './codex-process-manager.js';
import type { CodexProcess } from './codex-process.js';
import { EventNormalizer } from './event-normalizer.js';

interface AdapterRunState {
  process: CodexProcess;
  seenTerminalEvent: boolean;
}

export interface CodexAdapterEventBus extends ApprovalEventBus {}

export interface CodexRunConfig extends CodexProcessManagerOptions {
  runId: string;
  version?: string;
}

export interface CodexAdapterOptions {
  approvalMachine?: ApprovalQueueClient;
  eventBus: CodexAdapterEventBus;
  now?: () => string;
  processManager?: CodexProcessManager;
  source?: string;
  version?: string;
}

function extractApprovalId(event: ToolRequestedEvent): string | undefined {
  const value = (event as ToolRequestedEvent & { approvalId?: unknown }).approvalId;
  return typeof value === 'string' ? value : undefined;
}

function isTerminalStatus(event: BaseEvent): boolean {
  const status = (event as BaseEvent & { status?: unknown }).status;
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function isToolRequest(event: BaseEvent): event is ToolRequestedEvent {
  const candidate = event as BaseEvent & { status?: unknown; toolName?: unknown; args?: unknown };
  return (
    candidate.status === 'requested' &&
    typeof candidate.toolName === 'string' &&
    typeof candidate.args === 'object' &&
    candidate.args !== null
  );
}

export class CodexAdapter {
  private readonly approvalHandler: ApprovalHandler;
  private readonly eventBus: CodexAdapterEventBus;
  private readonly now: () => string;
  private readonly processManager: CodexProcessManager;
  private readonly runs = new Map<string, AdapterRunState>();
  private readonly source: string;
  private readonly version: string;

  constructor(options: CodexAdapterOptions) {
    this.eventBus = options.eventBus;
    this.now = options.now ?? (() => new Date().toISOString());
    this.processManager = options.processManager ?? new CodexProcessManager();
    this.source = options.source ?? 'engine.codex';
    this.version = options.version ?? 'unknown';
    this.approvalHandler = new ApprovalHandler({
      approvalMachine: options.approvalMachine,
      eventBus: this.eventBus,
      now: this.now,
      sendMessage: (runId, message) => {
        this.processManager.send(runId, message);
      },
    });
  }

  cancelRun(runId: string): void {
    this.processManager.send(runId, { type: 'cancel' });
  }

  sendInput(runId: string, input: string): void {
    this.processManager.send(runId, {
      content: input,
      type: 'user_input',
    });
  }

  startRun(config: CodexRunConfig): CodexProcess {
    const process = this.processManager.spawn(config.runId, config);
    const normalizer = new EventNormalizer({
      now: this.now,
      runId: config.runId,
      source: this.source,
    });

    const runState: AdapterRunState = {
      process,
      seenTerminalEvent: false,
    };
    this.runs.set(config.runId, runState);

    process.on('message', (message) => {
      const normalized = normalizer.normalize(message);
      if (!normalized) {
        return;
      }

      if (isTerminalStatus(normalized)) {
        runState.seenTerminalEvent = true;
      }

      this.eventBus.publish(normalized);

      if (isToolRequest(normalized)) {
        this.handleToolRequest(normalized);
      }
    });

    process.on('error', (error) => {
      console.warn('[codex][adapter] process error', error);
    });

    process.on('exit', (code, signal) => {
      this.handleProcessExit(config.runId, runState, code, signal);
    });

    this.publishEngineConnect(config.runId, config.version);
    return process;
  }

  stop(): void {
    this.approvalHandler.stop();
    this.processManager.killAll();
    this.runs.clear();
  }

  private handleProcessExit(
    runId: string,
    runState: AdapterRunState,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    this.publishEngineDisconnect(runId, code, signal);

    if (!runState.seenTerminalEvent && code !== 0) {
      const failureEvent: RunFailedEvent = {
        code: code === null ? undefined : String(code),
        error: signal ? `Codex exited with signal ${signal}` : 'Codex process exited unexpectedly',
        revision: 0,
        runId,
        source: this.source,
        status: 'failed',
        timestamp: this.now(),
      };
      this.eventBus.publish(failureEvent);
    }

    this.runs.delete(runId);
  }

  private handleToolRequest(event: ToolRequestedEvent): void {
    const approvalId = extractApprovalId(event);
    if (!approvalId) {
      return;
    }

    const waitingEvent: RunWaitingApprovalEvent = {
      approvalId,
      revision: 0,
      runId: event.runId,
      source: this.source,
      status: 'waiting_approval',
      timestamp: this.now(),
      toolName: event.toolName,
    };
    this.eventBus.publish(waitingEvent);
    this.approvalHandler.requestApproval({
      ...event,
      approvalId,
    });
  }

  private publishEngineConnect(runId: string, version: string | undefined): void {
    const event: SystemEngineConnectEvent = {
      engineType: 'codex',
      event: 'engine_connect',
      revision: 0,
      runId,
      source: this.source,
      timestamp: this.now(),
      version: version ?? this.version,
    };
    this.eventBus.publish(event);
  }

  private publishEngineDisconnect(
    runId: string,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const reason =
      code === 0
        ? 'process_exit'
        : signal
          ? `signal:${signal}`
          : `exit_code:${code ?? 'unknown'}`;

    const event: SystemEngineDisconnectEvent = {
      engineType: 'codex',
      event: 'engine_disconnect',
      reason,
      revision: 0,
      runId,
      source: this.source,
      timestamp: this.now(),
    };
    this.eventBus.publish(event);
  }
}
