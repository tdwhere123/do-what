import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsSnapshot } from '@do-what/protocol';
import { useNavigate } from 'react-router-dom';
import { dispatchSettingsSave } from '../../lib/commands';
import { dismissAckOverlay, retryAckOverlaySync } from '../../lib/reconciliation';
import { getAppServices } from '../../lib/runtime/app-services';
import { useAckOverlayStore } from '../../stores/ack-overlay';
import { useHotStateStore } from '../../stores/hot-state';
import { useSettingsBridgeStore } from '../../stores/settings-bridge';
import { useUiStore, type SettingsTabId } from '../../stores/ui';
import styles from './settings-page-content.module.css';

const SETTINGS_QUERY_KEY = ['settings-snapshot'];

const TAB_CONFIG: Array<{ id: SettingsTabId; label: string; sectionId: string }> = [
  { id: 'engines', label: 'Engines', sectionId: 'engine' },
  { id: 'soul', label: 'Soul', sectionId: 'soul' },
  { id: 'policies', label: 'Policies', sectionId: 'policy' },
  { id: 'environment', label: 'Environment', sectionId: 'environment' },
  { id: 'appearance', label: 'Appearance', sectionId: 'appearance' },
];

const FALLBACK_RUNTIME = {
  coreSessionToken: null,
  coreSessionTokenPath: 'unknown',
  platform: 'unknown',
  versions: {
    chrome: 'unknown',
    electron: 'unknown',
    node: 'unknown',
  },
} satisfies Window['doWhatRuntime'];

function getSectionForTab(snapshot: SettingsSnapshot | undefined, tabId: SettingsTabId): SettingsSnapshot['sections'][number] | null {
  const sectionId = TAB_CONFIG.find((tab) => tab.id === tabId)?.sectionId;
  return snapshot?.sections.find((section) => section.sectionId === sectionId) ?? null;
}

function mergeSettingsSnapshot(
  snapshot: SettingsSnapshot,
  changedFields: Record<string, unknown>,
): SettingsSnapshot {
  return {
    ...snapshot,
    sections: snapshot.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        Object.prototype.hasOwnProperty.call(changedFields, field.fieldId)
          ? {
              ...field,
              value: changedFields[field.fieldId],
            }
          : field,
      ),
    })),
  };
}

function readFieldValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
}

