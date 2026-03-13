import type { CoreError, WorkbenchHealthSnapshot, WorkbenchSnapshot } from '@do-what/protocol';
import { useEffect } from 'react';
import { normalizeCoreError } from '../lib/contracts';
import { buildCoreUrl, CoreHttpError } from '../lib/core-http-client';
import { getAppServices, type AppServices } from '../lib/runtime/app-services';
import { startAppStoreRuntime } from '../stores/app-store-runtime';
import { useHotStateStore } from '../stores/hot-state';
import { useUiStore, type BootstrapFailureStage } from '../stores/ui';

interface ClassifiedBootstrapFailure {
  readonly code: string;
  readonly error: CoreError;
  readonly stage: BootstrapFailureStage;
  readonly status: number | null;
}

async function isCoreReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(buildCoreUrl(baseUrl, '/health'));
    return response.ok;
  } catch {
    return false;
  }
}

function readCurrentSessionToken(services: AppServices): string | null {
  return services.config.readFreshSessionToken?.() ?? services.config.sessionToken;
}

function readErrorStatus(error: unknown): number | null {
  if (error instanceof CoreHttpError) {
    return error.status;
  }

  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

function readCoreError(error: unknown, fallbackMessage: string): CoreError {
  if (error instanceof CoreHttpError) {
    return error.coreError;
  }

  return normalizeCoreError(error, fallbackMessage);
}

function resolveFailureCode(error: CoreError, status: number | null, fallback: string): string {
  if (error.code !== 'core_error') {
    return error.code;
  }

  if (status !== null) {
    return `http_${status}`;
  }

  return fallback;
}

function isAuthFailure(error: CoreError, status: number | null): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  const message = error.message.toLowerCase();
  const code = error.code.toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    code.includes('auth') ||
    code.includes('token') ||
    code.includes('session')
  );
}

function isUnresolvedModule(
  module: WorkbenchSnapshot['modules']['core'],
): boolean {
  return module.phase === 'probing' || module.status === 'disconnected';
}

function buildBootstrapHealth(
  connectionState: 'connected' | 'disconnected',
  failureStage?: BootstrapFailureStage,
): WorkbenchHealthSnapshot {
  const current = useHotStateStore.getState();
  const unresolvedStatus =
    connectionState === 'disconnected'
      ? 'offline'
      : failureStage === 'modules'
        ? 'degraded'
        : 'booting';

  return {
    claude: isUnresolvedModule(current.modules.engines.claude)
      ? unresolvedStatus
      : current.health.claude,
    codex: isUnresolvedModule(current.modules.engines.codex)
      ? unresolvedStatus
      : current.health.codex,
    core: connectionState === 'disconnected' ? 'offline' : 'degraded',
    network: connectionState === 'disconnected' ? 'offline' : 'healthy',
    soul: isUnresolvedModule(current.modules.soul)
      ? unresolvedStatus
      : current.health.soul,
  };
}

function classifyBootstrapFailure(
  error: unknown,
  sessionToken: string | null,
): ClassifiedBootstrapFailure {
  const normalized = readCoreError(error, 'Failed to bootstrap workbench');
  const status = readErrorStatus(error);

  if (sessionToken === null) {
    return {
      code: 'session_token_unavailable',
      error: {
        code: 'session_token_unavailable',
        details: {
          retryable: true,
        },
        message: 'Core is reachable, but the session token is not available yet.',
      },
      stage: 'auth',
      status,
    };
  }

  if (isAuthFailure(normalized, status)) {
    return {
      code: resolveFailureCode(normalized, status, 'auth_failed'),
      error: normalized,
      stage: 'auth',
      status,
    };
  }

  return {
    code: resolveFailureCode(normalized, status, 'snapshot_failed'),
    error: normalized,
    stage: 'snapshot',
    status,
  };
}

function classifyModuleBootstrapFailure(error: unknown): ClassifiedBootstrapFailure {
  const normalized = readCoreError(error, 'Failed to initialize workbench modules');
  const status = readErrorStatus(error);

  return {
    code: resolveFailureCode(normalized, status, 'module_init_failed'),
    error: normalized,
    stage: 'modules',
    status,
  };
}

function shouldRetryBootstrap(): boolean {
  const state = useUiStore.getState();
  return (
    state.bootstrapStatus === 'offline' ||
    state.bootstrapFailureCode === 'session_token_unavailable'
  );
}

function setBootstrapError(failure: ClassifiedBootstrapFailure): void {
  useHotStateStore.getState().applyBootstrapDiagnostics({
    connectionState: 'connected',
    error: failure.error,
    health: buildBootstrapHealth('connected', failure.stage),
  });
  useUiStore.getState().setBootstrapState('error', {
    bootstrapError: failure.error.message,
    failureCode: failure.code,
    failureStage: failure.stage,
    failureStatus: failure.status,
  });
}

