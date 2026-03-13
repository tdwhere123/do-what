// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoot } from './app-root';
import { CoreHttpError } from '../lib/core-http-client';
import { CoreSessionGuard } from '../lib/core-session-guard';
import { NormalizedEventBus } from '../lib/events';
import { resetAppServices, setAppServicesForTesting } from '../lib/runtime/app-services';
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

function setMockLocation(hash = '/'): void {
  window.history.replaceState(null, '', `/?transport=mock#${hash}`);
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
    vi.unstubAllGlobals();
    setMockLocation('/');
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
    vi.unstubAllGlobals();
    setMockLocation('/');
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

  it('navigates to the settings route, shows the non-persistent banner, and exposes runtime information', async () => {
    render(<AppRoot />);

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/settings');
      expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
      expect(screen.getByText('Settings')).toBeTruthy();
      expect(screen.getByRole('note').textContent).toContain('v0.2');
    });

    expect(screen.getByText('Electron')).toBeTruthy();
    expect(screen.getByText('35.7.5')).toBeTruthy();
    expect(screen.getByText('Chrome')).toBeTruthy();
    expect(screen.getByText('134.0.0.0')).toBeTruthy();
    expect(screen.getByText('Node')).toBeTruthy();
    expect(screen.getByText('22.14.0')).toBeTruthy();
  });

  it('shows the Core offline screen when HTTP bootstrap cannot reach Core', async () => {
    const eventBus = new NormalizedEventBus();
    const getWorkbenchSnapshot = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

    setAppServicesForTesting({
      config: {
        baseUrl: 'http://127.0.0.1:3847',
        mockScenario: 'active',
        readFreshSessionToken: null,
        reconnectDelayMs: 1000,
        sessionToken: 'mock-core-token',
        transportMode: 'http',
      },
      coreApi: {
        getApprovalProbe: vi.fn(),
        getInspectorSnapshot: vi.fn(),
        getMemoryProbe: vi.fn(),
        getSettingsSnapshot: vi.fn(),
        getTimelinePage: vi.fn(),
        getWorkbenchSnapshot,
        listTemplates: vi.fn().mockResolvedValue([]),
        postCommand: vi.fn(),
        probeCommand: vi.fn(),
      },
      eventBus,
      eventClient: {
        start: vi.fn(() => () => {}),
        stop: vi.fn(),
      },
      sessionGuard: new CoreSessionGuard(),
      templateRegistry: {
        listTemplates: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    window.history.replaceState(null, '', '#/');

    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Core/ })).toBeTruthy();
      expect(screen.getByText('pnpm dev:core')).toBeTruthy();
    });
  });

  it('shows bootstrap diagnostics when the snapshot request is rejected by Core auth', async () => {
    const eventBus = new NormalizedEventBus();
    const getWorkbenchSnapshot = vi.fn().mockRejectedValue(
      new CoreHttpError(
        {
          code: 'auth_required',
          message: 'Unauthorized',
        },
        401,
      ),
    );

    setAppServicesForTesting({
      config: {
        baseUrl: 'http://127.0.0.1:3847',
        mockScenario: 'active',
        readFreshSessionToken: () => 'mock-core-token',
        reconnectDelayMs: 1000,
        sessionToken: 'mock-core-token',
        transportMode: 'http',
      },
      coreApi: {
        getApprovalProbe: vi.fn(),
        getInspectorSnapshot: vi.fn(),
        getMemoryProbe: vi.fn(),
        getSettingsSnapshot: vi.fn(),
        getTimelinePage: vi.fn(),
        getWorkbenchSnapshot,
        listTemplates: vi.fn().mockResolvedValue([]),
        postCommand: vi.fn(),
        probeCommand: vi.fn(),
      },
      eventBus,
      eventClient: {
        start: vi.fn(() => () => {}),
        stop: vi.fn(),
      },
      sessionGuard: new CoreSessionGuard(),
      templateRegistry: {
        listTemplates: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch);
    window.history.replaceState(null, '', '#/');

    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByText('Workbench bootstrap failed')).toBeTruthy();
      expect(screen.getByText('Stage: Authentication')).toBeTruthy();
      expect(screen.getByText('Unauthorized')).toBeTruthy();
      expect(screen.getByText('Code: auth_required ¡¤ HTTP 401')).toBeTruthy();
      expect(
        screen.getByText(
          'Module status: Core degraded ¡¤ Network healthy ¡¤ Claude booting ¡¤ Codex booting ¡¤ Soul booting',
        ),
      ).toBeTruthy();
    });

    expect(screen.queryByText('Core Î´ÔËÐÐ')).toBeNull();
  });

  it('redirects unknown hash routes back to the workbench shell', async () => {
    setMockLocation('/unexpected');

    render(<AppRoot />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
      expect(screen.getByText('Workspaces')).toBeTruthy();
    });
  });
});
