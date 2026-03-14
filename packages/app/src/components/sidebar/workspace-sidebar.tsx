import type {
  ModuleStatusSnapshot,
  WorkbenchHealthSnapshot,
  WorkbenchModulesSnapshot,
} from '@do-what/protocol';
import { Link } from 'react-router-dom';
import {
  formatModuleState,
  getModuleTone,
  selectPrimaryEngineModule,
} from '../../lib/module-status';
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

interface ModernWorkspaceSidebarProps {
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
}

interface LegacyWorkspaceSidebarProps {
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

type WorkspaceSidebarProps = ModernWorkspaceSidebarProps | LegacyWorkspaceSidebarProps;

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
  readonly module: ModuleStatusSnapshot;
}) {
  const tone = getModuleTone(props.module);
  const icon =
    props.icon === 'core' ? (
      <SoulSpiralIcon size={12} />
    ) : props.icon === 'soul' ? (
      <WorkbenchFlowerIcon size={12} />
    ) : tone === 'ok' ? (
      <StatusSuccessIcon size={12} />
    ) : tone === 'running' ? (
      <StatusRunningIcon size={12} />
    ) : (
      <StatusWaitingIcon size={12} />
    );

  const toneClass =
    tone === 'ok'
      ? styles.healthOk
      : tone === 'running'
        ? styles.healthRunning
        : styles.healthAttention;

  return (
    <div className={styles.healthRow}>
      <span className={styles.healthIcon}>{icon}</span>
      <span className={styles.healthLabel}>{props.label}</span>
      <span className={toneClass}>{formatModuleState(props.module)}</span>
    </div>
  );
}

function LegacyHealthRow(props: {
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

  const toneClass =
    props.value === 'healthy' || props.value === 'idle'
      ? styles.healthOk
      : props.value === 'running'
        ? styles.healthRunning
        : styles.healthAttention;

  return (
    <div className={styles.healthRow}>
      <span className={styles.healthIcon}>{icon}</span>
      <span className={styles.healthLabel}>{props.label}</span>
      <span className={toneClass}>{props.value}</span>
    </div>
  );
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const modernProps = 'modules' in props ? props : null;
  const legacyProps = 'health' in props ? props : null;
  const primaryEngine = modernProps ? selectPrimaryEngineModule(modernProps.modules) : null;
  const openButtonDisabled = modernProps
    ? props.isFrozen || modernProps.isOpeningWorkspace
    : props.isFrozen;
  const openButtonLabel = modernProps ? 'Add Workspace' : 'Create Run';

  return (
    <section className={styles.sidebar}>
      <header className={styles.header}>
        <span className={styles.labelCaps}>工作区</span>
        <button
          aria-label={openButtonLabel}
          className={styles.iconButton}
          disabled={openButtonDisabled}
          onClick={modernProps ? modernProps.onOpenWorkspace : legacyProps?.onCreateRun}
          title={openButtonLabel}
          type="button"
        >
          +
        </button>
      </header>

      <div className={styles.workspaceList}>
        {props.workspaces.map((workspace) => {
          const expanded = workspace.workspaceId === props.selectedWorkspaceId;
          const workspaceLabelClass = expanded
            ? `${styles.workspaceLabel} ${styles.workspaceLabelActive}`
            : styles.workspaceLabel;
          return (
            <section className={styles.workspaceBlock} key={workspace.workspaceId}>
              <button
                className={workspaceLabelClass}
                onClick={() => props.onSelectWorkspace(workspace.workspaceId)}
                type="button"
              >
                <span className={styles.workspaceChevron}>{expanded ? 'v' : '>'}</span>
                <span className={styles.workspaceName}>/{workspace.name}</span>
              </button>

              {expanded ? (
                <div className={styles.runList}>
                  {workspace.runIds.length === 0 ? (
                    <div className={styles.emptyRuns}>暂无运行</div>
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
                    onClick={() =>
                      modernProps
                        ? modernProps.onCreateRun(workspace.workspaceId)
                        : legacyProps?.onCreateRun()
                    }
                    type="button"
                  >
                    <WorkbenchFlowerIcon className={styles.newRunIcon} size={12} />
                    新建 Run
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className={styles.statusCluster}>
        {modernProps && primaryEngine ? (
          <>
            <HealthRow icon="engine" label="Engine" module={primaryEngine} />
            <HealthRow icon="core" label="Core" module={modernProps.modules.core} />
            <HealthRow icon="soul" label="Soul" module={modernProps.modules.soul} />
          </>
        ) : legacyProps ? (
          <>
            <LegacyHealthRow icon="engine" label="Engine" value={legacyProps.health.claude} />
            <LegacyHealthRow icon="core" label="Core" value={legacyProps.health.core} />
            <LegacyHealthRow icon="soul" label="Soul" value={legacyProps.health.soul} />
          </>
        ) : null}
        <Link className={styles.settingsLink} to="/settings">
          <span className={styles.healthIcon}>
            <SettingsSunIcon size={14} />
          </span>
          <span className={styles.settingsLabel}>设置</span>
        </Link>
      </div>
    </section>
  );
}
