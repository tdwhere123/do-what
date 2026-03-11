// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRoot } from './app-root';
import { useUiStore } from '../stores/ui';

function installRuntimeBridge(): void {
  Object.defineProperty(window, 'doWhatRuntime', {
    configurable: true,
    value: {
      coreSessionToken: 'mock-core-token',
      coreSessionTokenPath: 'C:/Users/lenovo/.do-what/run/session_token',
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
    useUiStore.setState({ currentRoute: 'workbench' });
    window.history.replaceState(null, '', '#/');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '#/');
  });

  it('renders the default workbench route with scaffold chrome', async () => {
    render(<AppRoot />);

    expect(screen.getByRole('heading', { name: 'do-what UI runtime skeleton' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByText('Active route: workbench')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Workbench' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Workbench' })).toBeTruthy();
    });
  });

  it('opens the create-run modal from the workbench shell', async () => {
    render(<AppRoot />);

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'New Run' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Run' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Launch a new workflow' })).toBeTruthy();
      expect(screen.getByText(/Workspace:/)).toBeTruthy();
    });
  });

  it('navigates to the settings route and exposes runtime information', async () => {
    render(<AppRoot />);

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
      expect(screen.getByText('Active route: settings')).toBeTruthy();
    });

    expect(screen.getByText('Electron')).toBeTruthy();
    expect(screen.getByText('35.7.5')).toBeTruthy();
    expect(screen.getByText('Chrome')).toBeTruthy();
    expect(screen.getByText('134.0.0.0')).toBeTruthy();
    expect(screen.getByText('Node')).toBeTruthy();
    expect(screen.getByText('22.14.0')).toBeTruthy();
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
