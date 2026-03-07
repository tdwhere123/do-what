import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ClaudeAdapter,
  type ClaudeAdapterDependencies,
} from '../claude-adapter.js';
import { ClaudeProcess } from '../claude-process.js';

const tempDirs: string[] = [];

class FakeClaudeProcess extends ClaudeProcess {
  constructor(private readonly processOptions: ConstructorParameters<typeof ClaudeProcess>[0]) {
    super(processOptions);
  }

  override start(): void {
    queueMicrotask(() => {
      this.processOptions.onExit?.(0, null);
    });
  }

  override stop(): void {
    // no-op for tests
  }
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-claude-adapter-'));
  tempDirs.push(dir);
  return dir;
}

function writeEmptyPolicyCache(workspaceRoot: string): string {
  const cachePath = path.join(workspaceRoot, 'run', 'hook-policy-cache.json');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    `${JSON.stringify({ rules: {}, updatedAt: new Date().toISOString(), version: '1' }, null, 2)}\n`,
    'utf8',
  );
  return cachePath;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('condition not met in time');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('ClaudeAdapter', () => {
  it('creates hooks/config files and completes the run on zero exit', async () => {
    const workspaceRoot = makeTempDir();
    let mcpStopped = false;
    const dependencies: ClaudeAdapterDependencies = {
      createProcess: (options) => new FakeClaudeProcess(options),
      startMcpServer: async () => ({
        host: '127.0.0.1',
        port: 3848,
        stop: async () => {
          mcpStopped = true;
        },
        url: 'http://127.0.0.1:3848',
      }),
    };

    const adapter = new ClaudeAdapter(dependencies);
    const policyCachePath = writeEmptyPolicyCache(workspaceRoot);
    const handle = await adapter.startRun({
      hookRunnerPath: path.join(workspaceRoot, 'hook-runner.js'),
      policyCachePath,
      port: 3847,
      prompt: 'list files',
      runId: 'run-adapter',
      token: 'test-token',
      workspaceId: 'ws-adapter',
      workspaceRoot,
    });

    await waitFor(() => String(handle.runActor.getSnapshot().value) === 'completed');
    assert.equal(fs.existsSync(handle.claudeMdPath), true);
    assert.equal(fs.existsSync(handle.hooksConfigPath), true);

    await handle.stop();
    assert.equal(mcpStopped, true);
  });
});
