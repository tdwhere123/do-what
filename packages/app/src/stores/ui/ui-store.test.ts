import { beforeEach, describe, expect, it } from 'vitest';
import { resetUiStore, useUiStore } from './ui-store';

describe('ui store', () => {
  beforeEach(() => {
    resetUiStore();
  });

  it('starts on the workbench route', () => {
    expect(useUiStore.getState().currentRoute).toBe('workbench');
  });

  it('updates the active route through the exported action', () => {
    useUiStore.getState().setCurrentRoute('settings');

    expect(useUiStore.getState().currentRoute).toBe('settings');
  });

  it('isolates create-run drafts by workspace', () => {
    useUiStore.getState().setCreateRunDraft('workspace-a', {
      templateId: 'template-a',
    });
    useUiStore.getState().setCreateRunDraft('workspace-b', {
      templateId: 'template-b',
    });

    expect(useUiStore.getState().createRunDraftsByWorkspace['workspace-a']).toEqual({
      templateId: 'template-a',
    });
    expect(useUiStore.getState().createRunDraftsByWorkspace['workspace-b']).toEqual({
      templateId: 'template-b',
    });
  });

  it('does not leak composer drafts across runs', () => {
    useUiStore.getState().setComposerDraft('run-a', 'alpha');
    useUiStore.getState().setComposerDraft('run-b', 'beta');
    useUiStore.getState().clearComposerDraft('run-a');

    expect(useUiStore.getState().composerDraftsByRun['run-a']).toBeUndefined();
    expect(useUiStore.getState().composerDraftsByRun['run-b']).toBe('beta');
  });
});
