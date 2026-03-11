import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCoreEvent } from '../../lib/events';
import {
  ACTIVE_EVENT_FIXTURES,
  ACTIVE_INSPECTOR_FIXTURE,
  ACTIVE_TIMELINE_FIXTURE,
} from '../../test/fixtures';
import {
  resetProjectionStore,
  useProjectionStore,
} from './projection-store';

describe('projection store', () => {
  beforeEach(() => {
    resetProjectionStore();
  });

  it('caps mounted runs and prunes stale projections', () => {
    useProjectionStore.getState().setMaxMountedRuns(2);
    useProjectionStore.getState().replaceTimelinePage({
      ...ACTIVE_TIMELINE_FIXTURE,
      runId: 'run-a',
    });
    useProjectionStore.getState().replaceTimelinePage({
      ...ACTIVE_TIMELINE_FIXTURE,
      runId: 'run-b',
    });
    useProjectionStore.getState().replaceTimelinePage({
      ...ACTIVE_TIMELINE_FIXTURE,
      runId: 'run-c',
    });

    expect(useProjectionStore.getState().mountedRunIds).toEqual(['run-b', 'run-c']);
    expect(useProjectionStore.getState().runTimelines['run-a']).toBeUndefined();
  });

  it('merges fine-grained events only for mounted runs', () => {
    useProjectionStore.getState().mountRun('run-active-1');

    for (const envelope of ACTIVE_EVENT_FIXTURES) {
      useProjectionStore
        .getState()
        .applyNormalizedEvent(normalizeCoreEvent(envelope));
    }

    useProjectionStore
      .getState()
      .applyNormalizedEvent(
        normalizeCoreEvent({
          coreSessionId: 'mock-core-active',
          event: {
            operation: 'propose',
            proposalId: 'proposal-1',
            cueDraft: {},
            requiresCheckpoint: false,
            revision: 27,
            runId: 'run-active-1',
            source: 'soul.memory',
            timestamp: '2026-03-10T09:34:00.000Z',
          },
          revision: 27,
        }),
      );

    expect(useProjectionStore.getState().runTimelines['run-active-1']?.entries.length).toBe(3);
    expect(useProjectionStore.getState().soulPanels['run-active-1']?.entries.length).toBe(1);
    expect(useProjectionStore.getState().runInspectors['run-active-1']?.revision).toBe(27);
  });

  it('ignores inactive runs for detailed event merges', () => {
    useProjectionStore
      .getState()
      .applyNormalizedEvent(normalizeCoreEvent(ACTIVE_EVENT_FIXTURES[0]));

    expect(useProjectionStore.getState().runTimelines['run-active-1']).toBeUndefined();
    expect(useProjectionStore.getState().runInspectors['run-active-1']).toBeUndefined();
  });

  it('refetches a single run projection without touching others', async () => {
    useProjectionStore.getState().replaceTimelinePage({
      ...ACTIVE_TIMELINE_FIXTURE,
      runId: 'run-one',
    });
    useProjectionStore.getState().replaceInspectorSnapshot({
      ...ACTIVE_INSPECTOR_FIXTURE,
      runId: 'run-two',
    });

    await useProjectionStore.getState().refetchTimeline(
      {
        getTimelinePage: vi.fn().mockResolvedValue({
          ...ACTIVE_TIMELINE_FIXTURE,
          revision: 99,
          runId: 'run-one',
        }),
      },
      {
        runId: 'run-one',
      },
    );

    await useProjectionStore.getState().refetchInspector(
      {
        getInspectorSnapshot: vi.fn().mockResolvedValue({
          ...ACTIVE_INSPECTOR_FIXTURE,
          revision: 101,
          runId: 'run-two',
        }),
      },
      'run-two',
    );

    expect(useProjectionStore.getState().runTimelines['run-one']?.revision).toBe(99);
    expect(useProjectionStore.getState().runInspectors['run-two']?.revision).toBe(101);
  });
});
