import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCoreEvent } from '../../lib/events';
import {
  ACTIVE_EVENT_FIXTURES,
  ACTIVE_INSPECTOR_FIXTURE,
  ACTIVE_TIMELINE_ENTRIES,
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

    expect(useProjectionStore.getState().runTimelines['run-active-1']?.entries.length).toBe(3);
    expect(useProjectionStore.getState().soulPanels['run-active-1']?.entries.length).toBe(1);
    expect(useProjectionStore.getState().soulPanels['run-active-1']?.proposals.length).toBe(1);
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

  it('merges older timeline pages into the loaded range without dropping the tail', async () => {
    useProjectionStore.getState().replaceTimelinePage({
      ...ACTIVE_TIMELINE_FIXTURE,
      runId: 'run-active-1',
    });

    await useProjectionStore.getState().refetchTimeline(
      {
        getTimelinePage: vi.fn().mockResolvedValue({
          entries: ACTIVE_TIMELINE_ENTRIES.slice(0, 2),
          hasMore: false,
          limit: 50,
          nextBeforeRevision: null,
          revision: 24,
          runId: 'run-active-1',
        }),
      },
      {
        beforeRevision: 12,
        runId: 'run-active-1',
      },
    );

    expect(useProjectionStore.getState().runTimelines['run-active-1']?.entries.length).toBeGreaterThan(4);
    expect(useProjectionStore.getState().runTimelines['run-active-1']?.hasMoreBefore).toBe(false);
  });
});
