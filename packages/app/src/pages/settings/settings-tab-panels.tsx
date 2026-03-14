import { useState } from 'react';
import type {
  ModuleStatusSnapshot,
  WorkbenchModulesSnapshot,
} from '@do-what/protocol';
import { formatModuleState } from '../../lib/module-status';
import type { SettingsTabId } from '../../stores/ui';
import styles from './settings-page-content.module.css';

export interface SettingsFieldBinding {
  readonly field: {
    readonly fieldId: string;
    readonly description?: string;
    readonly kind: string;
    readonly locked?: boolean;
    readonly value?: unknown;
    readonly options?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  };
  readonly locked: boolean;
  readonly value: unknown;
}

interface SettingsTabPanelsProps {
  readonly activeTab: SettingsTabId;
  readonly fieldBindings: readonly SettingsFieldBinding[];
  readonly globalLocked: boolean;
  readonly isLoading: boolean;
  readonly isRefreshingModules: boolean;
  readonly loadError: string | null;
  readonly lockedFieldIds: readonly string[];
  readonly moduleRefreshError: string | null;
  readonly modules: WorkbenchModulesSnapshot;
  readonly onDismissOverlay: (clientCommandId: string) => void;
  readonly onFieldChange: (fieldId: string, value: unknown) => void;
  readonly onRefreshModules: () => void;
  readonly onResetDraft: () => void;
  readonly onRetryOverlay: (clientCommandId: string) => void;
  readonly onSave: () => void;
  readonly overlays: readonly import('../../stores/ack-overlay').AckOverlayEntry[];
  readonly primaryEngineModule: ModuleStatusSnapshot;
  readonly runtime: NonNullable<Window['doWhatRuntime']>;
  readonly saveDisabled: boolean;
  readonly snapshotLeaseStatus: string;
}

type ConnectionMode = 'system' | 'local' | 'api';

function ModeSelector(props: {
  readonly selected: ConnectionMode;
  readonly onSelect: (mode: ConnectionMode) => void;
  readonly options?: ReadonlyArray<{ value: ConnectionMode; label: string }>;
}) {
  const options = props.options ?? [
    { value: 'system' as const, label: '系统默认' },
    { value: 'local' as const, label: '本地登录' },
    { value: 'api' as const, label: '官方 API' },
  ];

  return (
    <div className={styles.modeSelector}>
      {options.map((option) => (
        <div
          key={option.value}
          className={`${styles.modeOption} ${props.selected === option.value ? styles.modeOptionSelected : ''}`}
          onClick={() => props.onSelect(option.value)}
        >
          <div className={styles.modeRadio} />
          <span className={styles.modeLabel}>{option.label}</span>
        </div>
      ))}
    </div>
  );
}

function ToggleSwitch(props: {
  readonly on: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      className={`${styles.toggle} ${props.on ? styles.toggleOn : ''}`}
      onClick={props.onToggle}
      type="button"
    />
  );
}

function SettingsRow(props: {
  readonly label: string;
  readonly sub?: string;
  readonly children?: React.ReactNode;
  readonly column?: boolean;
}) {
  return (
    <div className={`${styles.settingsRow} ${props.column ? styles.settingsRowColumn : ''}`}>
      <div className={styles.settingsRowLabel}>
        <span className={styles.labelMain}>{props.label}</span>
        {props.sub ? <span className={styles.labelSub}>{props.sub}</span> : null}
      </div>
      {props.children}
    </div>
  );
}

function getHealthLabel(module: ModuleStatusSnapshot): string {
  const state = formatModuleState(module);
  if (state === 'connected' || state === 'ready' || state === 'running') return '正常';
  if (state === 'idle') return '空闲';
  if (state === 'error' || state === 'failed') return '异常';
  return state;
}

function getHealthColor(module: ModuleStatusSnapshot): string {
  const state = formatModuleState(module);
  if (state === 'connected' || state === 'ready' || state === 'running') {
    return 'var(--status-success)';
  }
  if (state === 'error' || state === 'failed') {
    return 'var(--status-error)';
  }
  return 'var(--text-muted)';
}

