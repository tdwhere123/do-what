import EventEmitter from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import type { BaseEvent } from '@do-what/protocol';

import { CodexAdapter, type CodexAdapterEventBus, type CodexRunConfig } from '../codex-adapter.js';
import type { ApprovalQueueClient } from '../approval-handler.js';
import type { CodexProcess } from '../codex-process.js';

class FakeEventBus implements CodexAdapterEventBus {
  private readonly emitter = new EventEmitter();
  public readonly events: BaseEvent[] = [];

  off(eventType: string, listener: (event: BaseEvent) => void): void {
    this.emitter.off(eventType, listener);
  }

  on(eventType: string, listener: (event: BaseEvent) => void): void {
    this.emitter.on(eventType, listener);
  }

  publish<TEvent extends BaseEvent>(event: TEvent): TEvent {
    this.events.push(event);
    const channel =
      'event' in event
        ? String(event.event)
        : 'type' in event
          ? String(event.type)
          : `status:${getEventStatus(event)}`;
    this.emitter.emit(channel, event);
    return event;
  }
}

function getEventStatus(event: BaseEvent): string {
  const status = (event as BaseEvent & { status?: unknown }).status;
  return typeof status === 'string' ? status : 'unknown';
}

class FakeCodexProcess extends EventEmitter {
  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.emit('exit', code, signal);
  }

  emitMessage(message: Record<string, unknown>): void {
    this.emit('message', message);
  }
}

class FakeProcessManager {
  public readonly processes = new Map<string, FakeCodexProcess>();
  public readonly sent: Array<{ message: Record<string, unknown>; runId: string }> = [];

  killAll(): void {
    this.processes.clear();
  }

  send(runId: string, message: Record<string, unknown>): void {
    this.sent.push({ message, runId });
  }

  spawn(runId: string, _config: CodexRunConfig): CodexProcess {
    const process = new FakeCodexProcess();
    this.processes.set(runId, process);
    return process as unknown as CodexProcess;
  }
}

describe('CodexAdapter', () => {
  it('publishes normalized run events and input messages', () => {
    const eventBus = new FakeEventBus();
    const processManager = new FakeProcessManager();
    const adapter = new CodexAdapter({
      eventBus,
      processManager: processManager as never,
      version: '1.2.3',
    });

    const process = adapter.startRun({ runId: 'run-1' }) as unknown as FakeCodexProcess;
    process.emitMessage({ type: 'token_stream', text: 'hello' });
    process.emitMessage({ type: 'run_complete', duration: 12 });
    adapter.sendInput('run-1', 'continue');
    process.emitExit(0, null);

    expect(
      eventBus.events.map((event) =>
        'event' in event
          ? event.event
          : 'type' in event
            ? event.type
            : getEventStatus(event),
      ),
    ).toEqual(['engine_connect', 'token_stream', 'completed', 'engine_disconnect']);
    expect(processManager.sent).toContainEqual({
      message: {
        content: 'continue',
        type: 'user_input',
      },
      runId: 'run-1',
    });

    adapter.stop();
  });

  it('bridges approval timeouts back into approval_response and cancel messages', async () => {
    const eventBus = new FakeEventBus();
    const processManager = new FakeProcessManager();
    const approvalMachine: ApprovalQueueClient = {
      enqueue: vi.fn(async () => ({
        approved: false,
        reason: 'approval timeout',
        status: 'timeout' as const,
      })),
    };
    const adapter = new CodexAdapter({
      approvalMachine,
      eventBus,
      processManager: processManager as never,
    });

    const process = adapter.startRun({ runId: 'run-approval' }) as unknown as FakeCodexProcess;
    process.emitMessage({
      args: {
        command: 'pnpm test',
      },
      request_id: 'approval-1',
      tool: 'tools.shell_exec',
      type: 'approval_request',
    });

    await vi.waitFor(() => {
      expect(processManager.sent).toHaveLength(2);
    });

    expect(processManager.sent).toEqual([
      {
        message: {
          approved: false,
          requestId: 'approval-1',
          type: 'approval_response',
        },
        runId: 'run-approval',
      },
      {
        message: {
          reason: 'approval timeout',
          type: 'cancel',
        },
        runId: 'run-approval',
      },
    ]);
    expect(
      eventBus.events.some(
        (event) => 'status' in event && event.status === 'waiting_approval',
      ),
    ).toBe(true);

    adapter.stop();
  });

  it('listens for externally published approval decisions and sends approval_response', () => {
    const eventBus = new FakeEventBus();
    const processManager = new FakeProcessManager();
    const adapter = new CodexAdapter({
      eventBus,
      processManager: processManager as never,
    });

    const process = adapter.startRun({ runId: 'run-external' }) as unknown as FakeCodexProcess;
    process.emitMessage({
      args: {
        content: 'updated',
        path: 'README.md',
      },
      requestId: 'approval-2',
      tool: 'tools.file_write',
      type: 'approval_request',
    });

    eventBus.publish({
      approvalId: 'approval-2',
      approvedBy: 'user',
      revision: 0,
      runId: 'run-external',
      source: 'core.ui',
      status: 'approved',
      timestamp: new Date().toISOString(),
    });

    expect(processManager.sent).toContainEqual({
      message: {
        approved: true,
        requestId: 'approval-2',
        type: 'approval_response',
      },
      runId: 'run-external',
    });

    adapter.stop();
  });
});
