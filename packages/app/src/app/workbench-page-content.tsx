import type {
  CoreCommandAck,
  ModuleStatusSnapshot,
  TemplateDescriptor,
  WorkbenchRunSummary,
  WorkbenchModulesSnapshot,
} from '@do-what/protocol';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreateRunModal,
  type CreateRunModalDraft,
} from '../components/create-run/create-run-modal';
import { WorkspaceFirstEmptyState } from '../components/empty/workbench-empty-state';
import { InspectorRail } from '../components/inspector/inspector-rail';
import { WorkbenchShell } from '../components/layout/workbench-shell';
import {
  WorkspaceSidebar,
  type SidebarRunSummary,
  type SidebarWorkspaceSummary,
} from '../components/sidebar/workspace-sidebar';
import { TimelinePane } from '../components/timeline/timeline-pane';
import {
  dispatchApprovalDecision,
  dispatchCreateRun,
  dispatchDriftResolution,
  dispatchIntegrationGateDecision,
  dispatchMemoryGovernance,
  dispatchMemoryProposalReview,
  dispatchRunMessage,
  dismissPendingCommand,
} from '../lib/commands';
import type { DispatchCoreCommandResult } from '../lib/commands';
import { createCoreCommandRequest } from '../lib/commands/core-commands';
import { createCoreHttpClient, CoreHttpError } from '../lib/core-http-client';
import { parseCoreCommandAck } from '../lib/contracts';
import { buildModulesSummary } from '../lib/module-status';
import { getAppServices } from '../lib/runtime/app-services';
import {
  selectBootstrapError,
  selectBootstrapFailureCode,
  selectBootstrapFailureStage,
  selectBootstrapFailureStatus,
  selectBootstrapStatus,
  selectGlobalInteractionLock,
  selectInspectorMode,
  selectRunInspectorProjection,
  selectRunSoulPanelProjection,
  selectRunTimelineProjection,
  selectSelectedRunId,
  selectSelectedWorkspaceId,
  selectTimelineViewMode,
} from '../selectors';
import { useAckOverlayStore } from '../stores/ack-overlay';
import { useHotStateStore } from '../stores/hot-state';
import {
  COMMAND_INTERACTION_LOCKED,
  usePendingCommandStore,
} from '../stores/pending-command';
import { useProjectionStore } from '../stores/projection';
import { useSettingsBridgeStore } from '../stores/settings-bridge';
import { useUiStore, type CreateRunDraft } from '../stores/ui';
import { dismissAckOverlay, retryAckOverlaySync, retryPendingMessageSync } from '../lib/reconciliation';
import styles from '../pages/workbench/workbench-page-content.module.css';

interface WorkspaceOpenResult extends DispatchCoreCommandResult {
  readonly ack: CoreCommandAck | null;
}

interface ComposerAvailability {
  readonly blockedReason: string | null;
  readonly isBlocked: boolean;
  readonly placeholder: string;
}

const PARTICIPANT_MODE_TO_VALUES: Record<string, readonly string[]> = {
  autonomous: [],
  lead_integrator: ['lead', 'integrator'],
  lead_review_integrator: ['lead', 'review', 'integrator'],
};

const BOOTSTRAP_STAGE_LABELS = {
  auth: 'Authentication',
  connection: 'Core Reachability',
  modules: 'Module Initialization',
  snapshot: 'Workbench Snapshot',
  unknown: 'Bootstrap',
} as const;

function buildWorkspaceList(
  workspaceIds: readonly string[],
  workspacesById: Record<
    string,
    {
      name: string;
      runIds: readonly string[];
      status: string;
      workspaceId: string;
    }
  >,
): SidebarWorkspaceSummary[] {
  return workspaceIds
    .map((workspaceId) => workspacesById[workspaceId])
    .filter((workspace): workspace is SidebarWorkspaceSummary => Boolean(workspace));
}

function toCreateRunModalDraft(draft: CreateRunDraft | undefined): CreateRunModalDraft {
  if (!draft) {
    return {
      participantMode: 'lead_integrator',
      templateId: '',
      templateInputs: {},
    };
  }

  const participantMode =
    Object.entries(PARTICIPANT_MODE_TO_VALUES).find(([, value]) =>
      value.join('|') === draft.participants.join('|'),
    )?.[0] ?? 'lead_integrator';

  return {
    participantMode,
    templateId: draft.templateId ?? '',
    templateInputs: draft.templateInputs,
  };
}

