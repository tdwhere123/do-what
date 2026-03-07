import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { HookPolicyCache } from '../policy-cache.js';

const tempDirs: string[] = [];
const caches: HookPolicyCache[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-claude-policy-'));
  tempDirs.push(dir);
  return dir;
}

function writeCache(dir: string, rules: Record<string, unknown>): string {
  const cachePath = path.join(dir, 'run', 'hook-policy-cache.json');
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    `${JSON.stringify({ rules, updatedAt: new Date().toISOString(), version: '1' }, null, 2)}\n`,
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
  while (caches.length > 0) {
    caches.pop()?.stop();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('HookPolicyCache', () => {
  it('evaluates command, path, and domain rules from cache', () => {
    const root = makeTempDir();
    const cachePath = writeCache(root, {
      'tools.file_write': {
        allow_paths: ['<workspace>/allowed/**'],
        default: 'ask',
        deny_paths: ['<workspace>/secrets/**'],
      },
      'tools.shell_exec': {
        allow_commands: ['git status'],
        default: 'ask',
      },
      'tools.web_fetch': {
        allow_domains: ['github.com'],
        default: 'ask',
      },
    });

    const cache = new HookPolicyCache({
      cachePath,
      watch: false,
      workspaceRoot: root,
    });
    caches.push(cache);
    cache.load();

    assert.equal(
      cache.evaluate('tools.file_write', { path: path.join(root, 'allowed', 'file.txt') }),
      'allow',
    );
    assert.equal(
      cache.evaluate('tools.file_write', { path: path.join(root, 'secrets', 'token.txt') }),
      'deny',
    );
    assert.equal(cache.evaluate('tools.shell_exec', { command: 'git status --short' }), 'allow');
    assert.equal(cache.evaluate('tools.web_fetch', { url: 'https://api.github.com/repos' }), 'allow');
    assert.equal(cache.evaluate('tools.shell_exec', { command: 'rm -rf tmp' }), 'ask');
  });

  it('reloads after cache file changes', async () => {
    const root = makeTempDir();
    const cachePath = writeCache(root, {
      'tools.shell_exec': {
        default: 'ask',
      },
    });

    const cache = new HookPolicyCache({
      cachePath,
      workspaceRoot: root,
    });
    caches.push(cache);
    cache.load();
    assert.equal(cache.evaluate('tools.shell_exec', { command: 'echo hello' }), 'ask');

    writeCache(root, {
      'tools.shell_exec': {
        default: 'deny',
      },
    });

    await waitFor(() => cache.evaluate('tools.shell_exec', { command: 'echo hello' }) === 'deny');
  });

  it('evaluates 1000 decisions in < 5ms average (pure synchronous cache path)', () => {
    const root = makeTempDir();
    const cachePath = writeCache(root, {
      'tools.shell_exec': {
        allow_commands: ['git status'],
        default: 'ask',
      },
    });

    const cache = new HookPolicyCache({
      cachePath,
      watch: false,
      workspaceRoot: root,
    });
    caches.push(cache);
    cache.load();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      cache.evaluate('tools.shell_exec', { command: 'git status' });
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / 1000;
    assert.ok(avgMs < 5, `Average latency ${avgMs.toFixed(3)}ms exceeds 5ms budget`);
  });
});
