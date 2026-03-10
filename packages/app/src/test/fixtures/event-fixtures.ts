import type { CoreSseEnvelope } from '@do-what/protocol';
import { normalizeCoreSseEnvelope } from '../../lib/contracts';

export const ACTIVE_EVENT_FIXTURES: readonly CoreSseEnvelope[] = [
  normalizeCoreSseEnvelope({
    coreSessionId: 'mock-core-active',
    event: {
      isComplete: false,
      revision: 25,
      runId: 'run-active-1',
      source: 'engine.codex',
      text: 'Running focused verification...',
      timestamp: '2026-03-10T09:32:00.000Z',
      type: 'token_stream',
    },
    revision: 25,
  }),
  normalizeCoreSseEnvelope({
    coreSessionId: 'mock-core-active',
    event: {
      approvalId: 'approval-active-1',
      revision: 26,
      runId: 'run-active-1',
      source: 'core.server',
      status: 'waiting_approval',
      timestamp: '2026-03-10T09:33:00.000Z',
      toolName: 'tools.shell_exec',
    },
    revision: 26,
  }),
];

export const CORE_RESTART_EVENT_FIXTURE: CoreSseEnvelope = normalizeCoreSseEnvelope({
  coreSessionId: 'mock-core-restarted',
  event: {
    engineType: 'codex',
    event: 'engine_connect',
    revision: 1,
    runId: 'run-active-1',
    source: 'core.server',
    timestamp: '2026-03-10T09:40:00.000Z',
    version: '1.0.0',
  },
  revision: 1,
});
