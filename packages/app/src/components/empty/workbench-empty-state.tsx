import { WorkbenchFlowerIcon } from '../icons';
import styles from './workbench-empty-state.module.css';

interface WorkbenchEmptyStateProps {
  readonly description: string;
  readonly isFrozen: boolean;
  readonly onCreateRun: () => void;
  readonly title: string;
}

export function WorkbenchEmptyState(props: WorkbenchEmptyStateProps) {
  return (
    <section className={styles.empty}>
      <div className={styles.iconWrap}>
        <WorkbenchFlowerIcon className={styles.icon} size={56} />
      </div>
      <h2 className={styles.title}>{props.title}</h2>
      <p className={styles.description}>{props.description}</p>
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={props.isFrozen}
          onClick={props.onCreateRun}
          type="button"
        >
          Create Run
        </button>
        <button className={styles.ghostButton} disabled type="button">
          Browse History
        </button>
      </div>
    </section>
  );
}
