import type { TemplateDescriptor } from '@do-what/protocol';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreateRunModal,
  type CreateRunModalDraft,
} from '../../components/create-run/create-run-modal';
import { WorkbenchEmptyState } from '../../components/empty/workbench-empty-state';
import { InspectorRail } from '../../components/inspector/inspector-rail';
import { WorkbenchShell } from '../../components/layout/workbench-shell';
import {
  WorkspaceSidebar,
  type SidebarWorkspaceSummary,
} from '../../components/sidebar/workspace-sidebar';
import { TimelinePane } from '../../components/timeline/timeline-pane';
import {
  dispatchApprovalDecision,
  dispatchCreateRun,
  dispatchDriftResolution,
  dispatchIntegrationGateDecision,
  dispatchMemoryGovernance,
  dispatchMemoryProposalReview,
  dispatchRunMessage,
  dismissPendingCommand,
} from '../../lib/commands';
import { dismissAckOverlay, retryAckOverlaySync, retryPendingMessageSync } from '../../lib/reconciliation';
import { getAppServices } from '../../lib/runtime/app-services';
import {
  selectBootstrapError,
  selectBootstrapStatus,
  selectGlobalInteractionLock,
  selectInspectorMode,
  selectRunInspectorProjection,
  selectRunSoulPanelProjection,
  selectRunTimelineProjection,
  selectSelectedRunId,
  selectSelectedWorkspaceId,
  selectTimelineViewMode,
} from '../../selectors';
import { useAckOverlayStore } from '../../stores/ack-overlay';
import { useHotStateStore } from '../../stores/hot-state';
import { usePendingCommandStore } from '../../stores/pending-command';
import { useProjectionStore } from '../../stores/projection';
import { useSettingsBridgeStore } from '../../stores/settings-bridge';
import { createEmptyCreateRunDraft, useUiStore, type CreateRunDraft } from '../../stores/ui';
import styles from './workbench-page-content.module.css';

const PARTICIPANT_MODE_TO_VALUES: Record<string, readonly string[]> = {
  autonomous: [],
  lead_integrator: ['lead', 'integrator'],
  lead_review_integrator: ['lead', 'review', 'integrator'],
};

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

function StatusBanner(props: {
  readonly bootstrapError: string | null;
  readonly bootstrapStatus: string;
  readonly isFrozen: boolean;
  readonly lastError: string | null;
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
    return (
      <div className={styles.banner}>
        <strong>Workbench bootstrap failed</strong>
        <p>{props.bootstrapError ?? 'Snapshot bootstrap did not complete.'}</p>
      </div>
    );
  }

  if (props.isFrozen || props.lastError) {
    return (
      <div className={styles.banner}>
        <strong>{props.isFrozen ? 'Global interaction is frozen.' : 'Workbench recovered with errors.'}</strong>
        <p>{props.lastError ?? 'Commands stay disabled until Core returns to a healthy state.'}</p>
      </div>
    );
  }

  return null;
}

export function WorkbenchPageContent() {
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

  const approvalsById = useHotStateStore((state) => state.approvalsById);
  const health = useHotStateStore((state) => state.health);
  const lastError = useHotStateStore((state) => state.lastError);
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
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);

  const { data: templates = [], error: templateError } = useQuery<readonly TemplateDescriptor[]>({
    queryKey: ['template-descriptors'],
    queryFn: () => services.coreApi.listTemplates(),
  });

  useEffect(() => {
    if (!workspaceIds.length) {
      return;
    }

    if (!selectedWorkspaceId || !workspacesById[selectedWorkspaceId]) {
      setSelectedWorkspaceId(workspaceIds[0] ?? null);
    }
  }, [workspaceIds, workspacesById, selectedWorkspaceId, setSelectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
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
  }, [workspacesById, selectedRunId, selectedWorkspaceId, setSelectedRunId]);

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

  const workspaces = useMemo(
    () => buildWorkspaceList(workspaceIds, workspacesById),
    [workspaceIds, workspacesById],
  );

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
  const selectedWorkspace = selectedWorkspaceId
    ? workspacesById[selectedWorkspaceId] ?? null
    : null;
  const workspaceLabel = selectedWorkspace?.name ?? 'No workspace selected';
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

    return Object.values(approvalsById).filter(
      (approval) => approval.runId === selectedRunId,
    );
  }, [approvalsById, selectedRunId]);

  const createRunError = templateError instanceof Error ? templateError.message : null;
  const modalOpen = activeModal === 'create-run';

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
            bootstrapStatus={bootstrapStatus}
            isFrozen={globalLocked}
            lastError={lastError?.message ?? null}
          />
        }
        main={
          selectedRun ? (
            <TimelinePane
              approvals={selectedApprovals}
              composerDraft={activeRunDraft}
              globalLocked={globalLocked}
              hasMoreBefore={timelineProjection?.hasMoreBefore ?? false}
              isLoading={timelineProjection?.status === 'loading' || timelineProjection?.status === 'refreshing'}
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
            <WorkbenchEmptyState
              description={
                workspaces.length
                  ? 'Pick a workspace and start the next run. The right rail stays mounted so later projections do not shift the shell.'
                  : 'Workbench is waiting for workspace snapshot data. Create Run remains the primary entry point.'
              }
              isFrozen={globalLocked}
              onCreateRun={() => setActiveModal('create-run')}
              title={workspaces.length ? 'No active run selected' : 'No runs yet'}
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
              onClose={() => setActiveModal(null)}
              onDraftChange={(draft) => {
                const nextWorkspaceId = selectedWorkspaceId ?? workspaceIds[0] ?? 'workspace-main';
                setCreateRunDraft(nextWorkspaceId, fromCreateRunModalDraft(draft));
              }}
              onSubmit={async () => {
                const nextWorkspaceId = selectedWorkspaceId ?? workspaceIds[0] ?? 'workspace-main';
                const draft = fromCreateRunModalDraft(activeCreateRunDraft);
                setIsSubmittingRun(true);
                const result = await dispatchCreateRun(nextWorkspaceId, draft, services.coreApi);
                setIsSubmittingRun(false);
                if (result.ok) {
                  clearCreateRunDraft(nextWorkspaceId);
                  setActiveModal(null);
                }
              }}
              templates={templates}
              workspaceLabel={workspaceLabel}
            />
          ) : null
        }
        sidebar={
          <WorkspaceSidebar
            health={health}
            isFrozen={globalLocked}
            onCreateRun={() => setActiveModal('create-run')}
            onSelectRun={(runId, workspaceId) => {
              setSelectedWorkspaceId(workspaceId);
              setSelectedRunId(runId);
            }}
            onSelectWorkspace={(workspaceId) => {
              setSelectedWorkspaceId(workspaceId);
              const runId = workspacesById[workspaceId]?.runIds[0] ?? null;
              setSelectedRunId(runId);
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
