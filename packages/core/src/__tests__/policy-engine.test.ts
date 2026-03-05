import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { PolicyEngine } from '../policy/policy-engine.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-policy-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('PolicyEngine', () => {
  it('creates default policy and cache files', () => {
    const root = makeTempDir();
    const policyPath = path.join(root, 'policy.json');
    const cachePath = path.join(root, 'run', 'hook-policy-cache.json');

    const engine = new PolicyEngine({
      cachePath,
      policyPath,
      watch: false,
      workspaceRoot: root,
    });
    engine.load();

    assert.equal(fs.existsSync(policyPath), true);
    assert.equal(fs.existsSync(cachePath), true);
    engine.stop();
  });

  it('evaluates path, command, and domain allow/deny rules', () => {
    const root = makeTempDir();
    const policyPath = path.join(root, 'policy.json');
    const cachePath = path.join(root, 'run', 'hook-policy-cache.json');
    fs.writeFileSync(
      policyPath,
      JSON.stringify(
        {
          'tools.file_write': {
            allow_paths: ['<workspace>/allowed/**'],
            default: 'ask',
            deny_paths: ['<workspace>/secrets/**'],
          },
          'tools.shell_exec': {
            allow_commands: ['git status', 'pnpm test'],
            default: 'ask',
          },
          'tools.web_fetch': {
            allow_domains: ['github.com'],
            default: 'ask',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const engine = new PolicyEngine({
      cachePath,
      policyPath,
      watch: false,
      workspaceRoot: root,
    });
    engine.load();

    const denied = engine.evaluate('tools.file_write', {
      path: path.join(root, 'secrets', 'token.txt'),
    });
    const allowed = engine.evaluate('tools.file_write', {
      path: path.join(root, 'allowed', 'doc.txt'),
    });
    const asks = engine.evaluate('tools.file_write', {
      path: path.join(root, 'other', 'doc.txt'),
    });
    const commandAllowed = engine.evaluate('tools.shell_exec', {
      command: 'git status --short',
    });
    const commandAsk = engine.evaluate('tools.shell_exec', {
      command: 'rm -rf ./tmp',
    });
    const domainAllowed = engine.evaluate('tools.web_fetch', {
      url: 'https://api.github.com/repos',
    });
    const domainAsk = engine.evaluate('tools.web_fetch', {
      url: 'https://example.com',
    });

    assert.equal(denied.result, 'deny');
    assert.equal(allowed.result, 'allow');
    assert.equal(asks.result, 'ask');
    assert.equal(commandAllowed.result, 'allow');
    assert.equal(commandAsk.result, 'ask');
    assert.equal(domainAllowed.result, 'allow');
    assert.equal(domainAsk.result, 'ask');
    engine.stop();
  });

  it('routes ask decisions through approval machine', async () => {
    const root = makeTempDir();
    const policyPath = path.join(root, 'policy.json');
    const cachePath = path.join(root, 'run', 'hook-policy-cache.json');
    fs.writeFileSync(
      policyPath,
      JSON.stringify(
        {
          'tools.shell_exec': {
            default: 'ask',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const engine = new PolicyEngine({
      approvalMachine: {
        enqueue: async () => ({
          approved: true,
          status: 'approved',
        }),
      },
      cachePath,
      policyPath,
      watch: false,
      workspaceRoot: root,
    });
    engine.load();

    const decision = await engine.evaluateOrRequest(
      'tools.shell_exec',
      { command: 'echo hello' },
      { runId: 'run-approve' },
    );
    assert.equal(decision.result, 'allow');

    engine.stop();
  });
});

