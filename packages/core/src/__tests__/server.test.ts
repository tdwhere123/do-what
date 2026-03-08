import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, it } from 'node:test';
import { runGit } from '@do-what/tools';
import { startHttpServer, type HttpServerHandle } from '../server/http.js';

const activeServers: HttpServerHandle[] = [];
const tempDirs: string[] = [];

async function startTestServer(
  isDevelopment = true,
  options: {
    soulConfig?: Record<string, unknown>;
  } = {},
): Promise<{
  baseUrl: string;
  server: HttpServerHandle;
  stateDir: string;
  soulConfigPath: string;
  token: string;
  worktreeBasePath: string;
  workspaceRoot: string;
}> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-core-'));
  tempDirs.push(tempDir);

  const sessionTokenPath = path.join(tempDir, 'run', 'session_token');
  const stateDir = path.join(tempDir, 'state');
  const soulConfigPath = path.join(tempDir, 'soul-config.json');
  const workspaceRoot = path.join(tempDir, 'workspace');
  const worktreeBasePath = path.join(tempDir, 'worktrees');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  await runGit(['init'], { cwd: workspaceRoot });
  await runGit(['config', 'user.email', 'codex@example.com'], { cwd: workspaceRoot });
  await runGit(['config', 'user.name', 'Codex'], { cwd: workspaceRoot });
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), '# workspace\n', 'utf8');
  await runGit(['add', 'README.md'], { cwd: workspaceRoot });
  await runGit(['commit', '-m', 'initial commit'], { cwd: workspaceRoot });
  if (options.soulConfig) {
    fs.writeFileSync(soulConfigPath, JSON.stringify(options.soulConfig, null, 2), 'utf8');
  }
  const server = await startHttpServer({
    host: '127.0.0.1',
    isDevelopment,
    logger: false,
    port: 0,
    sessionTokenPath,
    skipSignalHandlers: true,
    stateDir,
    soulConfigPath,
    worktreeBasePath,
    workspaceRoot,
  });

  activeServers.push(server);

  const token = fs.readFileSync(sessionTokenPath, 'utf8').trim();
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    server,
    stateDir,
    soulConfigPath,
    token,
    worktreeBasePath,
    workspaceRoot,
  };
}

