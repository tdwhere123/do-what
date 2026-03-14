import lineDrawing from '../../assets/decorative/line-drawing.svg';
import lineSDrawing from '../../assets/decorative/line-s-drawing.svg';
import waveCurly from '../../assets/decorative/wave-curly.svg';
import styles from './workbench-empty-state.module.css';

interface WorkspaceFirstEmptyStateProps {
  readonly description: string;
  readonly error: string | null;
  readonly isBusy: boolean;
  readonly isFrozen: boolean;
  readonly onOpenWorkspace: () => void;
  readonly title: string;
}

interface WorkbenchEmptyStateProps {
  readonly description: string;
  readonly isFrozen: boolean;
  readonly onCreateRun: () => void;
  readonly title: string;
}

export function WorkspaceFirstEmptyState(props: WorkspaceFirstEmptyStateProps) {
  return (
    <section className={styles.empty}>
      <img alt="" aria-hidden="true" className={styles.decoTL} src={lineDrawing} />
      <img alt="" aria-hidden="true" className={styles.decoBR} src={lineSDrawing} />
      <img alt="" src={waveCurly} style={{ width: 56, height: 56 }} />
      <h2 className={styles.title}>{props.title}</h2>
      <p className={styles.description}>{props.description}</p>
      {props.error ? <p className={styles.error}>{props.error}</p> : null}
      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          disabled={props.isFrozen || props.isBusy}
          onClick={props.onOpenWorkspace}
          type="button"
        >
          {props.isBusy ? '打开中...' : '打开工作区'}
        </button>
        <button className={styles.ghostButton} disabled type="button">
          浏览历史
        </button>
      </div>
    </section>
  );
}

export function WorkbenchEmptyState(props: WorkbenchEmptyStateProps) {
  return (
    <WorkspaceFirstEmptyState
      description={props.description}
      error={null}
      isBusy={false}
      isFrozen={props.isFrozen}
      onOpenWorkspace={props.onCreateRun}
      title={props.title}
    />
  );
}
