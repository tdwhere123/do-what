// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_WORKBENCH_FIXTURE } from '../test/fixtures';
import { CoreServicesBootstrap } from './core-services-bootstrap';
import { CoreSessionGuard } from '../lib/core-session-guard';
import { CoreHttpError } from '../lib/core-http-client';
import { NormalizedEventBus } from '../lib/events';
import { resetAppServices, setAppServicesForTesting } from '../lib/runtime/app-services';
import { resetAckOverlayStore } from '../stores/ack-overlay';
import { resetHotStateStore } from '../stores/hot-state';
import { resetPendingCommandStore } from '../stores/pending-command';
import { resetProjectionStore } from '../stores/projection';
import { resetSettingsBridgeStore } from '../stores/settings-bridge';
import { resetUiStore, useUiStore } from '../stores/ui';

function resetAppStores(): void {
  resetAckOverlayStore();
  resetHotStateStore();
  resetPendingCommandStore();
  resetProjectionStore();
  resetSettingsBridgeStore();
  resetUiStore();
}

async function flushMicrotasks(iterations = 4): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe('CoreServicesBootstrap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAppServices();
    resetAppStores();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    cleanup();
    resetAppServices();
    resetAppStores();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('treats a reachable Core without a session token as an auth bootstrap failure until retry succeeds', async () => {
    const eventBus = new NormalizedEventBus();
    const readFreshSessionToken = vi
      .fn(() => 'mock-core-token' as string | null)
      .mockReturnValueOnce(null as string | null);
    const getWorkbenchSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error('initial hot-state refresh failed'))
      .mockResolvedValueOnce(ACTIVE_WORKBENCH_FIXTURE);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

    setAppServicesForTesting({
      config: {
        baseUrl: 'http://127.0.0.1:3847',
        mockScenario: 'active',
        readFreshSessionToken,
        reconnectDelayMs: 1000,
        sessionToken: null,
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
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    render(<CoreServicesBootstrap />);

    await flushMicrotasks();

    expect(useUiStore.getState().bootstrapStatus).toBe('error');
    expect(useUiStore.getState().bootstrapFailureStage).toBe('auth');
    expect(useUiStore.getState().bootstrapFailureCode).toBe('session_token_unavailable');
    expect(useUiStore.getState().bootstrapError).toBe(
      'Core is reachable, but the session token is not available yet.',
    );

    await vi.advanceTimersByTimeAsync(3000);
    await flushMicrotasks();

    expect(useUiStore.getState().bootstrapStatus).toBe('ready');
    expect(getWorkbenchSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readFreshSessionToken).toHaveBeenCalledTimes(2);
  });

  it('classifies module initialization failures after snapshot bootstrap', async () => {
    const eventBus = new NormalizedEventBus();
    const getWorkbenchSnapshot = vi.fn().mockResolvedValue(ACTIVE_WORKBENCH_FIXTURE);

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
          throw new Error('SSE handshake failed');
        }),
        stop: vi.fn(),
      },
      sessionGuard: new CoreSessionGuard(),
      templateRegistry: {
        listTemplates: vi.fn().mockResolvedValue([]),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch);

    render(<CoreServicesBootstrap />);

    await flushMicrotasks();

    expect(useUiStore.getState().bootstrapStatus).toBe('error');
    expect(useUiStore.getState().bootstrapFailureStage).toBe('modules');
    expect(useUiStore.getState().bootstrapFailureCode).toBe('module_init_failed');
    expect(useUiStore.getState().bootstrapError).toBe('SSE handshake failed');
  });
});