function LeaseInterruptionNotice() {
  const activeModal = useUiStore((state) => state.activeModal);
  const setActiveModal = useUiStore((state) => state.setActiveModal);
  const interruptedDraft = useSettingsBridgeStore((state) => state.interruptedDraft);
  const clearInterruptedDraft = useSettingsBridgeStore((state) => state.clearInterruptedDraft);

  if (!interruptedDraft || activeModal !== 'settings-lease') {
    return null;
  }

  return (
    <section className={styles.settingsCard}>
      <div className={styles.settingsCardTitle}>Lease interruption</div>
      <p className={styles.rowSubtext}>
        Lease {interruptedDraft.leaseId ?? 'unknown'} locked one or more fields while you were editing. The retained draft is shown below.
      </p>
      <pre className={styles.preformatted}>{JSON.stringify(interruptedDraft.fields, null, 2)}</pre>
      <div className={styles.footerActions}>
        <button className={styles.secondaryButton} onClick={() => setActiveModal(null)} type="button">
          Keep Notice
        </button>
        <button
          className={styles.ghostButton}
          onClick={() => {
            clearInterruptedDraft();
            setActiveModal(null);
          }}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}

export function SettingsPageContent() {
  const services = getAppServices();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const runtime = window.doWhatRuntime ?? FALLBACK_RUNTIME;
  const globalLocked = useHotStateStore((state) => state.globalInteractionLock);
  const activeTab = useUiStore((state) => state.settingsActiveTab);
  const setActiveTab = useUiStore((state) => state.setSettingsActiveTab);
  const setActiveModal = useUiStore((state) => state.setActiveModal);
  const lockedFieldIds = useSettingsBridgeStore((state) => state.lockedFieldIds);
  const applySettingsSnapshot = useSettingsBridgeStore((state) => state.applySettingsSnapshot);
  const setInterruptedDraft = useSettingsBridgeStore((state) => state.setInterruptedDraft);
  const overlayOrder = useAckOverlayStore((state) => state.order);
  const overlayEntriesById = useAckOverlayStore((state) => state.entriesById);
  const [draftFields, setDraftFields] = useState<Record<string, unknown>>({});
  const handledLeaseRef = useRef<string | null>(null);

  const query = useQuery<SettingsSnapshot>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const snapshot = await services.coreApi.getSettingsSnapshot();
      applySettingsSnapshot(snapshot);
      return snapshot;
    },
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }

    const leaseSignature = `${query.data.lease.leaseId ?? 'none'}:${query.data.revision}`;
    if (handledLeaseRef.current === leaseSignature) {
      return;
    }

    const interruptedFields = Object.fromEntries(
      Object.entries(draftFields).filter(([fieldId]) => lockedFieldIds.includes(fieldId)),
    );

    if (Object.keys(interruptedFields).length === 0) {
      handledLeaseRef.current = leaseSignature;
      return;
    }

    setInterruptedDraft(interruptedFields, query.data);
    setDraftFields((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([fieldId]) => !lockedFieldIds.includes(fieldId)),
      ),
    );
    handledLeaseRef.current = leaseSignature;
    setActiveModal('settings-lease');
    void query.refetch();
  }, [draftFields, lockedFieldIds, query, setActiveModal, setInterruptedDraft]);

  const overlays = useMemo(
    () =>
      overlayOrder
        .map((clientCommandId) => overlayEntriesById[clientCommandId])
        .filter((entry) => entry?.entityType === 'settings'),
    [overlayEntriesById, overlayOrder],
  );

  const activeSection = useMemo(() => getSectionForTab(query.data, activeTab), [activeTab, query.data]);

  const saveDisabled = globalLocked || Object.keys(draftFields).length === 0 || query.isLoading;

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <button className={styles.backButton} onClick={() => navigate('/')} type="button">
          <span className={styles.backChevron}>&lt;</span>
          Back
        </button>
        <span className={styles.title}>Settings</span>
      </header>

      <div className={styles.body}>
        <div className={styles.tabBar}>
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              className={tab.id === activeTab ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.scrollArea}>
          <div className={styles.settingsBanner} role="note">
            设置当前不会持久化，重启后将恢复默认值。持久化支持将在 v0.2 中引入。
          </div>

          <LeaseInterruptionNotice />

          <section className={styles.settingsCard}>
            <div className={styles.settingsCardTitle}>
              {TAB_CONFIG.find((tab) => tab.id === activeTab)?.label ?? 'Settings'}
              <span className={styles.badge}>{query.data?.lease.status ?? 'none'}</span>
            </div>

            {query.isLoading ? <p className={styles.rowSubtext}>Loading settings snapshot...</p> : null}
            {query.error ? <p className={styles.errorText}>{query.error instanceof Error ? query.error.message : 'Failed to load settings.'}</p> : null}

            {(activeSection?.fields ?? []).map((field) => {
              const locked = globalLocked || field.locked || (activeSection?.locked ?? false) || lockedFieldIds.includes(field.fieldId);
              const value = Object.prototype.hasOwnProperty.call(draftFields, field.fieldId)
                ? draftFields[field.fieldId]
                : field.value;

              return (
                <div className={styles.settingsRow} key={field.fieldId}>
                  <div className={styles.settingsRowLabel}>
                    <span className={styles.labelMain}>{String(field.label)}</span>
                    <span className={styles.labelSub}>
                      {field.fieldId}
                      {locked ? ' - locked' : ''}
                      {typeof field.description === 'string' ? ` - ${field.description}` : ''}
                    </span>
                  </div>

                  {field.kind === 'textarea' ? (
                    <textarea
                      className={styles.textarea}
                      disabled={locked}
                      onChange={(event) =>
                        setDraftFields((current) => ({
                          ...current,
                          [field.fieldId]: event.currentTarget.value,
                        }))
                      }
                      rows={4}
                      value={readFieldValue(value)}
                    />
                  ) : field.kind === 'toggle' ? (
                    <label className={styles.toggleWrap}>
                      <input
                        checked={Boolean(value)}
                        disabled={locked}
                        onChange={(event) =>
                          setDraftFields((current) => ({
                            ...current,
                            [field.fieldId]: event.currentTarget.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span className={Boolean(value) ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle} />
                    </label>
                  ) : field.kind === 'select' ? (
                    <select
                      className={styles.select}
                      disabled={locked}
                      onChange={(event) =>
                        setDraftFields((current) => ({
                          ...current,
                          [field.fieldId]: event.currentTarget.value,
                        }))
                      }
                      value={readFieldValue(value)}
                    >
                      {(field.options ?? []).map((option: { label: string; value: string }) => (
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
                        setDraftFields((current) => ({
                          ...current,
                          [field.fieldId]:
                            field.kind === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value,
                        }))
                      }
                      type={field.kind === 'number' ? 'number' : 'text'}
                      value={readFieldValue(value)}
                    />
                  )}
                </div>
              );
            })}

            <div className={styles.footerActions}>
              <button
                className={styles.primaryButton}
                disabled={saveDisabled}
                onClick={async () => {
                  const result = await dispatchSettingsSave(draftFields, services.coreApi);
                  if (!result.ok || !query.data) {
                    return;
                  }

                  queryClient.setQueryData<SettingsSnapshot>(
                    SETTINGS_QUERY_KEY,
                    mergeSettingsSnapshot(query.data, draftFields),
                  );
                  setDraftFields({});
                }}
                type="button"
              >
                Save Changes
              </button>
              <button className={styles.secondaryButton} onClick={() => setDraftFields({})} type="button">
                Reset Draft
              </button>
            </div>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingsCardTitle}>Runtime</div>
            <div className={styles.settingsRow}>
              <div className={styles.settingsRowLabel}>
                <span className={styles.labelMain}>Electron</span>
              </div>
              <span className={styles.valueLabel}>{runtime.versions.electron}</span>
            </div>
            <div className={styles.settingsRow}>
              <div className={styles.settingsRowLabel}>
                <span className={styles.labelMain}>Chrome</span>
              </div>
              <span className={styles.valueLabel}>{runtime.versions.chrome}</span>
            </div>
            <div className={styles.settingsRow}>
              <div className={styles.settingsRowLabel}>
                <span className={styles.labelMain}>Node</span>
              </div>
              <span className={styles.valueLabel}>{runtime.versions.node}</span>
            </div>
            <div className={styles.settingsRow}>
              <div className={styles.settingsRowLabel}>
                <span className={styles.labelMain}>Token path</span>
              </div>
              <span className={styles.valueLabel}>{runtime.coreSessionTokenPath}</span>
            </div>
          </section>

          <section className={styles.settingsCard}>
            <div className={styles.settingsCardTitle}>Lease locks</div>
            {lockedFieldIds.length === 0 ? (
              <p className={styles.rowSubtext}>No fields are locked by the current governance lease.</p>
            ) : (
              lockedFieldIds.map((fieldId) => (
                <div className={styles.settingsRow} key={fieldId}>
                  <div className={styles.settingsRowLabel}>
                    <span className={styles.labelMain}>{fieldId}</span>
                  </div>
                  <span className={styles.valueLabel}>locked</span>
                </div>
              ))
            )}
          </section>

          {overlays.length > 0 ? (
            <section className={styles.settingsCard}>
              <div className={styles.settingsCardTitle}>Settings overlays</div>
              {overlays.map((entry) => (
                <article className={styles.overlayCard} key={entry.clientCommandId}>
                  <div className={styles.settingsRow}>
                    <div className={styles.settingsRowLabel}>
                      <span className={styles.labelMain}>{entry.action}</span>
                    </div>
                    <span className={styles.valueLabel}>{entry.status}</span>
                  </div>
                  {entry.errorMessage ? <p className={styles.rowSubtext}>{entry.errorMessage}</p> : null}
                  {entry.status === 'desynced' ? (
                    <div className={styles.footerActions}>
                      <button className={styles.secondaryButton} onClick={() => void retryAckOverlaySync(entry.clientCommandId, services.coreApi)} type="button">
                        Retry Sync
                      </button>
                      <button className={styles.ghostButton} onClick={() => dismissAckOverlay(entry.clientCommandId)} type="button">
                        Dismiss
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

