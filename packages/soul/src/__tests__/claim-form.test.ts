import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { createSoulToolDispatcher } from '../mcp/dispatcher.js';
import { shouldWarnClaimWrite } from '../claim/write-guard.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeDispatchers: Array<ReturnType<typeof createSoulToolDispatcher>> = [];

function createDispatcher() {
  const env = createSoulTestEnv();
  const events = new EventEmitter();
  activeEnvs.push(env);
  const dispatcher = createSoulToolDispatcher({
    dbPath: env.dbPath,
    eventSubscriber: events,
    memoryRepoBasePath: env.memoryRepoBasePath,
    publishEvent: () => undefined,
    workspaceRoot: env.workspaceRoot,
  });
  activeDispatchers.push(dispatcher);
  return { dispatcher, env, events };
}

afterEach(async () => {
  while (activeDispatchers.length > 0) {
    await activeDispatchers.pop()?.close();
  }
  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('claim form', () => {
  it('queues claim drafts until a run checkpoint writes claim_* fields', async () => {
    const { dispatcher, env, events } = createDispatcher();

    const proposed = (await dispatcher.dispatch({
      arguments: {
        confidence: 0.9,
        cue_draft: {
          anchors: ['auth'],
          claim_confidence: 0.8,
          claim_gist: 'auth contract updated',
          claim_mode: 'assert',
          claim_source: 'engine',
          gist: 'auth canonical memory',
          pointers: ['git_commit:abcdef1 repo_path:src/auth.ts symbol:authenticate'],
          source: 'compiler',
        },
        impact_level: 'canon',
        project_id: 'proj-claim',
      },
      name: 'soul.propose_memory_update',
    })) as { proposal_id: string };

    const reviewed = (await dispatcher.dispatch({
      arguments: {
        action: 'accept',
        proposal_id: proposed.proposal_id,
      },
      name: 'soul.review_memory_proposal',
    })) as { cue_id: string };

    const beforeCheckpointDb = new Database(env.dbPath, { readonly: true });
    const beforeCheckpoint = beforeCheckpointDb
      .prepare(
        `SELECT claim_draft, claim_gist
         FROM memory_cues
         WHERE cue_id = ?`,
      )
      .get(reviewed.cue_id) as
      | {
          claim_draft: string | null;
          claim_gist: string | null;
        }
      | undefined;
    beforeCheckpointDb.close();
    assert.equal(beforeCheckpoint?.claim_draft ?? null, null);
    assert.equal(beforeCheckpoint?.claim_gist ?? null, null);

    events.emit('run_checkpoint', {
      checkpointId: 'cp-1',
      event: 'run_checkpoint',
      projectId: 'proj-claim',
      revision: 1,
      runId: 'run-claim',
      source: 'test',
      timestamp: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const db = new Database(env.dbPath, { readonly: true });
    const afterCheckpoint = db
      .prepare(
        `SELECT claim_confidence, claim_draft, claim_gist, claim_mode, claim_source
         FROM memory_cues
         WHERE cue_id = ?`,
      )
      .get(reviewed.cue_id) as
      | {
          claim_confidence: number;
          claim_draft: string | null;
          claim_gist: string | null;
          claim_mode: string | null;
          claim_source: string | null;
        }
      | undefined;
    db.close();

    assert.equal(afterCheckpoint?.claim_gist, 'auth contract updated');
    assert.equal(afterCheckpoint?.claim_mode, 'assert');
    assert.equal(afterCheckpoint?.claim_source, 'engine');
    assert.equal(afterCheckpoint?.claim_confidence, 0.8);
    assert.equal(typeof afterCheckpoint?.claim_draft, 'string');
  });

  it('guards claim writes unless they come from the checkpoint writer', () => {
    assert.equal(
      shouldWarnClaimWrite('UPDATE memory_cues SET claim_gist = ? WHERE cue_id = ?'),
      true,
    );
    assert.equal(
      shouldWarnClaimWrite('/* checkpoint_claim_write */ UPDATE memory_cues SET claim_gist = ? WHERE cue_id = ?'),
      false,
    );
  });
});
