import type {
  CoreCommandAck,
  TemplateDescriptor,
  ModuleStatusSnapshot,
  WorkbenchModulesSnapshot,
} from '@do-what/protocol';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CreateRunModal,
  type CreateRunModalDraft,
} from '../components/create-run/create-run-modal';
import { InspectorRail } from '../components/inspector/inspector-rail';
import {
  SettingsSunIcon,
  SoulSpiralIcon,
  StatusRunningIcon,
  StatusSuccessIcon,
  StatusWaitingIcon,
  WorkbenchFlowerIcon,
} from '../components/icons';
import { WorkbenchShell } from '../components/layout/workbench-shell';
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
import {
  buildModulesSummary,
  formatModuleState,
  getModuleTone,
  selectPrimaryEngineModule,
} from '../lib/module-status';
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
import emptyStyles from '../components/empty/workbench-empty-state.module.css';
import sidebarStyles from '../components/sidebar/workspace-sidebar.module.css';
import styles from '../pages/workbench/workbench-page-content.module.css';

interface SidebarRunSummary {
  readonly approvalCount: number;
  readonly lastEventAt?: string;
  readonly runId: string;
  readonly status: string;
  readonly title: string;
}

interface SidebarWorkspaceSummary {
  readonly name: string;
  readonly runIds: readonly string[];
  readonly status: string;
  readonly workspaceId: string;
}