function fromCreateRunModalDraft(draft: CreateRunModalDraft): CreateRunDraft {
  return {
    participants: PARTICIPANT_MODE_TO_VALUES[draft.participantMode] ?? [],
    templateId: draft.templateId || null,
    templateInputs: draft.templateInputs,
    templateVersion: 'v0.1-ui',
  };
}

function buildBootstrapMeta(props: {
  readonly bootstrapFailureCode: string | null;
  readonly bootstrapFailureStatus: number | null;
}): string | null {
  const parts = [
    props.bootstrapFailureCode ? `Code: ${props.bootstrapFailureCode}` : null,
    props.bootstrapFailureStatus !== null ? `HTTP ${props.bootstrapFailureStatus}` : null,
  ].filter((part): part is string => part !== null);

  return parts.length ? parts.join(' | ') : null;
}

function readOpenWorkspaceError(error: unknown): string {
  if (error instanceof CoreHttpError) {
    return error.coreError.message;
  }

  return error instanceof Error ? error.message : 'Failed to open workspace.';
}

function selectRunEngineModule(
  modules: WorkbenchModulesSnapshot,
  run: WorkbenchRunSummary | null,
): ModuleStatusSnapshot | null {
  if (run?.engine === 'claude' || run?.engine === 'codex') {
    return modules.engines[run.engine];
  }

  return null;
}

function buildComposerAvailability(input: {
  readonly globalLocked: boolean;
  readonly modules: WorkbenchModulesSnapshot;
  readonly run: WorkbenchRunSummary | null;
  readonly workspaceId: string | null;
}): ComposerAvailability {
  if (!input.workspaceId) {
    return {
      blockedReason: 'Open a workspace before continuing this run.',
      isBlocked: true,
      placeholder: 'Open a workspace first...',
    };
  }

  if (!input.run) {
    return {
      blockedReason: 'Select or create a run before sending a message.',
      isBlocked: true,
      placeholder: 'Select or create a run...',
    };
  }

  if (input.globalLocked) {
    return {
      blockedReason: 'Commands stay disabled until Core returns to a healthy state.',
      isBlocked: true,
      placeholder: 'Core is still recovering...',
    };
  }

  const engineModule = selectRunEngineModule(input.modules, input.run);
  if (!engineModule) {
    return {
      blockedReason: 'This run has no assigned engine yet.',
      isBlocked: true,
      placeholder: 'Assign an engine before sending...',
    };
  }

  if (engineModule.status !== 'connected' || engineModule.phase !== 'ready') {
    return {
      blockedReason: `${engineModule.label} is unavailable for this run. Open Settings > Engines to reconnect it.`,
      isBlocked: true,
      placeholder: `${engineModule.label} is unavailable...`,
    };
  }

  return {
    blockedReason: null,
    isBlocked: false,
    placeholder: `Continue ${input.run.title}...`,
  };
}

function createOpenWorkspaceTransport() {
  const services = getAppServices();
  if (services.config.transportMode !== 'http') {
    return services.coreApi;
  }

  const client = createCoreHttpClient({
    baseUrl: services.config.baseUrl,
    sessionToken: () =>
      services.config.readFreshSessionToken?.() ?? services.config.sessionToken,
  });

  return {
    postCommand: async (command: ReturnType<typeof createCoreCommandRequest>) =>
      parseCoreCommandAck(
        await client.post('/api/workspaces/open', {
          clientCommandId: command.clientCommandId,
          rootPath:
            typeof command.payload.rootPath === 'string'
              ? command.payload.rootPath.trim()
              : '',
        }),
      ),
  };
}

