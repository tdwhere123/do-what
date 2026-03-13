// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeCoreConfig } from './runtime-config';

function installRuntimeBridge() {
  const readFreshSessionToken = vi.fn(() => 'fresh-token');

  Object.defineProperty(window, 'doWhatRuntime', {
    configurable: true,
    value: {
      coreSessionToken: 'runtime-token',
      coreSessionTokenPath: 'C:/Users/lenovo/.do-what/run/session_token',
      readFreshSessionToken,
      platform: 'win32',
      versions: {
        chrome: '134.0.0.0',
        electron: '35.7.5',
        node: '22.14.0',
      },
    },
  });

  return {
    readFreshSessionToken,
  };
}

describe('getRuntimeCoreConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('reads URL overrides for the visual harness', () => {
    const runtime = installRuntimeBridge();
    vi.stubEnv('DEV', true);
    window.history.replaceState(
      null,
      '',
      '/?transport=http&mockScenario=empty&coreBaseUrl=http://127.0.0.1:3999#/settings',
    );

    const config = getRuntimeCoreConfig();

    expect(config.transportMode).toBe('http');
    expect(config.mockScenario).toBe('empty');
    expect(config.baseUrl).toBe('http://127.0.0.1:3999');
    expect(config.sessionToken).toBe('runtime-token');
    expect(config.readFreshSessionToken?.()).toBe('fresh-token');
    expect(runtime.readFreshSessionToken).toHaveBeenCalledTimes(1);
  });

  it('uses the renderer origin for HTTP transport in dev mode', () => {
    installRuntimeBridge();
    vi.stubEnv('DEV', true);

    const config = getRuntimeCoreConfig();

    expect(config.transportMode).toBe('http');
    expect(config.baseUrl).toBe(window.location.origin);
  });

  it('falls back to the configured Core base URL outside dev mode', () => {
    installRuntimeBridge();
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CORE_BASE_URL', 'http://127.0.0.1:3999');

    const config = getRuntimeCoreConfig();

    expect(config.baseUrl).toBe('http://127.0.0.1:3999');
  });

  it('falls back to HTTP transport for invalid URL values', () => {
    installRuntimeBridge();
    window.history.replaceState(
      null,
      '',
      '/?transport=bogus&mockScenario=bogus#/settings',
    );

    const config = getRuntimeCoreConfig();

    expect(config.transportMode).toBe('http');
    expect(config.mockScenario).toBe('active');
  });

  it('switches to mock mode only when transport=mock is explicit', () => {
    installRuntimeBridge();
    window.history.replaceState(null, '', '/?transport=mock#/settings');

    const config = getRuntimeCoreConfig();

    expect(config.transportMode).toBe('mock');
    expect(config.sessionToken).toBe('runtime-token');
  });
});
