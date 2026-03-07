import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createConfiguredCoreToolEventForwarder,
  resolveCoreForwarderOptions,
} from '../core-forwarder.js';

describe('core-forwarder', () => {
  it('stays disabled when core connection details are incomplete', () => {
    const originalPort = process.env.DOWHAT_PORT;
    const originalToken = process.env.DOWHAT_TOKEN;
    delete process.env.DOWHAT_PORT;
    delete process.env.DOWHAT_TOKEN;

    try {
      assert.equal(resolveCoreForwarderOptions(), null);
      assert.equal(createConfiguredCoreToolEventForwarder(), undefined);
    } finally {
      process.env.DOWHAT_PORT = originalPort;
      process.env.DOWHAT_TOKEN = originalToken;
    }
  });

  it('enables forwarding only when both port and token are configured', () => {
    const resolved = resolveCoreForwarderOptions({
      port: 3847,
      token: 'session-token',
    });

    assert.deepEqual(resolved, {
      baseUrl: 'http://127.0.0.1:3847',
      endpoint: '/internal/hook-event',
      timeoutMs: 1_000,
      token: 'session-token',
    });
    assert.notEqual(
      createConfiguredCoreToolEventForwarder({
        port: 3847,
        token: 'session-token',
      }),
      undefined,
    );
  });
});
