import styles from '../app-shell.module.css';

const workbenchTasks = [
  'T013-T017: shell、sidebar、empty states、create run',
  'T018-T027: timeline、approval、inspector、governance、soul',
  'T028-T029: settings route 与 lease interruption',
];

export function WorkbenchPage(): JSX.Element {
  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Route shell</p>
        <h2 className={styles.heroTitle}>Workbench</h2>
        <p className={styles.heroBody}>
          这里先只建立 React 入口、HashRouter 页面骨架、Query/Zustand 挂载点和全局样式基线。
          真正的 workbench data flow 会从 T013 开始逐步接入。
        </p>
      </div>

      <div className={styles.panelGrid}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Next tasks on this route</h3>
          <ul className={styles.list}>
            {workbenchTasks.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>T001B acceptance anchors</h3>
          <p className={styles.panelText}>
            Electron main / preload / renderer 已分层，Workbench 与 Settings 已变成正式路由，而不是本地状态切换。
          </p>
        </section>
      </div>
    </section>
  );
}
