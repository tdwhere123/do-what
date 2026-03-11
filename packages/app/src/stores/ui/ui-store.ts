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
export type UiModalId = 'command-error' | 'create-run' | 'settings-lease' | null;
export type TimelineViewMode = 'history' | 'live';
export type CreateRunDraft = Record<string, unknown>;

export interface UiStoreState {
  readonly activeModal: UiModalId;
  readonly activePanel: UiPanelId;
  readonly composerDraftsByRun: Record<string, string>;
  readonly createRunDraftsByWorkspace: Record<string, CreateRunDraft>;
  readonly currentRoute: UiRouteId;
  readonly selectedRunId: string | null;
  readonly selectedWorkspaceId: string | null;
  readonly timelineViewMode: TimelineViewMode;
}

interface UiStoreActions {
  clearComposerDraft: (runId: string) => void;
  clearCreateRunDraft: (workspaceId: string) => void;
  reset: () => void;
  setActiveModal: (activeModal: UiModalId) => void;
  setActivePanel: (activePanel: UiPanelId) => void;
  setComposerDraft: (runId: string, draft: string) => void;
  setCreateRunDraft: (workspaceId: string, draft: CreateRunDraft) => void;
  setCurrentRoute: (currentRoute: UiRouteId) => void;
  setSelectedRunId: (selectedRunId: string | null) => void;
  setSelectedWorkspaceId: (selectedWorkspaceId: string | null) => void;
  setTimelineViewMode: (timelineViewMode: TimelineViewMode) => void;
}

export type UiStore = UiStoreState & UiStoreActions;

function createInitialState(): UiStoreState {
  return {
    activeModal: null,
    activePanel: 'timeline',
    composerDraftsByRun: {},
    createRunDraftsByWorkspace: {},
    currentRoute: 'workbench',
    selectedRunId: null,
    selectedWorkspaceId: null,
    timelineViewMode: 'live',
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

  setTimelineViewMode: (timelineViewMode) => {
    set({
      timelineViewMode,
    });
  },
}));

export function resetUiStore(): void {
  useUiStore.getState().reset();
}
