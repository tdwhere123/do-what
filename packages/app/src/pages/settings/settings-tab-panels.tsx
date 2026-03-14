import type {
  ModuleStatusSnapshot,
  SettingsSnapshot,
  WorkbenchModulesSnapshot,
} from '@do-what/protocol';
import { formatModuleState, getModuleTone } from '../../lib/module-status';
import type { AckOverlayEntry } from '../../stores/ack-overlay';
import type { SettingsTabId } from '../../stores/ui';
import styles from './settings-page-content.module.css';

type SettingsField = SettingsSnapshot['sections'][number]['fields'][number];

export interface SettingsFieldBinding {
  readonly field: SettingsField;
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
  readonly overlays: readonly AckOverlayEntry[];
  readonly primaryEngineModule: ModuleStatusSnapshot;
  readonly runtime: NonNullable<Window['doWhatRuntime']>;
  readonly saveDisabled: boolean;
  readonly snapshotLeaseStatus: SettingsSnapshot['lease']['status'] | 'none';
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
}

function buildFieldMap(
  bindings: readonly SettingsFieldBinding[],
): Map<string, SettingsFieldBinding> {
  return new Map(bindings.map((binding) => [binding.field.fieldId, binding]));
}

function FieldEditorRow(props: {
  readonly binding: SettingsFieldBinding | undefined;
  readonly onChange: (fieldId: string, value: unknown) => void;
}) {
  if (!props.binding) {
    return null;
  }

  const { field, locked, value } = props.binding;
  const description = [field.fieldId, field.description, locked ? 'locked' : null]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');

  return (
    <div className={styles.settingsRow}>
      <div className={styles.settingsRowLabel}>
        <span className={styles.labelMain}>{String(field.label)}</span>
        <span className={styles.labelSub}>{description}</span>
      </div>

      {field.kind === 'textarea' ? (
        <textarea
          className={styles.textarea}
          disabled={locked}
          onChange={(event) => props.onChange(field.fieldId, event.currentTarget.value)}
          rows={4}
          value={readString(value)}
        />
      ) : field.kind === 'toggle' ? (
        <label className={styles.toggleWrap}>
          <input
            checked={Boolean(value)}
            disabled={locked}
            onChange={(event) => props.onChange(field.fieldId, event.currentTarget.checked)}
            type="checkbox"
          />
          <span className={Boolean(value) ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle} />
        </label>
      ) : field.kind === 'select' ? (
        <select
          className={styles.select}
          disabled={locked}
          onChange={(event) => props.onChange(field.fieldId, event.currentTarget.value)}
          value={readString(value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={styles.input}
          disabled={locked}
          onChange={(event) =>
            props.onChange(
              field.fieldId,
              field.kind === 'number'
                ? Number(event.currentTarget.value)
                : event.currentTarget.value,
            )
          }
          type={field.kind === 'number' ? 'number' : 'text'}
          value={readString(value)}
        />
      )}
    </div>
  );
}

function StaticValueRow(props: {
  readonly description?: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={styles.settingsRow}>
      <div className={styles.settingsRowLabel}>
        <span className={styles.labelMain}>{props.label}</span>
        {props.description ? <span className={styles.labelSub}>{props.description}</span> : null}
      </div>
      <span className={styles.valueLabel}>{props.value}</span>
    </div>
  );
}

function ModuleTile(props: {
  readonly detail: string;
  readonly highlight?: string;
  readonly module: ModuleStatusSnapshot;
}) {
  const tone = getModuleTone(props.module);
  const toneClass =
    tone === 'ok'
      ? styles.statusPillOk
      : tone === 'running'
        ? styles.statusPillRunning
        : styles.statusPillAttention;

  return (
    <article className={styles.moduleTile}>
      <div className={styles.moduleTileHeader}>
        <strong className={styles.moduleTileTitle}>{props.module.label}</strong>
        <span className={`${styles.statusPill} ${toneClass}`}>{formatModuleState(props.module)}</span>
      </div>
      <p className={styles.rowSubtext}>{props.detail}</p>
      {props.highlight ? <p className={styles.moduleTileNote}>{props.highlight}</p> : null}
    </article>
  );
}

function DraftActionsCard(props: {
  readonly onResetDraft: () => void;
  readonly onSave: () => void;
  readonly saveDisabled: boolean;
}) {
  return (
    <section className={styles.settingsCard}>
      <div className={styles.settingsCardTitle}>Draft Actions</div>
      <p className={styles.rowSubtext}>
        Settings changes remain session-local for v0.1, but the editing flow stays real.
      </p>
      <div className={styles.footerActions}>
        <button
          className={styles.primaryButton}
          disabled={props.saveDisabled}
          onClick={props.onSave}
          type="button"
        >
          Save Changes
        </button>
        <button className={styles.secondaryButton} onClick={props.onResetDraft} type="button">
          Reset Draft
        </button>
      </div>
    </section>
  );
}

function EnginesTab(props: SettingsTabPanelsProps) {
  const fieldMap = buildFieldMap(props.fieldBindings);
  const claude = props.modules.engines.claude;
  const codex = props.modules.engines.codex;

  return (
    <>
      <section className={styles.introCard}>
        <div className={styles.settingsCardTitle}>
          <span>Engines</span>
          <span className={styles.introBadge}>A</span>
        </div>
        <p className={styles.introSummary}>
          Engines is the live module surface for v0.1. It owns status reading and reconnect guidance.
        </p>
        <p className={styles.rowSubtext}>
          Re-detecting modules re-reads the latest Core snapshot instead of inventing UI-side health.
        </p>
        <div className={styles.footerActions}>
          <button
            className={styles.secondaryButton}
            disabled={props.isRefreshingModules}
            onClick={props.onRefreshModules}
            type="button"
          >
            {props.isRefreshingModules ? 'Refreshing...' : 'Refresh Module Status'}
          </button>
        </div>
        {props.moduleRefreshError ? <p className={styles.errorText}>{props.moduleRefreshError}</p> : null}
      </section>

      <div className={styles.panelGrid}>
        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Module Topology</div>
          <div className={styles.moduleGrid}>
            <ModuleTile
              detail={props.modules.core.reason ?? 'Daemon status from the latest Core snapshot.'}
              module={props.modules.core}
            />
            <ModuleTile
              detail={claude.reason ?? 'Claude connection state for run assignment and recovery.'}
              highlight={
                props.primaryEngineModule.moduleId === claude.moduleId
                  ? 'Sidebar primary engine'
                  : undefined
              }
              module={claude}
            />
            <ModuleTile
              detail={codex.reason ?? 'Codex connection state for run assignment and recovery.'}
              highlight={
                props.primaryEngineModule.moduleId === codex.moduleId
                  ? 'Sidebar primary engine'
                  : undefined
              }
              module={codex}
            />
            <ModuleTile
              detail={props.modules.soul.reason ?? 'Soul availability from the same shared module contract.'}
              module={props.modules.soul}
            />
          </div>
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Run Defaults</div>
          <FieldEditorRow binding={fieldMap.get('engine.default')} onChange={props.onFieldChange} />
          <FieldEditorRow
            binding={fieldMap.get('engine.parallelism')}
            onChange={props.onFieldChange}
          />
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Connection Guidance</div>
          <ul className={styles.noteList}>
            <li>Open runs only send when their assigned engine is `connected + ready`.</li>
            <li>Failures here should explain whether the issue is install, probe, auth, or disablement.</li>
            <li>Core and Soul stay visible here so engine failures can be diagnosed in one place.</li>
          </ul>
        </section>
      </div>

      <DraftActionsCard
        onResetDraft={props.onResetDraft}
        onSave={props.onSave}
        saveDisabled={props.saveDisabled}
      />
    </>
  );
}

function SoulTab(props: SettingsTabPanelsProps) {
  const fieldMap = buildFieldMap(props.fieldBindings);

  return (
    <>
      <section className={styles.introCard}>
        <div className={styles.settingsCardTitle}>
          <span>Soul</span>
          <span className={styles.introBadge}>B/C</span>
        </div>
        <p className={styles.introSummary}>
          Soul groups memory computation, checkpoint policy, and storage boundaries into one surface.
        </p>
        <p className={styles.rowSubtext}>
          It remains a shell in v0.1, but it should read like a real domain instead of another generic form.
        </p>
      </section>

      <div className={styles.panelGrid}>
        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Memory Computation</div>
          <StaticValueRow
            description="Live module state from Core."
            label="Soul Module"
            value={formatModuleState(props.modules.soul)}
          />
          <FieldEditorRow binding={fieldMap.get('soul.mode')} onChange={props.onFieldChange} />
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Checkpoint Behavior</div>
          <ul className={styles.noteList}>
            <li>Checkpoint promotion remains an honest placeholder for v0.2.</li>
            <li>Retention decisions stay visible here so the operator can tell what Soul owns.</li>
            <li>Memory writes are not silently implied by UI-only toggles.</li>
          </ul>
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Storage</div>
          <FieldEditorRow
            binding={fieldMap.get('soul.memoryRepo')}
            onChange={props.onFieldChange}
          />
          <StaticValueRow
            description="Display-only runtime path until Soul persistence controls are expanded."
            label="soul.db"
            value="~/.do-what/state/soul.db"
          />
        </section>
      </div>

      <DraftActionsCard
        onResetDraft={props.onResetDraft}
        onSave={props.onSave}
        saveDisabled={props.saveDisabled}
      />
    </>
  );
}

function PoliciesTab(props: SettingsTabPanelsProps) {
  const fieldMap = buildFieldMap(props.fieldBindings);

  return (
    <>
      <section className={styles.introCard}>
        <div className={styles.settingsCardTitle}>
          <span>Policies</span>
          <span className={styles.introBadge}>B/C</span>
        </div>
        <p className={styles.introSummary}>
          Policies is the write-safety surface: lease state, tool approval defaults, and settings overlay recovery.
        </p>
        <p className={styles.rowSubtext}>
          The page stays honest about what is live versus what remains a shell for v0.2.
        </p>
      </section>

      <div className={styles.panelGrid}>
        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Tool Approval Policy</div>
          <FieldEditorRow
            binding={fieldMap.get('policy.autoApprove')}
            onChange={props.onFieldChange}
          />
          <FieldEditorRow binding={fieldMap.get('policy.guardMode')} onChange={props.onFieldChange} />
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Lease &amp; Writes</div>
          <StaticValueRow
            description="Lease status from the settings snapshot."
            label="Lease Status"
            value={props.snapshotLeaseStatus}
          />
          {props.lockedFieldIds.length === 0 ? (
            <p className={styles.rowSubtext}>No fields are locked by the current governance lease.</p>
          ) : (
            props.lockedFieldIds.map((fieldId) => (
              <StaticValueRow key={fieldId} label={fieldId} value="locked" />
            ))
          )}
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Settings Overlays</div>
          {props.overlays.length === 0 ? (
            <p className={styles.rowSubtext}>
              No settings overlays are waiting for reconciliation.
            </p>
          ) : (
            props.overlays.map((entry) => (
              <article className={styles.overlayCard} key={entry.clientCommandId}>
                <StaticValueRow label={entry.action} value={entry.status} />
                {entry.errorMessage ? <p className={styles.rowSubtext}>{entry.errorMessage}</p> : null}
                {entry.status === 'desynced' ? (
                  <div className={styles.footerActions}>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => props.onRetryOverlay(entry.clientCommandId)}
                      type="button"
                    >
                      Retry Sync
                    </button>
                    <button
                      className={styles.ghostButton}
                      onClick={() => props.onDismissOverlay(entry.clientCommandId)}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </div>

      <DraftActionsCard
        onResetDraft={props.onResetDraft}
        onSave={props.onSave}
        saveDisabled={props.saveDisabled}
      />
    </>
  );
}

function EnvironmentTab(props: SettingsTabPanelsProps) {
  const fieldMap = buildFieldMap(props.fieldBindings);

  return (
    <>
      <section className={styles.introCard}>
        <div className={styles.settingsCardTitle}>
          <span>Environment</span>
          <span className={styles.introBadge}>B/C</span>
        </div>
        <p className={styles.introSummary}>
          Environment holds runtime inspection and filesystem boundaries instead of hiding them in a generic extras card.
        </p>
        <p className={styles.rowSubtext}>
          Install and repair flows remain placeholders, but the host context stays real.
        </p>
      </section>

      <div className={styles.panelGrid}>
        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Runtime</div>
          <StaticValueRow label="Electron" value={props.runtime.versions.electron} />
          <StaticValueRow label="Chrome" value={props.runtime.versions.chrome} />
          <StaticValueRow label="Node" value={props.runtime.versions.node} />
          <StaticValueRow label="Platform" value={props.runtime.platform} />
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Core &amp; Filesystem</div>
          <FieldEditorRow
            binding={fieldMap.get('environment.coreBaseUrl')}
            onChange={props.onFieldChange}
          />
          <FieldEditorRow
            binding={fieldMap.get('environment.worktreeRoot')}
            onChange={props.onFieldChange}
          />
          <StaticValueRow label="Token Path" value={props.runtime.coreSessionTokenPath} />
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Toolchain Health</div>
          <div className={styles.toolchainList}>
            <StaticValueRow
              description="Core reachability from the shared module contract."
              label="Core"
              value={formatModuleState(props.modules.core)}
            />
            <StaticValueRow label="Node Runtime" value={props.runtime.versions.node} />
            <StaticValueRow label="Electron Host" value={props.runtime.versions.electron} />
          </div>
        </section>
      </div>

      <DraftActionsCard
        onResetDraft={props.onResetDraft}
        onSave={props.onSave}
        saveDisabled={props.saveDisabled}
      />
    </>
  );
}

function AppearanceTab(props: SettingsTabPanelsProps) {
  const fieldMap = buildFieldMap(props.fieldBindings);

  return (
    <>
      <section className={styles.introCard}>
        <div className={styles.settingsCardTitle}>
          <span>Appearance</span>
          <span className={styles.introBadge}>B/C</span>
        </div>
        <p className={styles.introSummary}>
          Appearance keeps visual direction, motion, and typography out of the workbench shell.
        </p>
        <p className={styles.rowSubtext}>
          Theme persistence remains deferred to v0.2, but the visual IA should already be explicit.
        </p>
      </section>

      <div className={styles.panelGrid}>
        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Theme Direction</div>
          <div className={styles.themePreviewGrid}>
            <div className={styles.themePreviewCard}>
              <div className={styles.themePreviewSurface}>
                <span className={styles.themePreviewSidebar} />
                <span className={styles.themePreviewMain} />
              </div>
              <span className={styles.themePreviewLabel}>Warm Paper</span>
            </div>
            <div className={`${styles.themePreviewCard} ${styles.themePreviewCardMuted}`}>
              <div className={styles.themePreviewSurface}>
                <span className={styles.themePreviewSidebarMuted} />
                <span className={styles.themePreviewMainMuted} />
              </div>
              <span className={styles.themePreviewLabel}>Dark Theme (v0.2)</span>
            </div>
          </div>
          <FieldEditorRow
            binding={fieldMap.get('appearance.theme')}
            onChange={props.onFieldChange}
          />
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Motion</div>
          <FieldEditorRow
            binding={fieldMap.get('appearance.motion')}
            onChange={props.onFieldChange}
          />
          <ul className={styles.noteList}>
            <li>Motion changes stay local to this shell during v0.1.</li>
            <li>Reduced motion should remain explicit instead of being hidden in global defaults.</li>
          </ul>
        </section>

        <section className={styles.settingsCard}>
          <div className={styles.settingsCardTitle}>Typography</div>
          <StaticValueRow
            description="Display font used by headings and route titles."
            label="Display"
            value="Fraunces"
          />
          <StaticValueRow
            description="UI body font used across lists, cards, and controls."
            label="Body"
            value="IBM Plex Sans"
          />
          <StaticValueRow
            description="Monospace font for paths, statuses, and tool output."
            label="Mono"
            value="JetBrains Mono"
          />
        </section>
      </div>

      <DraftActionsCard
        onResetDraft={props.onResetDraft}
        onSave={props.onSave}
        saveDisabled={props.saveDisabled}
      />
    </>
  );
}

export function SettingsTabPanels(props: SettingsTabPanelsProps) {
  if (props.isLoading) {
    return <p className={styles.rowSubtext}>Loading settings snapshot...</p>;
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
