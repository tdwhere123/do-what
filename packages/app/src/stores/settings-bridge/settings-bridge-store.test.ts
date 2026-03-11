import { beforeEach, describe, expect, it } from 'vitest';
import { LEASE_LOCKED_SETTINGS_FIXTURE } from '../../test/fixtures';
import {
  resetSettingsBridgeStore,
  useSettingsBridgeStore,
} from './settings-bridge-store';

describe('settings bridge store', () => {
  beforeEach(() => {
    resetSettingsBridgeStore();
  });

  it('bridges lease locks from settings snapshots', () => {
    useSettingsBridgeStore
      .getState()
      .applySettingsSnapshot(LEASE_LOCKED_SETTINGS_FIXTURE);

    expect(useSettingsBridgeStore.getState().lastLeaseId).toBe('lease-locked-1');
    expect(useSettingsBridgeStore.getState().lockedFieldIds).toContain('policy.autoApprove');
    expect(useSettingsBridgeStore.getState().lockedFieldIds).toContain('soul.mode');
  });

  it('preserves interrupted drafts for lease recovery', () => {
    useSettingsBridgeStore.getState().setInterruptedDraft(
      {
        'policy.autoApprove': true,
      },
      LEASE_LOCKED_SETTINGS_FIXTURE,
    );

    expect(useSettingsBridgeStore.getState().interruptedDraft?.fields).toEqual({
      'policy.autoApprove': true,
    });
    expect(useSettingsBridgeStore.getState().interruptedDraft?.leaseId).toBe('lease-locked-1');
  });
});
