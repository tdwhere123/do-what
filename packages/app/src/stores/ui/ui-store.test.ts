import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyCreateRunDraft, resetUiStore, useUiStore } from './ui-store';

describe('ui store', () => {
  beforeEach(() => {
    resetUiStore();
  });

  it('starts on the workbench route', () => {
    expect(useUiStore.getState().currentRoute).toBe('workbench');
    expect(useUiStore.getState().timelineViewMode).toBe('merged');
    expect(useUiStore.getState().settingsActiveTab).toBe('engines');
  });

  it('updates the active route through the exported action', () => {
    useUiStore.getState().setCurrentRoute('settings');
    useUiStore.getState().setInspectorMode('collaboration');
    useUiStore.getState().setSettingsActiveTab('soul');

    expect(useUiStore.getState().currentRoute).toBe('settings');
    expect(useUiStore.getState().inspectorMode).toBe('collaboration');
    expect(useUiStore.getState().settingsActiveTab).toBe('soul');
  });

  it('isolates create-run drafts by workspace', () => {
    useUiStore.getState().setCreateRunDraft('workspace-a', {
      ...createEmptyCreateRunDraft(),
      templateId: 'template-a',
    });
    useUiStore.getState().setCreateRunDraft('workspace-b', {
      ...createEmptyCreateRunDraft(),
      templateId: 'template-b',
    });

    expect(useUiStore.getState().createRunDraftsByWorkspace['workspace-a']).toEqual({
      participants: [],
      templateId: 'template-a',
      templateInputs: {},
      templateVersion: null,
    });
    expect(useUiStore.getState().createRunDraftsByWorkspace['workspace-b']).toEqual({
      participants: [],
      templateId: 'template-b',
      templateInputs: {},
      templateVersion: null,
    });
  });

  it('does not leak composer drafts across runs', () => {
    useUiStore.getState().setComposerDraft('run-a', 'alpha');
    useUiStore.getState().setComposerDraft('run-b', 'beta');
    useUiStore.getState().clearComposerDraft('run-a');

    expect(useUiStore.getState().composerDraftsByRun['run-a']).toBeUndefined();
    expect(useUiStore.getState().composerDraftsByRun['run-b']).toBe('beta');
  });

  it('tracks bootstrap state independently from route state', () => {
    useUiStore.getState().setBootstrapState('loading');
    useUiStore.getState().setBootstrapState('error', {
      bootstrapError: 'snapshot failed',
      failureCode: 'http_500',
      failureStage: 'snapshot',
      failureStatus: 500,
    });

    expect(useUiStore.getState().bootstrapStatus).toBe('error');
    expect(useUiStore.getState().bootstrapError).toBe('snapshot failed');
    expect(useUiStore.getState().bootstrapFailureCode).toBe('http_500');
    expect(useUiStore.getState().bootstrapFailureStage).toBe('snapshot');
    expect(useUiStore.getState().bootstrapFailureStatus).toBe(500);
  });
});