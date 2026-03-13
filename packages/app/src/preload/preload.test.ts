import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn(async () => 'D:/makefun/do-what/do-what-new');
const readFileSync = vi.fn(() => 'token-from-test');

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
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
    invoke.mockClear();
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

    const exposedRuntime = exposeInMainWorld.mock.calls[0]?.[1] as {
      openWorkspaceDirectory?: () => Promise<string | null>;
      readFreshSessionToken?: () => string | null;
    };

    await expect(exposedRuntime.openWorkspaceDirectory?.()).resolves.toBe(
      'D:/makefun/do-what/do-what-new',
    );
    expect(exposedRuntime.readFreshSessionToken?.()).toBe('token-from-test');
    expect(readFileSync).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('do-what:pick-workspace-directory');
  });
});
