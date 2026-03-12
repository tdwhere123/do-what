// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRoot } from './app-root';
import { resetAppServices } from '../lib/runtime/app-services';
import { resetAckOverlayStore } from '../stores/ack-overlay';
import { resetHotStateStore } from '../stores/hot-state';
import { resetPendingCommandStore } from '../stores/pending-command';
import { resetProjectionStore } from '../stores/projection';
import { resetSettingsBridgeStore } from '../stores/settings-bridge';
import { resetUiStore } from '../stores/ui';

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
    resetAppServices();
    resetAckOverlayStore();
    resetHotStateStore();
    resetPendingCommandStore();
    resetProjectionStore();
    resetSettingsBridgeStore();
    resetUiStore();
    window.history.replaceState(null, '', '#/');
  });

  afterEach(() => {
    cleanup();
    resetAppServices();
    resetAckOverlayStore();
    resetHotStateStore();
    resetPendingCommandStore();
    resetProjectionStore();
    resetSettingsBridgeStore();
    resetUiStore();
    window.history.replaceState(null, '', '#/');
  });

  it('renders the default workbench route with the parity shell', async () => {
    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByText('do-what')).toBeTruthy();
      expect(screen.getByText('Workspaces')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'New Run' })).toBeTruthy();
      expect(screen.getByText('Fix session guard race')).toBeTruthy();
      expect(screen.getByText('Approval required before continuing')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
    });
  });

  it('opens the create-run modal from the workbench shell', async () => {
    render(<AppRoot />);

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'New Run' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Run' }));

    await waitFor(() => {
      expect(screen.getByText('Create Run')).toBeTruthy();
      expect(screen.getByText(/Workspace:/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start Run' })).toBeTruthy();
    });
  });

  it('navigates to the settings route and exposes runtime information', async () => {
    render(<AppRoot />);

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/settings');
      expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
      expect(screen.getByText('Settings')).toBeTruthy();
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
      expect(screen.getByText('Workspaces')).toBeTruthy();
    });
  });
});
