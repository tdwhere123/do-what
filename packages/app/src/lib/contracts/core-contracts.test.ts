import { describe, expect, it } from 'vitest';
import { CoreHttpError } from '../core-http-client';
import {
  createEmptyInspectorSnapshot,
  createEmptySettingsSnapshot,
  createEmptyTimelinePage,
  normalizeCoreError,
  normalizeCoreProbeResult,
  normalizeCoreSseEnvelope,
  normalizeLegacyStateSnapshot,
  parseCoreCommandAck,
  parseTemplateDescriptors,
} from './core-contracts';

describe('core contracts', () => {
  it('normalizes the legacy /state payload into the app workbench snapshot contract', () => {
    const snapshot = normalizeLegacyStateSnapshot({
      pendingApprovals: [
        {
          approvalId: 'approval-1',
          createdAt: '2026-03-10T00:00:00.000Z',
          runId: 'run-1',
          toolName: 'tools.shell_exec',
        },
      ],
      recentEvents: [
        {
          isComplete: false,
          revision: 4,
          runId: 'run-1',
          source: 'test',
          text: 'hello',
          timestamp: '2026-03-10T00:00:00.000Z',
          type: 'token_stream',
        },
      ],
      revision: 4,
    });

    expect(snapshot.revision).toBe(4);
    expect(snapshot.pendingApprovals).toHaveLength(1);
    expect(snapshot.recentEvents).toHaveLength(1);
  });

  it('normalizes snake_case ack payloads and command errors', () => {
    const probe = normalizeCoreProbeResult({
      ack_id: 'ack-1',
      created_at: '2026-03-10T00:00:00.000Z',
      entity_id: 'run-1',
      entity_type: 'run',
      revision: 5,
      status: 'committed',
    });

    expect(probe.ackId).toBe('ack-1');
    expect(probe.entityType).toBe('run');

    const error = normalizeCoreError({
      error: {
        code: 'RUN_NOT_FOUND',
        details: {
          runId: 'run-missing',
        },
        message: 'Run not found',
      },
    });

    expect(error.code).toBe('RUN_NOT_FOUND');
    expect(error.message).toBe('Run not found');
  });

  it('preserves structured CoreHttpError instances during normalization', () => {
    const error = normalizeCoreError(
      new CoreHttpError(
        {
          code: 'auth_required',
          details: {
            stage: 'bootstrap',
          },
          message: 'Unauthorized',
        },
        401,
      ),
    );

    expect(error.code).toBe('auth_required');
    expect(error.message).toBe('Unauthorized');
    expect(error.details).toEqual({
      stage: 'bootstrap',
    });
  });

  it('parses legacy bare SSE events into the envelope contract', () => {
    const envelope = normalizeCoreSseEnvelope({
      isComplete: false,
      revision: 7,
      runId: 'run-1',
      source: 'test',
      text: 'chunk',
      timestamp: '2026-03-10T00:00:00.000Z',
      type: 'token_stream',
    });

    expect(envelope.revision).toBe(7);
    expect(envelope.event.runId).toBe('run-1');
  });

  it('provides empty defaults for future projection contracts', () => {
    expect(createEmptyTimelinePage('run-1').entries).toEqual([]);
    expect(createEmptyInspectorSnapshot('run-1').plans).toEqual([]);
    expect(createEmptySettingsSnapshot().sections).toEqual([]);
  });

  it('parses command ack envelopes and template descriptors', () => {
    expect(
      parseCoreCommandAck({
        ackId: 'ack-1',
        ok: true,
      }).ackId,
    ).toBe('ack-1');

    expect(
      parseTemplateDescriptors([
        {
          description: 'Default template',
          inputs: [],
          templateId: 'default',
          title: 'Default',
        },
      ]),
    ).toHaveLength(1);
  });
});
