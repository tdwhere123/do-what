import type { MockScenarioName } from '../mocks';

export type CoreTransportMode = 'http' | 'mock';

export interface RuntimeCoreConfig {
  readonly baseUrl: string;
  readonly mockScenario: MockScenarioName;
  readonly readFreshSessionToken: (() => string | null) | null;
  readonly reconnectDelayMs: number;
  readonly sessionToken: string | null;
  readonly transportMode: CoreTransportMode;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3847';
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

function readUrlSearchParam(key: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return new URLSearchParams(window.location.search).get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function readTransportMode(value: string | undefined): CoreTransportMode {
  return value === 'mock' ? 'mock' : 'http';
}

function readMockScenario(value: string | undefined): MockScenarioName {
  switch (value) {
    case 'desynced':
    case 'empty':
    case 'lease_locked':
      return value;
    default:
      return 'active';
  }
}

function readReconnectDelay(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_RECONNECT_DELAY_MS;
}

function readWindowOrigin(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.location.origin;
  } catch {
    return undefined;
  }
}

function readBaseUrl(
  transportMode: CoreTransportMode,
  urlBaseUrl: string | undefined,
): string {
  if (urlBaseUrl) {
    return urlBaseUrl;
  }

  if (transportMode === 'http' && import.meta.env.DEV) {
    const origin = readWindowOrigin();
    if (origin) {
      return origin;
    }
  }

  return import.meta.env.VITE_CORE_BASE_URL ?? DEFAULT_BASE_URL;
}

export function getRuntimeCoreConfig(): RuntimeCoreConfig {
  const runtimeToken = window.doWhatRuntime?.coreSessionToken ?? null;
  const urlTransport = readUrlSearchParam('transport');
  const urlMockScenario = readUrlSearchParam('mockScenario');
  const urlBaseUrl = readUrlSearchParam('coreBaseUrl');
  const transportMode = readTransportMode(urlTransport ?? import.meta.env.VITE_CORE_TRANSPORT);

  return {
    baseUrl: readBaseUrl(transportMode, urlBaseUrl),
    mockScenario: readMockScenario(urlMockScenario ?? import.meta.env.VITE_CORE_MOCK_SCENARIO),
    readFreshSessionToken: window.doWhatRuntime?.readFreshSessionToken ?? null,
    reconnectDelayMs: readReconnectDelay(import.meta.env.VITE_CORE_RECONNECT_DELAY_MS),
    sessionToken: import.meta.env.VITE_CORE_SESSION_TOKEN ?? runtimeToken,
    transportMode,
  };
}
