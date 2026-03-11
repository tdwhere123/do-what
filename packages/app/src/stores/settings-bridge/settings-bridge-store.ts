import type { SettingsSnapshot } from '@do-what/protocol';
import { create } from 'zustand';

export interface InterruptedSettingsDraft {
  readonly fields: Record<string, unknown>;
  readonly leaseId: string | null;
  readonly revision: number;
  readonly savedAt: string;
}

export interface SettingsBridgeState {
  readonly interruptedDraft: InterruptedSettingsDraft | null;
  readonly lastLeaseId: string | null;
  readonly lastRevision: number;
  readonly lockedFieldIds: readonly string[];
}

interface SettingsBridgeActions {
  applySettingsSnapshot: (snapshot: SettingsSnapshot) => void;
  clearInterruptedDraft: () => void;
  reset: () => void;
  setInterruptedDraft: (fields: Record<string, unknown>, snapshot: SettingsSnapshot) => void;
}

export type SettingsBridgeStore = SettingsBridgeState & SettingsBridgeActions;

function collectLockedFieldIds(snapshot: SettingsSnapshot): string[] {
  const lockedFieldIds = new Set(snapshot.lease.lockedFields);

  for (const section of snapshot.sections) {
    for (const field of section.fields) {
      if (section.locked || field.locked) {
        lockedFieldIds.add(field.fieldId);
      }
    }
  }

  return [...lockedFieldIds];
}

function createInitialState(): SettingsBridgeState {
  return {
    interruptedDraft: null,
    lastLeaseId: null,
    lastRevision: 0,
    lockedFieldIds: [],
  };
}

export const useSettingsBridgeStore = create<SettingsBridgeStore>((set) => ({
  ...createInitialState(),

  applySettingsSnapshot: (snapshot) => {
    set({
      lastLeaseId: snapshot.lease.leaseId,
      lastRevision: snapshot.revision,
      lockedFieldIds: collectLockedFieldIds(snapshot),
    });
  },

  clearInterruptedDraft: () => {
    set({
      interruptedDraft: null,
    });
  },

  reset: () => {
    set(createInitialState());
  },

  setInterruptedDraft: (fields, snapshot) => {
    set({
      interruptedDraft: {
        fields,
        leaseId: snapshot.lease.leaseId,
        revision: snapshot.revision,
        savedAt: new Date().toISOString(),
      },
      lastLeaseId: snapshot.lease.leaseId,
      lastRevision: snapshot.revision,
      lockedFieldIds: collectLockedFieldIds(snapshot),
    });
  },
}));

export function resetSettingsBridgeStore(): void {
  useSettingsBridgeStore.getState().reset();
}
