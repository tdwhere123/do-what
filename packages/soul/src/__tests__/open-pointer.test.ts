import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { EvidenceExtractor } from '../evidence/evidence-extractor.js';
import { createOpenPointerHandler } from '../mcp/open-pointer-handler.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createHandler(
  overrides: {
    readFile?: (filePath: string) => Promise<string>;
  } = {},
) {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const worker = new SoulWorkerClient(env.dbPath);
  activeWorkers.push(worker);
  const stateStore = new SoulStateStore(env.dbPath);
  return {
    env,
    handle: createOpenPointerHandler({
      extractor: new EvidenceExtractor({
        readFile: overrides.readFile,
        workspaceRoot: env.workspaceRoot,
      }),
      stateStore,
      writer: worker,
    }),
  };
}

afterEach(async () => {
  while (activeWorkers.length > 0) {
    const worker = activeWorkers.pop();
    if (worker) {
      await worker.close();
    }
  }

  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('open pointer', () => {
  it('does not read files for hint level', async () => {
    let readCount = 0;
    const readFile = async () => {
      readCount += 1;
      return 'should not be read';
    };
    const { env, handle } = createHandler({ readFile });
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-1',
        'proj-1',
        'auth hint gist',
        'compiler',
        '["auth"]',
        '["git_commit:abc repo_path:src/auth.ts symbol:authenticate"]',
        0.8,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const result = (await handle({
      level: 'hint',
      pointer: 'git_commit:abc repo_path:src/auth.ts symbol:authenticate',
    })) as { found: boolean; gist?: string; level: string };

    assert.equal(result.found, true);
    assert.equal(result.gist, 'auth hint gist');
    assert.equal(result.level, 'hint');
    assert.equal(readCount, 0);
  });

  it('degrades full requests to excerpt when budget is too small', async () => {
    const { env, handle } = createHandler();
    const filePath = path.join(env.workspaceRoot, 'src', 'auth.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `export function authenticate() {\n${'  return "ok";\n'.repeat(120)}}\n`,
      'utf8',
    );
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-2',
        'proj-1',
        'auth full gist',
        'compiler',
        '["auth"]',
        '["git_commit:abc repo_path:src/auth.ts symbol:authenticate"]',
        0.9,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const result = (await handle({
      level: 'full',
      max_tokens: 20,
      pointer: 'git_commit:abc repo_path:src/auth.ts symbol:authenticate',
    })) as { content?: string; degraded?: boolean; level: string };

    assert.equal(result.level, 'excerpt');
    assert.equal(result.degraded, true);
    assert.match(result.content ?? '', /export function authenticate/);
  });

  it('returns suggested relocation when the file is missing', async () => {
    const { env, handle } = createHandler();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-3',
        'proj-1',
        'missing file gist',
        'compiler',
        '["auth"]',
        '["git_commit:abc repo_path:src/missing.ts symbol:authenticate"]',
        0.9,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const result = (await handle({
      level: 'excerpt',
      pointer: 'git_commit:abc repo_path:src/missing.ts symbol:authenticate',
    })) as { found: boolean; reason?: string; suggested_relocation?: boolean };

    assert.equal(result.found, false);
    assert.equal(result.reason, 'file_not_found');
    assert.equal(result.suggested_relocation, true);
  });
});