// ── Engines Tab ──────────────────────────────────────

function EnginesTab(props: SettingsTabPanelsProps) {
  const [ccMode, setCcMode] = useState<ConnectionMode>('local');
  const [codexMode, setCodexMode] = useState<ConnectionMode>('system');
  const claude = props.modules.engines.claude;
  const codex = props.modules.engines.codex;

  return (
    <>
      {/* Claude Code */}
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>
          Claude Code
          <span className={styles.settingsCardBadge}>已连接</span>
        </div>

        <div className={`${styles.settingsRow} ${styles.settingsRowColumn}`}>
          <div className={styles.settingsRowLabel}>
            <span className={styles.labelMain}>连接模式</span>
            <span className={styles.labelSub}>选择 Claude Code 的认证方式</span>
          </div>
          <ModeSelector selected={ccMode} onSelect={setCcMode} />
        </div>

        <div className={`${styles.expandSection} ${ccMode === 'api' ? styles.expandSectionVisible : ''}`}>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>API Key</span>
              <span className={styles.labelSub}>存储于系统密钥链</span>
            </div>
            <span className={`${styles.rowValue} ${styles.rowValueMasked}`}>
              sk-ant-••••••••••••••••
            </span>
            <button className={styles.btnSmall} type="button">修改</button>
          </div>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>Base URL</span>
            </div>
            <span className={styles.rowValue}>https://api.anthropic.com</span>
          </div>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>模型</span>
              <span className={styles.labelSub}>新建 Run 时的默认模型</span>
            </div>
            <span className={styles.rowValue}>claude-sonnet-4-6</span>
          </div>
        </div>

        <div className={styles.settingsRow}>
          <div className={styles.settingsRowLabel}>
            <span className={styles.labelMain}>健康检查</span>
            <span className={styles.labelSub}>2 分钟前检测</span>
          </div>
          <span className={styles.rowValue} style={{ color: getHealthColor(claude) }}>
            ● {getHealthLabel(claude)}
          </span>
          <button
            className={styles.btnSmall}
            disabled={props.isRefreshingModules}
            onClick={props.onRefreshModules}
            type="button"
          >
            {props.isRefreshingModules ? '检测中...' : '重新检测'}
          </button>
        </div>
      </section>

      {/* Codex */}
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>
          Codex
          <span className={styles.settingsCardBadge}>已连接</span>
        </div>

        <div className={`${styles.settingsRow} ${styles.settingsRowColumn}`}>
          <div className={styles.settingsRowLabel}>
            <span className={styles.labelMain}>连接模式</span>
          </div>
          <ModeSelector selected={codexMode} onSelect={setCodexMode} />
        </div>

        <div className={`${styles.expandSection} ${codexMode === 'api' ? styles.expandSectionVisible : ''}`}>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>API Key</span>
            </div>
            <span className={`${styles.rowValue} ${styles.rowValueMasked}`}>
              sk-••••••••••••••••••••
            </span>
            <button className={styles.btnSmall} type="button">修改</button>
          </div>
        </div>

        <div className={styles.settingsRow}>
          <div className={styles.settingsRowLabel}>
            <span className={styles.labelMain}>健康检查</span>
          </div>
          <span className={styles.rowValue} style={{ color: getHealthColor(codex) }}>
            ● {getHealthLabel(codex)}
          </span>
          <button
            className={styles.btnSmall}
            disabled={props.isRefreshingModules}
            onClick={props.onRefreshModules}
            type="button"
          >
            {props.isRefreshingModules ? '检测中...' : '重新检测'}
          </button>
        </div>
      </section>

      {props.moduleRefreshError ? (
        <p className={styles.errorText}>{props.moduleRefreshError}</p>
      ) : null}
    </>
  );
}

// ── Soul Tab ─────────────────────────────────────────

