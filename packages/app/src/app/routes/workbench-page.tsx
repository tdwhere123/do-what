import styles from '../app-shell.module.css';
import { DECORATIVE_ASSET_URLS, EMPTY_ASSET_URLS } from '../../assets';
import { EngineSmileIcon, SoulCanonIcon, WorkbenchFlowerIcon } from '../../components/icons';

const workbenchTasks = [
  'T013-T017: shell、sidebar、empty states、create run',
  'T018-T027: timeline、approval、inspector、governance、soul',
  'T028-T029: settings route 与 lease interruption',
];

export function WorkbenchPage() {
  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroMeta}>
          <span className={styles.badge}>Route shell</span>
          <span className={styles.heroMetric}>
            <EngineSmileIcon size={16} />
            foundation-ready
          </span>
        </div>
        <div className={styles.heroLayout}>
          <div className={styles.heroCopy}>
            <h2 className={styles.heroTitle}>Workbench</h2>
            <p className={styles.heroBody}>
              这里先只建立 React 入口、HashRouter 页面骨架、Query/Zustand 挂载点和全局样式基线。
              真正的 workbench data flow 会从 T013 开始逐步接入。
            </p>
            <div className={styles.heroActions}>
              <span className={styles.heroChip}>
                <WorkbenchFlowerIcon size={18} />
                workbench shell
              </span>
              <span className={styles.heroChip}>
                <SoulCanonIcon size={18} />
                soul-aware tokens
              </span>
            </div>
          </div>

          <div className={styles.heroArtwork}>
            <img alt="Workbench empty state illustration" src={EMPTY_ASSET_URLS.workbench} />
            <img
              aria-hidden="true"
              className={styles.heroTexture}
              src={DECORATIVE_ASSET_URLS.dotGrain}
            />
          </div>
        </div>
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

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Adopted assets</h3>
          <p className={styles.panelText}>
            设计 token、装饰纹理和空状态插图现在都来自 <code>packages/app</code> 的正式运行时目录。
          </p>
        </section>
      </div>
    </section>
  );
}