async function dispatchOpenWorkspace(rootPath: string): Promise<WorkspaceOpenResult> {
  const entry = usePendingCommandStore.getState().createPendingEntry({
    action: 'open-workspace',
    coreSessionIdAtSend: useHotStateStore.getState().coreSessionId,
    entityType: 'workspace',
    optimisticPayload: {
      rootPath,
    },
  });

  if (useHotStateStore.getState().globalInteractionLock) {
    usePendingCommandStore
      .getState()
      .markFailed(entry.clientCommandId, COMMAND_INTERACTION_LOCKED, 'Global interaction is locked.');
    return {
      ack: null,
      entry: usePendingCommandStore.getState().entriesById[entry.clientCommandId],
      ok: false,
    };
  }

  useAckOverlayStore.getState().stagePendingEntry(entry);

  try {
    const ack = await createOpenWorkspaceTransport().postCommand(
      createCoreCommandRequest({
        clientCommandId: entry.clientCommandId,
        command: 'workspace.open',
        payload: {
          rootPath,
        },
      }),
    );
    usePendingCommandStore.getState().markAcked(entry.clientCommandId, ack);
    useAckOverlayStore.getState().markAcked(entry.clientCommandId, ack);
    return {
      ack,
      entry: usePendingCommandStore.getState().entriesById[entry.clientCommandId],
      ok: true,
    };
  } catch (error) {
    const message = readOpenWorkspaceError(error);
    const code =
      error instanceof CoreHttpError ? error.coreError.code : 'workspace_open_failed';
    usePendingCommandStore.getState().markFailed(entry.clientCommandId, code, message);
    useAckOverlayStore.getState().markDesynced(entry.clientCommandId, message, code);
    return {
      ack: null,
      entry: usePendingCommandStore.getState().entriesById[entry.clientCommandId],
      ok: false,
    };
  }
}

function StatusBanner(props: {
  readonly bootstrapError: string | null;
  readonly bootstrapFailureCode: string | null;
  readonly bootstrapFailureStage: string | null;
  readonly bootstrapFailureStatus: number | null;
  readonly bootstrapStatus: string;
  readonly isFrozen: boolean;
  readonly lastError: string | null;
  readonly modules: WorkbenchModulesSnapshot;
}) {
  if (props.bootstrapStatus === 'error') {
    const bootstrapMeta = buildBootstrapMeta(props);
    const stageLabel =
      props.bootstrapFailureStage && props.bootstrapFailureStage in BOOTSTRAP_STAGE_LABELS
        ? BOOTSTRAP_STAGE_LABELS[
            props.bootstrapFailureStage as keyof typeof BOOTSTRAP_STAGE_LABELS
          ]
        : BOOTSTRAP_STAGE_LABELS.unknown;

    return (
      <div className={styles.banner}>
        <strong>Workbench bootstrap failed</strong>
        <p>Stage: {stageLabel}</p>
        <p>{props.bootstrapError ?? 'Snapshot bootstrap did not complete.'}</p>
        {bootstrapMeta ? <p>{bootstrapMeta}</p> : null}
        <p>Module status: {buildModulesSummary(props.modules)}</p>
      </div>
    );
  }

  if (props.isFrozen || props.lastError) {
    return (
      <div className={styles.banner}>
        <strong>
          {props.isFrozen ? 'Global interaction is frozen.' : 'Workbench recovered with errors.'}
        </strong>
        <p>{props.lastError ?? 'Commands stay disabled until Core returns to a healthy state.'}</p>
      </div>
    );
  }

  return null;
}

function useWorkspaceSelectionSync(
  selectedRunId: string | null,
  selectedWorkspaceId: string | null,
  workspaceIds: readonly string[],
  workspacesById: Record<string, SidebarWorkspaceSummary>,
) {
  const setSelectedRunId = useUiStore((state) => state.setSelectedRunId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);

  useEffect(() => {
    if (!workspaceIds.length) {
      if (selectedWorkspaceId !== null) {
        setSelectedWorkspaceId(null);
      }
      if (selectedRunId !== null) {
        setSelectedRunId(null);
      }
      return;
    }

    if (!selectedWorkspaceId || !workspacesById[selectedWorkspaceId]) {
      setSelectedWorkspaceId(workspaceIds[0] ?? null);
    }
  }, [
    selectedRunId,
    selectedWorkspaceId,
    setSelectedRunId,
    setSelectedWorkspaceId,
    workspaceIds,
    workspacesById,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      if (selectedRunId !== null) {
        setSelectedRunId(null);
      }
      return;
    }

    const workspace = workspacesById[selectedWorkspaceId];
    const workspaceRunIds = workspace?.runIds ?? [];
    if (!workspaceRunIds.length) {
      if (selectedRunId) {
        setSelectedRunId(null);
      }
      return;
    }

    if (!selectedRunId || !workspaceRunIds.includes(selectedRunId)) {
      setSelectedRunId(workspaceRunIds[0] ?? null);
    }
  }, [selectedRunId, selectedWorkspaceId, setSelectedRunId, workspacesById]);
}

