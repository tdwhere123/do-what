// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoot } from './app-root';
import {
  createEmptyInspectorSnapshot,
  createEmptyModulesSnapshot,
  createEmptyTimelinePage,
  createEmptyWorkbenchSnapshot,
} from '../lib/contracts';
import { CoreHttpError } from '../lib/core-http-client';
import { CoreSessionGuard } from '../lib/core-session-guard';
import {
  DEFERRED_HISTORY_COPY,
  DEFERRED_HISTORY_LABEL,
  DEFERRED_TO_V0_2_TITLE,
} from '../lib/ui-placeholders';
import { NormalizedEventBus } from '../lib/events';
import { resetAppServices, setAppServicesForTesting } from '../lib/runtime/app-services';
import { resetAckOverlayStore } from '../stores/ack-overlay';
import { resetHotStateStore } from '../stores/hot-state';
import { resetPendingCommandStore } from '../stores/pending-command';
import { resetProjectionStore } from '../stores/projection';
import { resetSettingsBridgeStore } from '../stores/settings-bridge';
import { resetUiStore } from '../stores/ui';

function createWorkbenchModules(
  overrides: Partial<{
    claude: Partial<ReturnType<typeof createEmptyModulesSnapshot>['engines']['claude']>;
    codex: Partial<ReturnType<typeof createEmptyModulesSnapshot>['engines']['codex']>;
    core: Partial<ReturnType<typeof createEmptyModulesSnapshot>['core']>;
    soul: Partial<ReturnType<typeof createEmptyModulesSnapshot>['soul']>;
  }> = {},
): ReturnType<typeof createEmptyModulesSnapshot> {
  const updatedAt = '2026-03-10T00:00:00.000Z';
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

function installRuntimeBridge(): void {
  Object.defineProperty(window, 'doWhatRuntime', {
    configurable: true,
    value: {
      coreSessionToken: 'mock-core-token',
      coreSessionTokenPath: 'C:/Users/lenovo/.do-what/run/session_token',
      openWorkspaceDirectory: vi.fn(async () => 'D:/makefun/do-what/do-what-new'),
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

function findPrimaryEmptyStateButton(): HTMLButtonElement {
  const button = screen
    .getAllByRole('button')
    .find(
      (candidate): candidate is HTMLButtonElement =>
        candidate instanceof HTMLButtonElement &&
        candidate.getAttribute('aria-label') !== 'Add Workspace' &&
        !candidate.disabled,
    );

  if (!button) {
    throw new Error('Expected an enabled empty-state action button.');
  }

  return button;
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
      const shell = document.querySelector('[data-route="workbench"]');
      expect(screen.getByText('do-what')).toBeTruthy();
      expect(screen.getByText('工作区')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add Workspace' })).toBeTruthy();
      expect(screen.getByRole('button', { name: '新建 Run' })).toBeTruthy();
      expect(screen.getByText('Fix session guard race')).toBeTruthy();
      expect(screen.getByText('Approval required before continuing')).toBeTruthy();
      expect(screen.getByRole('link', { name: '设置' })).toBeTruthy();
      expect(shell?.childElementCount).toBe(1);
      expect(shell?.firstElementChild?.tagName).toBe('MAIN');
    });
  });

  it('opens the create-run modal from the workbench shell', async () => {
    render(<AppRoot />);

    await waitFor(() => {
      expect((screen.getByRole('button', { name: '新建 Run' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: '新建 Run' }));

    await waitFor(() => {
      expect(screen.getByText('Create Run')).toBeTruthy();
      expect(screen.getByText(/Workspace:/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start Run' })).toBeTruthy();
    });
  });

  it('shows Open Workspace as the primary empty-state action when no workspace exists', async () => {
    setAppServicesForTesting({
      config: {
        baseUrl: 'http://127.0.0.1:3847',
        mockScenario: 'empty',
        readFreshSessionToken: () => 'mock-core-token',
        reconnectDelayMs: 1000,
        sessionToken: 'mock-core-token',
        transportMode: 'mock',
      },
      coreApi: {
        getApprovalProbe: vi.fn(),
        getInspectorSnapshot: vi.fn(),
        getMemoryProbe: vi.fn(),
        getSettingsSnapshot: vi.fn(),
        getTimelinePage: vi.fn(),
        getWorkbenchSnapshot: vi.fn().mockResolvedValue(
          createEmptyWorkbenchSnapshot({
            coreSessionId: 'mock-core-empty',
            modules: createWorkbenchModules({
              soul: {
                phase: 'ready',
                status: 'connected',
              },
            }),
          }),
        ),
        listTemplates: vi.fn().mockResolvedValue([]),
        postCommand: vi.fn(),
        probeCommand: vi.fn(),
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
    });

    render(<AppRoot />);

    await waitFor(() => {
      expect(findPrimaryEmptyStateButton()).toBeTruthy();
      expect(screen.queryByText('Create Run')).toBeNull();
      const historyButton = screen.getByRole('button', {
        name: DEFERRED_HISTORY_LABEL,
      }) as HTMLButtonElement;
      expect(historyButton.disabled).toBe(true);
      expect(historyButton.getAttribute('title')).toBe(DEFERRED_TO_V0_2_TITLE);
      expect(screen.getByText(DEFERRED_HISTORY_COPY)).toBeTruthy();
    });
  });

  it('opens a workspace from the empty state and syncs the sidebar tree', async () => {
    const getWorkbenchSnapshot = vi
      .fn()
      .mockResolvedValueOnce(
        createEmptyWorkbenchSnapshot({
          coreSessionId: 'mock-core-empty',
          modules: createWorkbenchModules({
            soul: {
              phase: 'ready',
              status: 'connected',
            },
          }),
        }),
      )
      .mockResolvedValueOnce(
        createEmptyWorkbenchSnapshot({
          coreSessionId: 'mock-core-opened',
          modules: createWorkbenchModules({
            codex: {
              phase: 'ready',
              status: 'connected',
            },
            soul: {
              phase: 'ready',
              status: 'connected',
            },
          }),
          revision: 7,
          workspaces: [
            {
              lastEventAt: '2026-03-10T09:31:00.000Z',
              name: 'do-what-new',
              runIds: [],
              status: 'idle',
              workspaceId: 'workspace-main',
            },
          ],
        }),
      );
    const postCommand = vi.fn().mockResolvedValue({
      ackId: 'ack-workspace-open-1',
      entityId: 'workspace-main',
      entityType: 'workspace',
      ok: true,
      revision: 7,
    });

    setAppServicesForTesting({
      config: {
        baseUrl: 'http://127.0.0.1:3847',
        mockScenario: 'empty',
        readFreshSessionToken: () => 'mock-core-token',
        reconnectDelayMs: 1000,
        sessionToken: 'mock-core-token',
        transportMode: 'mock',
      },
      coreApi: {
        getApprovalProbe: vi.fn(),
        getInspectorSnapshot: vi.fn(),
        getMemoryProbe: vi.fn(),
        getSettingsSnapshot: vi.fn(),
        getTimelinePage: vi.fn(),
        getWorkbenchSnapshot,
        listTemplates: vi.fn().mockResolvedValue([]),
        postCommand,
        probeCommand: vi.fn(),
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
    });

    render(<AppRoot />);

    await waitFor(() => {
      expect(findPrimaryEmptyStateButton()).toBeTruthy();
    });

    fireEvent.click(findPrimaryEmptyStateButton());

    await waitFor(() => {
      expect(window.doWhatRuntime.openWorkspaceDirectory).toHaveBeenCalledTimes(1);
      expect(postCommand).toHaveBeenCalledTimes(1);
      expect(screen.getByText('/do-what-new')).toBeTruthy();
      expect(screen.getAllByText('暂无运行').length).toBeGreaterThan(0);
    });
  });

  it('switches the active run and keeps the timeline, inspector, and send state in sync', async () => {
    const getTimelinePage = vi.fn(async ({ runId }: { readonly runId: string }) => {
      if (runId === 'run-active-1') {
        return createEmptyTimelinePage(runId, {
          entries: [
            {
              body: 'Codex is reconciling the approval overlay.',
              id: 'run-1-message',
              kind: 'message',
              meta: {
                engine: 'codex',
                laneId: 'integrator',
                laneLabel: 'Integrator',
              },
              runId,
              timestamp: '2026-03-10T09:21:00.000Z',
              title: 'Codex',
            },
          ],
          revision: 18,
        });
      }

      return createEmptyTimelinePage(runId, {
        entries: [
          {
            body: 'Claude prepared the follow-up integration plan.',
            id: 'run-2-message',
            kind: 'message',
            meta: {
              engine: 'claude',
              laneId: 'lead',
              laneLabel: 'Lead',
            },
            runId,
            timestamp: '2026-03-10T09:41:00.000Z',
            title: 'Claude',
          },
        ],
        revision: 22,
      });
    });
    const getInspectorSnapshot = vi.fn(async (runId: string) => {
      if (runId === 'run-active-1') {
        return createEmptyInspectorSnapshot(runId, {
          files: [
            {
              path: 'packages/app/src/overlay-reconciliation.ts',
              status: 'modified',
              summary: 'Keep optimistic state aligned with ack revisions',
            },
          ],
          overview: {
            engine: 'codex',
            workspaceName: 'do-what-new',
          },
          plans: [
            {
              id: 'plan-run-1',
              status: 'active',
              summary: 'Stabilize overlay reconciliation',
            },
          ],
          revision: 18,
        });
      }

      return createEmptyInspectorSnapshot(runId, {
        files: [
          {
            path: 'packages/core/src/server/module-probe.ts',
            status: 'modified',
            summary: 'Verify Claude reconnect behavior',
          },
        ],
        overview: {
          engine: 'claude',
          workspaceName: 'do-what-new',
        },
        plans: [
          {
            id: 'plan-run-2',
            status: 'active',
            summary: 'Finish Claude fallback validation',
          },
        ],
        revision: 22,
      });
    });

    setAppServicesForTesting({
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
        getInspectorSnapshot,
        getMemoryProbe: vi.fn(),
        getSettingsSnapshot: vi.fn(),
        getTimelinePage,
        getWorkbenchSnapshot: vi.fn().mockResolvedValue(
          createEmptyWorkbenchSnapshot({
            coreSessionId: 'mock-core-active',
            modules: createWorkbenchModules({
              claude: {
                phase: 'ready',
                status: 'connected',
              },
              codex: {
                phase: 'ready',
                status: 'connected',
              },
              soul: {
                phase: 'ready',
                status: 'connected',
              },
            }),
            revision: 22,
            runs: [
              {
                activeNodeId: 'node-integrator-1',
                approvalIds: [],
                engine: 'codex',
                lastEventAt: '2026-03-10T09:21:00.000Z',
                runId: 'run-active-1',
                status: 'running',
                title: 'Stabilize Codex approvals',
                workspaceId: 'workspace-main',
              },
              {
                activeNodeId: 'node-lead-2',
                approvalIds: [],
                engine: 'claude',
                lastEventAt: '2026-03-10T09:41:00.000Z',
                runId: 'run-active-2',
                status: 'running',
                title: 'Validate Claude fallback',
                workspaceId: 'workspace-main',
              },
            ],
            workspaces: [
              {
                lastEventAt: '2026-03-10T09:41:00.000Z',
                name: 'do-what-new',
                runIds: ['run-active-1', 'run-active-2'],
                status: 'running',
                workspaceId: 'workspace-main',
              },
            ],
          }),
        ),
        listTemplates: vi.fn().mockResolvedValue([]),
        postCommand: vi.fn(),
        probeCommand: vi.fn(),
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
    });

    render(<AppRoot />);

    await waitFor(() => {
      expect(screen.getByText('Codex is reconciling the approval overlay.')).toBeTruthy();
      expect(screen.getByText('packages/app/src/overlay-reconciliation.ts')).toBeTruthy();
      expect(screen.getByText('Stabilize overlay reconciliation')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('Continue Stabilize Codex approvals...'), {
      target: { value: 'Continue with the Codex pass.' },
    });
    expect(
      (screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Validate Claude fallback' }));

    await waitFor(() => {
      expect(screen.getByText('Claude prepared the follow-up integration plan.')).toBeTruthy();
      expect(screen.getByText('packages/core/src/server/module-probe.ts')).toBeTruthy();
      expect(screen.getByText('Finish Claude fallback validation')).toBeTruthy();
      expect(screen.queryByText('Codex is reconciling the approval overlay.')).toBeNull();
      expect(screen.queryByText('packages/app/src/overlay-reconciliation.ts')).toBeNull();
    });

    expect(getTimelinePage).toHaveBeenCalledWith({ limit: 50, runId: 'run-active-1' });
    expect(getTimelinePage).toHaveBeenCalledWith({ limit: 50, runId: 'run-active-2' });
    expect(getInspectorSnapshot).toHaveBeenCalledWith('run-active-1');
    expect(getInspectorSnapshot).toHaveBeenCalledWith('run-active-2');
  });

  it('disables the composer with a clear explanation when the selected run engine is unavailable', async () => {
    setAppServicesForTesting({
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
        getInspectorSnapshot: vi
          .fn()
          .mockResolvedValue(createEmptyInspectorSnapshot('run-active-1', { revision: 12 })),
        getMemoryProbe: vi.fn(),
        getSettingsSnapshot: vi.fn(),
        getTimelinePage: vi
          .fn()
          .mockResolvedValue(createEmptyTimelinePage('run-active-1', { revision: 12 })),
        getWorkbenchSnapshot: vi.fn().mockResolvedValue(
          createEmptyWorkbenchSnapshot({
            coreSessionId: 'mock-core-active',
            modules: createWorkbenchModules({
              claude: {
                phase: 'degraded',
                reason: 'session token missing',
                status: 'probe_failed',
              },
              soul: {
                phase: 'ready',
                status: 'connected',
              },
            }),
            revision: 12,
            runs: [
              {
                activeNodeId: 'node-review-1',
                approvalIds: [],
                engine: 'claude',
                lastEventAt: '2026-03-10T09:41:00.000Z',
                runId: 'run-active-1',
                status: 'running',
                title: 'Reconnect Claude',
                workspaceId: 'workspace-main',
              },
            ],
            workspaces: [
              {
                lastEventAt: '2026-03-10T09:41:00.000Z',
                name: 'do-what-new',
                runIds: ['run-active-1'],
                status: 'running',
                workspaceId: 'workspace-main',
              },
            ],
          }),
        ),
        listTemplates: vi.fn().mockResolvedValue([]),
        postCommand: vi.fn(),
        probeCommand: vi.fn(),
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
    });

    render(<AppRoot />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Claude is unavailable for this run. Open Settings > Engines to reconnect it.',
        ),
      ).toBeTruthy();
    });

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('navigates to the settings route, shows the non-persistent banner, and exposes runtime information', async () => {
    render(<AppRoot />);

    fireEvent.click(screen.getByRole('link', { name: '设置' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/settings');
      expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy();
      expect(screen.getByText('Settings')).toBeTruthy();
      expect(screen.getByRole('note').textContent).toContain('v0.2');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    expect(screen.getByText('Electron')).toBeTruthy();
    expect(screen.getAllByText('35.7.5').length).toBeGreaterThan(0);
    expect(screen.getByText('Chrome')).toBeTruthy();
    expect(screen.getByText('134.0.0.0')).toBeTruthy();
    expect(screen.getByText('Node')).toBeTruthy();
    expect(screen.getAllByText('22.14.0').length).toBeGreaterThan(0);
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
      expect(screen.getByText('Code: auth_required | HTTP 401')).toBeTruthy();
      const statusLine = screen.getByText(/Module status:/);
      expect(statusLine.textContent).toContain('Core');
      expect(statusLine.textContent).toContain('Network healthy');
      expect(statusLine.textContent).toContain('Claude booting');
      expect(statusLine.textContent).toContain('Codex booting');
      expect(statusLine.textContent).toContain('Soul booting');
    });

    expect(screen.queryByRole('heading', { name: /Core/ })).toBeNull();
  });

  it('shows a snapshot-stage error for non-auth bootstrap failures', async () => {
    const eventBus = new NormalizedEventBus();
    const getWorkbenchSnapshot = vi.fn().mockRejectedValue(
      new CoreHttpError(
        {
          code: 'snapshot_unavailable',
          message: 'Snapshot query failed',
        },
        500,
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
      expect(screen.getByText('Stage: Workbench Snapshot')).toBeTruthy();
      expect(screen.getByText('Snapshot query failed')).toBeTruthy();
      expect(screen.getByText('Code: snapshot_unavailable | HTTP 500')).toBeTruthy();
    });
  });

  it('shows a module-stage error when runtime initialization fails after snapshot success', async () => {
    const eventBus = new NormalizedEventBus();
    const getWorkbenchSnapshot = vi.fn().mockResolvedValue(
      createEmptyWorkbenchSnapshot({
        coreSessionId: 'core-session-1',
        modules: createWorkbenchModules(),
      }),
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
        start: vi.fn(() => {
          throw new Error('Event stream failed to initialize');
        }),
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
      expect(screen.getByText('Stage: Module Initialization')).toBeTruthy();
      expect(screen.getByText('Event stream failed to initialize')).toBeTruthy();
      const statusLine = screen.getByText(/Module status:/);
      expect(statusLine.textContent).toContain('Core');
      expect(statusLine.textContent).toContain('Network healthy');
      expect(statusLine.textContent).toContain('Claude');
      expect(statusLine.textContent).toContain('Codex');
      expect(statusLine.textContent).toContain('Soul');
    });
  });

  it('redirects unknown hash routes back to the workbench shell', async () => {
    setMockLocation('/unexpected');

    render(<AppRoot />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
      expect(screen.getByText('工作区')).toBeTruthy();
    });
  });
});

