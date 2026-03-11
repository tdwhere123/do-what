import type { TimelineEntry } from '@do-what/protocol';
import type { PendingCommandEntry } from '../../stores/pending-command';
import type { TimelineMarker, TimelineThread } from '../../stores/projection';
import styles from './timeline-pane.module.css';

interface TimelinePaneProps {
  readonly composerDraft: string;
  readonly globalLocked: boolean;
  readonly hasMoreBefore: boolean;
  readonly isLoading: boolean;
  readonly markers: readonly TimelineMarker[];
  readonly onComposerChange: (draft: string) => void;
  readonly onDismissOptimistic: (clientCommandId: string) => void;
  readonly onLoadOlder: () => void;
  readonly onRetryOptimistic: (clientCommandId: string) => void;
  readonly onSendMessage: () => void;
  readonly onSetViewMode: (viewMode: 'merged' | 'threaded') => void;
  readonly optimisticMessages: readonly PendingCommandEntry[];
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

  return new Date(parsed).toLocaleTimeString();
}

function renderEntry(entry: TimelineEntry) {
  return (
    <article className={styles.entry} key={entry.id}>
      <div className={styles.entryMeta}>
        <strong>{entry.title ?? entry.kind}</strong>
        <span>{formatTimestamp(entry.timestamp)}</span>
      </div>
      {entry.body ? <p className={styles.entryBody}>{entry.body}</p> : null}
      {entry.status ? <span className={styles.entryStatus}>{entry.status}</span> : null}
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

  return (
    <section className={styles.timeline}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Timeline</p>
          <h2 className={styles.title}>
            {props.selectedRunId ? `Run ${props.selectedRunId}` : 'Select a run'}
          </h2>
        </div>

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
      </header>

      <div className={styles.body}>
        {props.hasMoreBefore ? (
          <button className={styles.loadOlder} onClick={props.onLoadOlder} type="button">
            Load older entries
          </button>
        ) : null}

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

        <div className={styles.entryList}>
          {props.viewMode === 'merged'
            ? props.projectionEntries.map((entry) => renderEntry(entry))
            : props.threads.map((thread) => (
                <section className={styles.thread} key={thread.laneId}>
                  <div className={styles.threadHeader}>{thread.laneLabel}</div>
                  {thread.entries.map((entry) => renderEntry(entry))}
                </section>
              ))}

          {!props.projectionEntries.length ? (
            <div className={styles.emptyState}>
              <strong>Timeline is idle</strong>
              <p>The selected run has not produced timeline entries yet.</p>
            </div>
          ) : null}
        </div>

        {optimisticEntries.length ? (
          <div className={styles.optimisticTail}>
            <div className={styles.optimisticHeader}>Optimistic tail</div>
            {optimisticEntries.map((entry) => (
              <article className={`${styles.entry} ${styles.entryOptimistic}`} key={entry.clientCommandId}>
                <div className={styles.entryMeta}>
                  <strong>You</strong>
                  <span>{formatTimestamp(entry.createdAt)}</span>
                </div>
                <p className={styles.entryBody}>
                  {typeof entry.optimisticPayload?.body === 'string'
                    ? entry.optimisticPayload.body
                    : typeof entry.optimisticPayload?.text === 'string'
                      ? entry.optimisticPayload.text
                      : entry.errorMessage ?? 'Pending local message'}
                </p>
                <span className={styles.entryStatus}>{entry.status}</span>
                <div className={styles.optimisticActions}>
                  {entry.status === 'desynced' ? (
                    <button className={styles.retryButton} onClick={() => props.onRetryOptimistic(entry.clientCommandId)} type="button">
                      Retry Sync
                    </button>
                  ) : null}
                  <button className={styles.dismissButton} onClick={() => props.onDismissOptimistic(entry.clientCommandId)} type="button">
                    Dismiss / Rollback
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <footer className={styles.composer}>
        <textarea
          className={styles.composerInput}
          disabled={!props.selectedRunId}
          onChange={(event) => props.onComposerChange(event.target.value)}
          placeholder="Send a message to the active run"
          rows={4}
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
      </footer>
    </section>
  );
}


