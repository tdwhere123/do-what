import { useState } from 'react';
import leavesTwigUrl from '../../assets/empty/leaves-twig.svg';
import workbenchFlowerUrl from '../../assets/icons/raw/workbench-flower.svg';
import {
  createDeferredToV0_2Note,
  DEFERRED_TO_V0_2_TITLE,
} from '../../lib/ui-placeholders';
import type { AckOverlayEntry } from '../../stores/ack-overlay';
import type { RunInspectorProjection, SoulPanelProjection } from '../../stores/projection';
import type { InterruptedSettingsDraft } from '../../stores/settings-bridge';
import type { InspectorMode } from '../../stores/ui';
import styles from './inspector-rail.module.css';

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
    : [];
}

interface PendingGlobalMemoryAction {
  readonly memoryId: string;
  readonly mode: 'edit' | 'supersede';
}

interface InspectorRailProps {
  readonly inspector: RunInspectorProjection | null;
  readonly inspectorMode: InspectorMode;
  readonly interruptedDraft: InterruptedSettingsDraft | null;
  readonly isFrozen: boolean;
  readonly onApproveGate: () => void;
  readonly onBlockGate: () => void;
  readonly onDismissOverlay: (clientCommandId: string) => void;
  readonly onGovernMemory: (
    memoryId: string,
    mode: 'edit' | 'pin' | 'supersede',
    projectOverride: boolean,
  ) => void;
  readonly onInspectorModeChange: (mode: InspectorMode) => void;
  readonly onResolveDrift: () => void;
  readonly onRetryOverlay: (clientCommandId: string) => void;
  readonly onReviewProposal: (
    proposalId: string,
    mode: 'accept' | 'hint_only' | 'reject',
  ) => void;
  readonly overlays: readonly AckOverlayEntry[];
  readonly runTitle: string | null;
  readonly soulPanel: SoulPanelProjection | null;
  readonly workspaceName: string | null;
}

function EmptyBlock(props: {
  readonly title: string;
  readonly text: string;
  readonly icon?: React.ReactNode;
}) {
  return (
    <section className={styles.block}>
      <div className={styles.blockTitle}>{props.title}</div>
      <div className={styles.emptyBlock}>
        {props.icon ? <span className={styles.emptyBlockIcon}>{props.icon}</span> : null}
        <span>{props.text}</span>
      </div>
    </section>
  );
}