async function waitForStateMatch(
  baseUrl: string,
  token: string,
  predicate: (body: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/state`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (predicate(body)) {
      return body;
    }
    await sleep(25);
  }

  throw new Error('state predicate not satisfied in time');
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await server.stop();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('HTTP server auth and SSE', () => {
  it('returns health without auth', async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
  });

  it('rejects unauthenticated state requests', async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/state`);

    assert.equal(response.status, 401);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Unauthorized');
  });

  it('accepts authenticated state requests', async () => {
    const { baseUrl, token } = await startTestServer();
    const response = await fetch(`${baseUrl}/state`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.revision, 0);
    assert.deepEqual(body.pendingApprovals, []);
    assert.deepEqual(body.recentEvents, []);
  });

  it('streams SSE events from development publish route', async () => {
    const { baseUrl, token } = await startTestServer(true);

    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        `${baseUrl}/events`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        (response) => {
          assert.equal(response.statusCode, 200);
          const contentType = response.headers['content-type'];
          assert.ok(typeof contentType === 'string');
          assert.match(contentType, /text\/event-stream/);

          response.setEncoding('utf8');

          const eventText = '"runId":"run-test"';
          let buffer = '';

          response.on('data', (chunk) => {
            buffer += chunk;
            if (buffer.includes(eventText)) {
              request.destroy();
              resolve();
            }
          });

          response.on('error', reject);

          void fetch(`${baseUrl}/_dev/publish`, {
            body: JSON.stringify({
              isComplete: false,
              runId: 'run-test',
              source: 'test',
              text: 'hello from dev publish',
              timestamp: new Date().toISOString(),
              type: 'token_stream',
            }),
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
          })
            .then(async (publishResponse) => {
              assert.equal(publishResponse.status, 200);
            })
            .catch(reject);
        },
      );

      request.on('error', reject);
      request.end();
    });
  });

  it('accepts internal hook events and exposes them via state snapshot', async () => {
    const { baseUrl, token } = await startTestServer(false);

    const publishResponse = await fetch(`${baseUrl}/internal/hook-event`, {
      body: JSON.stringify({
        args: {
          command: 'git status',
        },
        runId: 'run-hook',
        source: 'hook_runner',
        status: 'requested',
        timestamp: new Date().toISOString(),
        toolName: 'tools.shell_exec',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(publishResponse.status, 200);
    const ackBody = (await publishResponse.json()) as { ackId: string; ok: boolean; revision: number };
    assert.equal(typeof ackBody.ackId, 'string');

    const ackStatusResponse = await fetch(`${baseUrl}/acks/${ackBody.ackId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(ackStatusResponse.status, 200);
    const ackStatus = (await ackStatusResponse.json()) as { status: string };
    assert.equal(ackStatus.status === 'pending' || ackStatus.status === 'committed', true);

    const body = await waitForStateMatch(baseUrl, token, (snapshot) => {
      const recentEvents = snapshot.recentEvents;
      return Array.isArray(recentEvents)
        && recentEvents.some(
          (event) =>
            event
            && typeof event === 'object'
            && (event as Record<string, unknown>).source === 'hook_runner',
        );
    });

    assert.equal(body.revision, ackBody.revision);
  });

  it('starts and completes a dev run with worktree allocation and integration events', async () => {
    const { baseUrl, token, worktreeBasePath } = await startTestServer(true);

    const response = await fetch(`${baseUrl}/_dev/start-run`, {
      body: JSON.stringify({
        durationMs: 300,
        engine: 'claude',
        prompt: 'show git status',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(response.status, 202);
    const body = (await response.json()) as {
      ok: boolean;
      runId: string;
      worktreePath: string;
    };
    assert.equal(body.ok, true);
    assert.equal(fs.existsSync(body.worktreePath), true);

    const snapshot = await waitForStateMatch(baseUrl, token, (state) => {
      const recentEvents = state.recentEvents;
      return Array.isArray(recentEvents)
        && recentEvents.some(
          (event) =>
            event
            && typeof event === 'object'
            && (event as Record<string, unknown>).event === 'gate_passed',
        );
    });

    assert.equal(
      Array.isArray(snapshot.recentEvents)
      && snapshot.recentEvents.some(
        (event) =>
          event
          && typeof event === 'object'
          && (event as Record<string, unknown>).event === 'gate_passed',
      ),
      true,
    );

    const remainingWorktrees = fs.existsSync(worktreeBasePath)
      ? fs.readdirSync(worktreeBasePath)
      : [];
    assert.deepEqual(remainingWorktrees, []);
  });

  it('triggers memory compiler after a dev run writes a test file', async () => {
    const { baseUrl, stateDir, token } = await startTestServer(true, {
      soulConfig: {
        compiler: {
          trigger_delay_ms: 50,
        },
      },
    });

    const response = await fetch(`${baseUrl}/_dev/start-run`, {
      body: JSON.stringify({
        durationMs: 200,
        engine: 'claude',
        prompt: 'write a test file',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(response.status, 202);

    let row: { impact_level: string; source: string } | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const soulDb = new Database(path.join(stateDir, 'soul.db'));
      row = soulDb
        .prepare(
          `SELECT source, impact_level
           FROM memory_cues
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get() as { impact_level: string; source: string } | undefined;
      soulDb.close();

      if (row) {
        break;
      }

      await sleep(50);
    }

    assert.equal(row?.source, 'local_heuristic');
    assert.equal(row?.impact_level, 'working');
  });

  it('proxies soul memory search through /mcp/call', async () => {
    const { baseUrl, stateDir, token } = await startTestServer(false);
    const soulDb = new Database(path.join(stateDir, 'soul.db'));
    soulDb
      .prepare(
        `INSERT INTO memory_cues (
          cue_id,
          project_id,
          gist,
          source,
          track,
          anchors,
          pointers,
          confidence,
          impact_level,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cue-1',
        'proj-1',
        'authentication logic refactored to service layer',
        'compiler',
        'architecture',
        '["auth","service"]',
        '["git_commit:abc repo_path:src/auth.ts symbol:authenticate"]',
        0.9,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      );
    soulDb.close();

    const response = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        arguments: {
          limit: 5,
          project_id: 'proj-1',
          query: 'auth service',
        },
        name: 'soul.memory_search',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      result: { cues: Array<{ cueId: string }> };
      status: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.status, 'completed');
    assert.equal(body.result.cues[0]?.cueId, 'cue-1');
  });

  it('proxies soul open_pointer through /mcp/call', async () => {
    const { baseUrl, stateDir, token, workspaceRoot } = await startTestServer(false);
    const filePath = path.join(workspaceRoot, 'src', 'auth.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      'export function authenticate() {\n  return "ok";\n}\n',
      'utf8',
    );

    const soulDb = new Database(path.join(stateDir, 'soul.db'));
    soulDb
      .prepare(
        `INSERT INTO memory_cues (
          cue_id,
          project_id,
          gist,
          source,
          anchors,
          pointers,
          confidence,
          impact_level,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'cue-open',
        'proj-1',
        'auth hint gist',
        'compiler',
        '["auth"]',
        '["git_commit:abc repo_path:src/auth.ts symbol:authenticate"]',
        0.9,
        'consolidated',
        new Date().toISOString(),
        new Date().toISOString(),
      );
    soulDb.close();

    const response = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        args: {
          level: 'full',
          max_tokens: 200,
          pointer: 'git_commit:abc repo_path:src/auth.ts symbol:authenticate',
        },
        tool: 'soul.open_pointer',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      result: { content?: string; found: boolean; level: string };
    };
    assert.equal(body.ok, true);
    assert.equal(body.result.found, true);
    assert.equal(body.result.level, 'full');
    assert.match(body.result.content ?? '', /authenticate/);
  });

  it('proxies soul explore_graph through /mcp/call', async () => {
    const { baseUrl, stateDir, token } = await startTestServer(false);
    const now = new Date().toISOString();
    const soulDb = new Database(path.join(stateDir, 'soul.db'));
    soulDb.exec(`
      INSERT INTO memory_cues (
        cue_id, project_id, gist, source, track, anchors, pointers, confidence,
        impact_level, created_at, updated_at
      ) VALUES
        ('cue-a', 'proj-1', 'Auth service', 'compiler', 'architecture', '["auth"]', '[]', 0.9, 'consolidated', '${now}', '${now}'),
        ('cue-b', 'proj-1', 'Session service', 'compiler', 'architecture', '["session"]', '[]', 0.8, 'consolidated', '${now}', '${now}');
      INSERT INTO memory_graph_edges (
        edge_id, source_id, target_id, relation, track, confidence, created_at
      ) VALUES ('edge-1', 'cue-a', 'cue-b', 'supports', 'architecture', 0.8, '${now}');
    `);
    soulDb.close();

    const response = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        args: {
          depth: 2,
          entity_name: 'auth',
          limit: 10,
          track: 'architecture',
        },
        tool: 'soul.explore_graph',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      result: { edges: Array<{ edge_id: string }>; nodes: Array<{ cueId: string }> };
    };
    assert.equal(body.ok, true);
    assert.deepEqual(
      body.result.nodes.map((node) => node.cueId).sort(),
      ['cue-a', 'cue-b'],
    );
    assert.deepEqual(
      body.result.edges.map((edge) => edge.edge_id),
      ['edge-1'],
    );
  });

  it('rejects non-loopback mcp calls even with a valid token', async () => {
    const { server, token } = await startTestServer(false);
    const response = await server.app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: 'POST',
      payload: {
        args: {
          project_id: 'proj-1',
          query: 'auth',
        },
        tool: 'soul.memory_search',
      },
      remoteAddress: '10.0.0.1',
      url: '/mcp/call',
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), { error: 'Forbidden' });
  });

  it('lists pending checkpoint proposals through /soul/proposals', async () => {
    const { baseUrl, token } = await startTestServer(false);

    const proposeResponse = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        args: {
          confidence: 0.9,
          cue_draft: {
            anchors: ['architecture'],
            gist: 'architecture checkpoint note',
            pointers: ['git_commit:abc repo_path:src/core.ts'],
            source: 'compiler',
          },
          impact_level: 'consolidated',
          project_id: 'proj-pending',
        },
        tool: 'soul.propose_memory_update',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(proposeResponse.status, 200);

    const listResponse = await fetch(
      `${baseUrl}/soul/proposals?project_id=proj-pending`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    assert.equal(listResponse.status, 200);
    const body = (await listResponse.json()) as {
      proposals: Array<{ project_id: string; status: string }>;
    };
    assert.equal(body.proposals.length, 1);
    assert.equal(body.proposals[0]?.project_id, 'proj-pending');
    assert.equal(body.proposals[0]?.status, 'pending');
  });

  it('returns healing queue stats through /soul/healing/stats', async () => {
    const { baseUrl, token } = await startTestServer(false);

    const response = await fetch(`${baseUrl}/soul/healing/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      completed: number;
      failed: number;
      queued: number;
    };
    assert.equal(body.queued, 0);
    assert.equal(body.completed, 0);
    assert.equal(body.failed, 0);
  });

  it('proxies soul propose/review write flows through /mcp/call', async () => {
    const { baseUrl, stateDir, token } = await startTestServer(false);

    const proposeResponse = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        args: {
          confidence: 0.95,
          cue_draft: {
            anchors: ['auth'],
            gist: 'auth canonical memory',
            pointers: ['git_commit:abc repo_path:src/auth.ts symbol:authenticate'],
            source: 'compiler',
          },
          impact_level: 'canon',
          project_id: 'proj-review',
        },
        tool: 'soul.propose_memory_update',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(proposeResponse.status, 200);
    const proposal = (await proposeResponse.json()) as {
      result: { proposal_id: string; requires_checkpoint: boolean };
    };
    assert.equal(proposal.result.requires_checkpoint, true);

    const reviewResponse = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        args: {
          action: 'accept',
          proposal_id: proposal.result.proposal_id,
        },
        tool: 'soul.review_memory_proposal',
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    assert.equal(reviewResponse.status, 200);
    const reviewBody = (await reviewResponse.json()) as {
      result: { committed: boolean; cue_id: string; status: string };
    };
    assert.equal(reviewBody.result.committed, true);
    assert.equal(reviewBody.result.status, 'accepted');

    const soulDb = new Database(path.join(stateDir, 'soul.db'), { readonly: true });
    const cue = soulDb
      .prepare('SELECT impact_level FROM memory_cues WHERE cue_id = ?')
      .get(reviewBody.result.cue_id) as { impact_level: string } | undefined;
    soulDb.close();

    assert.equal(cue?.impact_level, 'canon');
  });
});
