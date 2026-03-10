import { describe, expect, it } from 'vitest';
import {
  CoreCommandAckSchema,
  CoreProbeResultSchema,
  CoreSseEnvelopeSchema,
  SettingsSnapshotSchema,
  TemplateDescriptorSchema,
  TimelinePageSchema,
  WorkbenchSnapshotSchema,
} from '../index.js';

describe('ui contract schemas', () => {
  it('accepts a normalized workbench snapshot payload', () => {
    const parsed = WorkbenchSnapshotSchema.parse({
      connectionState: 'connected',
      coreSessionId: 'core-session-1',
      health: {
        claude: 'healthy',
        codex: 'idle',
        core: 'healthy',
        network: 'healthy',
        soul: 'idle',
      },
      pendingApprovals: [
        {
          approvalId: 'approval-1',
          createdAt: '2026-03-10T00:00:00.000Z',
          runId: 'run-1',
          toolName: 'tools.shell_exec',
        },
      ],
      recentEvents: [],
      revision: 12,
      runs: [],
      workspaces: [],
    });

    expect(parsed.revision).toBe(12);
    expect(parsed.pendingApprovals[0]?.approvalId).toBe('approval-1');
  });

  it('accepts timeline, settings, and template descriptor baselines', () => {
    expect(
      TimelinePageSchema.parse({
        entries: [],
        hasMore: false,
        limit: 50,
        nextBeforeRevision: null,
        revision: 0,
        runId: 'run-1',
      }).runId,
    ).toBe('run-1');

    expect(
      SettingsSnapshotSchema.parse({
        coreSessionId: null,
        lease: {
          leaseId: null,
          lockedFields: [],
          status: 'none',
        },
        revision: 0,
        sections: [],
      }).lease.status,
    ).toBe('none');

    expect(
      TemplateDescriptorSchema.parse({
        description: 'Create a basic coding run',
        inputs: [],
        templateId: 'default',
        title: 'Default',
      }).templateId,
    ).toBe('default');
  });

  it('accepts command ack, probe, and SSE envelope payloads', () => {
    expect(
      CoreCommandAckSchema.parse({
        ackId: 'ack-1',
        ok: true,
        revision: 3,
      }).ackId,
    ).toBe('ack-1');

    expect(
      CoreProbeResultSchema.parse({
        ackId: 'ack-1',
        ok: true,
        status: 'pending',
      }).status,
    ).toBe('pending');

    expect(
      CoreSseEnvelopeSchema.parse({
        coreSessionId: 'core-session-1',
        event: {
          isComplete: false,
          revision: 3,
          runId: 'run-1',
          source: 'test',
          text: 'hello',
          timestamp: '2026-03-10T00:00:00.000Z',
          type: 'token_stream',
        },
        revision: 3,
      }).revision,
    ).toBe(3);
  });
});
