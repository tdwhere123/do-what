// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRoot } from './app-root';
import { useUiShellStore } from '../stores/ui-shell-store';

function installRuntimeBridge(): void {
  Object.defineProperty(window, 'doWhatRuntime', {
    configurable: true,
    value: {
      platform: 'win32',
      versions: {
        chrome: '134.0.0.0',
        electron: '35.7.5',
        node: '22.14.0',
      },
    },
  });
}

describe('AppRoot scaffold', () => {
  beforeEach(() => {
    installRuntimeBridge();
    useUiShellStore.setState({ currentRoute: 'workbench' });
    window.history.replaceState(null, '', '#/');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '#/');
  });

  it('renders the default workbench route with scaffold chrome', () => {
    render(<AppRoot />);

    expect(screen.getByRole('heading', { name: 'do-what UI runtime skeleton' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Workbench' })).toBeTruthy();
    expect(screen.getByText('Active route: workbench')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Workbench' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
  });

  it('navigates to the settings route and exposes runtime information', async () => {
    render(<AppRoot />);

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
      expect(screen.getByText('Active route: settings')).toBeTruthy();
    });

    expect(screen.getByText(/Electron 35.7.5 \/ Chrome 134.0.0.0 \/ Node 22.14.0/)).toBeTruthy();
  });

  it('redirects unknown hash routes back to the workbench shell', async () => {
    window.history.replaceState(null, '', '#/unexpected');

    render(<AppRoot />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
      expect(screen.getByRole('heading', { name: 'Workbench' })).toBeTruthy();
    });
  });
});
