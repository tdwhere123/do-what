import type { ReactNode } from 'react';
import styles from './workbench-shell.module.css';

interface WorkbenchShellProps {
  readonly aside: ReactNode;
  readonly banner?: ReactNode;
  readonly main: ReactNode;
  readonly modal?: ReactNode;
  readonly sidebar: ReactNode;
}

export function WorkbenchShell(props: WorkbenchShellProps) {
  return (
    <section className={styles.shell}>
      {props.banner ? <div className={styles.banner}>{props.banner}</div> : null}

      <div className={styles.grid}>
        <aside className={styles.sidebar}>{props.sidebar}</aside>
        <div className={styles.main}>{props.main}</div>
        <aside className={styles.aside}>{props.aside}</aside>
      </div>

      {props.modal ? <div className={styles.modalLayer}>{props.modal}</div> : null}
    </section>
  );
}
