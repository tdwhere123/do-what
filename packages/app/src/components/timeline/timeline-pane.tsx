import type { TimelineEntry } from '@do-what/protocol';
import type { AckOverlayEntry } from '../../stores/ack-overlay';
import type { HotApprovalSummary } from '../../stores/hot-state';
import type { PendingCommandEntry } from '../../stores/pending-command';
import type { TimelineMarker, TimelineThread } from '../../stores/projection';
import {
  EngineSmileIcon,
  SoulCanonIcon,
  SoulConsolidatedIcon,
  SoulWorkingIcon,
  UserFaceIcon,
} from '../icons';
import styles from './timeline-pane.module.css';

interface TimelinePaneProps {
  readonly approvals: readonly HotApprovalSummary[];
  readonly composerDraft: string;
  readonly globalLocked: boolean;
  readonly hasMoreBefore: boolean;
  readonly isLoading: boolean;
  readonly markers: readonly TimelineMarker[];
  readonly onAllowOnce: (approvalId: string) => void;
  readonly onAllowSession: (approvalId: string) => void;
  readonly onComposerChange: (draft: string) => void;
  readonly onDismissOptimistic: (clientCommandId: string) => void;
  readonly onDismissOverlay: (clientCommandId: string) => void;
  readonly onLoadOlder: () => void;
  readonly onReject: (approvalId: string) => void;
  readonly onRetryOptimistic: (clientCommandId: string) => void;
  readonly onRetryOverlay: (clientCommandId: string) => void;
  readonly onSendMessage: () => void;
  readonly onSetViewMode: (viewMode: 'merged' | 'threaded') => void;
  readonly optimisticMessages: readonly PendingCommandEntry[];
  readonly overlayEntries: readonly AckOverlayEntry[];
  readonly projectionEntries: readonly TimelineEntry[];
  readonly selectedRunId: string | null;
  readonly threads: readonly TimelineThread[];
  readonly viewMode: 'merged' | 'threaded';
}

function formatTimestamp(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }

  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMetaRecord(entry: TimelineEntry): Record<string, unknown> {
  return typeof entry.meta === 'object' && entry.meta !== null
    ? (entry.meta as Record<string, unknown>)
    : {};
}

function renderSoulIcon(entry: TimelineEntry) {
  const meta = getMetaRecord(entry);
  const state = meta.retentionState;
  if (state === 'canon') {
    return <SoulCanonIcon size={12} />;
  }

  if (state === 'consolidated') {
    return <SoulConsolidatedIcon size={12} />;
  }

  return <SoulWorkingIcon size={12} />;
}

function renderEntry(entry: TimelineEntry) {
  const meta = getMetaRecord(entry);
  const laneLabel =
    typeof meta.laneLabel === 'string' ? meta.laneLabel : typeof entry.title === 'string' ? entry.title : entry.kind;

  if (entry.kind === 'message') {
    const speaker = meta.speaker === 'user' ? 'user' : 'engine';
    return (
      <article className={styles.messageBlock} key={entry.id}>
        <div className={styles.messageHeader}>
          <span className={styles.messageAvatar}>
            {speaker === 'user' ? <UserFaceIcon size={24} /> : <EngineSmileIcon size={24} />}
          </span>
          <span className={styles.messageAuthor}>{laneLabel}</span>
          {typeof meta.engine === 'string' ? (
            <span className={styles.engineTag}>{String(meta.engine)}</span>
          ) : null}
          <span className={styles.messageTime}>{formatTimestamp(entry.timestamp)}</span>
        </div>
        <div className={styles.messageBody}>{entry.body}</div>
      </article>
    );
  }

  if (entry.kind === 'memory') {
    return (
      <article className={styles.messageBlock} key={entry.id}>
        <div className={styles.flowSoul}>{renderSoulIcon(entry)}</div>
        <div className={styles.messageHeader}>
          <span className={styles.messageAvatar}>
            <SoulWorkingIcon size={24} />
          </span>
          <span className={styles.messageAuthor}>{entry.title ?? 'Soul cue'}</span>
          <span className={styles.messageTime}>{formatTimestamp(entry.timestamp)}</span>
        </div>
        <div className={styles.messageBody}>{entry.body}</div>
      </article>
    );
  }

  return (
    <article
      className={
        entry.kind === 'plan' ? styles.resultCard : styles.toolCard
      }
      key={entry.id}
    >
      <div className={styles.cardHeader}>
        <strong className={styles.cardTitle}>{entry.title ?? entry.kind}</strong>
        {entry.status ? <span className={styles.cardStatus}>{entry.status}</span> : null}
      </div>
      {entry.body ? <div className={styles.cardBody}>{entry.body}</div> : null}
    </article>
  );
}

