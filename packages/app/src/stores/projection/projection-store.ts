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
export type TimelineMarkerKind = 'blocked' | 'handoff' | 'integration';

export interface TimelineLoadedRange {
  readonly fromRevision: number | null;
  readonly toRevision: number | null;
}

export interface TimelineMarker {
  readonly entryId: string;
  readonly kind: TimelineMarkerKind;
  readonly label: string;
  readonly laneId: string;
  readonly timestamp: string;
}

export interface TimelineThread {
  readonly entries: readonly TimelineEntry[];
  readonly laneId: string;
  readonly laneLabel: string;
}

export interface RunTimelineProjection {
  readonly entries: readonly TimelineEntry[];
  readonly error: string | null;
  readonly hasMoreBefore: boolean;
  readonly laneOrder: readonly string[];
  readonly loadedRange: TimelineLoadedRange;
  readonly markers: readonly TimelineMarker[];
  readonly nextBeforeRevision: number | null;
  readonly nodeThreads: readonly TimelineThread[];
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
  readonly claim?: string;
  readonly conflictSummary?: string;
  readonly dimension?: string;
  readonly id: string;
  readonly kind: 'memory' | 'system';
  readonly manifestationState?: string;
  readonly retentionState?: string;
  readonly revision: number;
  readonly scope?: string;
  readonly timestamp: string;
  readonly title: string;
}

export interface SoulGraphPreviewNode {
  readonly id: string;
  readonly label: string;
  readonly scope: string;
}

