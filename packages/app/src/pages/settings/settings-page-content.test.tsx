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
import { resetAckOverlayStore } from '../../stores/ack-overlay';
import { resetHotStateStore, useHotStateStore } from '../../stores/hot-state';
import { resetSettingsBridgeStore } from '../../stores/settings-bridge';
import { resetUiStore } from '../../stores/ui';
import {
  DEFAULT_SETTINGS_FIXTURE,
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

  it('renders Chinese tab labels and engine cards on the engines tab', async () => {
    setAppServicesForTesting(createServices());

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeTruthy();
      expect(screen.getByText('Codex')).toBeTruthy();
      expect(screen.getAllByText('已连接').length).toBeGreaterThan(0);
    });

    // Tab labels should be in Chinese
    expect(screen.getByRole('button', { name: 'Soul' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '策略' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '环境' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '外观' })).toBeTruthy();
  });

  it('switches between tabs and shows correct content', async () => {
    setAppServicesForTesting(createServices());

    renderSettingsPage();

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Soul' }));
    expect(screen.getByText('记忆计算')).toBeTruthy();
    expect(screen.getByText('检查点')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '策略' }));
    expect(screen.getByText('工具审批规则')).toBeTruthy();
    expect(screen.getByText('自动审批模式')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '环境' }));
    expect(screen.getByText('工具链健康')).toBeTruthy();
    expect(screen.getByText('Worktree')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '外观' }));
    expect(screen.getByText('颜色主题')).toBeTruthy();
    expect(screen.getByText('字体排版')).toBeTruthy();
  });

  it('refreshes module status when clicking the health check button', async () => {
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
      expect(screen.getByText('Claude Code')).toBeTruthy();
    });

    // Click the first "重新检测" button
    const recheckButtons = screen.getAllByRole('button', { name: /重新检测/ });
    fireEvent.click(recheckButtons[0]);

    await waitFor(() => {
      expect(getWorkbenchSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});
