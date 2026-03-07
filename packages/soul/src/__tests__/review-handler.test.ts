import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { createSoulToolDispatcher } from '../mcp/dispatcher.js';
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

describe('review handler', () => {
  it('accepts checkpointed proposals, writes cues, and commits canon memory', async () => {
    const { dispatcher, env } = createDispatcher();

    const proposal = (await dispatcher.dispatch({
      arguments: {
        confidence: 0.9,
        cue_draft: {
          anchors: ['monorepo'],
          gist: 'monorepo uses pnpm workspace',
          pointers: ['git_commit:abc repo_path:package.json'],
          source: 'compiler',
        },
        impact_level: 'canon',
        project_id: 'proj-review',
      },
      name: 'soul.propose_memory_update',
    })) as { proposal_id: string };

    const review = (await dispatcher.dispatch({
      arguments: {
        action: 'accept',
        proposal_id: proposal.proposal_id,
      },
      name: 'soul.review_memory_proposal',
    })) as { commit_sha?: string; committed: boolean; cue_id: string; status: string };

    assert.equal(review.committed, true);
    assert.equal(review.status, 'accepted');
    assert.ok(review.commit_sha);

    const db = new Database(env.dbPath, { readonly: true });
    const cue = db
      .prepare('SELECT gist, impact_level FROM memory_cues WHERE cue_id = ?')
      .get(review.cue_id) as { gist: string; impact_level: string } | undefined;
    const proposalRow = db
      .prepare('SELECT status FROM memory_proposals WHERE proposal_id = ?')
      .get(proposal.proposal_id) as { status: string } | undefined;
    const project = db
      .prepare('SELECT memory_repo_path FROM projects WHERE project_id = ?')
      .get('proj-review') as { memory_repo_path: string } | undefined;
    db.close();

    assert.equal(cue?.gist, 'monorepo uses pnpm workspace');
    assert.equal(cue?.impact_level, 'canon');
    assert.equal(proposalRow?.status, 'accepted');
    assert.equal(fs.existsSync(path.join(project?.memory_repo_path ?? '', 'memory_cues', `${review.cue_id}.md`)), true);
  });

  it('supports reject and hint_only review actions', async () => {
    const { dispatcher, env } = createDispatcher();

    const rejectedProposal = (await dispatcher.dispatch({
      arguments: {
        confidence: 0.85,
        cue_draft: {
          anchors: ['reject-me'],
          gist: 'reject me',
          pointers: ['git_commit:abc repo_path:src/reject.ts'],
          source: 'compiler',
        },
        impact_level: 'canon',
        project_id: 'proj-review-actions',
      },
      name: 'soul.propose_memory_update',
    })) as { proposal_id: string };
    const rejected = (await dispatcher.dispatch({
      arguments: {
        action: 'reject',
        proposal_id: rejectedProposal.proposal_id,
      },
      name: 'soul.review_memory_proposal',
    })) as { committed: boolean; status: string };

    assert.equal(rejected.committed, false);
    assert.equal(rejected.status, 'rejected');

    const hintProposal = (await dispatcher.dispatch({
      arguments: {
        confidence: 0.75,
        cue_draft: {
          anchors: ['hint'],
          gist: 'hint only memory',
          pointers: ['git_commit:abc repo_path:src/hint.ts'],
          source: 'compiler',
        },
        impact_level: 'consolidated',
        project_id: 'proj-review-actions',
      },
      name: 'soul.propose_memory_update',
    })) as { proposal_id: string };
    const hinted = (await dispatcher.dispatch({
      arguments: {
        action: 'hint_only',
        proposal_id: hintProposal.proposal_id,
      },
      name: 'soul.review_memory_proposal',
    })) as { committed: boolean; cue_id: string; status: string };

    assert.equal(hinted.committed, false);
    assert.equal(hinted.status, 'hint_only');

    const db = new Database(env.dbPath, { readonly: true });
    const rejectedProposalRow = db
      .prepare('SELECT status FROM memory_proposals WHERE proposal_id = ?')
      .get(rejectedProposal.proposal_id) as { status: string } | undefined;
    const hintedCue = db
      .prepare('SELECT impact_level FROM memory_cues WHERE cue_id = ?')
      .get(hinted.cue_id) as { impact_level: string } | undefined;
    db.close();

    assert.equal(rejectedProposalRow?.status, 'rejected');
    assert.equal(hintedCue?.impact_level, 'working');
  });
});