export function WorkspaceFirstWorkbenchPageContent() {
  const services = getAppServices();
  const activeModal = useUiStore((state) => state.activeModal);
  const createRunDraftsByWorkspace = useUiStore((state) => state.createRunDraftsByWorkspace);
  const composerDraftsByRun = useUiStore((state) => state.composerDraftsByRun);
  const inspectorMode = useUiStore(selectInspectorMode);
  const selectedRunId = useUiStore(selectSelectedRunId);
  const selectedWorkspaceId = useUiStore(selectSelectedWorkspaceId);
  const timelineViewMode = useUiStore(selectTimelineViewMode);
  const setActiveModal = useUiStore((state) => state.setActiveModal);
  const setComposerDraft = useUiStore((state) => state.setComposerDraft);
  const clearComposerDraft = useUiStore((state) => state.clearComposerDraft);
  const setCreateRunDraft = useUiStore((state) => state.setCreateRunDraft);
  const clearCreateRunDraft = useUiStore((state) => state.clearCreateRunDraft);
  const setInspectorMode = useUiStore((state) => state.setInspectorMode);
  const setSelectedRunId = useUiStore((state) => state.setSelectedRunId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const setTimelineViewMode = useUiStore((state) => state.setTimelineViewMode);
  const bootstrapStatus = useUiStore(selectBootstrapStatus);
  const bootstrapError = useUiStore(selectBootstrapError);
  const bootstrapFailureCode = useUiStore(selectBootstrapFailureCode);
  const bootstrapFailureStage = useUiStore(selectBootstrapFailureStage);
  const bootstrapFailureStatus = useUiStore(selectBootstrapFailureStatus);

  const approvalsById = useHotStateStore((state) => state.approvalsById);
  const lastError = useHotStateStore((state) => state.lastError);
  const modules = useHotStateStore((state) => state.modules);
  const runIds = useHotStateStore((state) => state.runIds);
  const runsById = useHotStateStore((state) => state.runsById);
  const workspaceIds = useHotStateStore((state) => state.workspaceIds);
  const workspacesById = useHotStateStore((state) => state.workspacesById);
  const globalLocked = useHotStateStore(selectGlobalInteractionLock);
  const timelineProjection = useProjectionStore((state) =>
    selectedRunId ? selectRunTimelineProjection(state, selectedRunId) : null,
  );
  const inspectorProjection = useProjectionStore((state) =>
    selectedRunId ? selectRunInspectorProjection(state, selectedRunId) : null,
  );
  const soulProjection = useProjectionStore((state) =>
    selectedRunId ? selectRunSoulPanelProjection(state, selectedRunId) : null,
  );
  const pendingOrder = usePendingCommandStore((state) => state.order);
  const pendingEntriesById = usePendingCommandStore((state) => state.entriesById);
  const ackOrder = useAckOverlayStore((state) => state.order);
  const ackEntriesById = useAckOverlayStore((state) => state.entriesById);
  const interruptedDraft = useSettingsBridgeStore((state) => state.interruptedDraft);
  const [createRunSubmitError, setCreateRunSubmitError] = useState<string | null>(null);
  const [isOpeningWorkspace, setIsOpeningWorkspace] = useState(false);
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [workspaceActionError, setWorkspaceActionError] = useState<string | null>(null);

  const { data: templates = [], error: templateError } = useQuery<readonly TemplateDescriptor[]>({
    queryKey: ['template-descriptors'],
    queryFn: () => services.coreApi.listTemplates(),
  });

  const workspaces = useMemo(
    () => buildWorkspaceList(workspaceIds, workspacesById),
    [workspaceIds, workspacesById],
  );
  useWorkspaceSelectionSync(selectedRunId, selectedWorkspaceId, workspaceIds, workspacesById);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }

    if (!timelineProjection) {
      void useProjectionStore.getState().refetchTimeline(services.coreApi, {
        limit: 50,
        runId: selectedRunId,
      });
    }

    if (!inspectorProjection) {
      void useProjectionStore.getState().refetchInspector(services.coreApi, selectedRunId);
    }
  }, [inspectorProjection, selectedRunId, services.coreApi, timelineProjection]);

  const sidebarRuns = useMemo(
    () =>
      Object.fromEntries(
        runIds.map((runId) => {
          const run = runsById[runId];
          return [
            runId,
            {
              approvalCount: run?.approvalIds.length ?? 0,
              lastEventAt: run?.lastEventAt,
              runId,
              status: run?.status ?? 'created',
              title: run?.title ?? runId,
            },
          ];
        }),
      ),
    [runIds, runsById],
  );

  const optimisticMessages = useMemo(
    () =>
      selectedRunId
        ? pendingOrder
            .map((clientCommandId) => pendingEntriesById[clientCommandId])
            .filter(
              (entry) =>
                entry?.runId === selectedRunId &&
                entry.entityType === 'message' &&
                entry.status !== 'settled',
            )
        : [],
    [pendingEntriesById, pendingOrder, selectedRunId],
  );

  const ackOverlays = useMemo(
    () =>
      selectedRunId
        ? ackOrder
            .map((clientCommandId) => ackEntriesById[clientCommandId])
            .filter((entry) => entry?.runId === selectedRunId)
        : [],
    [ackEntriesById, ackOrder, selectedRunId],
  );

  const selectedRun = selectedRunId ? runsById[selectedRunId] ?? null : null;
  const selectedWorkspace =
    selectedWorkspaceId ? workspacesById[selectedWorkspaceId] ?? null : null;
  const activeWorkspaceId = selectedRun?.workspaceId ?? selectedWorkspaceId ?? null;
  const workspaceLabel = selectedWorkspace?.name ?? 'Open a workspace first';
  const activeRunDraft =
    selectedRunId && composerDraftsByRun[selectedRunId] ? composerDraftsByRun[selectedRunId] : '';
  const activeCreateRunDraft = toCreateRunModalDraft(
    selectedWorkspaceId ? createRunDraftsByWorkspace[selectedWorkspaceId] : undefined,
  );
  const composerAvailability = useMemo(
    () =>
      buildComposerAvailability({
        globalLocked,
        modules,
        run: selectedRun,
        workspaceId: activeWorkspaceId,
      }),
    [activeWorkspaceId, globalLocked, modules, selectedRun],
  );

  useEffect(() => {
    if (!selectedWorkspaceId || !templates.length || activeCreateRunDraft.templateId) {
      return;
    }

    setCreateRunDraft(
      selectedWorkspaceId,
      fromCreateRunModalDraft({
        ...activeCreateRunDraft,
        templateId: templates[0].templateId,
      }),
    );
  }, [activeCreateRunDraft, selectedWorkspaceId, setCreateRunDraft, templates]);

  const selectedApprovals = useMemo(() => {
    if (!selectedRunId) {
      return [];
    }

    return Object.values(approvalsById).filter((approval) => approval.runId === selectedRunId);
  }, [approvalsById, selectedRunId]);

  const createRunError =
    createRunSubmitError ?? (templateError instanceof Error ? templateError.message : null);
  const modalOpen = activeModal === 'create-run';

  async function refreshAndSelectWorkspace(workspaceId: string | undefined): Promise<void> {
    const snapshot = await services.coreApi.getWorkbenchSnapshot();
    useHotStateStore.getState().applyWorkbenchSnapshot(snapshot);
    const workspace =
      (workspaceId
        ? snapshot.workspaces.find((entry) => entry.workspaceId === workspaceId)
        : null) ?? snapshot.workspaces[0];
    if (!workspace) {
      return;
    }

    setSelectedWorkspaceId(workspace.workspaceId);
    setSelectedRunId(workspace.runIds[0] ?? null);
  }

  async function handleOpenWorkspace(): Promise<void> {
    const pickWorkspace = window.doWhatRuntime?.openWorkspaceDirectory;
    if (!pickWorkspace) {
      setWorkspaceActionError('Workspace picker is unavailable in this environment.');
      return;
    }

    setWorkspaceActionError(null);
    setIsOpeningWorkspace(true);
    try {
      const rootPath = await pickWorkspace();
      if (!rootPath) {
        return;
      }

      const result = await dispatchOpenWorkspace(rootPath);
      if (!result.ok) {
        setWorkspaceActionError(result.entry.errorMessage ?? 'Failed to open workspace.');
        return;
      }

      await refreshAndSelectWorkspace(result.ack?.entityId);
    } catch (error) {
      setWorkspaceActionError(readOpenWorkspaceError(error));
    } finally {
      setIsOpeningWorkspace(false);
    }
  }

  function handleCreateRunIntent(workspaceId?: string): void {
    const nextWorkspaceId = workspaceId ?? selectedWorkspaceId;
    if (!nextWorkspaceId) {
      setWorkspaceActionError('Open a workspace before creating a run.');
      setCreateRunSubmitError(null);
      return;
    }

    setWorkspaceActionError(null);
    setCreateRunSubmitError(null);
    setSelectedWorkspaceId(nextWorkspaceId);
    setSelectedRunId(null);
    setActiveModal('create-run');
  }

  async function handleSubmitCreateRun(): Promise<void> {
    const nextWorkspaceId = selectedWorkspaceId;
    if (!nextWorkspaceId) {
      setCreateRunSubmitError('Open a workspace before starting a run.');
      return;
    }

    const draft = fromCreateRunModalDraft(activeCreateRunDraft);
    setCreateRunSubmitError(null);
    setIsSubmittingRun(true);
    const result = await dispatchCreateRun(nextWorkspaceId, draft, services.coreApi);
    setIsSubmittingRun(false);
    if (!result.ok) {
      setCreateRunSubmitError(result.entry.errorMessage ?? 'Failed to start run.');
      return;
    }

    clearCreateRunDraft(nextWorkspaceId);
    setActiveModal(null);
  }

  function handleSendMessage(): void {
    if (composerAvailability.isBlocked || !selectedRun || !activeWorkspaceId) {
      return;
    }

    const message = activeRunDraft.trim();
    if (message.length === 0) {
      return;
    }

    void dispatchRunMessage(
      selectedRun.runId,
      activeWorkspaceId,
      message,
      services.coreApi,
    ).then((result) => {
      if (result.ok) {
        clearComposerDraft(selectedRun.runId);
      }
    });
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.topbarLogo}>do-what</span>
        <div className={styles.topbarSpacer} />
      </header>

      <WorkbenchShell
        aside={
          <InspectorRail
            inspector={inspectorProjection}
            inspectorMode={inspectorMode}
            interruptedDraft={interruptedDraft}
            isFrozen={globalLocked}
            onApproveGate={() =>
              selectedRunId
                ? void dispatchIntegrationGateDecision(
                    { decision: 'approve', gateId: 'gate-main', runId: selectedRunId },
                    services.coreApi,
                  )
                : undefined
            }
            onBlockGate={() =>
              selectedRunId
                ? void dispatchIntegrationGateDecision(
                    { decision: 'block', gateId: 'gate-main', runId: selectedRunId },
                    services.coreApi,
                  )
                : undefined
            }
            onDismissOverlay={(clientCommandId) => dismissAckOverlay(clientCommandId)}
            onGovernMemory={(memoryId, mode, projectOverride) =>
              selectedRunId
                ? void dispatchMemoryGovernance(
                    { memoryId, mode, projectOverride, runId: selectedRunId },
                    services.coreApi,
                  )
                : undefined
            }
            onInspectorModeChange={setInspectorMode}
            onResolveDrift={() =>
              selectedRunId
                ? void dispatchDriftResolution(
                    { actionId: 'soft-stale', mode: 'reconcile', runId: selectedRunId },
                    services.coreApi,
                  )
                : undefined
            }
            onReviewProposal={(proposalId, mode) =>
              selectedRunId
                ? void dispatchMemoryProposalReview(
                    { mode, proposalId, runId: selectedRunId },
                    services.coreApi,
                  )
                : undefined
            }
            onRetryOverlay={(clientCommandId) =>
              void retryAckOverlaySync(clientCommandId, services.coreApi)
            }
            overlays={ackOverlays.filter((entry) => entry.entityType !== 'approval')}
            runTitle={selectedRun?.title ?? null}
            soulPanel={soulProjection}
            workspaceName={selectedWorkspace?.name ?? null}
          />
        }
        banner={
          <StatusBanner
            bootstrapError={bootstrapError}
            bootstrapFailureCode={bootstrapFailureCode}
            bootstrapFailureStage={bootstrapFailureStage}
            bootstrapFailureStatus={bootstrapFailureStatus}
            bootstrapStatus={bootstrapStatus}
            isFrozen={globalLocked}
            lastError={lastError?.message ?? null}
            modules={modules}
          />
        }
        main={
          selectedRun ? (
            <TimelinePane
              approvals={selectedApprovals}
              composerDraft={activeRunDraft}
              composerBlockedReason={composerAvailability.blockedReason}
              composerPlaceholder={composerAvailability.placeholder}
              globalLocked={globalLocked}
              hasMoreBefore={timelineProjection?.hasMoreBefore ?? false}
              isLoading={
                timelineProjection?.status === 'loading' ||
                timelineProjection?.status === 'refreshing'
              }
              isComposerBlocked={composerAvailability.isBlocked}
              markers={timelineProjection?.markers ?? []}
              onAllowOnce={(approvalId) =>
                void dispatchApprovalDecision(
                  { approvalId, decision: 'allow_once', runId: selectedRun.runId },
                  services.coreApi,
                )
              }
              onAllowSession={(approvalId) =>
                void dispatchApprovalDecision(
                  { approvalId, decision: 'allow_session', runId: selectedRun.runId },
                  services.coreApi,
                )
              }
              onComposerChange={(draft) => {
                if (selectedRunId) {
                  setComposerDraft(selectedRunId, draft);
                }
              }}
              onDismissOptimistic={(clientCommandId) => dismissPendingCommand(clientCommandId)}
              onDismissOverlay={(clientCommandId) => dismissAckOverlay(clientCommandId)}
              onLoadOlder={() => {
                if (!selectedRunId || !timelineProjection?.nextBeforeRevision) {
                  return;
                }

                void useProjectionStore.getState().refetchTimeline(services.coreApi, {
                  beforeRevision: timelineProjection.nextBeforeRevision,
                  limit: 50,
                  runId: selectedRunId,
                });
              }}
              onReject={(approvalId) =>
                void dispatchApprovalDecision(
                  { approvalId, decision: 'reject', runId: selectedRun.runId },
                  services.coreApi,
                )
              }
              onRetryOptimistic={(clientCommandId) =>
                selectedRunId
                  ? void retryPendingMessageSync(clientCommandId, selectedRunId, services.coreApi)
                  : undefined
              }
              onRetryOverlay={(clientCommandId) =>
                void retryAckOverlaySync(clientCommandId, services.coreApi)
              }
              onSendMessage={handleSendMessage}
              onSetViewMode={setTimelineViewMode}
              optimisticMessages={optimisticMessages}
              overlayEntries={ackOverlays}
              projectionEntries={timelineProjection?.entries ?? []}
              selectedRunId={selectedRun?.runId ?? null}
              threads={timelineProjection?.nodeThreads ?? []}
              viewMode={timelineViewMode}
            />
          ) : (
            <WorkspaceFirstEmptyState
              description={
                workspaces.length
                  ? '从左侧工作区中选择，或直接用侧栏里的新建 Run 发起一次协作。'
                  : '先在侧栏中打开一个工作区，再创建 Run。'
              }
              error={workspaceActionError}
              isBusy={isOpeningWorkspace}
              isFrozen={globalLocked}
              onOpenWorkspace={() => {
                void handleOpenWorkspace();
              }}
              title={workspaces.length ? '暂无运行' : '暂无工作区'}
            />
          )
        }
        modal={
          modalOpen ? (
            <CreateRunModal
              draft={activeCreateRunDraft}
              error={createRunError}
              isOpen
              isSubmitting={isSubmittingRun || globalLocked}
              onClose={() => {
                setCreateRunSubmitError(null);
                setActiveModal(null);
              }}
              onDraftChange={(draft) => {
                const nextWorkspaceId = selectedWorkspaceId;
                if (!nextWorkspaceId) {
                  return;
                }
                setCreateRunDraft(nextWorkspaceId, fromCreateRunModalDraft(draft));
              }}
              onSubmit={() => {
                void handleSubmitCreateRun();
              }}
              templates={templates}
              workspaceLabel={workspaceLabel}
            />
          ) : null
        }
        sidebar={
          <WorkspaceSidebar
            isFrozen={globalLocked}
            isOpeningWorkspace={isOpeningWorkspace}
            modules={modules}
            onCreateRun={handleCreateRunIntent}
            onOpenWorkspace={() => {
              void handleOpenWorkspace();
            }}
            onSelectRun={(runId, workspaceId) => {
              setCreateRunSubmitError(null);
              setWorkspaceActionError(null);
              setSelectedWorkspaceId(workspaceId);
              setSelectedRunId(runId);
            }}
            onSelectWorkspace={(workspaceId) => {
              setCreateRunSubmitError(null);
              setWorkspaceActionError(null);
              setSelectedWorkspaceId(workspaceId);
              setSelectedRunId(workspacesById[workspaceId]?.runIds[0] ?? null);
            }}
            selectedRunId={selectedRunId}
            selectedWorkspaceId={selectedWorkspaceId}
            runsById={sidebarRuns}
            workspaces={workspaces}
          />
        }
      />
    </section>
  );
}