function sortOptimistic(entries: readonly PendingCommandEntry[]): PendingCommandEntry[] {
  return [...entries].sort((left, right) => {
    const leftSequence = left.localSequence ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = right.localSequence ?? Number.MAX_SAFE_INTEGER;
    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function TimelinePane(props: TimelinePaneProps) {
  const optimisticEntries = sortOptimistic(props.optimisticMessages);
  const approvalOverlays = props.overlayEntries.filter((entry) => entry.entityType === 'approval');

  return (
    <section className={styles.timeline}>
      <div className={styles.feed}>
        <div className={styles.feedToolbar}>
          <div className={styles.modeSwitch}>
            <button
              className={
                props.viewMode === 'merged'
                  ? `${styles.modeButton} ${styles.modeButtonActive}`
                  : styles.modeButton
              }
              onClick={() => props.onSetViewMode('merged')}
              type="button"
            >
              Merged
            </button>
            <button
              className={
                props.viewMode === 'threaded'
                  ? `${styles.modeButton} ${styles.modeButtonActive}`
                  : styles.modeButton
              }
              onClick={() => props.onSetViewMode('threaded')}
              type="button"
            >
              Threaded
            </button>
          </div>
          {props.hasMoreBefore ? (
            <button className={styles.loadOlder} onClick={props.onLoadOlder} type="button">
              Load older entries
            </button>
          ) : null}
        </div>

        {props.markers.length > 0 ? (
          <div className={styles.markerRow}>
            {props.markers.map((marker) => (
              <span key={`${marker.entryId}-${marker.kind}`} className={styles.markerBadge}>
                {marker.kind}
              </span>
            ))}
          </div>
        ) : null}

        {props.isLoading ? <p className={styles.loading}>Refreshing timeline...</p> : null}

        {props.viewMode === 'merged'
          ? props.projectionEntries.map((entry) => renderEntry(entry))
          : props.threads.flatMap((thread) => thread.entries.map((entry) => renderEntry(entry)))}

        {props.projectionEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>Timeline is idle</strong>
            <p>The selected run has not produced timeline entries yet.</p>
          </div>
        ) : null}

        {optimisticEntries.map((entry) => (
          <article className={styles.messageBlock} key={entry.clientCommandId}>
            <div className={styles.messageHeader}>
              <span className={styles.messageAvatar}>
                <UserFaceIcon size={24} />
              </span>
              <span className={styles.messageAuthor}>You</span>
              <span className={styles.messageTime}>{formatTimestamp(entry.createdAt)}</span>
            </div>
            <div className={styles.messageBody}>
              {typeof entry.optimisticPayload?.body === 'string'
                ? entry.optimisticPayload.body
                : typeof entry.optimisticPayload?.text === 'string'
                  ? entry.optimisticPayload.text
                  : entry.errorMessage ?? 'Pending local message'}
            </div>
            <div className={styles.optimisticActions}>
              <span className={styles.cardStatus}>{entry.status}</span>
              {entry.status === 'desynced' ? (
                <button
                  className={styles.linkButton}
                  onClick={() => props.onRetryOptimistic(entry.clientCommandId)}
                  type="button"
                >
                  Retry Sync
                </button>
              ) : null}
              <button
                className={styles.linkButton}
                onClick={() => props.onDismissOptimistic(entry.clientCommandId)}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </article>
        ))}
      </div>

      <footer className={styles.inputArea}>
        {(props.approvals.length > 0 || approvalOverlays.length > 0) && props.selectedRunId ? (
          <div className={styles.approvalOverlay}>
            <div className={styles.approvalHeader}>Approval required before continuing</div>
            <div className={styles.approvalOptions}>
              {props.approvals.map((approval) => (
                <div className={styles.approvalGroup} key={approval.approvalId}>
                  <div className={styles.approvalSummary}>
                    {approval.toolName}: {approval.summary}
                  </div>
                  <button
                    className={`${styles.approvalOption} ${styles.approvalOptionActive}`}
                    disabled={props.globalLocked}
                    onClick={() => props.onAllowOnce(approval.approvalId)}
                    type="button"
                  >
                    <span className={styles.approvalCursor}>&gt;</span>
                    Allow once
                  </button>
                  <button
                    className={styles.approvalOption}
                    disabled={props.globalLocked}
                    onClick={() => props.onAllowSession(approval.approvalId)}
                    type="button"
                  >
                    Allow in session
                  </button>
                  <button
                    className={styles.approvalOption}
                    disabled={props.globalLocked}
                    onClick={() => props.onReject(approval.approvalId)}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              ))}
              {approvalOverlays.map((overlay) => (
                <div className={styles.approvalGroup} key={overlay.clientCommandId}>
                  <div className={styles.approvalSummary}>
                    {overlay.action}: {overlay.errorMessage ?? overlay.status}
                  </div>
                  {overlay.status === 'desynced' ? (
                    <>
                      <button
                        className={`${styles.approvalOption} ${styles.approvalOptionActive}`}
                        onClick={() => props.onRetryOverlay(overlay.clientCommandId)}
                        type="button"
                      >
                        <span className={styles.approvalCursor}>&gt;</span>
                        Retry Sync
                      </button>
                      <button
                        className={styles.approvalOption}
                        onClick={() => props.onDismissOverlay(overlay.clientCommandId)}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.inputBox}>
          <textarea
            disabled={!props.selectedRunId}
            onChange={(event) => props.onComposerChange(event.target.value)}
            placeholder="Continue the active run..."
            rows={1}
            value={props.composerDraft}
          />
          <button
            className={styles.sendButton}
            disabled={
              props.globalLocked || !props.selectedRunId || props.composerDraft.trim().length === 0
            }
            onClick={props.onSendMessage}
            type="button"
          >
            Send
          </button>
        </div>
      </footer>
    </section>
  );
}
