// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeCoreConfig } from './runtime-config';

function installRuntimeBridge(): void {
  Object.defineProperty(window, 'doWhatRuntime', {
    configurable: true,
    value: {
      coreSessionToken: 'runtime-token',
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

describe('getRuntimeCoreConfig', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reads URL overrides for the visual harness', () => {
    installRuntimeBridge();
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
  });

  it('falls back to the safe mock defaults for invalid URL values', () => {
    installRuntimeBridge();
    window.history.replaceState(
      null,
      '',
      '/?transport=bogus&mockScenario=bogus#/settings',
    );

    const config = getRuntimeCoreConfig();

    expect(config.transportMode).toBe('mock');
    expect(config.mockScenario).toBe('active');
  });
});
