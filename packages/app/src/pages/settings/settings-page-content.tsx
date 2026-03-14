import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsSnapshot } from '@do-what/protocol';
import { useNavigate } from 'react-router-dom';
import { dispatchSettingsSave } from '../../lib/commands';
import { selectPrimaryEngineModule } from '../../lib/module-status';
import { dismissAckOverlay, retryAckOverlaySync } from '../../lib/reconciliation';
import { getAppServices } from '../../lib/runtime/app-services';
import { useAckOverlayStore } from '../../stores/ack-overlay';
import { useHotStateStore } from '../../stores/hot-state';
import { useSettingsBridgeStore } from '../../stores/settings-bridge';
import { useUiStore, type SettingsTabId } from '../../stores/ui';
import {
  type SettingsFieldBinding,
  SettingsTabPanels,
} from './settings-tab-panels';
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

async function refreshModuleSnapshot(): Promise<void> {
  const snapshot = await getAppServices().coreApi.getWorkbenchSnapshot();
  useHotStateStore.getState().applyWorkbenchSnapshot(snapshot);
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
  const modules = useHotStateStore((state) => state.modules);
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
  const [isRefreshingModules, setIsRefreshingModules] = useState(false);
  const [moduleRefreshError, setModuleRefreshError] = useState<string | null>(null);

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

  const activeSection = useMemo(
    () => getSectionForTab(query.data, activeTab),
    [activeTab, query.data],
  );
  const fieldBindings = useMemo<readonly SettingsFieldBinding[]>(
    () =>
      (activeSection?.fields ?? []).map((field) => ({
        field,
        locked:
          globalLocked ||
          field.locked ||
          (activeSection?.locked ?? false) ||
          lockedFieldIds.includes(field.fieldId),
        value: Object.prototype.hasOwnProperty.call(draftFields, field.fieldId)
          ? draftFields[field.fieldId]
          : field.value,
      })),
    [activeSection, draftFields, globalLocked, lockedFieldIds],
  );
  const primaryEngineModule = useMemo(() => selectPrimaryEngineModule(modules), [modules]);
  const loadError =
    query.error instanceof Error
      ? query.error.message
      : query.error
        ? 'Failed to load settings.'
        : null;
  const saveDisabled = globalLocked || Object.keys(draftFields).length === 0 || query.isLoading;

  function handleFieldChange(fieldId: string, value: unknown): void {
    setDraftFields((current) => ({
      ...current,
      [fieldId]: value,
    }));
  }

  async function handleSave(): Promise<void> {
    if (!query.data) {
      return;
    }

    const result = await dispatchSettingsSave(draftFields, services.coreApi);
    if (!result.ok) {
      return;
    }

    queryClient.setQueryData<SettingsSnapshot>(
      SETTINGS_QUERY_KEY,
      mergeSettingsSnapshot(query.data, draftFields),
    );
    setDraftFields({});
  }

  async function handleRefreshModules(): Promise<void> {
    setModuleRefreshError(null);
    setIsRefreshingModules(true);

    try {
      await refreshModuleSnapshot();
    } catch (error) {
      setModuleRefreshError(
        error instanceof Error ? error.message : 'Failed to refresh module status.',
      );
    } finally {
      setIsRefreshingModules(false);
    }
  }

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

          <SettingsTabPanels
            activeTab={activeTab}
            fieldBindings={fieldBindings}
            globalLocked={globalLocked}
            isLoading={query.isLoading}
            isRefreshingModules={isRefreshingModules}
            loadError={loadError}
            lockedFieldIds={lockedFieldIds}
            moduleRefreshError={moduleRefreshError}
            modules={modules}
            onDismissOverlay={dismissAckOverlay}
            onFieldChange={handleFieldChange}
            onRefreshModules={() => {
              void handleRefreshModules();
            }}
            onResetDraft={() => setDraftFields({})}
            onRetryOverlay={(clientCommandId) => {
              void retryAckOverlaySync(clientCommandId, services.coreApi);
            }}
            onSave={() => {
              void handleSave();
            }}
            overlays={overlays}
            primaryEngineModule={primaryEngineModule}
            runtime={runtime}
            saveDisabled={saveDisabled}
            snapshotLeaseStatus={query.data?.lease.status ?? 'none'}
          />
        </div>
      </div>
    </section>
  );
}