function setBootstrapOffline(): void {
  useHotStateStore.getState().applyBootstrapDiagnostics({
    connectionState: 'disconnected',
    error: null,
    health: buildBootstrapHealth('disconnected'),
  });
  useUiStore.getState().setBootstrapState('offline', {
    bootstrapError: 'Core is not reachable yet.',
    failureCode: 'core_unreachable',
    failureStage: 'connection',
  });
}

function startWorkbenchRuntime(
  services: AppServices,
  bootstrapSnapshot: WorkbenchSnapshot,
): { cleanupStores: () => void; stopEvents: () => void } {
  const cleanupStores = startAppStoreRuntime(services, {
    bootstrapSnapshot,
  });

  try {
    const stopEvents = services.eventClient.start();
    return {
      cleanupStores,
      stopEvents,
    };
  } catch (error) {
    cleanupStores();
    throw error;
  }
}

function startMockBootstrap(services: AppServices): () => void {
  let cleanupStores: (() => void) | null = null;
  let stopEvents: (() => void) | null = null;
  let disposed = false;

  useUiStore.getState().setBootstrapState('loading');

  const bootstrap = async () => {
    try {
      const bootstrapSnapshot = await services.coreApi.getWorkbenchSnapshot();
      if (disposed) {
        return;
      }

      try {
        const runtime = startWorkbenchRuntime(services, bootstrapSnapshot);
        cleanupStores = runtime.cleanupStores;
        stopEvents = runtime.stopEvents;
      } catch (error) {
        setBootstrapError(classifyModuleBootstrapFailure(error));
        return;
      }

      useUiStore.getState().setBootstrapState('ready');
    } catch (error) {
      if (!disposed) {
        setBootstrapError(classifyBootstrapFailure(error, readCurrentSessionToken(services)));
      }
    }
  };

  void bootstrap();

  return () => {
    disposed = true;
    stopEvents?.();
    cleanupStores?.();
  };
}

function startHttpBootstrap(services: AppServices): () => void {
  let disposed = false;
  let retrying = false;
  let bootstrapRetryTimer: ReturnType<typeof setInterval> | null = null;
  let cleanupStores: (() => void) | null = null;
  let stopEvents: (() => void) | null = null;

  useUiStore.getState().setBootstrapState('loading');

  const loadSnapshot = async (): Promise<void> => {
    try {
      const snapshot = await services.coreApi.getWorkbenchSnapshot();
      if (disposed) {
        return;
      }

      try {
        const runtime = startWorkbenchRuntime(services, snapshot);
        cleanupStores = runtime.cleanupStores;
        stopEvents = runtime.stopEvents;
      } catch (error) {
        setBootstrapError(classifyModuleBootstrapFailure(error));
        return;
      }

      useUiStore.getState().setBootstrapState('ready');
    } catch (error) {
      if (disposed) {
        return;
      }

      const reachable = await isCoreReachable(services.config.baseUrl);
      if (!reachable) {
        setBootstrapOffline();
        startBootstrapRetry();
        return;
      }

      const failure = classifyBootstrapFailure(error, readCurrentSessionToken(services));
      setBootstrapError(failure);
      if (failure.code === 'session_token_unavailable') {
        startBootstrapRetry();
      }
    }
  };

  function startBootstrapRetry(): void {
    if (bootstrapRetryTimer) {
      return;
    }

    bootstrapRetryTimer = setInterval(() => {
      if (disposed) {
        clearInterval(bootstrapRetryTimer!);
        bootstrapRetryTimer = null;
        return;
      }

      if (!shouldRetryBootstrap() || retrying) {
        clearInterval(bootstrapRetryTimer!);
        bootstrapRetryTimer = null;
        return;
      }

      void isCoreReachable(services.config.baseUrl).then((reachable) => {
        if (!reachable || disposed) {
          return;
        }

        if (
          useUiStore.getState().bootstrapFailureCode === 'session_token_unavailable' &&
          readCurrentSessionToken(services) === null
        ) {
          return;
        }

        clearInterval(bootstrapRetryTimer!);
        bootstrapRetryTimer = null;
        retrying = true;
        useUiStore.getState().setBootstrapState('loading');
        void loadSnapshot().finally(() => {
          retrying = false;
        });
      });
    }, 3000);
  }

  void loadSnapshot();

  return () => {
    disposed = true;
    if (bootstrapRetryTimer) {
      clearInterval(bootstrapRetryTimer);
      bootstrapRetryTimer = null;
    }
    stopEvents?.();
    cleanupStores?.();
  };
}

export function CoreServicesBootstrap() {
  useEffect(() => {
    const services = getAppServices();
    return services.config.transportMode === 'http'
      ? startHttpBootstrap(services)
      : startMockBootstrap(services);
  }, []);

  return null;
}
