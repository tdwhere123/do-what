import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    exposeInMainWorld.mockClear();
    vi.resetModules();
  });

  it('exposes runtime metadata to the renderer', async () => {
    await import('./preload');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith(
      'doWhatRuntime',
      expect.objectContaining({
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
