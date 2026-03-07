import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { GitRenameDetector } from '../pointer/git-rename-detector.js';
import { PointerRelocator } from '../pointer/pointer-relocator.js';
import { SemanticFallback } from '../pointer/semantic-fallback.js';
import { SnippetMatcher } from '../pointer/snippet-matcher.js';
import { SymbolSearcher } from '../pointer/symbol-searcher.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createRelocator() {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const worker = new SoulWorkerClient(env.dbPath);
  activeWorkers.push(worker);
  const stateStore = new SoulStateStore(env.dbPath);
  return {
    env,
    relocator: new PointerRelocator({
      gitRenameDetector: new GitRenameDetector({
        stateStore,
        writer: worker,
      }),
      semanticFallback: new SemanticFallback({
        workspaceRoot: env.workspaceRoot,
      }),
      snippetMatcher: new SnippetMatcher({
        workspaceRoot: env.workspaceRoot,
      }),
      stateStore,
      symbolSearcher: new SymbolSearcher({
        workspaceRoot: env.workspaceRoot,
      }),
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

describe('pointer relocator', () => {
  it('relocates pointers using recorded git rename events', async () => {
    const { env, relocator } = createRelocator();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-1',
        'proj-1',
        'auth cue',
        'compiler',
        '["auth"]',
        '["git_commit:abc123 repo_path:src/auth.ts symbol:authenticate"]',
        0.8,
        'working',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    env.insertSql(
      `INSERT INTO refactor_events (event_id, project_id, commit_sha, renames, detected_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        'evt-1',
        'proj-1',
        'abc123',
        JSON.stringify([
          {
            new_path: 'src/services/auth.ts',
            old_path: 'src/auth.ts',
            similarity: 97,
          },
        ]),
        new Date().toISOString(),
      ],
    );
    const relocatedFile = path.join(env.workspaceRoot, 'src', 'services', 'auth.ts');
    fs.mkdirSync(path.dirname(relocatedFile), { recursive: true });
    fs.writeFileSync(relocatedFile, 'export function authenticate() { return true; }\n', 'utf8');

    const result = await relocator.relocate({
      cueId: 'cue-1',
      impactLevel: 'working',
      pointer: 'git_commit:abc123 repo_path:src/auth.ts symbol:authenticate',
      projectId: 'proj-1',
    });

    assert.equal(result.found, true);
    assert.equal(result.relocationMethod, 'rename');
    assert.equal(result.relocatedTo, 'src/services/auth.ts');
  });

  it('returns a semantic candidate for canon cues when direct relocation fails', async () => {
    const { env, relocator } = createRelocator();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-2',
        'proj-2',
        'canon auth cue',
        'compiler',
        '["auth"]',
        '["git_commit:abc123 repo_path:src/missing.ts symbol:authenticate"]',
        0.9,
        'canon',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
    const candidatePath = path.join(env.workspaceRoot, 'src', 'architecture.ts');
    fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
    fs.writeFileSync(
      candidatePath,
      'export const architectureNotes = "authentication service workflow overview";\n',
      'utf8',
    );

    const result = await relocator.relocate({
      cueGist: 'authentication service workflow overview',
      cueId: 'cue-2',
      impactLevel: 'canon',
      pointer: 'git_commit:abc123 repo_path:src/missing.ts symbol:authenticate',
      projectId: 'proj-2',
    });

    assert.equal(result.found, false);
    assert.equal(result.relocationStatus, 'semantic_candidate');
    assert.match(result.candidate ?? '', /repo_path:src\/architecture.ts/);
  });

  it('marks repeated failed relocations as irrecoverable', async () => {
    const { env, relocator } = createRelocator();
    const pointer = 'repo_path:src/missing.ts symbol:missingSymbol';
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-3',
        'proj-3',
        'missing cue',
        'compiler',
        '["missing"]',
        `["${pointer}"]`,
        0.6,
        'working',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const first = await relocator.relocate({
      cueId: 'cue-3',
      impactLevel: 'working',
      pointer,
      projectId: 'proj-3',
    });
    const second = await relocator.relocate({
      cueId: 'cue-3',
      impactLevel: 'working',
      pointer,
      projectId: 'proj-3',
    });

    assert.equal(first.relocationStatus, 'failed');
    assert.equal(second.relocationStatus, 'irrecoverable');
    assert.equal(second.archived, true);
  });
});
