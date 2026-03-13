import type { HotStateStore } from '../stores/hot-state';
import type { ProjectionStore } from '../stores/projection';
import type { SettingsBridgeStore } from '../stores/settings-bridge';
import type { AckOverlayStore } from '../stores/ack-overlay';
import type { PendingCommandStore } from '../stores/pending-command';
import type { UiStore } from '../stores/ui';

export const selectCurrentRoute = (state: UiStore): UiStore['currentRoute'] =>
  state.currentRoute;
export const selectSelectedRunId = (state: UiStore): string | null => state.selectedRunId;
export const selectSelectedWorkspaceId = (state: UiStore): string | null =>
  state.selectedWorkspaceId;
export const selectTimelineViewMode = (state: UiStore): UiStore['timelineViewMode'] =>
  state.timelineViewMode;
export const selectBootstrapStatus = (state: UiStore): UiStore['bootstrapStatus'] =>
  state.bootstrapStatus;
export const selectBootstrapError = (state: UiStore): string | null => state.bootstrapError;
export const selectBootstrapFailureCode = (state: UiStore): string | null =>
  state.bootstrapFailureCode;
export const selectBootstrapFailureStage = (
  state: UiStore,
): UiStore['bootstrapFailureStage'] => state.bootstrapFailureStage;
export const selectBootstrapFailureStatus = (state: UiStore): number | null =>
  state.bootstrapFailureStatus;
export const selectInspectorMode = (state: UiStore): UiStore['inspectorMode'] =>
  state.inspectorMode;
export const selectSettingsActiveTab = (state: UiStore): UiStore['settingsActiveTab'] =>
  state.settingsActiveTab;

export const selectGlobalInteractionLock = (
  state: HotStateStore,
): boolean => state.globalInteractionLock;
export const selectHotRunSummary = (
  state: HotStateStore,
  runId: string,
) => state.runsById[runId] ?? null;
export const selectHotWorkspaceSummary = (
  state: HotStateStore,
  workspaceId: string,
) => state.workspacesById[workspaceId] ?? null;

export const selectRunTimelineProjection = (
  state: ProjectionStore,
  runId: string,
) => state.runTimelines[runId] ?? null;
export const selectRunInspectorProjection = (
  state: ProjectionStore,
  runId: string,
) => state.runInspectors[runId] ?? null;
export const selectRunSoulPanelProjection = (
  state: ProjectionStore,
  runId: string,
) => state.soulPanels[runId] ?? null;

export const selectOptimisticMessagesForRun = (
  state: PendingCommandStore,
  runId: string,
) =>
  state.order
    .map((clientCommandId) => state.entriesById[clientCommandId])
    .filter(
      (entry) =>
        entry?.runId === runId &&
        entry.entityType === 'message' &&
        entry.status !== 'settled',
    );

export const selectAckOverlaysForRun = (
  state: AckOverlayStore,
  runId: string,
) =>
  state.order
    .map((clientCommandId) => state.entriesById[clientCommandId])
    .filter((entry) => entry?.runId === runId);

export const selectLockedFieldIds = (
  state: SettingsBridgeStore,
): readonly string[] => state.lockedFieldIds;
export const selectInterruptedDraft = (
  state: SettingsBridgeStore,
) => state.interruptedDraft;
