import { DECORATIVE_ASSET_URLS, EMPTY_ASSET_URLS } from '../../assets';
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
      <div className={styles.art}>
        <img alt="Workbench empty state" src={EMPTY_ASSET_URLS.workbench} />
        <img aria-hidden="true" className={styles.texture} src={DECORATIVE_ASSET_URLS.waveLine} />
      </div>

      <div className={styles.copy}>
        <p className={styles.eyebrow}>Idle workbench</p>
        <h2 className={styles.title}>{props.title}</h2>
        <p className={styles.description}>{props.description}</p>
      </div>

      <button
        className={styles.cta}
        disabled={props.isFrozen}
        onClick={props.onCreateRun}
        type="button"
      >
        <WorkbenchFlowerIcon size={18} />
        Create a run
      </button>
    </section>
  );
}