export function InspectorRail(props: InspectorRailProps) {
  const overview = props.inspector?.snapshot.overview ?? {};
  const governance = props.inspector?.snapshot.governance ?? {};
  const gitTree = asStringArray(overview.gitTree);
  const collaboration = asRecordArray(overview.collaboration);
  const nativeSurfaceReport = asStringArray(governance.nativeSurfaceReport);
  const pendingCheckpoints = asRecordArray(
    (governance.checkpoints as Record<string, unknown> | undefined)?.pending,
  );
  const recentCheckpoints = asRecordArray(
    (governance.checkpoints as Record<string, unknown> | undefined)?.recent,
  );
  const softStaleNodes = asRecordArray(governance.softStaleNodes);
  const [pendingGlobalMemoryAction, setPendingGlobalMemoryAction] =
    useState<PendingGlobalMemoryAction | null>(null);

  function requestMemoryAction(
    memoryId: string,
    mode: 'edit' | 'pin' | 'supersede',
    isGlobal: boolean,
  ): void {
    if (mode === 'pin' || !isGlobal) {
      props.onGovernMemory(memoryId, mode, false);
      return;
    }

    setPendingGlobalMemoryAction({ memoryId, mode });
  }

  function confirmMemoryAction(projectOverride: boolean): void {
    if (!pendingGlobalMemoryAction) {
      return;
    }

    props.onGovernMemory(
      pendingGlobalMemoryAction.memoryId,
      pendingGlobalMemoryAction.mode,
      projectOverride,
    );
    setPendingGlobalMemoryAction(null);
  }

  if (!props.runTitle) {
    return (
      <div className={styles.rail}>
        <EmptyBlock
          title="概览"
          text="引擎待机中"
          icon={
            <img
              alt=""
              aria-hidden="true"
              src={workbenchFlowerUrl}
              style={{ width: 60, height: 60 }}
            />
          }
        />
        <EmptyBlock
          title="历史"
          text="暂无历史记录"
          icon={
            <img
              alt=""
              aria-hidden="true"
              src={leavesTwigUrl}
              style={{ width: 48, height: 48 }}
            />
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className={styles.rail}>
        <section className={styles.block}>
          <div className={styles.blockTitle}>文件</div>
          <div className={styles.blockBody}>
            {(props.inspector?.snapshot.files ?? []).map((file) => (
              <div className={styles.diffRow} key={file.path}>
                <span className={styles.diffFilename}>{file.path}</span>
                <span className={styles.diffKind}>{file.status}</span>
              </div>
            ))}
            {!props.inspector || props.inspector.snapshot.files.length === 0 ? (
              <div className={styles.emptyBlock}>暂无修改文件</div>
            ) : null}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockTitle}>计划</div>
          <div className={styles.blockBody}>
            {(props.inspector?.snapshot.plans ?? []).map((plan) => (
              <div className={styles.checkItem} key={plan.id}>
                <span className={plan.status === 'active' ? styles.checkDotActive : styles.checkDot} />
                <span className={styles.checkLabel}>{plan.summary}</span>
              </div>
            ))}
            {(props.inspector?.snapshot.history ?? []).map((item) => (
              <div className={styles.historyRow} key={item.id}>
                <strong>{item.label}</strong>
                <span>{item.type}</span>
              </div>
            ))}
            {!props.inspector ||
            (props.inspector.snapshot.plans.length === 0 &&
              props.inspector.snapshot.history.length === 0) ? (
              <div className={styles.emptyBlock}>暂无计划</div>
            ) : null}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockTitle}>Git / 协作</div>
          <div className={styles.blockBody}>
            <div className={styles.toggleRow}>
              <button
                className={
                  props.inspectorMode === 'git'
                    ? `${styles.toggleButton} ${styles.toggleButtonActive}`
                    : styles.toggleButton
                }
                onClick={() => props.onInspectorModeChange('git')}
                type="button"
              >
                Git
              </button>
              <button
                className={
                  props.inspectorMode === 'collaboration'
                    ? `${styles.toggleButton} ${styles.toggleButtonActive}`
                    : styles.toggleButton
                }
                onClick={() => props.onInspectorModeChange('collaboration')}
                type="button"
              >
                Collaboration
              </button>
            </div>
            {props.inspectorMode === 'git'
              ? gitTree.length === 0
                ? <div className={styles.emptyBlock}>暂无 Git 记录</div>
                : gitTree.map((item) => (
                    <div className={styles.gitRow} key={item}>
                      <span className={styles.gitFold}>v</span>
                      <span className={styles.diffFilename}>{item}</span>
                    </div>
                  ))
              : collaboration.length === 0
                ? <div className={styles.emptyBlock}>暂无并行运行</div>
                : collaboration.map((node) => (
                    <div className={styles.historyRow} key={String(node.id)}>
                      <strong>{String(node.title ?? node.id)}</strong>
                      <span>{String(node.lastAction ?? node.role ?? 'idle')}</span>
                    </div>
                  ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockTitle}>治理</div>
          <div className={styles.blockBody}>
            <div className={styles.historyRow}>
              <strong>Workspace</strong>
              <span>{props.workspaceName ?? 'unknown'}</span>
            </div>
            <div className={styles.historyRow}>
              <strong>Native surface</strong>
              <span>{nativeSurfaceReport.join(', ') || 'none'}</span>
            </div>
            <div className={styles.historyRow}>
              <strong>Gate</strong>
              <span>{String(governance.gateState ?? 'idle')}</span>
            </div>
            <div className={styles.historyRow}>
              <strong>Drift</strong>
              <span>{String(governance.driftState ?? 'none')}</span>
            </div>
            {pendingCheckpoints.map((item) => (
              <div className={styles.historyRow} key={String(item.id)}>
                <strong>{String(item.label ?? item.id)}</strong>
                <span>pending checkpoint</span>
              </div>
            ))}
            {recentCheckpoints.map((item) => (
              <div className={styles.historyRow} key={String(item.id)}>
                <strong>{String(item.label ?? item.id)}</strong>
                <span>{String(item.timestamp ?? 'recent')}</span>
              </div>
            ))}
            {softStaleNodes.map((item) => (
              <div className={styles.historyRow} key={String(item.nodeId)}>
                <strong>{String(item.nodeId)}</strong>
                <span>{String(item.summary ?? 'soft stale')}</span>
              </div>
            ))}
            <p className={styles.mutedText}>{createDeferredToV0_2Note('治理写入动作')}</p>
            <div className={styles.actionRow}>
              <button className={styles.primaryButton} disabled title={DEFERRED_TO_V0_2_TITLE} type="button">
                Resolve Drift
              </button>
              <button className={styles.secondaryButton} disabled title={DEFERRED_TO_V0_2_TITLE} type="button">
                Approve Gate
              </button>
              <button className={styles.ghostButton} disabled title={DEFERRED_TO_V0_2_TITLE} type="button">
                Block Gate
              </button>
            </div>
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockTitle}>记忆</div>
          <div className={styles.blockBody}>
            {(props.soulPanel?.proposals ?? []).map((proposal) => (
              <article className={styles.inlineCard} key={proposal.id}>
                <strong>{proposal.claim ?? proposal.title}</strong>
                <p className={styles.mutedText}>{proposal.scope ?? 'project'}</p>
                <div className={styles.actionRow}>
                  <button className={styles.primaryButton} disabled={props.isFrozen} onClick={() => props.onReviewProposal(proposal.id, 'accept')} type="button">
                    Accept
                  </button>
                  <button className={styles.secondaryButton} disabled={props.isFrozen} onClick={() => props.onReviewProposal(proposal.id, 'hint_only')} type="button">
                    Hint Only
                  </button>
                  <button className={styles.ghostButton} disabled={props.isFrozen} onClick={() => props.onReviewProposal(proposal.id, 'reject')} type="button">
                    Reject
                  </button>
                </div>
              </article>
            ))}
            {(props.soulPanel?.memories ?? []).map((memory) => {
              const isGlobal =
                memory.scope === 'global-core' || memory.scope === 'global-domain';
              return (
                <article className={styles.inlineCard} key={memory.id}>
                  <strong>{memory.claim ?? memory.title}</strong>
                  <p className={styles.mutedText}>
                    {memory.scope ?? 'project'} / {memory.retentionState ?? 'working'}
                  </p>
                  <p className={styles.mutedText}>{createDeferredToV0_2Note('记忆维护动作')}</p>
                  <div className={styles.actionRow}>
                    <button className={styles.primaryButton} disabled title={DEFERRED_TO_V0_2_TITLE} type="button">
                      Pin
                    </button>
                    <button className={styles.secondaryButton} disabled title={DEFERRED_TO_V0_2_TITLE} type="button">
                      Edit
                    </button>
                    <button className={styles.ghostButton} disabled title={DEFERRED_TO_V0_2_TITLE} type="button">
                      Supersede
                    </button>
                  </div>
                </article>
              );
            })}
            {!props.soulPanel || props.soulPanel.entries.length === 0 ? (
              <div className={styles.emptyBlock}>记忆为空</div>
            ) : null}
          </div>
        </section>

        {props.overlays.length > 0 ? (
          <section className={styles.block}>
            <div className={styles.blockTitle}>Overlay lifecycle</div>
            <div className={styles.blockBody}>
              {props.overlays.map((entry) => (
                <article className={styles.inlineCard} key={entry.clientCommandId}>
                  <div className={styles.historyRow}>
                    <strong>{entry.action}</strong>
                    <span>{entry.status}</span>
                  </div>
                  {entry.errorMessage ? <p className={styles.mutedText}>{entry.errorMessage}</p> : null}
                  {entry.status === 'desynced' ? (
                    <div className={styles.actionRow}>
                      <button className={styles.secondaryButton} onClick={() => props.onRetryOverlay(entry.clientCommandId)} type="button">
                        Retry Sync
                      </button>
                      <button className={styles.ghostButton} onClick={() => props.onDismissOverlay(entry.clientCommandId)} type="button">
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {props.interruptedDraft ? (
          <section className={styles.block}>
            <div className={styles.blockTitle}>Lease interruption</div>
            <div className={styles.blockBody}>
              <p className={styles.mutedText}>
                Lease {props.interruptedDraft.leaseId ?? 'unknown'} interrupted dirty settings fields.
              </p>
              <pre className={styles.preformatted}>
                {JSON.stringify(props.interruptedDraft.fields, null, 2)}
              </pre>
            </div>
          </section>
        ) : null}
      </div>

      {pendingGlobalMemoryAction ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <div aria-modal="true" className={styles.dialog} role="dialog">
            <div className={styles.blockTitle}>Global memory guard</div>
            <p className={styles.mutedText}>
              This memory is scoped globally. Apply the change globally only when you
              intend to affect every project; otherwise create a project override.
            </p>
            <div className={styles.actionRow}>
              <button className={styles.primaryButton} disabled={props.isFrozen} onClick={() => confirmMemoryAction(true)} type="button">
                Project Override
              </button>
              <button className={styles.secondaryButton} disabled={props.isFrozen} onClick={() => confirmMemoryAction(false)} type="button">
                Apply Globally
              </button>
              <button className={styles.ghostButton} onClick={() => setPendingGlobalMemoryAction(null)} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
