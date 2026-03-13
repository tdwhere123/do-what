import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, it } from 'node:test';
import { runGit } from '@do-what/tools';
import { startHttpServer, type HttpServerHandle } from '../server/http.js';

interface ApiEnvelope<T> {
  data: T;
  ok: boolean;
}

const activeServers: HttpServerHandle[] = [];
const tempDirs: string[] = [];

function authHeaders(token: string, includeJson = false): Record<string, string> {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

function openSoulDb(stateDir: string): Database.Database {
  return new Database(path.join(stateDir, 'soul.db'));
}

function openStateDb(stateDir: string): Database.Database {
  return new Database(path.join(stateDir, 'state.db'));
}

function insertApproval(stateDir: string, input: {
  approvalId: string;
  runId: string;
  status?: string;
  toolName: string;
}): void {
  const db = openStateDb(stateDir);
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO approval_queue (
        approval_id, run_id, tool_name, args, status, created_at, resolved_at, resolver
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.approvalId,
      input.runId,
      input.toolName,
      '{}',
      input.status ?? 'pending',
      now,
      null,
      null,
    );
  } finally {
    db.close();
  }
}

function insertGovernanceLease(stateDir: string, input: {
  leaseId: string;
  runId: string;
  workspaceId: string;
}): void {
  const db = openStateDb(stateDir);
  const issuedAt = '2026-03-11T10:00:00.000Z';
  const expiresAt = '2099-01-01T00:00:00.000Z';
  try {
    db.prepare(
      `INSERT INTO governance_leases (
        lease_id,
        run_id,
        workspace_id,
        surface_id,
        valid_snapshot,
        conflict_conclusions,
        invalidation_conditions,
        issued_at,
        expires_at,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.leaseId,
      input.runId,
      input.workspaceId,
      'surface-ui',
      '{}',
      '[]',
      '[]',
      issuedAt,
      expiresAt,
      'active',
    );
  } finally {
    db.close();
  }
}

function insertMemoryCue(stateDir: string, input: {
  claimGist?: string;
  cueId: string;
  gist: string;
  projectId: string;
}): void {
  const db = openSoulDb(stateDir);
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO memory_cues (
        cue_id,
        project_id,
        gist,
        claim_gist,
        source,
        scope,
        manifestation_state,
        retention_state,
        anchors,
        pointers,
        confidence,
        impact_level,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.cueId,
      input.projectId,
      input.gist,
      input.claimGist ?? null,
      'compiler',
      'project',
      'visible',
      'working',
      '["auth"]',
      '[]',
      0.9,
      'consolidated',
      now,
      now,
    );
  } finally {
    db.close();
  }
}

function insertWorkspaceAndRun(
  stateDir: string,
  workspaceRoot: string,
  input: {
    metadata?: Record<string, unknown>;
    runId: string;
    status?: string;
    workspaceId: string;
  },
): void {
  const db = openStateDb(stateDir);
  const now = '2026-03-11T10:00:00.000Z';
  try {
    db.prepare(
      `INSERT INTO workspaces (
        workspace_id, name, root_path, engine_type, created_at, last_opened_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.workspaceId,
      `Workspace ${input.workspaceId}`,
      workspaceRoot,
      'claude',
      now,
      now,
    );
    db.prepare(
      `INSERT INTO runs (
        run_id, workspace_id, agent_id, engine_type, status, created_at, updated_at, completed_at, error, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.runId,
      input.workspaceId,
      null,
      'claude',
      input.status ?? 'running',
      now,
      now,
      null,
      null,
      JSON.stringify(input.metadata ?? {}),
    );
  } finally {
    db.close();
  }
}

async function publishDevEvent(
  baseUrl: string,
  token: string,
  event: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${baseUrl}/_dev/publish`, {
    body: JSON.stringify(event),
    headers: authHeaders(token, true),
    method: 'POST',
  });
  assert.equal(response.status, 200);
}

async function startTestServer(isDevelopment = true): Promise<{
  baseUrl: string;
  server: HttpServerHandle;
  stateDir: string;
  token: string;
  workspaceRoot: string;
}> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-ui-api-'));
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

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    server,
    stateDir,
    token: fs.readFileSync(sessionTokenPath, 'utf8').trim(),
    workspaceRoot,
  };
}

