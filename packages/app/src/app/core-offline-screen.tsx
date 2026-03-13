import type { CSSProperties } from 'react';
import { WorkbenchFlowerIcon } from '../components/icons';
import styles from '../components/empty/workbench-empty-state.module.css';

const START_CORE_COMMAND = 'pnpm dev:core';

const commandStyle: CSSProperties = {
  margin: 0,
  padding: '10px 14px',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  background: 'var(--surface-raised)',
  boxShadow: 'var(--shadow-hairline)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
};

export function CoreOfflineScreen() {
  return (
    <section className={styles.empty}>
      <div className={styles.iconWrap}>
        <WorkbenchFlowerIcon className={styles.icon} size={56} />
      </div>
      <h1 className={styles.title}>Core 未运行</h1>
      <p className={styles.description}>
        App 默认通过 HTTP 连接本地 Core daemon。请先启动 Core，再返回工作台；连接恢复后，界面会自动重试。
      </p>
      <pre aria-label="Start Core command" style={commandStyle}>
        <code>{START_CORE_COMMAND}</code>
      </pre>
    </section>
  );
}
