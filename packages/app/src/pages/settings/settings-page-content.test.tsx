// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import {
  createEmptyModulesSnapshot,
  createEmptyWorkbenchSnapshot,
} from '../../lib/contracts';
import { CoreSessionGuard } from '../../lib/core-session-guard';
import { NormalizedEventBus } from '../../lib/events';
import {
  resetAppServices,
  setAppServicesForTesting,
  type AppServices,
} from '../../lib/runtime/app-services';
import { resetAckOverlayStore, useAckOverlayStore } from '../../stores/ack-overlay';
import { resetHotStateStore, useHotStateStore } from '../../stores/hot-state';
import { resetSettingsBridgeStore } from '../../stores/settings-bridge';
import { resetUiStore } from '../../stores/ui';
import {
  DEFAULT_SETTINGS_FIXTURE,
  LEASE_LOCKED_SETTINGS_FIXTURE,
} from '../../test/fixtures/settings-fixtures';
import { SettingsPageContent } from './settings-page-content';

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

function createWorkbenchModules(
  overrides: Partial<{
    claude: Partial<ReturnType<typeof createEmptyModulesSnapshot>['engines']['claude']>;
    codex: Partial<ReturnType<typeof createEmptyModulesSnapshot>['engines']['codex']>;
    core: Partial<ReturnType<typeof createEmptyModulesSnapshot>['core']>;
    soul: Partial<ReturnType<typeof createEmptyModulesSnapshot>['soul']>;
  }> = {},
): ReturnType<typeof createEmptyModulesSnapshot> {
  const updatedAt = '2026-03-14T08:00:00.000Z';
  const modules = createEmptyModulesSnapshot();
  return {
    core: {
      ...modules.core,
      phase: 'ready',
      status: 'connected',
      updatedAt,
      ...overrides.core,
    },
    engines: {
      claude: {
        ...modules.engines.claude,
        updatedAt,
        ...overrides.claude,
      },
      codex: {
        ...modules.engines.codex,
        updatedAt,
        ...overrides.codex,
      },
    },
    soul: {
      ...modules.soul,
      updatedAt,
      ...overrides.soul,
    },
  };
}

function seedModules(
  modules = createWorkbenchModules({
    claude: {
      phase: 'ready',
      reason: 'Claude bridge connected.',
      status: 'connected',
    },
    codex: {
      phase: 'ready',
      reason: 'Codex bridge connected.',
      status: 'connected',
    },
    soul: {
      phase: 'ready',
      reason: 'Soul initialized.',
      status: 'connected',
    },
  }),
): void {
  useHotStateStore.getState().applyWorkbenchSnapshot(
    createEmptyWorkbenchSnapshot({
      coreSessionId: 'mock-core-settings',
      modules,
      revision: 5,
    }),
  );
}

function createServices(
  overrides: Partial<AppServices['coreApi']> = {},
): AppServices {
  return {
    config: {
      baseUrl: 'http://127.0.0.1:3847',
      mockScenario: 'active',
      readFreshSessionToken: () => 'mock-core-token',
      reconnectDelayMs: 1000,
      sessionToken: 'mock-core-token',
      transportMode: 'mock',
    },
    coreApi: {
      getApprovalProbe: vi.fn(),
      getInspectorSnapshot: vi.fn(),
      getMemoryProbe: vi.fn(),
      getSettingsSnapshot: vi.fn().mockResolvedValue(DEFAULT_SETTINGS_FIXTURE),
      getTimelinePage: vi.fn(),
      getWorkbenchSnapshot: vi.fn().mockResolvedValue(
        createEmptyWorkbenchSnapshot({
          coreSessionId: 'mock-core-settings',
          modules: createWorkbenchModules(),
        }),
      ),
      listTemplates: vi.fn().mockResolvedValue([]),
      postCommand: vi.fn(),
      probeCommand: vi.fn(),
      ...overrides,
    },
    eventBus: new NormalizedEventBus(),
    eventClient: {
      start: vi.fn(() => () => {}),
      stop: vi.fn(),
    },
    sessionGuard: new CoreSessionGuard(),
    templateRegistry: {
      listTemplates: vi.fn().mockResolvedValue([]),
    },
  };
}

function renderSettingsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SettingsPageContent />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('SettingsPageContent', () => {
  beforeEach(() => {
    installRuntimeBridge();
    resetAppServices();
    resetAckOverlayStore();
    resetHotStateStore();
    resetSettingsBridgeStore();
    resetUiStore();
    vi.unstubAllGlobals();
    seedModules();
  });

  afterEach(() => {
    cleanup();
    resetAppServices();
    resetAckOverlayStore();
    resetHotStateStore();
    resetSettingsBridgeStore();
    resetUiStore();
    vi.unstubAllGlobals();
  });

  it('renders distinct settings domains across tabs', async () => {
    setAppServicesForTesting(createServices());

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('Module Topology')).toBeTruthy();
      expect(screen.getByText('Run Defaults')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Soul' }));
    expect(screen.getByText('Memory Computation')).toBeTruthy();
    expect(screen.getByText('Storage')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Policies' }));
    expect(screen.getByText('Tool Approval Policy')).toBeTruthy();
    expect(screen.getByText('Lease & Writes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));
    expect(screen.getByText('Runtime')).toBeTruthy();
    expect(screen.getByText('Core & Filesystem')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByText('Theme Direction')).toBeTruthy();
    expect(screen.getByText('Typography')).toBeTruthy();
  });

  it('refreshes module status from the live workbench snapshot on the engines tab', async () => {
    seedModules(
      createWorkbenchModules({
        claude: {
          phase: 'degraded',
          reason: 'Session token unavailable.',
          status: 'auth_failed',
        },
        codex: {
          phase: 'ready',
          reason: 'Codex bridge connected.',
          status: 'connected',
        },
      }),
    );

    const getWorkbenchSnapshot = vi.fn().mockResolvedValue(
      createEmptyWorkbenchSnapshot({
        coreSessionId: 'mock-core-settings',
        modules: createWorkbenchModules({
          claude: {
            phase: 'ready',
            reason: 'Recovered after session token retry.',
            status: 'connected',
          },
          codex: {
            phase: 'ready',
            reason: 'Codex bridge connected.',
            status: 'connected',
          },
          soul: {
            phase: 'ready',
            reason: 'Soul initialized.',
            status: 'connected',
          },
        }),
        revision: 8,
      }),
    );

    setAppServicesForTesting(
      createServices({
        getWorkbenchSnapshot,
      }),
    );

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('Session token unavailable.')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Module Status' }));

    await waitFor(() => {
      expect(getWorkbenchSnapshot).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Recovered after session token retry.')).toBeTruthy();
    });
  });

  it('shows lease locks and desynced settings overlays in the policies tab', async () => {
    useAckOverlayStore.getState().stagePendingEntry({
      action: 'settings.save',
      clientCommandId: 'settings-save-1',
      coreSessionIdAtSend: 'mock-core-settings',
      createdAt: '2026-03-14T08:10:00.000Z',
      entityId: 'settings',
      entityType: 'settings',
      reconcileTarget: {
        entityType: 'settings',
      },
      runId: null,
      status: 'pending',
      updatedAt: '2026-03-14T08:10:00.000Z',
      workspaceId: null,
    });
    useAckOverlayStore
      .getState()
      .markDesynced('settings-save-1', 'Settings snapshot drifted after lease handoff.');

    setAppServicesForTesting(
      createServices({
        getSettingsSnapshot: vi.fn().mockResolvedValue(LEASE_LOCKED_SETTINGS_FIXTURE),
      }),
    );

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('Module Topology')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Policies' }));

    await waitFor(() => {
      expect(screen.getByText('Tool Approval Policy')).toBeTruthy();
      expect(screen.getByText('Lease & Writes')).toBeTruthy();
      expect(screen.getByText('policy.autoApprove')).toBeTruthy();
      expect(screen.getByText('soul.mode')).toBeTruthy();
      expect(screen.getByText('Settings Overlays')).toBeTruthy();
      expect(
        screen.getByText('Settings snapshot drifted after lease handoff.'),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry Sync' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    });
  });
});