function SoulTab(props: SettingsTabPanelsProps) {
  const [soulMode, setSoulMode] = useState<ConnectionMode>('system');
  const [autoCheckpoint, setAutoCheckpoint] = useState(true);
  const [writeMemoryRepo, setWriteMemoryRepo] = useState(true);
  const [budgetValue, setBudgetValue] = useState(1500);

  return (
    <>
      {/* 记忆计算 */}
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>记忆计算</div>

        <div className={`${styles.settingsRow} ${styles.settingsRowColumn}`}>
          <div className={styles.settingsRowLabel}>
            <span className={styles.labelMain}>计算提供方</span>
            <span className={styles.labelSub}>用于 cue 整合与晋升为 canon</span>
          </div>
          <ModeSelector
            selected={soulMode}
            onSelect={setSoulMode}
            options={[
              { value: 'system', label: '系统默认' },
              { value: 'local', label: '本地模型' },
              { value: 'api', label: '自定义 API' },
            ]}
          />
        </div>

        <div className={`${styles.expandSection} ${soulMode === 'api' ? styles.expandSectionVisible : ''}`}>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>Embedding URL</span>
            </div>
            <span className={styles.rowValue}>https://...</span>
            <button className={styles.btnSmall} type="button">编辑</button>
          </div>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>API Key</span>
            </div>
            <span className={`${styles.rowValue} ${styles.rowValueMasked}`}>••••••••</span>
            <button className={styles.btnSmall} type="button">修改</button>
          </div>
          <div className={styles.settingsRow}>
            <div className={styles.settingsRowLabel}>
              <span className={styles.labelMain}>模型</span>
            </div>
            <span className={styles.rowValue}>text-embedding-3-small</span>
          </div>
        </div>

        <div className={styles.settingsRow}>
          <div className={styles.settingsRowLabel}>
            <span className={styles.labelMain}>Token 预算</span>
            <span className={styles.labelSub}>每次整合的最大 token 数</span>
          </div>
          <div className={styles.budgetSliderWrap}>
            <input
              className={styles.budgetSlider}
              max={4000}
              min={500}
              onChange={(e) => setBudgetValue(Number(e.target.value))}
              type="range"
              value={budgetValue}
            />
            <span className={styles.budgetLabel}>{budgetValue}t</span>
          </div>
        </div>
      </section>

      {/* 检查点 */}
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>检查点</div>
        <SettingsRow label="自动 Checkpoint" sub="每个 Run 结束时写入检查点">
          <ToggleSwitch on={autoCheckpoint} onToggle={() => setAutoCheckpoint((v) => !v)} />
        </SettingsRow>
        <SettingsRow label="Canon 晋升阈值" sub="整合 cue 经过多少次 Run 后晋升为 canon">
          <span className={styles.rowValue}>5 次运行</span>
        </SettingsRow>
        <SettingsRow label="写入 memory_repo" sub="将 canon cue 持久化到 git（证据层）">
          <ToggleSwitch on={writeMemoryRepo} onToggle={() => setWriteMemoryRepo((v) => !v)} />
        </SettingsRow>
      </section>

      {/* 存储 + 危险操作 */}
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>存储</div>
        <SettingsRow label="soul.db 路径">
          <span className={styles.rowValue}>~/.do-what/state/soul.db</span>
        </SettingsRow>
        <SettingsRow label="memory_repo 根目录">
          <span className={styles.rowValue}>~/.do-what/memory/</span>
        </SettingsRow>

        <div className={styles.dangerZone}>
          <div className={styles.dangerZoneLabel}>危险操作</div>
          <div className={styles.dangerZoneRow}>
            <div className={styles.dangerZoneDesc}>
              <span className={styles.labelMain}>清除 Working cue</span>
              <span className={styles.labelSub}>删除所有未整合的工作级记忆</span>
            </div>
            <button className={`${styles.btnSmall} ${styles.btnSmallDanger}`} type="button">
              清除
            </button>
          </div>
          <div className={styles.dangerZoneRow}>
            <div className={styles.dangerZoneDesc}>
              <span className={styles.labelMain}>重置 Soul 数据库</span>
              <span className={styles.labelSub}>清空 soul.db 全部内容（不可恢复）</span>
            </div>
            <button className={`${styles.btnSmall} ${styles.btnSmallDanger}`} type="button">
              重置
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

// ── Policies Tab ─────────────────────────────────────

const POLICY_RULES: ReadonlyArray<{
  tool: string;
  badge: 'allow' | 'require' | 'block';
  label: string;
}> = [
  { tool: 'tools.file_read', badge: 'allow', label: '自动允许' },
  { tool: 'tools.file_write', badge: 'require', label: '需要审批' },
  { tool: 'tools.shell_exec', badge: 'require', label: '需要审批' },
  { tool: 'tools.shell_exec — pnpm run test', badge: 'allow', label: '自动允许' },
  { tool: 'tools.shell_exec — pnpm run build', badge: 'allow', label: '自动允许' },
  { tool: 'tools.network_fetch', badge: 'require', label: '需要审批' },
  { tool: 'tools.git_commit', badge: 'require', label: '需要审批' },
  { tool: 'tools.docker_run', badge: 'block', label: '阻止' },
];

const BADGE_CLASS_MAP = {
  allow: styles.policyBadgeAllow,
  require: styles.policyBadgeRequire,
  block: styles.policyBadgeBlock,
} as const;

function PoliciesTab(_props: SettingsTabPanelsProps) {
  return (
    <>
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>工具审批规则</div>
        <div className={styles.policyDescription}>
          所有工具调用都通过 Policy Engine 仲裁。规则会覆盖默认的"需要审批"行为。
        </div>

        {POLICY_RULES.map((rule) => (
          <div className={styles.policyRow} key={rule.tool}>
            <span className={styles.policyTool}>{rule.tool}</span>
            <span className={`${styles.policyBadge} ${BADGE_CLASS_MAP[rule.badge]}`}>
              {rule.label}
            </span>
          </div>
        ))}

        <div className={styles.footerActions}>
          <button className={styles.secondaryButton} type="button">
            + 添加规则
          </button>
        </div>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>自动审批模式</div>
        <div className={styles.policyDescription}>
          匹配以下 glob 模式的 Shell 命令将自动通过，无需提示。
        </div>
        <div className={styles.autoApprovePatterns}>
          <div>pnpm run *</div>
          <div>npm run *</div>
          <div>tsc --noEmit</div>
          <div>vitest run *</div>
        </div>
        <div className={styles.footerActions}>
          <button className={styles.secondaryButton} type="button">
            编辑模式
          </button>
        </div>
      </section>
    </>
  );
}

// ── Environment Tab ──────────────────────────────────

const TOOLCHAIN_ITEMS: ReadonlyArray<{
  name: string;
  version: string;
  status: 'ok' | 'warn' | 'err';
}> = [
  { name: 'git', version: '2.44.0', status: 'ok' },
  { name: 'node', version: 'v22.13.1', status: 'ok' },
  { name: 'pnpm', version: '10.6.5', status: 'ok' },
  { name: 'ripgrep (rg)', version: '14.1.1', status: 'ok' },
  { name: 'bun', version: '1.2.4', status: 'ok' },
  { name: 'docker', version: 'daemon 未运行', status: 'warn' },
];

const HEALTH_DOT_CLASS_MAP = {
  ok: styles.healthDotOk,
  warn: styles.healthDotWarn,
  err: styles.healthDotErr,
} as const;

function EnvironmentTab(_props: SettingsTabPanelsProps) {
  const [autoCleanWorktree, setAutoCleanWorktree] = useState(true);

  return (
    <>
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>工具链健康</div>
        {TOOLCHAIN_ITEMS.map((item) => (
          <div className={styles.toolsHealthRow} key={item.name}>
            <span className={`${styles.healthDot} ${HEALTH_DOT_CLASS_MAP[item.status]}`} />
            <span className={styles.healthName}>{item.name}</span>
            <span
              className={styles.healthVer}
              style={item.status === 'warn' ? { color: 'var(--status-waiting)' } : undefined}
            >
              {item.version}
            </span>
          </div>
        ))}
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>Worktree</div>
        <SettingsRow label="Worktree 根目录" sub="临时 worktree 的创建位置">
          <span className={styles.rowValue}>~/.do-what/worktrees/</span>
        </SettingsRow>
        <SettingsRow label="活跃 worktree 数">
          <span className={styles.rowValue}>2</span>
          <button className={styles.btnSmall} type="button">查看</button>
        </SettingsRow>
        <SettingsRow label="自动清理过期 worktree" sub="删除已完成 Run 的 worktree">
          <ToggleSwitch on={autoCleanWorktree} onToggle={() => setAutoCleanWorktree((v) => !v)} />
        </SettingsRow>
      </section>
    </>
  );
}

// ── Appearance Tab ───────────────────────────────────

function AppearanceTab(_props: SettingsTabPanelsProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [soulRailMotion, setSoulRailMotion] = useState(true);

  return (
    <>
      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>颜色主题</div>
        <div className={styles.themeSwatchGrid}>
          <div className={styles.themeSwatchItem}>
            <div className={`${styles.themeSwatch} ${styles.themeSwatchActive}`}>
              <div className={styles.themeSwatchInner}>
                <div className={styles.swatchSidebar} />
                <div className={styles.swatchMain} />
              </div>
            </div>
            <div className={styles.themeSwatchLabel}>浅色（暖调）</div>
          </div>
          <div className={styles.themeSwatchItem}>
            <div className={`${styles.themeSwatch} ${styles.themeSwatchDark}`} title="暗色模式 — 即将推出">
              <div className={styles.themeSwatchInner}>
                <div className={styles.swatchSidebar} />
                <div className={styles.swatchMain} />
              </div>
              <div className={styles.disabledOverlay} />
            </div>
            <div className={styles.themeSwatchLabel} style={{ color: 'var(--text-disabled)' }}>
              暗色（即将）
            </div>
          </div>
        </div>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>动画与过渡</div>
        <SettingsRow label="减少动画" sub="禁用过渡效果和装饰动画">
          <ToggleSwitch on={reduceMotion} onToggle={() => setReduceMotion((v) => !v)} />
        </SettingsRow>
        <SettingsRow label="Soul rail 动效" sub="canon cue 的脉冲/光晕效果">
          <ToggleSwitch on={soulRailMotion} onToggle={() => setSoulRailMotion((v) => !v)} />
        </SettingsRow>
      </section>

      <section className={styles.settingsCard}>
        <div className={styles.settingsCardTitle}>字体排版</div>
        <SettingsRow label="UI 字号" sub="界面文字的基础大小">
          <span className={styles.rowValue}>13px</span>
        </SettingsRow>
        <SettingsRow label="代码字体" sub="代码块与路径的字体">
          <span className={styles.rowValue}>JetBrains Mono</span>
        </SettingsRow>
      </section>
    </>
  );
}

// ── Main Export ──────────────────────────────────────

export function SettingsTabPanels(props: SettingsTabPanelsProps) {
  if (props.isLoading) {
    return <p className={styles.rowSubtext}>加载设置中...</p>;
  }

  if (props.loadError) {
    return <p className={styles.errorText}>{props.loadError}</p>;
  }

  switch (props.activeTab) {
    case 'engines':
      return <EnginesTab {...props} />;
    case 'soul':
      return <SoulTab {...props} />;
    case 'policies':
      return <PoliciesTab {...props} />;
    case 'environment':
      return <EnvironmentTab {...props} />;
    case 'appearance':
      return <AppearanceTab {...props} />;
    default:
      return null;
  }
}