interface WorkspaceOpenResult extends DispatchCoreCommandResult {
  readonly ack: CoreCommandAck | null;
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
function getStatusTone(status: string): 'attention' | 'ok' | 'running' {
  if (status === 'running' || status === 'started') {
    return 'running';
  }

  if (status === 'waiting_approval' || status === 'failed' || status === 'interrupted') {
    return 'attention';
  }

  return 'ok';
}

function readOpenWorkspaceError(error: unknown): string {
  if (error instanceof CoreHttpError) {
    return error.coreError.message;
  }

  return error instanceof Error ? error.message : 'Failed to open workspace.';
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

function StatusDot(props: { readonly status: string }) {
  const tone = getStatusTone(props.status);
  return (
    <span
      aria-hidden="true"
      className={
        tone === 'running'
          ? `${sidebarStyles.runDot} ${sidebarStyles.runDotRunning}`
          : tone === 'attention'
            ? `${sidebarStyles.runDot} ${sidebarStyles.runDotAttention}`
            : `${sidebarStyles.runDot} ${sidebarStyles.runDotOk}`
      }
    />
  );
}

function SidebarHealthRow(props: {
  readonly icon: 'core' | 'engine' | 'soul';
  readonly label: string;
  readonly module: ModuleStatusSnapshot;
}) {
  const icon =
    props.icon === 'core' ? (
      <SoulSpiralIcon size={12} />
    ) : props.icon === 'soul' ? (
      <WorkbenchFlowerIcon size={12} />
    ) : getModuleTone(props.module) === 'ok' ? (
      <StatusSuccessIcon size={12} />
    ) : getModuleTone(props.module) === 'running' ? (
      <StatusRunningIcon size={12} />
    ) : (
      <StatusWaitingIcon size={12} />
    );

  const tone = getModuleTone(props.module);
  const toneClass =
    tone === 'ok'
      ? sidebarStyles.healthOk
      : tone === 'running'
        ? sidebarStyles.healthRunning
        : sidebarStyles.healthAttention;

  return (
    <div className={sidebarStyles.healthRow}>
      <span className={sidebarStyles.healthIcon}>{icon}</span>
      <span className={sidebarStyles.healthLabel}>{props.label}</span>
      <span className={toneClass}>{formatModuleState(props.module)}</span>
    </div>
  );
}

function WorkspaceFirstSidebar(props: {
  readonly isFrozen: boolean;
  readonly isOpeningWorkspace: boolean;
  readonly modules: WorkbenchModulesSnapshot;
  readonly onCreateRun: (workspaceId: string) => void;
  readonly onOpenWorkspace: () => void;
  readonly onSelectRun: (runId: string, workspaceId: string) => void;
  readonly onSelectWorkspace: (workspaceId: string) => void;
  readonly selectedRunId: string | null;
  readonly selectedWorkspaceId: string | null;
  readonly runsById: Record<string, SidebarRunSummary>;
  readonly workspaces: readonly SidebarWorkspaceSummary[];
}) {
  const primaryEngine = selectPrimaryEngineModule(props.modules);

  return (
    <section className={sidebarStyles.sidebar}>
      <header className={sidebarStyles.header}>
        <span className={sidebarStyles.labelCaps}>Workspaces</span>
        <button
          className={sidebarStyles.iconButton}
          disabled={props.isFrozen || props.isOpeningWorkspace}
          onClick={props.onOpenWorkspace}
          type="button"
        >
          +
        </button>
      </header>

      <div className={sidebarStyles.workspaceList}>
        {props.workspaces.map((workspace) => {
          const expanded = workspace.workspaceId === props.selectedWorkspaceId;
          return (
            <section className={sidebarStyles.workspaceBlock} key={workspace.workspaceId}>
              <button
                className={sidebarStyles.workspaceLabel}
                onClick={() => props.onSelectWorkspace(workspace.workspaceId)}
                type="button"
              >
                <span className={sidebarStyles.workspaceChevron}>{expanded ? 'v' : '>'}</span>
                <span className={sidebarStyles.workspaceName}>/{workspace.name}</span>
              </button>

              {expanded ? (
                <div className={sidebarStyles.runList}>
                  {workspace.runIds.length === 0 ? (
                    <div className={sidebarStyles.emptyRuns}>No runs yet</div>
                  ) : null}
                  {workspace.runIds.map((runId) => {
                    const run = props.runsById[runId];
                    if (!run) {
                      return null;
                    }

                    const active = runId === props.selectedRunId;
                    return (
                      <button
                        key={runId}
                        className={
                          active
                            ? `${sidebarStyles.runButton} ${sidebarStyles.runButtonActive}`
                            : sidebarStyles.runButton
                        }
                        onClick={() => props.onSelectRun(runId, workspace.workspaceId)}
                        type="button"
                      >
                        <StatusDot status={run.status} />
                        <span className={sidebarStyles.runTitle}>{run.title}</span>
                        {run.approvalCount > 0 ? (
                          <span className={sidebarStyles.runMeta}>{run.approvalCount}</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    className={sidebarStyles.newRunButton}
                    disabled={props.isFrozen}
                    onClick={() => props.onCreateRun(workspace.workspaceId)}
                    type="button"
                  >
                    <WorkbenchFlowerIcon className={sidebarStyles.newRunIcon} size={12} />
                    New Run
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className={sidebarStyles.statusCluster}>
        <SidebarHealthRow
          icon="engine"
          label={primaryEngine.label}
          module={primaryEngine}
        />
        <SidebarHealthRow icon="core" label="Core" module={props.modules.core} />
        <SidebarHealthRow icon="soul" label="Soul" module={props.modules.soul} />
        <Link className={sidebarStyles.settingsLink} to="/settings">
          <span className={sidebarStyles.healthIcon}>
            <SettingsSunIcon size={14} />
          </span>
          <span className={sidebarStyles.settingsLabel}>Settings</span>
        </Link>
      </div>
    </section>
  );
}

function WorkspaceFirstEmptyState(props: {
  readonly description: string;
  readonly error: string | null;
  readonly isBusy: boolean;
  readonly isFrozen: boolean;
  readonly onOpenWorkspace: () => void;
  readonly title: string;
}) {
  return (
    <section className={emptyStyles.empty}>
      <div className={emptyStyles.iconWrap}>
        <WorkbenchFlowerIcon className={emptyStyles.icon} size={56} />
      </div>
      <h2 className={emptyStyles.title}>{props.title}</h2>
      <p className={emptyStyles.description}>{props.description}</p>
      {props.error ? <p className={styles.bannerInline}>{props.error}</p> : null}
      <div className={emptyStyles.actions}>
        <button
          className={emptyStyles.primaryButton}
          disabled={props.isFrozen || props.isBusy}
          onClick={props.onOpenWorkspace}
          type="button"
        >
          {props.isBusy ? 'Opening...' : 'Open Workspace'}
        </button>
        <button className={emptyStyles.ghostButton} disabled type="button">
          Browse History (v0.2)
        </button>
      </div>
    </section>
  );
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
  if (props.bootstrapStatus === 'loading') {
    return (
      <div className={styles.banner}>
        <strong>Bootstrapping workbench</strong>
        <p>Reading snapshot and opening the event stream.</p>
      </div>
    );
  }

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
  const workspaceLabel = selectedWorkspace?.name ?? 'Open a workspace first';
  const activeRunDraft =
    selectedRunId && composerDraftsByRun[selectedRunId] ? composerDraftsByRun[selectedRunId] : '';
  const activeCreateRunDraft = toCreateRunModalDraft(
    selectedWorkspaceId ? createRunDraftsByWorkspace[selectedWorkspaceId] : undefined,
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
    if (!workspaceId) {
      return;
    }

    const workspace = snapshot.workspaces.find((entry) => entry.workspaceId === workspaceId);
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
    const nextWorkspaceId = workspaceId ?? selectedWorkspaceId ?? workspaceIds[0] ?? null;
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
    const nextWorkspaceId = selectedWorkspaceId ?? workspaceIds[0] ?? null;
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
              globalLocked={globalLocked}
              hasMoreBefore={timelineProjection?.hasMoreBefore ?? false}
              isLoading={
                timelineProjection?.status === 'loading' ||
                timelineProjection?.status === 'refreshing'
              }
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
              onSendMessage={() =>
                selectedRun
                  ? void dispatchRunMessage(
                      selectedRun.runId,
                      selectedRun.workspaceId ?? selectedWorkspaceId,
                      activeRunDraft,
                      services.coreApi,
                    ).then((result) => {
                      if (result.ok) {
                        clearComposerDraft(selectedRun.runId);
                      }
                    })
                  : undefined
              }
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
                  ? 'Pick a workspace and start the next run. The right rail stays mounted so later projections do not shift the shell.'
                  : 'Open a workspace first, then create a run inside that workspace.'
              }
              error={workspaceActionError}
              isBusy={isOpeningWorkspace}
              isFrozen={globalLocked}
              onOpenWorkspace={() => {
                void handleOpenWorkspace();
              }}
              title={workspaces.length ? 'No active run selected' : 'No workspace yet'}
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
                const nextWorkspaceId = selectedWorkspaceId ?? workspaceIds[0] ?? null;
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
          <WorkspaceFirstSidebar
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
