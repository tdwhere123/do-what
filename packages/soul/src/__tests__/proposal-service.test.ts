import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { createSoulToolDispatcher } from '../mcp/dispatcher.js';
import { SoulToolValidationError } from '../mcp/types.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeDispatchers: Array<ReturnType<typeof createSoulToolDispatcher>> = [];

function createDispatcher() {
  const env = createSoulTestEnv();
  activeEnvs.push(env);
  const dispatcher = createSoulToolDispatcher({
    dbPath: env.dbPath,
    memoryRepoBasePath: env.memoryRepoBasePath,
    workspaceRoot: env.workspaceRoot,
  });
  activeDispatchers.push(dispatcher);
  return { dispatcher, env };
}

afterEach(async () => {
  while (activeDispatchers.length > 0) {
    const dispatcher = activeDispatchers.pop();
    if (dispatcher) {
      await dispatcher.close();
    }
  }

  while (activeEnvs.length > 0) {
    activeEnvs.pop()?.cleanup();
  }
});

describe('proposal service', () => {
  it('auto-accepts working proposals and writes the cue immediately', async () => {
    const { dispatcher, env } = createDispatcher();

    const result = (await dispatcher.dispatch({
      arguments: {
        confidence: 0.7,
        cue_draft: {
          anchors: ['auth'],
          gist: 'core auth logic',
          pointers: [],
          source: 'compiler',
        },
        impact_level: 'working',
        project_id: 'proj-working',
      },
      name: 'soul.propose_memory_update',
    })) as { cue_id: string; requires_checkpoint: boolean; status: string };

    assert.equal(result.requires_checkpoint, false);
    assert.equal(result.status, 'accepted');
    assert.ok(result.cue_id);

    const db = new Database(env.dbPath, { readonly: true });
    const proposal = db
      .prepare('SELECT status FROM memory_proposals WHERE project_id = ?')
      .get('proj-working') as { status: string } | undefined;
    const cue = db
      .prepare('SELECT gist FROM memory_cues WHERE project_id = ?')
      .get('proj-working') as { gist: string } | undefined;
    db.close();

    assert.equal(proposal?.status, 'accepted');
    assert.equal(cue?.gist, 'core auth logic');
  });

  it('queues consolidated proposals with pointers for checkpoint review', async () => {
    const { dispatcher } = createDispatcher();

    const result = (await dispatcher.dispatch({
      arguments: {
        confidence: 0.9,
        cue_draft: {
          anchors: ['auth'],
          gist: 'auth architecture decision',
          pointers: ['git_commit:abc repo_path:src/auth.ts symbol:authenticate'],
          source: 'compiler',
        },
        impact_level: 'consolidated',
        project_id: 'proj-pending',
      },
      name: 'soul.propose_memory_update',
    })) as { proposal_id: string; requires_checkpoint: boolean; status: string };

    assert.equal(result.requires_checkpoint, true);
    assert.equal(result.status, 'pending');

    const pending = await dispatcher.listPendingProposals('proj-pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.proposal_id, result.proposal_id);
  });

  it('rejects canon proposals that do not provide evidence pointers', async () => {
    const { dispatcher } = createDispatcher();

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          arguments: {
            confidence: 0.95,
            cue_draft: {
              anchors: ['auth'],
              gist: 'unsupported canon memory',
              pointers: [],
            },
            impact_level: 'canon',
            project_id: 'proj-invalid',
          },
          name: 'soul.propose_memory_update',
        }),
      (error: unknown) =>
        error instanceof SoulToolValidationError
        && /must include at least one pointer/.test(error.message),
    );
  });
});
