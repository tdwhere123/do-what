import type { WorkbenchHealthSnapshot } from '@do-what/protocol';
import {
  StatusRunningIcon,
  StatusSuccessIcon,
  StatusWaitingIcon,
  WorkbenchFlowerIcon,
} from '../icons';
import styles from './workspace-sidebar.module.css';

export interface SidebarRunSummary {
  readonly approvalCount: number;
  readonly lastEventAt?: string;
  readonly runId: string;
  readonly status: string;
  readonly title: string;
}

export interface SidebarWorkspaceSummary {
  readonly name: string;
  readonly runIds: readonly string[];
  readonly status: string;
  readonly workspaceId: string;
}

interface WorkspaceSidebarProps {
  readonly health: WorkbenchHealthSnapshot;
  readonly isFrozen: boolean;
  readonly onCreateRun: () => void;
  readonly onSelectRun: (runId: string, workspaceId: string) => void;
  readonly selectedRunId: string | null;
  readonly selectedWorkspaceId: string | null;
  readonly runsById: Record<string, SidebarRunSummary>;
  readonly workspaces: readonly SidebarWorkspaceSummary[];
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

function StatusDot(props: { readonly status: string }) {
  const tone = getStatusTone(props.status);
  const className =
    tone === 'running'
      ? `${styles.statusDot} ${styles.statusDotRunning}`
      : tone === 'attention'
        ? `${styles.statusDot} ${styles.statusDotAttention}`
        : `${styles.statusDot} ${styles.statusDotOk}`;

  return <span aria-hidden="true" className={className} />;
}

function HealthBadge(props: { readonly label: string; readonly value: string }) {
  const icon =
    props.value === 'healthy' || props.value === 'idle' ? (
      <StatusSuccessIcon size={14} />
    ) : props.value === 'running' ? (
      <StatusRunningIcon size={14} />
    ) : (
      <StatusWaitingIcon size={14} />
    );

  return (
    <span className={styles.healthBadge}>
      {icon}
      {props.label}: {props.value}
    </span>
  );
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) {
    return 'No events yet';
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }

  return new Date(parsed).toLocaleString();
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  return (
    <section className={styles.sidebar}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workbench</p>
          <h2 className={styles.title}>Workspaces</h2>
        </div>

        <button
          className={styles.primaryButton}
          disabled={props.isFrozen}
          onClick={props.onCreateRun}
          type="button"
        >
          <WorkbenchFlowerIcon size={16} />
          New Run
        </button>
      </header>

      <section className={styles.healthCluster} aria-label="Runtime health">
        <HealthBadge label="Core" value={props.health.core} />
        <HealthBadge label="Claude" value={props.health.claude} />
        <HealthBadge label="Codex" value={props.health.codex} />
        <HealthBadge label="Soul" value={props.health.soul} />
      </section>

      <div className={styles.workspaceList}>
        {props.workspaces.map((workspace) => {
          const isWorkspaceActive = workspace.workspaceId === props.selectedWorkspaceId;
          return (
            <section
              className={
                isWorkspaceActive
                  ? `${styles.workspaceCard} ${styles.workspaceCardActive}`
                  : styles.workspaceCard
              }
              key={workspace.workspaceId}
            >
              <div className={styles.workspaceMeta}>
                <div>
                  <p className={styles.workspaceLabel}>{workspace.name}</p>
                  <p className={styles.workspaceCaption}>
                    {workspace.runIds.length} tracked runs
                  </p>
                </div>
                <StatusDot status={workspace.status} />
              </div>

              <div className={styles.runList}>
                {workspace.runIds.map((runId) => {
                  const run = props.runsById[runId];
                  if (!run) {
                    return null;
                  }

                  const isRunActive = runId === props.selectedRunId;
                  return (
                    <button
                      className={
                        isRunActive
                          ? `${styles.runButton} ${styles.runButtonActive}`
                          : styles.runButton
                      }
                      key={runId}
                      onClick={() => props.onSelectRun(runId, workspace.workspaceId)}
                      type="button"
                    >
                      <div className={styles.runRow}>
                        <StatusDot status={run.status} />
                        <span className={styles.runTitle}>{run.title}</span>
                        {run.approvalCount > 0 ? (
                          <span className={styles.approvalBadge}>{run.approvalCount}</span>
                        ) : null}
                      </div>
                      <p className={styles.runMeta}>
                        {run.status} • {formatTimestamp(run.lastEventAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
