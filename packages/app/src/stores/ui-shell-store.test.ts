import { beforeEach, describe, expect, it } from 'vitest';
import { useUiShellStore } from './ui-shell-store';

describe('ui shell store', () => {
  beforeEach(() => {
    useUiShellStore.setState({ currentRoute: 'workbench' });
  });

  it('starts on the workbench route', () => {
    expect(useUiShellStore.getState().currentRoute).toBe('workbench');
  });

  it('updates the active route through the exported action', () => {
    useUiShellStore.getState().setCurrentRoute('settings');

    expect(useUiShellStore.getState().currentRoute).toBe('settings');
  });
});
