import styles from '../app-shell.module.css';
import { EMPTY_ASSET_URLS } from '../../assets';
import { SettingsSunIcon, SoulWorkingIcon } from '../../components/icons';

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
        <div className={styles.heroMeta}>
          <span className={styles.badge}>Hash route</span>
          <span className={styles.heroMetric}>
            <SoulWorkingIcon size={16} />
            lease-aware shell
          </span>
        </div>
        <div className={styles.heroLayout}>
          <div className={styles.heroCopy}>
            <h2 className={styles.heroTitle}>Settings</h2>
            <p className={styles.heroBody}>
              Settings 先以 <code>HashRouter</code> 正式页面落位，后续 T028/T029 会在这个壳层上接入
              Query-first 读取、readonly/disabled 锁定态和 interrupted draft 保护。
            </p>
            <div className={styles.heroActions}>
              <span className={styles.heroChip}>
                <SettingsSunIcon size={18} />
                query-first settings
              </span>
            </div>
          </div>

          <div className={styles.heroArtwork}>
            <img alt="Settings empty state illustration" src={EMPTY_ASSET_URLS.settings} />
          </div>
        </div>
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
