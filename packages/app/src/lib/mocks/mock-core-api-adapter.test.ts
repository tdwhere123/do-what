import { describe, expect, it } from 'vitest';
import { createMockCoreApiAdapter } from './mock-core-api-adapter';

describe('mock-adapter', () => {
  it('returns active fixtures and template descriptors from the shared contract', async () => {
    const adapter = createMockCoreApiAdapter({ scenario: 'active' });

    const snapshot = await adapter.getWorkbenchSnapshot();
    const timeline = await adapter.getTimelinePage({ runId: 'run-active-1' });
    const templates = await adapter.listTemplates();

    expect(snapshot.runs[0]?.runId).toBe('run-active-1');
    expect(timeline.entries.some((entry) => entry.kind === 'approval')).toBe(true);
    expect(templates[0]?.templateId).toBe('default');
  });

  it('supports empty and lease-locked scenarios without changing the consumer API', async () => {
    const emptyAdapter = createMockCoreApiAdapter({ scenario: 'empty' });
    const lockedAdapter = createMockCoreApiAdapter({ scenario: 'lease_locked' });

    const emptySnapshot = await emptyAdapter.getWorkbenchSnapshot();
    const lockedSettings = await lockedAdapter.getSettingsSnapshot();

    expect(emptySnapshot.runs).toHaveLength(0);
    expect(lockedSettings.lease.status).toBe('active');
    expect(lockedSettings.sections[0]?.locked).toBe(true);
  });

  it('tracks command acks and exposes probe status through the same adapter boundary', async () => {
    const adapter = createMockCoreApiAdapter({ ackStatus: 'committed' });

    const ack = await adapter.postCommand({
      clientCommandId: 'client-1',
      command: 'run.create',
      payload: {
        prompt: 'Implement Foundation tasks',
      },
      runId: 'run-active-1',
    });
    const probe = await adapter.probeCommand(ack.ackId);

    expect(ack.ok).toBe(true);
    expect(probe.status).toBe('committed');
    expect(probe.entityId).toBe('run-active-1');
  });
});
