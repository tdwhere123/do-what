import type {
  InspectorSnapshot,
  TimelineEntry,
  TimelinePage,
} from '@do-what/protocol';
import { create } from 'zustand';
import { createEmptyInspectorSnapshot, createEmptyTimelinePage } from '../../lib/contracts';
import type { NormalizedCoreEvent } from '../../lib/events';
import type { CoreApiAdapter, TimelinePageQuery } from '../../lib/core-http-client';

export type ProjectionStatus = 'error' | 'idle' | 'loading' | 'refreshing';

export interface TimelineLoadedRange {
  readonly fromRevision: number | null;
  readonly toRevision: number | null;
}

export interface RunTimelineProjection {
  readonly entries: readonly TimelineEntry[];
  readonly error: string | null;
  readonly hasMoreBefore: boolean;
  readonly loadedRange: TimelineLoadedRange;
  readonly nextBeforeRevision: number | null;
  readonly revision: number;
  readonly runId: string;
  readonly status: ProjectionStatus;
}

export interface RunInspectorProjection {
  readonly error: string | null;
  readonly revision: number;
  readonly runId: string;
  readonly snapshot: InspectorSnapshot;
  readonly status: ProjectionStatus;
}

export interface SoulPanelEntry {
  readonly body?: string;
  readonly id: string;
  readonly kind: 'memory' | 'system';
  readonly revision: number;
  readonly timestamp: string;
  readonly title: string;
}

export interface SoulPanelProjection {
  readonly entries: readonly SoulPanelEntry[];
  readonly error: string | null;
  readonly lastRevision: number;
  readonly runId: string;
  readonly status: ProjectionStatus;
}

export interface ProjectionStoreState {
  readonly maxMountedRuns: number;
  readonly mountedRunIds: readonly string[];
  readonly runInspectors: Record<string, RunInspectorProjection>;
  readonly runTimelines: Record<string, RunTimelineProjection>;
  readonly soulPanels: Record<string, SoulPanelProjection>;
}

interface ProjectionStoreActions {
  applyNormalizedEvent: (event: NormalizedCoreEvent) => void;
  mountRun: (runId: string) => void;
  refetchInspector: (
    coreApi: Pick<CoreApiAdapter, 'getInspectorSnapshot'>,
    runId: string,
  ) => Promise<InspectorSnapshot>;
  refetchTimeline: (
    coreApi: Pick<CoreApiAdapter, 'getTimelinePage'>,
    query: TimelinePageQuery,
  ) => Promise<TimelinePage>;
  replaceInspectorSnapshot: (snapshot: InspectorSnapshot) => void;
  replaceTimelinePage: (page: TimelinePage) => void;
  reset: () => void;
  setMaxMountedRuns: (maxMountedRuns: number) => void;
  unmountRun: (runId: string) => void;
}

export type ProjectionStore = ProjectionStoreState & ProjectionStoreActions;

const DEFAULT_MAX_MOUNTED_RUNS = 3;

function createEmptyTimelineProjection(runId: string): RunTimelineProjection {
  const page = createEmptyTimelinePage(runId);
  return {
    entries: page.entries,
    error: null,
    hasMoreBefore: page.hasMore,
    loadedRange: {
      fromRevision: page.nextBeforeRevision,
      toRevision: page.revision,
    },
    nextBeforeRevision: page.nextBeforeRevision,
    revision: page.revision,
    runId,
    status: 'idle',
  };
}

function createEmptyInspectorProjection(runId: string): RunInspectorProjection {
  const snapshot = createEmptyInspectorSnapshot(runId);
  return {
    error: null,
    revision: snapshot.revision,
    runId,
    snapshot,
    status: 'idle',
  };
}

function createEmptySoulPanel(runId: string): SoulPanelProjection {
  return {
    entries: [],
    error: null,
    lastRevision: 0,
    runId,
    status: 'idle',
  };
}

