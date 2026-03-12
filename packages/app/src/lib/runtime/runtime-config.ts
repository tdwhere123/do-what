import type { MockScenarioName } from '../mocks';

export type CoreTransportMode = 'http' | 'mock';

export interface RuntimeCoreConfig {
  readonly baseUrl: string;
  readonly mockScenario: MockScenarioName;
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
  return value === 'http' ? 'http' : 'mock';
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

export function getRuntimeCoreConfig(): RuntimeCoreConfig {
  const runtimeToken = window.doWhatRuntime?.coreSessionToken ?? null;
  const urlTransport = readUrlSearchParam('transport');
  const urlMockScenario = readUrlSearchParam('mockScenario');
  const urlBaseUrl = readUrlSearchParam('coreBaseUrl');

  return {
    baseUrl: urlBaseUrl ?? import.meta.env.VITE_CORE_BASE_URL ?? DEFAULT_BASE_URL,
    mockScenario: readMockScenario(urlMockScenario ?? import.meta.env.VITE_CORE_MOCK_SCENARIO),
    reconnectDelayMs: readReconnectDelay(import.meta.env.VITE_CORE_RECONNECT_DELAY_MS),
    sessionToken: import.meta.env.VITE_CORE_SESSION_TOKEN ?? runtimeToken,
    transportMode: readTransportMode(urlTransport ?? import.meta.env.VITE_CORE_TRANSPORT),
  };
}
