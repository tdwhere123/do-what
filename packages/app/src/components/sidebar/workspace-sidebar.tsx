import type { WorkbenchHealthSnapshot } from '@do-what/protocol';
import { Link } from 'react-router-dom';
import {
  SettingsSunIcon,
  SoulSpiralIcon,
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
  readonly onSelectWorkspace: (workspaceId: string) => void;
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
  return (
    <span
      aria-hidden="true"
      className={
        tone === 'running'
          ? `${styles.runDot} ${styles.runDotRunning}`
          : tone === 'attention'
            ? `${styles.runDot} ${styles.runDotAttention}`
            : `${styles.runDot} ${styles.runDotOk}`
      }
    />
  );
}

function HealthRow(props: {
  readonly icon: 'core' | 'engine' | 'soul';
  readonly label: string;
  readonly value: string;
}) {
  const icon =
    props.icon === 'core' ? (
      <SoulSpiralIcon size={12} />
    ) : props.icon === 'soul' ? (
      <WorkbenchFlowerIcon size={12} />
    ) : props.value === 'healthy' || props.value === 'idle' ? (
      <StatusSuccessIcon size={12} />
    ) : props.value === 'running' ? (
      <StatusRunningIcon size={12} />
    ) : (
      <StatusWaitingIcon size={12} />
    );

  const tone =
    props.value === 'healthy' || props.value === 'idle'
      ? styles.healthOk
      : props.value === 'running'
        ? styles.healthRunning
        : styles.healthAttention;

  return (
    <div className={styles.healthRow}>
      <span className={styles.healthIcon}>{icon}</span>
      <span className={styles.healthLabel}>{props.label}</span>
      <span className={tone}>{props.value}</span>
    </div>
  );
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  return (
    <section className={styles.sidebar}>
      <header className={styles.header}>
        <span className={styles.labelCaps}>Workspaces</span>
        <button
          className={styles.iconButton}
          disabled={props.isFrozen}
          onClick={props.onCreateRun}
          type="button"
        >
          +
        </button>
      </header>

      <div className={styles.workspaceList}>
        {props.workspaces.map((workspace) => {
          const expanded = workspace.workspaceId === props.selectedWorkspaceId;
          return (
            <section className={styles.workspaceBlock} key={workspace.workspaceId}>
              <button
                className={styles.workspaceLabel}
                onClick={() => props.onSelectWorkspace(workspace.workspaceId)}
                type="button"
              >
                <span className={styles.workspaceChevron}>{expanded ? 'v' : '>'}</span>
                <span className={styles.workspaceName}>/{workspace.name}</span>
              </button>

              {expanded ? (
                <div className={styles.runList}>
                  {workspace.runIds.length === 0 ? (
                    <div className={styles.emptyRuns}>No runs yet</div>
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
                        className={active ? `${styles.runButton} ${styles.runButtonActive}` : styles.runButton}
                        onClick={() => props.onSelectRun(runId, workspace.workspaceId)}
                        type="button"
                      >
                        <StatusDot status={run.status} />
                        <span className={styles.runTitle}>{run.title}</span>
                        {run.approvalCount > 0 ? (
                          <span className={styles.runMeta}>{run.approvalCount}</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    className={styles.newRunButton}
                    disabled={props.isFrozen}
                    onClick={props.onCreateRun}
                    type="button"
                  >
                    <WorkbenchFlowerIcon className={styles.newRunIcon} size={12} />
                    New Run
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className={styles.statusCluster}>
        <HealthRow icon="engine" label="Engine" value={props.health.claude} />
        <HealthRow icon="core" label="Core" value={props.health.core} />
        <HealthRow icon="soul" label="Soul" value={props.health.soul} />
        <Link className={styles.settingsLink} to="/settings">
          <span className={styles.healthIcon}>
            <SettingsSunIcon size={14} />
          </span>
          <span className={styles.settingsLabel}>Settings</span>
        </Link>
      </div>
    </section>
  );
}
