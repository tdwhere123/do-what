import { create } from 'zustand';

export type UiRouteId = 'settings' | 'workbench';
export type UiPanelId =
  | 'approval'
  | 'composer'
  | 'inspector'
  | 'settings'
  | 'soul'
  | 'timeline'
  | null;
export type UiModalId =
  | 'command-error'
  | 'create-run'
  | 'create-workspace'
  | 'settings-lease'
  | null;
export type TimelineViewMode = 'merged' | 'threaded';
export type InspectorMode = 'collaboration' | 'git';
export type SettingsTabId =
  | 'appearance'
  | 'engines'
  | 'environment'
  | 'policies'
  | 'soul';
export type BootstrapStatus = 'error' | 'idle' | 'loading' | 'offline' | 'ready';
export type BootstrapFailureStage = 'auth' | 'connection' | 'snapshot' | 'unknown';

export interface BootstrapStateDetails {
  readonly bootstrapError?: string | null;
  readonly failureCode?: string | null;
  readonly failureStage?: BootstrapFailureStage | null;
  readonly failureStatus?: number | null;
}

export interface CreateRunDraft {
  readonly participants: readonly string[];
  readonly templateId: string | null;
  readonly templateInputs: Record<string, unknown>;
  readonly templateVersion: string | null;
}

export interface UiStoreState {
  readonly activeModal: UiModalId;
  readonly activePanel: UiPanelId;
  readonly bootstrapError: string | null;
  readonly bootstrapFailureCode: string | null;
  readonly bootstrapFailureStage: BootstrapFailureStage | null;
  readonly bootstrapFailureStatus: number | null;
  readonly bootstrapStatus: BootstrapStatus;
  readonly composerDraftsByRun: Record<string, string>;
  readonly createRunDraftsByWorkspace: Record<string, CreateRunDraft>;
  readonly currentRoute: UiRouteId;
  readonly inspectorMode: InspectorMode;
  readonly selectedRunId: string | null;
  readonly selectedWorkspaceId: string | null;
  readonly settingsActiveTab: SettingsTabId;
  readonly timelineViewMode: TimelineViewMode;
}

interface UiStoreActions {
  clearComposerDraft: (runId: string) => void;
  clearCreateRunDraft: (workspaceId: string) => void;
  reset: () => void;
  setActiveModal: (activeModal: UiModalId) => void;
  setActivePanel: (activePanel: UiPanelId) => void;
  setBootstrapState: (
    bootstrapStatus: BootstrapStatus,
    details?: BootstrapStateDetails,
  ) => void;
  setComposerDraft: (runId: string, draft: string) => void;
  setCreateRunDraft: (workspaceId: string, draft: CreateRunDraft) => void;
  setCurrentRoute: (currentRoute: UiRouteId) => void;
  setInspectorMode: (inspectorMode: InspectorMode) => void;
  setSelectedRunId: (selectedRunId: string | null) => void;
  setSelectedWorkspaceId: (selectedWorkspaceId: string | null) => void;
  setSettingsActiveTab: (settingsActiveTab: SettingsTabId) => void;
  setTimelineViewMode: (timelineViewMode: TimelineViewMode) => void;
}

export type UiStore = UiStoreState & UiStoreActions;

export function createEmptyCreateRunDraft(): CreateRunDraft {
  return {
    participants: [],
    templateId: null,
    templateInputs: {},
    templateVersion: null,
  };
}

function createInitialState(): UiStoreState {
  return {
    activeModal: null,
    activePanel: 'timeline',
    bootstrapError: null,
    bootstrapFailureCode: null,
    bootstrapFailureStage: null,
    bootstrapFailureStatus: null,
    bootstrapStatus: 'idle',
    composerDraftsByRun: {},
    createRunDraftsByWorkspace: {},
    currentRoute: 'workbench',
    inspectorMode: 'git',
    selectedRunId: null,
    selectedWorkspaceId: null,
    settingsActiveTab: 'engines',
    timelineViewMode: 'merged',
  };
}

export const useUiStore = create<UiStore>((set) => ({
  ...createInitialState(),

  clearComposerDraft: (runId) => {
    set((state) => {
      const composerDraftsByRun = { ...state.composerDraftsByRun };
      delete composerDraftsByRun[runId];
      return {
        composerDraftsByRun,
      };
    });
  },

  clearCreateRunDraft: (workspaceId) => {
    set((state) => {
      const createRunDraftsByWorkspace = { ...state.createRunDraftsByWorkspace };
      delete createRunDraftsByWorkspace[workspaceId];
      return {
        createRunDraftsByWorkspace,
      };
    });
  },

  reset: () => {
    set(createInitialState());
  },

  setActiveModal: (activeModal) => {
    set({
      activeModal,
    });
  },

  setActivePanel: (activePanel) => {
    set({
      activePanel,
    });
  },

  setBootstrapState: (bootstrapStatus, details) => {
    set({
      bootstrapError: details?.bootstrapError ?? null,
      bootstrapFailureCode: details?.failureCode ?? null,
      bootstrapFailureStage: details?.failureStage ?? null,
      bootstrapFailureStatus: details?.failureStatus ?? null,
      bootstrapStatus,
    });
  },

  setComposerDraft: (runId, draft) => {
    set((state) => ({
      composerDraftsByRun: {
        ...state.composerDraftsByRun,
        [runId]: draft,
      },
    }));
  },

  setCreateRunDraft: (workspaceId, draft) => {
    set((state) => ({
      createRunDraftsByWorkspace: {
        ...state.createRunDraftsByWorkspace,
        [workspaceId]: draft,
      },
    }));
  },

  setCurrentRoute: (currentRoute) => {
    set({
      currentRoute,
    });
  },

  setInspectorMode: (inspectorMode) => {
    set({
      inspectorMode,
    });
  },

  setSelectedRunId: (selectedRunId) => {
    set({
      selectedRunId,
    });
  },

  setSelectedWorkspaceId: (selectedWorkspaceId) => {
    set({
      selectedWorkspaceId,
    });
  },

  setSettingsActiveTab: (settingsActiveTab) => {
    set({
      settingsActiveTab,
    });
  },

  setTimelineViewMode: (timelineViewMode) => {
    set({
      timelineViewMode,
    });
  },
}));

export function resetUiStore(): void {
  useUiStore.getState().reset();
}

