import type { AckOverlayEntry } from '../../stores/ack-overlay';
import type { HotApprovalSummary } from '../../stores/hot-state';
import styles from './approval-strip.module.css';

interface ApprovalStripProps {
  readonly approvals: readonly HotApprovalSummary[];
  readonly globalLocked: boolean;
  readonly onAllowOnce: (approvalId: string) => void;
  readonly onAllowSession: (approvalId: string) => void;
  readonly onDismissOverlay: (clientCommandId: string) => void;
  readonly onReject: (approvalId: string) => void;
  readonly onRetryOverlay: (clientCommandId: string) => void;
  readonly overlays: readonly AckOverlayEntry[];
}

export function ApprovalStrip(props: ApprovalStripProps) {
  const approvalOverlays = props.overlays.filter((entry) => entry.entityType === 'approval');
  if (!props.approvals.length && !approvalOverlays.length) {
    return null;
  }

  return (
    <section aria-label="Approval queue" className={styles.strip}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CLI approval queue</p>
          <h3 className={styles.title}>Review gated actions before continuing</h3>
        </div>
      </header>

      <div className={styles.cardList}>
        {props.approvals.map((approval) => (
          <article className={styles.card} key={approval.approvalId}>
            <div className={styles.cardCopy}>
              <strong>{approval.toolName}</strong>
              <p>{approval.summary ?? 'Approval required for a tool action.'}</p>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.actionPrimary}
                disabled={props.globalLocked}
                onClick={() => props.onAllowOnce(approval.approvalId)}
                type="button"
              >
                Allow once
              </button>
              <button
                className={styles.actionSecondary}
                disabled={props.globalLocked}
                onClick={() => props.onAllowSession(approval.approvalId)}
                type="button"
              >
                Allow in session
              </button>
              <button
                className={styles.actionGhost}
                disabled={props.globalLocked}
                onClick={() => props.onReject(approval.approvalId)}
                type="button"
              >
                Reject
              </button>
            </div>
          </article>
        ))}

        {approvalOverlays.map((overlay) => (
          <article className={styles.overlayCard} key={overlay.clientCommandId}>
            <div className={styles.cardCopy}>
              <strong>{overlay.action}</strong>
              <p>{overlay.errorMessage ?? `Overlay status: ${overlay.status}`}</p>
            </div>

            {overlay.status === 'desynced' ? (
              <div className={styles.actions}>
                <button
                  className={styles.actionSecondary}
                  onClick={() => props.onRetryOverlay(overlay.clientCommandId)}
                  type="button"
                >
                  Retry Sync
                </button>
                <button
                  className={styles.actionGhost}
                  onClick={() => props.onDismissOverlay(overlay.clientCommandId)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
