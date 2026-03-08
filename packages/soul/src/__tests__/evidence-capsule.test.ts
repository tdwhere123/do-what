import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import type { CueRow } from '../db/schema.js';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { EvidenceExtractor } from '../evidence/evidence-extractor.js';
import { EvidenceCapsuleWriter } from '../evidence/capsule-writer.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createWriter() {
  const env = createSoulTestEnv();
  const worker = new SoulWorkerClient(env.dbPath);
  activeEnvs.push(env);
  activeWorkers.push(worker);
  return {
    env,
    writer: new EvidenceCapsuleWriter({
      extractor: new EvidenceExtractor({
        workspaceRoot: env.workspaceRoot,
      }),
      stateStore: new SoulStateStore(env.dbPath),
      writer: worker,
    }),
  };
}

afterEach(async () => {
  while (activeWorkers.length > 0) {
    await activeWorkers.pop()?.close();
  }
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('evidence capsule', () => {
  it('writes a capsule and snippet excerpt for canon cues', async () => {
    const { env, writer } = createWriter();
    const filePath = path.join(env.workspaceRoot, 'src', 'auth.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      'export function authenticate() {\n  return "ok";\n}\n',
      'utf8',
    );
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-canon',
        'proj-evidence',
        'canon auth note',
        'compiler',
        '["auth"]',
        '["git_commit:abcdef1 repo_path:src/auth.ts symbol:authenticate"]',
        0.9,
        'canon',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const cueDb = new Database(env.dbPath, { readonly: true });
    const cue = cueDb
      .prepare('SELECT * FROM memory_cues WHERE cue_id = ?')
      .get('cue-canon') as CueRow;
    cueDb.close();

    await writer.writeAcceptedClaim({
      claim: {
        claim_confidence: 0.9,
        claim_gist: 'auth confirmed',
        claim_mode: 'assert',
        claim_source: 'user',
        cue_id: 'cue-canon',
        draft_id: 'draft-1',
        proposed_at: new Date().toISOString(),
      },
      cue,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const readonlyDb = new Database(env.dbPath, { readonly: true });
    const evidence = readonlyDb
      .prepare(
        `SELECT git_commit, repo_path, snippet_excerpt, context_fingerprint
         FROM evidence_index
         WHERE cue_id = ?`,
      )
      .get('cue-canon') as
      | {
          context_fingerprint: string | null;
          git_commit: string | null;
          repo_path: string | null;
          snippet_excerpt: string | null;
        }
      | undefined;
    const updatedCue = readonlyDb
      .prepare('SELECT snippet_excerpt FROM memory_cues WHERE cue_id = ?')
      .get('cue-canon') as { snippet_excerpt: string | null } | undefined;
    readonlyDb.close();

    assert.equal(evidence?.git_commit, 'abcdef1');
    assert.equal(evidence?.repo_path, 'src/auth.ts');
    assert.equal(typeof evidence?.context_fingerprint, 'string');
    assert.match(evidence?.snippet_excerpt ?? '', /authenticate/);
    assert.match(updatedCue?.snippet_excerpt ?? '', /authenticate/);
  });

  it('skips non-canon cues', async () => {
    const { env, writer } = createWriter();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-working',
        'proj-evidence',
        'working note',
        'compiler',
        '["auth"]',
        '["git_commit:abcdef1 repo_path:src/auth.ts symbol:authenticate"]',
        0.9,
        'working',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const cueDb = new Database(env.dbPath, { readonly: true });
    const cue = cueDb
      .prepare('SELECT * FROM memory_cues WHERE cue_id = ?')
      .get('cue-working') as CueRow;
    cueDb.close();

    await writer.writeAcceptedClaim({
      claim: {
        claim_confidence: 0.9,
        claim_gist: 'ignored',
        claim_mode: 'assert',
        claim_source: 'engine',
        cue_id: 'cue-working',
        draft_id: 'draft-2',
        proposed_at: new Date().toISOString(),
      },
      cue,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const readonlyDb = new Database(env.dbPath, { readonly: true });
    const countRow = readonlyDb
      .prepare('SELECT COUNT(*) AS count FROM evidence_index WHERE cue_id = ?')
      .get('cue-working') as { count: number };
    readonlyDb.close();

    assert.equal(countRow.count, 0);
  });
});