function createInitialState(): ProjectionStoreState {
  return {
    maxMountedRuns: DEFAULT_MAX_MOUNTED_RUNS,
    mountedRunIds: [],
    runInspectors: {},
    runTimelines: {},
    soulPanels: {},
  };
}

function ensureMountedRunIds(
  mountedRunIds: readonly string[],
  maxMountedRuns: number,
  runId: string,
): readonly string[] {
  const next = [...mountedRunIds.filter((entry) => entry !== runId), runId];
  return next.slice(-maxMountedRuns);
}

function pruneProjectionRecords<T>(
  records: Record<string, T>,
  mountedRunIds: readonly string[],
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(records).filter(([runId]) => mountedRunIds.includes(runId)),
  );
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function upsertTimelineEntry(
  entries: readonly TimelineEntry[],
  entry: TimelineEntry,
): readonly TimelineEntry[] {
  return [...entries.filter((existing) => existing.id !== entry.id), entry].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

function upsertSoulEntry(
  entries: readonly SoulPanelEntry[],
  entry: SoulPanelEntry,
): readonly SoulPanelEntry[] {
  return [...entries.filter((existing) => existing.id !== entry.id), entry].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

function upsertPlanItem(
  snapshot: InspectorSnapshot,
  item: InspectorSnapshot['plans'][number],
): InspectorSnapshot {
  return {
    ...snapshot,
    plans: [...snapshot.plans.filter((plan) => plan.id !== item.id), item],
  };
}

function upsertFileChange(
  snapshot: InspectorSnapshot,
  fileChange: InspectorSnapshot['files'][number],
): InspectorSnapshot {
  return {
    ...snapshot,
    files: [
      ...snapshot.files.filter((entry) => entry.path !== fileChange.path),
      fileChange,
    ],
  };
}

function mapEventToTimelineEntry(event: NormalizedCoreEvent): TimelineEntry {
  const payload = event.event as Record<string, unknown>;
  const status = readString(payload, 'status');
  const operation = readString(payload, 'operation');
  const eventName = readString(payload, 'event');
  const type = readString(payload, 'type');
  const toolName = readString(payload, 'toolName');

  if (type === 'token_stream') {
    return {
      body: readString(payload, 'text'),
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'message',
      meta: {
        isComplete: payload.isComplete === true,
      },
      runId: event.runId,
      timestamp: event.event.timestamp,
      title: 'Engine Output',
    };
  }

  if (status === 'waiting_approval') {
    return {
      body: toolName ? `Approval required for ${toolName}` : 'Approval required',
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'approval',
      meta: {
        approvalId: readString(payload, 'approvalId'),
        toolName,
      },
      runId: event.runId,
      status: 'pending',
      timestamp: event.event.timestamp,
      title: 'Approval',
    };
  }

  if (type === 'diff') {
    return {
      body: readString(payload, 'patch'),
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'diff',
      meta: {
        path: readString(payload, 'path'),
      },
      runId: event.runId,
      timestamp: event.event.timestamp,
      title: 'Diff',
    };
  }

  if (operation) {
    return {
      body: readString(payload, 'query') ?? readString(payload, 'pointer'),
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'memory',
      meta: {
        operation,
      },
      runId: event.runId,
      timestamp: event.event.timestamp,
      title: `Memory ${operation}`,
    };
  }

  return {
    body: readString(payload, 'reason'),
    causedBy: event.causedBy,
    id: `timeline-${event.revision}`,
    kind: 'system',
    meta: {
      eventName,
      status,
    },
    runId: event.runId,
    status: status ?? undefined,
    timestamp: event.event.timestamp,
    title: event.type,
  };
}

function applyEventToInspector(
  projection: RunInspectorProjection,
  event: NormalizedCoreEvent,
): RunInspectorProjection {
  const payload = event.event as Record<string, unknown>;
  const type = readString(payload, 'type');

  if (type === 'plan_node') {
    return {
      ...projection,
      revision: event.revision,
      snapshot: upsertPlanItem(projection.snapshot, {
        id: readString(payload, 'nodeId') ?? `plan-${event.revision}`,
        status:
          (readString(payload, 'status') as InspectorSnapshot['plans'][number]['status']) ??
          'pending',
        summary: readString(payload, 'title') ?? 'Plan node',
      }),
    };
  }

  if (type === 'diff') {
    return {
      ...projection,
      revision: event.revision,
      snapshot: upsertFileChange(projection.snapshot, {
        path: readString(payload, 'path') ?? `diff-${event.revision}`,
        status: 'modified',
        summary: `Revision ${event.revision} diff`,
      }),
    };
  }

  return {
    ...projection,
    revision: event.revision,
    snapshot: {
      ...projection.snapshot,
      history: [
        ...projection.snapshot.history,
        {
          id: `history-${event.revision}`,
          label: event.type,
          timestamp: event.event.timestamp,
          type: 'run',
        },
      ],
    },
  };
}

function mapEventToSoulEntry(event: NormalizedCoreEvent): SoulPanelEntry | null {
  const payload = event.event as Record<string, unknown>;
  const operation = readString(payload, 'operation');
  const eventName = readString(payload, 'event');

  if (operation) {
    return {
      body: readString(payload, 'pointer') ?? readString(payload, 'query'),
      id: `soul-${event.revision}`,
      kind: 'memory',
      revision: event.revision,
      timestamp: event.event.timestamp,
      title: `Memory ${operation}`,
    };
  }

  if (eventName === 'checkpoint_queue' || eventName === 'soul_mode') {
    return {
      body: readString(payload, 'reason'),
      id: `soul-${event.revision}`,
      kind: 'system',
      revision: event.revision,
      timestamp: event.event.timestamp,
      title: eventName,
    };
  }

  return null;
}

export const useProjectionStore = create<ProjectionStore>((set, get) => ({
  ...createInitialState(),

  applyNormalizedEvent: (event) => {
    const current = get();
    if (!current.mountedRunIds.includes(event.runId)) {
      return;
    }

    const nextTimeline = upsertTimelineEntry(
      current.runTimelines[event.runId]?.entries ?? [],
      mapEventToTimelineEntry(event),
    );
    const currentInspector =
      current.runInspectors[event.runId] ?? createEmptyInspectorProjection(event.runId);
    const currentSoulPanel =
      current.soulPanels[event.runId] ?? createEmptySoulPanel(event.runId);
    const nextSoulEntry = mapEventToSoulEntry(event);

    set({
      runInspectors: {
        ...current.runInspectors,
        [event.runId]: applyEventToInspector(currentInspector, event),
      },
      runTimelines: {
        ...current.runTimelines,
        [event.runId]: {
          ...(current.runTimelines[event.runId] ?? createEmptyTimelineProjection(event.runId)),
          entries: nextTimeline,
          error: null,
          loadedRange: {
            fromRevision:
              current.runTimelines[event.runId]?.loadedRange.fromRevision ?? event.revision,
            toRevision: event.revision,
          },
          nextBeforeRevision: current.runTimelines[event.runId]?.nextBeforeRevision ?? null,
          revision: event.revision,
          status: 'idle',
        },
      },
      soulPanels:
        nextSoulEntry === null
          ? current.soulPanels
          : {
              ...current.soulPanels,
              [event.runId]: {
                ...currentSoulPanel,
                entries: upsertSoulEntry(currentSoulPanel.entries, nextSoulEntry),
                error: null,
                lastRevision: event.revision,
                status: 'idle',
              },
            },
    });
  },

  mountRun: (runId) => {
    set((state) => {
      const mountedRunIds = ensureMountedRunIds(
        state.mountedRunIds,
        state.maxMountedRuns,
        runId,
      );
      return {
        mountedRunIds,
        runInspectors: pruneProjectionRecords(state.runInspectors, mountedRunIds),
        runTimelines: pruneProjectionRecords(state.runTimelines, mountedRunIds),
        soulPanels: pruneProjectionRecords(state.soulPanels, mountedRunIds),
      };
    });
  },

  refetchInspector: async (coreApi, runId) => {
    get().mountRun(runId);
    set((state) => ({
      runInspectors: {
        ...state.runInspectors,
        [runId]: {
          ...(state.runInspectors[runId] ?? createEmptyInspectorProjection(runId)),
          error: null,
          status: state.runInspectors[runId] ? 'refreshing' : 'loading',
        },
      },
    }));

    try {
      const snapshot = await coreApi.getInspectorSnapshot(runId);
      get().replaceInspectorSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      set((state) => ({
        runInspectors: {
          ...state.runInspectors,
          [runId]: {
            ...(state.runInspectors[runId] ?? createEmptyInspectorProjection(runId)),
            error: error instanceof Error ? error.message : 'Failed to refetch inspector',
            status: 'error',
          },
        },
      }));
      throw error;
    }
  },

  refetchTimeline: async (coreApi, query) => {
    const runId = query.runId;
    get().mountRun(runId);
    set((state) => ({
      runTimelines: {
        ...state.runTimelines,
        [runId]: {
          ...(state.runTimelines[runId] ?? createEmptyTimelineProjection(runId)),
          error: null,
          status: state.runTimelines[runId] ? 'refreshing' : 'loading',
        },
      },
    }));

    try {
      const page = await coreApi.getTimelinePage(query);
      get().replaceTimelinePage(page);
      return page;
    } catch (error) {
      set((state) => ({
        runTimelines: {
          ...state.runTimelines,
          [runId]: {
            ...(state.runTimelines[runId] ?? createEmptyTimelineProjection(runId)),
            error: error instanceof Error ? error.message : 'Failed to refetch timeline',
            status: 'error',
          },
        },
      }));
      throw error;
    }
  },

  replaceInspectorSnapshot: (snapshot) => {
    get().mountRun(snapshot.runId);
    set((state) => ({
      runInspectors: {
        ...state.runInspectors,
        [snapshot.runId]: {
          error: null,
          revision: snapshot.revision,
          runId: snapshot.runId,
          snapshot,
          status: 'idle',
        },
      },
    }));
  },

  replaceTimelinePage: (page) => {
    get().mountRun(page.runId);
    set((state) => ({
      runTimelines: {
        ...state.runTimelines,
        [page.runId]: {
          entries: page.entries,
          error: null,
          hasMoreBefore: page.hasMore,
          loadedRange: {
            fromRevision: page.nextBeforeRevision,
            toRevision: page.revision,
          },
          nextBeforeRevision: page.nextBeforeRevision,
          revision: page.revision,
          runId: page.runId,
          status: 'idle',
        },
      },
    }));
  },

  reset: () => {
    set(createInitialState());
  },

  setMaxMountedRuns: (maxMountedRuns) => {
    set((state) => {
      const mountedRunIds = state.mountedRunIds.slice(-maxMountedRuns);
      return {
        maxMountedRuns,
        mountedRunIds,
        runInspectors: pruneProjectionRecords(state.runInspectors, mountedRunIds),
        runTimelines: pruneProjectionRecords(state.runTimelines, mountedRunIds),
        soulPanels: pruneProjectionRecords(state.soulPanels, mountedRunIds),
      };
    });
  },

  unmountRun: (runId) => {
    set((state) => {
      const mountedRunIds = state.mountedRunIds.filter((entry) => entry !== runId);
      return {
        mountedRunIds,
        runInspectors: pruneProjectionRecords(state.runInspectors, mountedRunIds),
        runTimelines: pruneProjectionRecords(state.runTimelines, mountedRunIds),
        soulPanels: pruneProjectionRecords(state.soulPanels, mountedRunIds),
      };
    });
  },
}));

export function resetProjectionStore(): void {
  useProjectionStore.getState().reset();
}
