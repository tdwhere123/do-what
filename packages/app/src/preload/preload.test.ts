import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const readFileSync = vi.fn(() => 'token-from-test');

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync,
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    exposeInMainWorld.mockClear();
    readFileSync.mockClear();
    vi.resetModules();
  });

  it('exposes runtime metadata to the renderer', async () => {
    await import('./preload');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'doWhatRuntime',
      expect.objectContaining({
        coreSessionToken: 'token-from-test',
        coreSessionTokenPath: expect.stringContaining('session_token'),
        platform: process.platform,
        versions: expect.objectContaining({
          chrome: process.versions.chrome,
          electron: process.versions.electron,
          node: process.versions.node,
        }),
      }),
    );
  });
});
