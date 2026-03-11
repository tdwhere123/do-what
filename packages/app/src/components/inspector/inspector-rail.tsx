import { useState } from 'react';
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

  return (
    <>
      <div className={styles.rail}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Inspector rail</p>
          <h3 className={styles.title}>Overview</h3>
          <div className={styles.metaList}>
            <div className={styles.metaRow}>
              <span>Workspace</span>
              <strong>{props.workspaceName ?? 'Awaiting selection'}</strong>
            </div>
            <div className={styles.metaRow}>
              <span>Run</span>
              <strong>{props.runTitle ?? 'No active run'}</strong>
            </div>
            <div className={styles.metaRow}>
              <span>Branch</span>
              <strong>{String(overview.branch ?? 'unknown')}</strong>
            </div>
            <div className={styles.metaRow}>
              <span>Diff summary</span>
              <strong>{String(overview.diffSummary ?? 'n/a')}</strong>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Projection</p>
              <h3 className={styles.title}>Files / Plan / History</h3>
            </div>
            <span className={styles.badge}>read-only</span>
          </div>
          <div className={styles.stackList}>
            {(props.inspector?.snapshot.files ?? []).map((file) => (
              <div key={file.path} className={styles.record}>
                <strong>{file.path}</strong>
                <span>{file.status}</span>
              </div>
            ))}
            {(props.inspector?.snapshot.plans ?? []).map((plan) => (
              <div key={plan.id} className={styles.record}>
                <strong>{plan.summary}</strong>
                <span>{plan.status}</span>
              </div>
            ))}
            {(props.inspector?.snapshot.history ?? []).map((item) => (
              <div key={item.id} className={styles.record}>
                <strong>{item.label}</strong>
                <span>{item.type}</span>
              </div>
            ))}
            {!props.inspector ||
            (props.inspector.snapshot.files.length === 0 &&
              props.inspector.snapshot.plans.length === 0 &&
              props.inspector.snapshot.history.length === 0) ? (
              <p className={styles.mutedText}>Inspector projection is idle for this run.</p>
            ) : null}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Switch</p>
              <h3 className={styles.title}>Git / Collaboration</h3>
            </div>
            <div className={styles.toggleRow}>
              <button
                className={
                  props.inspectorMode === 'git'
                    ? styles.toggleActive
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
                    ? styles.toggleActive
                    : styles.toggleButton
                }
                onClick={() => props.onInspectorModeChange('collaboration')}
                type="button"
              >
                Collaboration
              </button>
            </div>
          </div>
          <div className={styles.stackList}>
            {props.inspectorMode === 'git'
              ? gitTree.length === 0
                ? [
                    <p key="empty-git" className={styles.mutedText}>
                      Git projection is still thin for this run.
                    </p>,
                  ]
                : gitTree.map((item) => (
                    <div key={item} className={styles.record}>
                      <strong>{item}</strong>
                      <span>tree</span>
                    </div>
                  ))
              : collaboration.length === 0
                ? [
                    <p key="empty-collab" className={styles.mutedText}>
                      No parallel collaboration nodes were projected.
                    </p>,
                  ]
                : collaboration.map((node) => (
                    <div key={String(node.id)} className={styles.record}>
                      <strong>{String(node.title ?? node.id)}</strong>
                      <span>{String(node.lastAction ?? node.role ?? 'idle')}</span>
                    </div>
                  ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Governance</p>
              <h3 className={styles.title}>Checkpoint / Drift / Gate</h3>
            </div>
            <span className={styles.badge}>{String(governance.leaseStatus ?? 'none')}</span>
          </div>
          <div className={styles.metaList}>
            <div className={styles.metaRow}>
              <span>Native surface</span>
              <strong>{nativeSurfaceReport.join(', ') || 'none'}</strong>
            </div>
            <div className={styles.metaRow}>
              <span>Gate state</span>
              <strong>{String(governance.gateState ?? 'idle')}</strong>
            </div>
            <div className={styles.metaRow}>
              <span>Drift state</span>
              <strong>{String(governance.driftState ?? 'none')}</strong>
            </div>
          </div>
          <div className={styles.stackList}>
            {pendingCheckpoints.map((item) => (
              <div key={String(item.id)} className={styles.record}>
                <strong>{String(item.label ?? item.id)}</strong>
                <span>pending checkpoint</span>
              </div>
            ))}
            {recentCheckpoints.map((item) => (
              <div key={String(item.id)} className={styles.record}>
                <strong>{String(item.label ?? item.id)}</strong>
                <span>{String(item.timestamp ?? 'recent')}</span>
              </div>
            ))}
            {softStaleNodes.map((item) => (
              <div key={String(item.nodeId)} className={styles.record}>
                <strong>{String(item.nodeId)}</strong>
                <span>{String(item.summary ?? 'soft stale')}</span>
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              disabled={props.isFrozen}
              onClick={props.onResolveDrift}
              type="button"
            >
              Resolve Drift
            </button>
            <button
              className={styles.secondaryButton}
              disabled={props.isFrozen}
              onClick={props.onApproveGate}
              type="button"
            >
              Approve Gate
            </button>
            <button
              className={styles.ghostButton}
              disabled={props.isFrozen}
              onClick={props.onBlockGate}
              type="button"
            >
              Block Gate
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Soul</p>
              <h3 className={styles.title}>Memory projections</h3>
            </div>
            <span className={styles.badge}>
              {props.soulPanel?.memories.length ?? 0} memories
            </span>
          </div>
          <div className={styles.stackList}>
            {(props.soulPanel?.graphPreview ?? []).map((node) => (
              <div key={node.id} className={styles.record}>
                <strong>{node.label}</strong>
                <span>{node.scope}</span>
              </div>
            ))}
            {(props.soulPanel?.proposals ?? []).map((proposal) => (
              <article key={proposal.id} className={styles.inlineCard}>
                <strong>{proposal.claim ?? proposal.title}</strong>
                <p className={styles.mutedText}>
                  {proposal.scope ?? 'project'} / {proposal.dimension ?? 'memory'}
                </p>
                {proposal.body ? <p className={styles.mutedText}>{proposal.body}</p> : null}
                <div className={styles.actions}>
                  <button
                    className={styles.primaryButton}
                    disabled={props.isFrozen}
                    onClick={() => props.onReviewProposal(proposal.id, 'accept')}
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    className={styles.secondaryButton}
                    disabled={props.isFrozen}
                    onClick={() => props.onReviewProposal(proposal.id, 'hint_only')}
                    type="button"
                  >
                    Hint Only
                  </button>
                  <button
                    className={styles.ghostButton}
                    disabled={props.isFrozen}
                    onClick={() => props.onReviewProposal(proposal.id, 'reject')}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
            {(props.soulPanel?.memories ?? []).map((memory) => {
              const isGlobal =
                memory.scope === 'global-core' || memory.scope === 'global-domain';
              return (
                <article key={memory.id} className={styles.inlineCard}>
                  <strong>{memory.claim ?? memory.title}</strong>
                  <p className={styles.mutedText}>
                    {memory.scope ?? 'project'} / {memory.dimension ?? 'memory'} /{' '}
                    {memory.retentionState ?? 'working'} /{' '}
                    {memory.manifestationState ?? 'entry'}
                  </p>
                  {memory.conflictSummary ? (
                    <p className={styles.mutedText}>{memory.conflictSummary}</p>
                  ) : null}
                  <div className={styles.actions}>
                    <button
                      className={styles.primaryButton}
                      disabled={props.isFrozen}
                      onClick={() => requestMemoryAction(memory.id, 'pin', isGlobal)}
                      type="button"
                    >
                      Pin
                    </button>
                    <button
                      className={styles.secondaryButton}
                      disabled={props.isFrozen}
                      onClick={() => requestMemoryAction(memory.id, 'edit', isGlobal)}
                      type="button"
                    >
                      {isGlobal ? 'Review Edit Scope' : 'Edit'}
                    </button>
                    <button
                      className={styles.ghostButton}
                      disabled={props.isFrozen}
                      onClick={() => requestMemoryAction(memory.id, 'supersede', isGlobal)}
                      type="button"
                    >
                      {isGlobal ? 'Review Supersede Scope' : 'Supersede'}
                    </button>
                  </div>
                </article>
              );
            })}
            {!props.soulPanel || props.soulPanel.entries.length === 0 ? (
              <p className={styles.mutedText}>
                Soul projection is idle until memory events arrive.
              </p>
            ) : null}
          </div>
        </section>

        {props.overlays.length > 0 ? (
          <section className={styles.card}>
            <p className={styles.eyebrow}>Overlay lifecycle</p>
            <h3 className={styles.title}>Tracked object actions</h3>
            <div className={styles.stackList}>
              {props.overlays.map((entry) => (
                <article key={entry.clientCommandId} className={styles.inlineCard}>
                  <div className={styles.record}>
                    <strong>{entry.action}</strong>
                    <span>{entry.status}</span>
                  </div>
                  {entry.errorMessage ? (
                    <p className={styles.mutedText}>{entry.errorMessage}</p>
                  ) : null}
                  {entry.status === 'desynced' ? (
                    <div className={styles.actions}>
                      <button
                        className={styles.secondaryButton}
                        onClick={() => props.onRetryOverlay(entry.clientCommandId)}
                        type="button"
                      >
                        Retry Sync
                      </button>
                      <button
                        className={styles.ghostButton}
                        onClick={() => props.onDismissOverlay(entry.clientCommandId)}
                        type="button"
                      >
                        Dismiss / Rollback
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {props.interruptedDraft ? (
          <section className={styles.card}>
            <p className={styles.eyebrow}>Lease interruption</p>
            <h3 className={styles.title}>Retained settings draft</h3>
            <p className={styles.mutedText}>
              Lease {props.interruptedDraft.leaseId ?? 'unknown'} interrupted dirty
              settings fields. The draft is retained locally.
            </p>
            <pre className={styles.preformatted}>
              {JSON.stringify(props.interruptedDraft.fields, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>

      {pendingGlobalMemoryAction ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <div aria-modal="true" className={styles.dialog} role="dialog">
            <p className={styles.eyebrow}>Global memory guard</p>
            <h3 className={styles.title}>
              {pendingGlobalMemoryAction.mode === 'edit'
                ? 'Choose how to edit this global memory'
                : 'Choose how to supersede this global memory'}
            </h3>
            <p className={styles.mutedText}>
              This memory is scoped globally. Apply the change globally only when you
              intend to affect every project; otherwise create a project override.
            </p>
            <div className={styles.actions}>
              <button
                className={styles.primaryButton}
                disabled={props.isFrozen}
                onClick={() => confirmMemoryAction(true)}
                type="button"
              >
                Project Override
              </button>
              <button
                className={styles.secondaryButton}
                disabled={props.isFrozen}
                onClick={() => confirmMemoryAction(false)}
                type="button"
              >
                Apply Globally
              </button>
              <button
                className={styles.ghostButton}
                onClick={() => setPendingGlobalMemoryAction(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