async function waitForAckStatus(
  baseUrl: string,
  token: string,
  ackId: string,
  predicate: (status: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/acks/${ackId}`, {
      headers: authHeaders(token),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (predicate(body)) {
      return body;
    }
    await sleep(25);
  }

  throw new Error(`ack ${ackId} did not reach expected state`);
}

async function waitForTimeline(
  baseUrl: string,
  token: string,
  runId: string,
  predicate: (timeline: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/runs/${runId}/timeline?limit=50`, {
      headers: authHeaders(token),
    });
    const body = (await response.json()) as ApiEnvelope<Record<string, unknown>>;
    if (body.ok && predicate(body.data)) {
      return body.data;
    }
    await sleep(25);
  }

  throw new Error(`timeline for ${runId} did not satisfy predicate`);
}

async function waitForWorkbenchSnapshot(
  baseUrl: string,
  token: string,
  predicate: (snapshot: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/workbench/snapshot`, {
      headers: authHeaders(token),
    });
    const body = (await response.json()) as ApiEnvelope<Record<string, unknown>>;
    if (body.ok && predicate(body.data)) {
      return body.data;
    }
    await sleep(25);
  }

  throw new Error('workbench snapshot predicate not satisfied');
}

async function waitForWorkspaceIdByName(
  baseUrl: string,
  token: string,
  workspaceName: string,
): Promise<string> {
  const snapshot = await waitForWorkbenchSnapshot(baseUrl, token, (body) => {
    const workspaces = body.workspaces;
    return Array.isArray(workspaces)
      && workspaces.some(
        (workspace) =>
          workspace
          && typeof workspace === 'object'
          && (workspace as Record<string, unknown>).name === workspaceName,
      );
  });
  const workspace = (snapshot.workspaces as Array<Record<string, unknown>>).find(
    (entry) => entry.name === workspaceName,
  );
  assert.ok(workspace);
  return String(workspace.workspaceId);
}

async function waitForSseEnvelope(
  baseUrl: string,
  token: string,
  predicate: (payload: Record<string, unknown>) => boolean,
  trigger: () => Promise<void>,
): Promise<Record<string, unknown>> {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = http.request(
      `${baseUrl}/events`,
      {
        headers: authHeaders(token),
      },
      (response) => {
        assert.equal(response.statusCode, 200);
        response.setEncoding('utf8');

        let buffer = '';
        response.on('data', (chunk) => {
          buffer += chunk;

          let frameBoundary = buffer.indexOf('\n\n');
          while (frameBoundary >= 0) {
            const frame = buffer.slice(0, frameBoundary);
            buffer = buffer.slice(frameBoundary + 2);

            for (const line of frame.split('\n')) {
              if (!line.startsWith('data: ')) {
                continue;
              }

              const payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (predicate(payload)) {
                request.destroy();
                resolve(payload);
                return;
              }
            }

            frameBoundary = buffer.indexOf('\n\n');
          }
        });

        response.on('error', reject);
        void trigger().catch(reject);
      },
    );

    request.on('error', reject);
    request.end();
  });
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

describe('UI API routes', () => {
  it('serves workbench snapshot, templates, timeline pagination, and inspector data', async () => {
    const { baseUrl, server, stateDir, token, workspaceRoot } = await startTestServer(true);
    insertWorkspaceAndRun(stateDir, workspaceRoot, {
      metadata: {
        participants: ['claude'],
        templateId: 'default',
        title: 'Query Surface Run',
      },
      runId: 'run-query',
      workspaceId: 'ws-query',
    });

    await publishDevEvent(baseUrl, token, {
      isComplete: true,
      revision: 0,
      runId: 'run-query',
      source: 'test.timeline',
      speaker: 'engine',
      text: 'hello from timeline',
      timestamp: '2026-03-11T10:00:01.000Z',
      type: 'token_stream',
    });
    await publishDevEvent(baseUrl, token, {
      nodeId: 'plan-1',
      revision: 0,
      runId: 'run-query',
      source: 'test.timeline',
      status: 'active',
      timestamp: '2026-03-11T10:00:02.000Z',
      title: 'Inspect auth flow',
      type: 'plan_node',
    });
    await publishDevEvent(baseUrl, token, {
      hunks: 1,
      patch: '+export const query = true;\n',
      path: 'src/index.ts',
      revision: 0,
      runId: 'run-query',
      source: 'test.timeline',
      timestamp: '2026-03-11T10:00:03.000Z',
      type: 'diff',
    });
    await publishDevEvent(baseUrl, token, {
      checkpointId: 'checkpoint-1',
      event: 'run_checkpoint',
      projectId: 'ws-query',
      revision: 0,
      runId: 'run-query',
      source: 'test.timeline',
      timestamp: '2026-03-11T10:00:04.000Z',
    });
    await publishDevEvent(baseUrl, token, {
      event: 'run_serialized',
      reason: 'hard_stale_serialize',
      reconcileCount: 1,
      revision: 0,
      runId: 'run-query',
      source: 'test.timeline',
      timestamp: '2026-03-11T10:00:05.000Z',
      touchedPaths: ['src/index.ts'],
      workspaceId: 'ws-query',
    });

    const snapshot = await waitForWorkbenchSnapshot(baseUrl, token, (body) => {
      const runs = body.runs;
      return Array.isArray(runs)
        && runs.some(
          (run) =>
            run
            && typeof run === 'object'
            && (run as Record<string, unknown>).runId === 'run-query',
        )
        && body.revision === 5;
    });
    assert.equal(snapshot.coreSessionId, server.coreSessionId);
    assert.equal(typeof snapshot.modules, 'object');
    assert.equal(
      ((snapshot.modules as Record<string, unknown>).core as Record<string, unknown>).status,
      'connected',
    );
    assert.equal(
      ((snapshot.modules as Record<string, unknown>).soul as Record<string, unknown>).status,
      'connected',
    );

    const templatesResponse = await fetch(`${baseUrl}/api/workflows/templates`, {
      headers: authHeaders(token),
    });
    assert.equal(templatesResponse.status, 200);
    const templatesBody = (await templatesResponse.json()) as ApiEnvelope<
      Array<Record<string, unknown>>
    >;
    assert.equal(templatesBody.ok, true);
    assert.equal(
      templatesBody.data.some((template) => template.templateId === 'default'),
      true,
    );

    const timelineResponse = await fetch(`${baseUrl}/api/runs/run-query/timeline?limit=2`, {
      headers: authHeaders(token),
    });
    assert.equal(timelineResponse.status, 200);
    const timelineBody = (await timelineResponse.json()) as ApiEnvelope<Record<string, unknown>>;
    assert.equal(timelineBody.ok, true);
    assert.equal(Array.isArray(timelineBody.data.entries), true);
    assert.equal((timelineBody.data.entries as unknown[]).length, 2);
    assert.equal(timelineBody.data.hasMore, true);
    assert.equal(typeof timelineBody.data.nextBeforeRevision, 'number');

    const olderTimelineResponse = await fetch(
      `${baseUrl}/api/runs/run-query/timeline?limit=2&beforeRevision=${timelineBody.data.nextBeforeRevision}`,
      {
        headers: authHeaders(token),
      },
    );
    assert.equal(olderTimelineResponse.status, 200);
    const olderTimelineBody = (await olderTimelineResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(olderTimelineBody.ok, true);
    assert.equal(Array.isArray(olderTimelineBody.data.entries), true);
    assert.equal((olderTimelineBody.data.entries as unknown[]).length >= 1, true);

    const inspectorResponse = await fetch(`${baseUrl}/api/runs/run-query/inspector`, {
      headers: authHeaders(token),
    });
    assert.equal(inspectorResponse.status, 200);
    const inspectorBody = (await inspectorResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(inspectorBody.ok, true);
    assert.equal(inspectorBody.data.runId, 'run-query');
    assert.equal(
      Array.isArray(inspectorBody.data.files)
      && (inspectorBody.data.files as Array<Record<string, unknown>>).some(
        (file) => file.path === 'src/index.ts',
      ),
      true,
    );
    assert.equal(
      Array.isArray(inspectorBody.data.plans)
      && (inspectorBody.data.plans as Array<Record<string, unknown>>).some(
        (plan) => plan.id === 'plan-1',
      ),
      true,
    );
    assert.equal(
      (inspectorBody.data.governance as Record<string, unknown>).driftState,
      'hard_stale',
    );
  });

  it('serves settings snapshots and approval/memory probes', async () => {
    const { baseUrl, stateDir, token, workspaceRoot } = await startTestServer(false);
    insertWorkspaceAndRun(stateDir, workspaceRoot, {
      runId: 'run-probe',
      workspaceId: 'ws-probe',
    });
    insertApproval(stateDir, {
      approvalId: 'approval-ui',
      runId: 'run-probe',
      toolName: 'tools.shell_exec',
    });
    insertGovernanceLease(stateDir, {
      leaseId: 'lease-ui',
      runId: 'run-probe',
      workspaceId: 'ws-probe',
    });
    insertMemoryCue(stateDir, {
      claimGist: 'Auth claim summary',
      cueId: 'cue-ui',
      gist: 'Auth gist summary',
      projectId: 'proj-ui',
    });

    const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
      headers: authHeaders(token),
    });
    assert.equal(settingsResponse.status, 200);
    const settingsBody = (await settingsResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(settingsBody.ok, true);
    assert.equal(
      (settingsBody.data.lease as Record<string, unknown>).status,
      'active',
    );
    assert.equal(
      Array.isArray((settingsBody.data.lease as Record<string, unknown>).lockedFields)
      && ((settingsBody.data.lease as Record<string, unknown>).lockedFields as string[]).includes(
        'engine.connection_mode',
      ),
      true,
    );

    const approvalResponse = await fetch(`${baseUrl}/api/approvals/approval-ui`, {
      headers: authHeaders(token),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalBody = (await approvalResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(approvalBody.ok, true);
    assert.equal(approvalBody.data.runId, 'run-probe');
    assert.equal(approvalBody.data.status, 'pending');

    const memoryResponse = await fetch(`${baseUrl}/api/memory/cue-ui`, {
      headers: authHeaders(token),
    });
    assert.equal(memoryResponse.status, 200);
    const memoryBody = (await memoryResponse.json()) as ApiEnvelope<Record<string, unknown>>;
    assert.equal(memoryBody.ok, true);
    assert.equal(memoryBody.data.memoryId, 'cue-ui');
    assert.equal(memoryBody.data.slotStatus, 'bound');
    assert.equal(memoryBody.data.claimSummary, 'Auth claim summary');
  });

  it('requires creating a workspace before creating a run and exposes empty snapshots honestly', async () => {
    const { baseUrl, token, workspaceRoot } = await startTestServer(true);

    const initialSnapshotResponse = await fetch(`${baseUrl}/api/workbench/snapshot`, {
      headers: authHeaders(token),
    });
    assert.equal(initialSnapshotResponse.status, 200);
    const initialSnapshotBody = (await initialSnapshotResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(initialSnapshotBody.ok, true);
    assert.deepEqual(initialSnapshotBody.data.workspaces, []);

    const missingWorkspaceRunResponse = await fetch(`${baseUrl}/api/runs`, {
      body: JSON.stringify({
        clientCommandId: 'cmd-missing-workspace',
        participants: ['claude'],
        templateId: 'default',
        templateInputs: {
          prompt: 'Run without workspace',
        },
        workspaceId: 'ws-missing',
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(missingWorkspaceRunResponse.status, 404);
    const missingWorkspaceRunBody = (await missingWorkspaceRunResponse.json()) as Record<
      string,
      unknown
    >;
    assert.equal(
      ((missingWorkspaceRunBody.error as Record<string, unknown>).code),
      'workspace_not_found',
    );

    const workspaceResponse = await fetch(`${baseUrl}/api/workspaces/open`, {
      body: JSON.stringify({
        clientCommandId: 'cmd-open-workspace',
        rootPath: workspaceRoot,
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(workspaceResponse.status, 202);

    const workspaceId = await waitForWorkspaceIdByName(
      baseUrl,
      token,
      path.basename(workspaceRoot),
    );
    assert.match(workspaceId, /^workspace-/);

    const snapshot = await waitForWorkbenchSnapshot(baseUrl, token, (body) => {
      const workspaces = body.workspaces;
      return Array.isArray(workspaces)
        && workspaces.some(
          (workspace) =>
            workspace
            && typeof workspace === 'object'
            && (workspace as Record<string, unknown>).workspaceId === workspaceId
            && Array.isArray((workspace as Record<string, unknown>).runIds)
            && ((workspace as Record<string, unknown>).runIds as unknown[]).length === 0,
        );
    });
    const workspace = (snapshot.workspaces as Array<Record<string, unknown>>).find(
      (entry) => entry.workspaceId === workspaceId,
    );
    assert.equal(workspace?.name, path.basename(workspaceRoot));

    const reopenResponse = await fetch(`${baseUrl}/api/workspaces/open`, {
      body: JSON.stringify({
        clientCommandId: 'cmd-open-workspace-again',
        rootPath: workspaceRoot,
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(reopenResponse.status, 202);
    const reopenBody = (await reopenResponse.json()) as ApiEnvelope<Record<string, unknown>>;
    assert.equal(reopenBody.ok, true);
    assert.equal(reopenBody.data.entityId, workspaceId);

    const secondSnapshotResponse = await fetch(`${baseUrl}/api/workbench/snapshot`, {
      headers: authHeaders(token),
    });
    const secondSnapshotBody = (await secondSnapshotResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(Array.isArray(secondSnapshotBody.data.workspaces), true);
    assert.equal((secondSnapshotBody.data.workspaces as unknown[]).length, 1);
  });

  it('supports formal command routes and emits SSE envelopes with causedBy metadata', async () => {
    const { baseUrl, server, stateDir, token, workspaceRoot } = await startTestServer(true);
    const createCommandId = 'cmd-create-ui';
    let createAckId = '';
    const workspaceName = path.basename(workspaceRoot);
    const workspaceResponse = await fetch(`${baseUrl}/api/workspaces/open`, {
      body: JSON.stringify({
        clientCommandId: 'cmd-workspace-ui',
        rootPath: workspaceRoot,
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(workspaceResponse.status, 202);
    const workspaceId = await waitForWorkspaceIdByName(baseUrl, token, workspaceName);

    const createEnvelope = await waitForSseEnvelope(
      baseUrl,
      token,
      (payload) =>
        typeof payload.coreSessionId === 'string'
        && payload.coreSessionId === server.coreSessionId
        && typeof payload.causedBy === 'object'
        && payload.causedBy !== null
        && (payload.causedBy as Record<string, unknown>).clientCommandId === createCommandId,
      async () => {
        const response = await fetch(`${baseUrl}/api/runs`, {
          body: JSON.stringify({
            clientCommandId: createCommandId,
            participants: ['claude'],
            templateId: 'default',
            templateInputs: {
              prompt: 'Create a UI API run',
            },
            workspaceId,
          }),
          headers: authHeaders(token, true),
          method: 'POST',
        });
        assert.equal(response.status, 202);
        const body = (await response.json()) as ApiEnvelope<Record<string, unknown>>;
        assert.equal(body.ok, true);
        createAckId = String(body.data.ackId);
      },
    );

    assert.equal(
      (createEnvelope.causedBy as Record<string, unknown>).ackId,
      createAckId,
    );
    assert.equal(
      ((createEnvelope.event as Record<string, unknown>).status),
      'created',
    );

    const snapshot = await waitForWorkbenchSnapshot(baseUrl, token, (body) => {
      const runs = body.runs;
      return Array.isArray(runs)
        && runs.some(
          (run) =>
            run
            && typeof run === 'object'
            && (run as Record<string, unknown>).workspaceId === workspaceId,
        );
    });
    const commandRun = (snapshot.runs as Array<Record<string, unknown>>).find(
      (run) => run.workspaceId === workspaceId,
    );
    assert.ok(commandRun);
    const runId = String(commandRun.runId);

    const messageResponse = await fetch(`${baseUrl}/api/runs/${runId}/messages`, {
      body: JSON.stringify({
        body: 'hello command surface',
        clientCommandId: 'cmd-message-ui',
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(messageResponse.status, 202);
    const messageBody = (await messageResponse.json()) as ApiEnvelope<Record<string, unknown>>;
    assert.equal(messageBody.ok, true);

    const timeline = await waitForTimeline(baseUrl, token, runId, (body) => {
      const entries = body.entries;
      return Array.isArray(entries)
        && entries.some(
          (entry) =>
            entry
            && typeof entry === 'object'
            && (entry as Record<string, unknown>).kind === 'message'
            && typeof (entry as Record<string, unknown>).causedBy === 'object'
            && (entry as Record<string, unknown>).causedBy !== null
            && ((entry as Record<string, unknown>).causedBy as Record<string, unknown>).ackId
              === messageBody.data.ackId,
        );
    });
    assert.equal(Array.isArray(timeline.entries), true);

    const settingsPatchResponse = await fetch(`${baseUrl}/api/settings`, {
      body: JSON.stringify({
        clientCommandId: 'cmd-settings-ui',
        fields: {
          'appearance.theme': 'dark',
        },
      }),
      headers: authHeaders(token, true),
      method: 'PATCH',
    });
    assert.equal(settingsPatchResponse.status, 202);
    const settingsPatchBody = (await settingsPatchResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    assert.equal(settingsPatchBody.ok, true);

    const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
      headers: authHeaders(token),
    });
    const settingsBody = (await settingsResponse.json()) as ApiEnvelope<
      Record<string, unknown>
    >;
    const appearance = ((settingsBody.data.sections as Array<Record<string, unknown>>).find(
      (section) => section.sectionId === 'appearance',
    )?.fields ?? []) as Array<Record<string, unknown>>;
    assert.equal(
      appearance.some(
        (field) => field.fieldId === 'appearance.theme' && field.value === 'dark',
      ),
      true,
    );

    const proposalResponse = await fetch(`${baseUrl}/mcp/call`, {
      body: JSON.stringify({
        args: {
          confidence: 0.9,
          cue_draft: {
            anchors: ['ui'],
            gist: 'ui api proposal',
            pointers: ['git_commit:abc repo_path:src/ui.ts symbol:renderUi'],
            source: 'compiler',
          },
          impact_level: 'working',
          project_id: 'proj-ui-api',
        },
        tool: 'soul.propose_memory_update',
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(proposalResponse.status, 200);
    const proposalBody = (await proposalResponse.json()) as {
      result: { proposal_id: string };
    };

    const reviewResponse = await fetch(
      `${baseUrl}/api/memory/proposals/${proposalBody.result.proposal_id}/review`,
      {
        body: JSON.stringify({
          clientCommandId: 'cmd-review-ui',
          mode: 'accept',
        }),
        headers: authHeaders(token, true),
        method: 'POST',
      },
    );
    assert.equal(reviewResponse.status, 202);
    const reviewBody = (await reviewResponse.json()) as ApiEnvelope<Record<string, unknown>>;
    assert.equal(reviewBody.ok, true);
    await waitForAckStatus(
      baseUrl,
      token,
      String(reviewBody.data.ackId),
      (ack) => ack.status === 'committed' || ack.status === 'failed',
    );

    const cueDb = openSoulDb(stateDir);
    try {
      const cueCount = cueDb
        .prepare('SELECT COUNT(*) AS count FROM memory_cues WHERE project_id = ?')
        .get('proj-ui-api') as { count: number };
      assert.equal(cueCount.count >= 1, true);
    } finally {
      cueDb.close();
    }

    const driftResponse = await fetch(`${baseUrl}/api/nodes/node-1/resolve-drift`, {
      body: JSON.stringify({
        clientCommandId: 'cmd-drift-ui',
        mode: 'rollback',
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    });
    assert.equal(driftResponse.status, 202);
    const driftBody = (await driftResponse.json()) as ApiEnvelope<Record<string, unknown>>;
    assert.equal(driftBody.ok, true);
    const driftAck = await waitForAckStatus(
      baseUrl,
      token,
      String(driftBody.data.ackId),
      (ack) => ack.status === 'failed',
    );
    assert.equal(
      typeof driftAck.error === 'string' && driftAck.error.includes('Drift resolution'),
      true,
    );
  });
});
