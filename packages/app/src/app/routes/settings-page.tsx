import styles from '../app-shell.module.css';

const FALLBACK_RUNTIME = {
  platform: 'unknown',
  versions: {
    chrome: 'unknown',
    electron: 'unknown',
    node: 'unknown',
  },
} satisfies Window['doWhatRuntime'];

export function SettingsPage() {
  const runtime = window.doWhatRuntime ?? FALLBACK_RUNTIME;

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Hash route</p>
        <h2 className={styles.heroTitle}>Settings</h2>
        <p className={styles.heroBody}>
          Settings 先以 `HashRouter` 正式页面落位，后续 T028/T029 会在这个壳层上接入
          Query-first 读取、readonly/disabled 锁定态和 interrupted draft 保护。
        </p>
      </div>

      <div className={styles.panelGrid}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Runtime bridge</h3>
          <p className={styles.panelText}>
            Electron {runtime.versions.electron} / Chrome {runtime.versions.chrome} / Node {runtime.versions.node}
          </p>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Scaffold guarantees</h3>
          <p className={styles.panelText}>
            全局 token、CSS Modules、Query client 和 Zustand 接入点都已在这个页面骨架之下稳定挂载。
          </p>
        </section>
      </div>
    </section>
  );
}