export interface SoulPanelProjection {
  readonly entries: readonly SoulPanelEntry[];
  readonly error: string | null;
  readonly graphPreview: readonly SoulGraphPreviewNode[];
  readonly lastRevision: number;
  readonly memories: readonly SoulPanelEntry[];
  readonly proposals: readonly SoulPanelEntry[];
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readMetaString(entry: TimelineEntry, key: string): string | undefined {
  const value = entry.meta?.[key];
  return typeof value === 'string' ? value : undefined;
}

function deriveTimelineStructure(entries: readonly TimelineEntry[]): Pick<
  RunTimelineProjection,
  'laneOrder' | 'markers' | 'nodeThreads'
> {
  const laneLabels = new Map<string, string>();
  const laneEntries = new Map<string, TimelineEntry[]>();
  const laneOrder: string[] = [];
  const markers: TimelineMarker[] = [];

  for (const entry of entries) {
    const laneId = readMetaString(entry, 'laneId') ?? 'main';
    const laneLabel = readMetaString(entry, 'laneLabel') ?? laneId;

    if (!laneEntries.has(laneId)) {
      laneOrder.push(laneId);
      laneEntries.set(laneId, []);
      laneLabels.set(laneId, laneLabel);
    }

    laneEntries.get(laneId)?.push(entry);

    const markerKind = readMetaString(entry, 'markerKind');
    if (
      markerKind === 'blocked' ||
      markerKind === 'handoff' ||
      markerKind === 'integration'
    ) {
      markers.push({
        entryId: entry.id,
        kind: markerKind,
        label: entry.title ?? markerKind,
        laneId,
        timestamp: entry.timestamp,
      });
    }
  }

  return {
    laneOrder,
    markers,
    nodeThreads: laneOrder.map((laneId) => ({
      entries: laneEntries.get(laneId) ?? [],
      laneId,
      laneLabel: laneLabels.get(laneId) ?? laneId,
    })),
  };
}

function deriveSoulCollections(entries: readonly SoulPanelEntry[]): Pick<
  SoulPanelProjection,
  'graphPreview' | 'memories' | 'proposals'
> {
  const memories = entries.filter((entry) => entry.kind === 'memory');
  const proposals = memories.filter(
    (entry) => entry.manifestationState === 'proposal' || entry.title.includes('propose'),
  );

  return {
    graphPreview: memories.slice(0, 4).map((entry) => ({
      id: entry.id,
      label: entry.claim ?? entry.title,
      scope: entry.scope ?? 'project',
    })),
    memories,
    proposals,
  };
}

function createEmptyTimelineProjection(runId: string): RunTimelineProjection {
  const page = createEmptyTimelinePage(runId);
  return {
    entries: page.entries,
    error: null,
    hasMoreBefore: page.hasMore,
    laneOrder: [],
    loadedRange: {
      fromRevision: page.nextBeforeRevision,
      toRevision: page.revision,
    },
    markers: [],
    nextBeforeRevision: page.nextBeforeRevision,
    nodeThreads: [],
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
    graphPreview: [],
    lastRevision: 0,
    memories: [],
    proposals: [],
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

function upsertTimelineEntry(
  entries: readonly TimelineEntry[],
  entry: TimelineEntry,
): readonly TimelineEntry[] {
  return [...entries.filter((existing) => existing.id !== entry.id), entry].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

function mergeTimelineEntries(
  currentEntries: readonly TimelineEntry[],
  nextEntries: readonly TimelineEntry[],
): readonly TimelineEntry[] {
  const map = new Map<string, TimelineEntry>();

  for (const entry of currentEntries) {
    map.set(entry.id, entry);
  }

  for (const entry of nextEntries) {
    map.set(entry.id, entry);
  }

  return [...map.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
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
  const status = readString(payload.status);
  const operation = readString(payload.operation);
  const eventName = readString(payload.event);
  const type = readString(payload.type);
  const toolName = readString(payload.toolName);

  if (type === 'token_stream') {
    return {
      body: readString(payload.text),
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'message',
      meta: {
        engine: event.event.source,
        laneId: readString(payload.laneId) ?? 'lead',
        laneLabel: readString(payload.laneLabel) ?? 'Lead',
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
        approvalId: readString(payload.approvalId),
        laneId: 'review',
        laneLabel: 'Review',
        markerKind: 'blocked',
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
      body: readString(payload.patch),
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'diff',
      meta: {
        laneId: 'integrator',
        laneLabel: 'Integrator',
        path: readString(payload.path),
      },
      runId: event.runId,
      timestamp: event.event.timestamp,
      title: 'Diff',
    };
  }

  if (operation) {
    return {
      body: readString(payload.claim) ?? readString(payload.query) ?? readString(payload.pointer),
      causedBy: event.causedBy,
      id: `timeline-${event.revision}`,
      kind: 'memory',
      meta: {
        claim: readString(payload.claim),
        dimension: readString(payload.dimension),
        laneId: 'soul',
        laneLabel: 'Soul',
        manifestationState: readString(payload.manifestationState),
        operation,
        retentionState: readString(payload.retentionState),
        scope: readString(payload.scope),
      },
      runId: event.runId,
      timestamp: event.event.timestamp,
      title: `Memory ${operation}`,
    };
  }

  return {
    body: readString(payload.reason),
    causedBy: event.causedBy,
    id: `timeline-${event.revision}`,
    kind: 'system',
    meta: {
      eventName,
      laneId: 'main',
      laneLabel: 'Main',
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
  const type = readString(payload.type);

  if (type === 'plan_node') {
    return {
      ...projection,
      revision: event.revision,
      snapshot: upsertPlanItem(projection.snapshot, {
        id: readString(payload.nodeId) ?? `plan-${event.revision}`,
        status:
          (readString(payload.status) as InspectorSnapshot['plans'][number]['status']) ??
          'pending',
        summary: readString(payload.title) ?? 'Plan node',
      }),
    };
  }

  if (type === 'diff') {
    return {
      ...projection,
      revision: event.revision,
      snapshot: upsertFileChange(projection.snapshot, {
        path: readString(payload.path) ?? `diff-${event.revision}`,
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
  const operation = readString(payload.operation);
  const eventName = readString(payload.event);

  if (operation) {
    return {
      body: readString(payload.pointer) ?? readString(payload.query),
      claim: readString(payload.claim),
      conflictSummary: readString(payload.conflictSummary),
      dimension: readString(payload.dimension),
      id: `soul-${event.revision}`,
      kind: 'memory',
      manifestationState: readString(payload.manifestationState),
      retentionState: readString(payload.retentionState),
      revision: event.revision,
      scope: readString(payload.scope),
      timestamp: event.event.timestamp,
      title: `Memory ${operation}`,
    };
  }

  if (eventName === 'checkpoint_queue' || eventName === 'soul_mode') {
    return {
      body: readString(payload.reason),
      id: `soul-${event.revision}`,
      kind: 'system',
      revision: event.revision,
      timestamp: event.event.timestamp,
      title: eventName,
    };
  }

  return null;
}

function createTimelineProjectionFromPage(page: TimelinePage): RunTimelineProjection {
  const timelineStructure = deriveTimelineStructure(page.entries);
  return {
    entries: page.entries,
    error: null,
    hasMoreBefore: page.hasMore,
    laneOrder: timelineStructure.laneOrder,
    loadedRange: {
      fromRevision: page.nextBeforeRevision,
      toRevision: page.revision,
    },
    markers: timelineStructure.markers,
    nextBeforeRevision: page.nextBeforeRevision,
    nodeThreads: timelineStructure.nodeThreads,
    revision: page.revision,
    runId: page.runId,
    status: 'idle',
  };
}

function mergeTimelinePage(
  current: RunTimelineProjection,
  page: TimelinePage,
  query: TimelinePageQuery,
): RunTimelineProjection {
  if (!query.beforeRevision) {
    return createTimelineProjectionFromPage(page);
  }

  const entries = mergeTimelineEntries(current.entries, page.entries);
  const timelineStructure = deriveTimelineStructure(entries);
  return {
    ...current,
    entries,
    error: null,
    hasMoreBefore: page.hasMore,
    laneOrder: timelineStructure.laneOrder,
    loadedRange: {
      fromRevision: page.nextBeforeRevision,
      toRevision: current.loadedRange.toRevision,
    },
    markers: timelineStructure.markers,
    nextBeforeRevision: page.nextBeforeRevision,
    nodeThreads: timelineStructure.nodeThreads,
    revision: Math.max(current.revision, page.revision),
    status: 'idle',
  };
}

export const useProjectionStore = create<ProjectionStore>((set, get) => ({
  ...createInitialState(),

  applyNormalizedEvent: (event) => {
    const current = get();
    if (!current.mountedRunIds.includes(event.runId)) {
      return;
    }

    const nextTimelineEntries = upsertTimelineEntry(
      current.runTimelines[event.runId]?.entries ?? [],
      mapEventToTimelineEntry(event),
    );
    const nextTimelineStructure = deriveTimelineStructure(nextTimelineEntries);
    const currentInspector =
      current.runInspectors[event.runId] ?? createEmptyInspectorProjection(event.runId);
    const currentSoulPanel =
      current.soulPanels[event.runId] ?? createEmptySoulPanel(event.runId);
    const nextSoulEntry = mapEventToSoulEntry(event);
    const nextSoulEntries =
      nextSoulEntry === null
        ? currentSoulPanel.entries
        : upsertSoulEntry(currentSoulPanel.entries, nextSoulEntry);
    const nextSoulCollections = deriveSoulCollections(nextSoulEntries);

    set({
      runInspectors: {
        ...current.runInspectors,
        [event.runId]: applyEventToInspector(currentInspector, event),
      },
      runTimelines: {
        ...current.runTimelines,
        [event.runId]: {
          ...(current.runTimelines[event.runId] ?? createEmptyTimelineProjection(event.runId)),
          entries: nextTimelineEntries,
          error: null,
          laneOrder: nextTimelineStructure.laneOrder,
          loadedRange: {
            fromRevision:
              current.runTimelines[event.runId]?.loadedRange.fromRevision ?? event.revision,
            toRevision: event.revision,
          },
          markers: nextTimelineStructure.markers,
          nextBeforeRevision: current.runTimelines[event.runId]?.nextBeforeRevision ?? null,
          nodeThreads: nextTimelineStructure.nodeThreads,
          revision: event.revision,
          status: 'idle',
        },
      },
      soulPanels: {
        ...current.soulPanels,
        [event.runId]: {
          ...currentSoulPanel,
          entries: nextSoulEntries,
          error: null,
          graphPreview: nextSoulCollections.graphPreview,
          lastRevision: event.revision,
          memories: nextSoulCollections.memories,
          proposals: nextSoulCollections.proposals,
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
      set((state) => ({
        runTimelines: {
          ...state.runTimelines,
          [runId]: mergeTimelinePage(
            state.runTimelines[runId] ?? createEmptyTimelineProjection(runId),
            page,
            query,
          ),
        },
      }));
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
        [page.runId]: createTimelineProjectionFromPage(page),
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
