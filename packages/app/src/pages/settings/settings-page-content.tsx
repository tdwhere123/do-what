import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsSnapshot } from '@do-what/protocol';
import { EMPTY_ASSET_URLS } from '../../assets';
import { SettingsSunIcon, SoulWorkingIcon } from '../../components/icons';
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
    <section className={styles.noticeCard}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Lease interruption</p>
          <h3 className={styles.cardTitle}>Dirty draft preserved locally</h3>
        </div>
        <button className={styles.ghostButton} onClick={() => setActiveModal(null)} type="button">
          Close
        </button>
      </div>
      <p className={styles.cardText}>
        Lease {interruptedDraft.leaseId ?? 'unknown'} locked one or more fields while you were editing. The draft below was retained and the page refreshed against the latest server values.
      </p>
      <pre className={styles.preformatted}>{JSON.stringify(interruptedDraft.fields, null, 2)}</pre>
      <div className={styles.actionRow}>
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
      <div className={styles.hero}>
        <div className={styles.heroMeta}>
          <span className={styles.badge}>Hash route</span>
          <span className={styles.heroMetric}>
            <SoulWorkingIcon size={16} />
            query-first settings
          </span>
        </div>
        <div className={styles.heroLayout}>
          <div className={styles.heroCopy}>
            <h2 className={styles.heroTitle}>Settings</h2>
            <p className={styles.heroBody}>
              Five query-first tabs now render from a single Settings snapshot. Locked fields stay visible, writes go through the command pipeline, and lease interruptions preserve your local draft before refresh.
            </p>
            <div className={styles.heroActions}>
              <span className={styles.heroChip}><SettingsSunIcon size={18} /> lease-aware tabs</span>
              <span className={styles.heroChip}>Token: {runtime.coreSessionToken ? 'loaded' : 'missing'}</span>
            </div>
          </div>

          <div className={styles.heroArtwork}>
            <img alt="Settings empty state illustration" src={EMPTY_ASSET_URLS.settings} />
          </div>
        </div>
      </div>

      <LeaseInterruptionNotice />

      <div className={styles.grid}>
        <aside className={styles.tabRail}>
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
        </aside>

        <main className={styles.mainPanel}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Section</p>
                <h3 className={styles.cardTitle}>{TAB_CONFIG.find((tab) => tab.id === activeTab)?.label}</h3>
              </div>
              <span className={styles.statusBadge}>{query.data?.lease.status ?? 'none'}</span>
            </div>

            {query.isLoading ? <p className={styles.cardText}>Loading settings snapshot...</p> : null}
            {query.error ? <p className={styles.errorText}>{query.error instanceof Error ? query.error.message : 'Failed to load settings.'}</p> : null}

            <div className={styles.fieldList}>
              {(activeSection?.fields ?? []).map((field: SettingsSnapshot['sections'][number]['fields'][number]) => {
                const locked = globalLocked || field.locked || (activeSection?.locked ?? false) || lockedFieldIds.includes(field.fieldId);
                const value = Object.prototype.hasOwnProperty.call(draftFields, field.fieldId)
                  ? draftFields[field.fieldId]
                  : field.value;

                return (
                  <label key={field.fieldId} className={styles.fieldCard}>
                    <span className={styles.fieldLabel}>{String(field.label)}</span>
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
                        rows={5}
                        value={readFieldValue(value)}
                      />
                    ) : field.kind === 'toggle' ? (
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
                            [field.fieldId]: field.kind === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value,
                          }))
                        }
                        type={field.kind === 'number' ? 'number' : 'text'}
                        value={readFieldValue(value)}
                      />
                    )}
                    <span className={styles.fieldMeta}>
                      {field.fieldId}
                      {locked ? ' �� locked' : ''}
                      {typeof field.description === 'string' ? ` �� ${field.description}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className={styles.actionRow}>
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
        </main>

        <aside className={styles.sidePanel}>
          <section className={styles.card}>
            <p className={styles.eyebrow}>Runtime bridge</p>
            <h3 className={styles.cardTitle}>Environment</h3>
            <div className={styles.metaList}>
              <div className={styles.metaRow}><span>Electron</span><strong>{runtime.versions.electron}</strong></div>
              <div className={styles.metaRow}><span>Chrome</span><strong>{runtime.versions.chrome}</strong></div>
              <div className={styles.metaRow}><span>Node</span><strong>{runtime.versions.node}</strong></div>
              <div className={styles.metaRow}><span>Token path</span><strong>{runtime.coreSessionTokenPath}</strong></div>
            </div>
          </section>

          <section className={styles.card}>
            <p className={styles.eyebrow}>Lease locks</p>
            <h3 className={styles.cardTitle}>Readonly fields</h3>
            <div className={styles.fieldList}>
              {lockedFieldIds.length === 0 ? <p className={styles.cardText}>No fields are locked by the current governance lease.</p> : null}
              {lockedFieldIds.map((fieldId) => (
                <div key={fieldId} className={styles.metaRow}><span>{fieldId}</span><strong>locked</strong></div>
              ))}
            </div>
          </section>

          {overlays.length > 0 ? (
            <section className={styles.card}>
              <p className={styles.eyebrow}>Command lifecycle</p>
              <h3 className={styles.cardTitle}>Settings overlays</h3>
              <div className={styles.fieldList}>
                {overlays.map((entry) => (
                  <div key={entry.clientCommandId} className={styles.overlayCard}>
                    <div className={styles.metaRow}><strong>{entry.action}</strong><span>{entry.status}</span></div>
                    {entry.errorMessage ? <p className={styles.cardText}>{entry.errorMessage}</p> : null}
                    {entry.status === 'desynced' ? (
                      <div className={styles.actionRow}>
                        <button className={styles.secondaryButton} onClick={() => void retryAckOverlaySync(entry.clientCommandId, services.coreApi)} type="button">Retry Sync</button>
                        <button className={styles.ghostButton} onClick={() => dismissAckOverlay(entry.clientCommandId)} type="button">Dismiss / Rollback</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}




