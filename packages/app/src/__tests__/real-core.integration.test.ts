// @vitest-environment node

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchApprovalDecision,
  dispatchCreateRun,
  dispatchDriftResolution,
  dispatchMemoryGovernance,
  dispatchRunMessage,
  dispatchSettingsSave,
} from '../lib/commands';
import { retryAckOverlaySync } from '../lib/reconciliation';
import { createAppServices, resetAppServices, type AppServices } from '../lib/runtime/app-services';
import { startAppStoreRuntime } from '../stores/app-store-runtime';
import { resetAckOverlayStore, useAckOverlayStore } from '../stores/ack-overlay';
import { resetHotStateStore, useHotStateStore } from '../stores/hot-state';
import { resetPendingCommandStore, usePendingCommandStore } from '../stores/pending-command';
import { resetProjectionStore, useProjectionStore } from '../stores/projection';
import { resetSettingsBridgeStore } from '../stores/settings-bridge';
import { resetUiStore, useUiStore } from '../stores/ui';

const execFileAsync = promisify(execFile);
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../../../..');
const CORE_HTTP_SERVER_PATH = path.join(REPO_ROOT, 'packages/core/dist/server/http.js');

interface TestHttpServerHandle {
  readonly coreSessionId: string;
  readonly port: number;
  readonly sseManager?: {
    closeAll(): void;
  };
  stop(): Promise<void>;
}

interface TestServerContext {
  readonly baseUrl: string;
  readonly server: TestHttpServerHandle;
  readonly stateDir: string;
  readonly token: string;
  readonly workspaceRoot: string;
}

type StartHttpServer = (options: Record<string, unknown>) => Promise<TestHttpServerHandle>;

const activeRuntimeCleanups: Array<() => void> = [];
const activeServers: TestHttpServerHandle[] = [];
const tempDirs: string[] = [];

let cachedStartHttpServer: Promise<StartHttpServer> | null = null;

interface SnapshotEnvelope<T> {
  readonly data: T;
  readonly ok: boolean;
}

function authHeaders(token: string, includeJson = false): Record<string, string> {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: 'Bearer ' + token,
  };
}

function resetAppTestState(): void {
  resetAckOverlayStore();
  resetHotStateStore();
  resetPendingCommandStore();
  resetProjectionStore();
  resetSettingsBridgeStore();
  resetUiStore();
  resetAppServices();
}

async function loadStartHttpServer(): Promise<StartHttpServer> {
  if (!cachedStartHttpServer) {
    cachedStartHttpServer = import(pathToFileURL(CORE_HTTP_SERVER_PATH).href).then(
      (module) => module.startHttpServer as StartHttpServer,
    );
  }

  return cachedStartHttpServer;
}

async function runGit(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function startTestServer(
  options: {
    readonly isDevelopment?: boolean;
    readonly port?: number;
  } = {},
): Promise<TestServerContext> {
  const startHttpServer = await loadStartHttpServer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-app-int-'));
  tempDirs.push(tempDir);

  const sessionTokenPath = path.join(tempDir, 'run', 'session_token');
  const soulConfigPath = path.join(tempDir, 'soul-config.json');
  const stateDir = path.join(tempDir, 'state');
  const workspaceRoot = path.join(tempDir, 'workspace');
  const worktreeBasePath = path.join(tempDir, 'worktrees');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  await runGit(['init'], workspaceRoot);
  await runGit(['config', 'user.email', 'codex@example.com'], workspaceRoot);
  await runGit(['config', 'user.name', 'Codex'], workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), '# workspace\n', 'utf8');
  await runGit(['add', 'README.md'], workspaceRoot);
  await runGit(['commit', '-m', 'initial commit'], workspaceRoot);

  const server = await startHttpServer({
    host: '127.0.0.1',
    isDevelopment: options.isDevelopment ?? true,
    logger: false,
    port: options.port ?? 0,
    sessionTokenPath,
    skipSignalHandlers: true,
    soulConfigPath,
    stateDir,
    worktreeBasePath,
    workspaceRoot,
  });
  activeServers.push(server);

  return {
    baseUrl: 'http://127.0.0.1:' + server.port,
    server,
    stateDir,
    token: fs.readFileSync(sessionTokenPath, 'utf8').trim(),
    workspaceRoot,
  };
}

function untrackServer(server: TestHttpServerHandle): void {
  const index = activeServers.indexOf(server);
  if (index >= 0) {
    activeServers.splice(index, 1);
  }
}

function untrackRuntimeCleanup(cleanup: () => void): void {
  const index = activeRuntimeCleanups.indexOf(cleanup);
  if (index >= 0) {
    activeRuntimeCleanups.splice(index, 1);
  }
}

async function waitForCondition(
  assertion: () => void | Promise<void>,
  options: {
    readonly intervalMs?: number;
    readonly timeoutMs?: number;
  } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  let lastError: unknown = new Error('Condition was not satisfied before timeout.');

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs ?? 50);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function waitForWorkbenchRun(
  baseUrl: string,
  token: string,
  workspaceId: string,
): Promise<{ readonly revision: number; readonly runId: string }> {
  let matchedRunId = '';
  let matchedRevision = 0;

  await waitForCondition(async () => {
    const response = await fetch(baseUrl + '/api/workbench/snapshot', {
      headers: authHeaders(token),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SnapshotEnvelope<{
      readonly revision: number;
      readonly runs: Array<{ readonly runId: string; readonly workspaceId?: string | null }>;
    }>;
    expect(body.ok).toBe(true);
    const run = body.data.runs.find((entry) => entry.workspaceId === workspaceId);
    expect(run).toBeDefined();
    matchedRunId = run?.runId ?? '';
    matchedRevision = body.data.revision;
  });

  return {
    revision: matchedRevision,
    runId: matchedRunId,
  };
}

async function createRunViaHttp(
  baseUrl: string,
  token: string,
  workspaceId: string,
  prompt: string,
): Promise<string> {
  const response = await fetch(baseUrl + '/api/runs', {
    body: JSON.stringify({
      clientCommandId: 'seed-' + workspaceId,
      participants: ['lead', 'integrator'],
      templateId: 'default',
      templateInputs: {
        prompt,
      },
      templateVersion: 'v0.1-ui',
      workspaceId,
    }),
    headers: authHeaders(token, true),
    method: 'POST',
  });
  expect(response.status).toBe(202);
  return (await waitForWorkbenchRun(baseUrl, token, workspaceId)).runId;
}

async function sendMessageViaHttp(
  baseUrl: string,
  token: string,
  input: {
    readonly body: string;
    readonly clientCommandId: string;
    readonly runId: string;
  },
): Promise<void> {
  const response = await fetch(
    baseUrl + '/api/runs/' + encodeURIComponent(input.runId) + '/messages',
    {
      body: JSON.stringify({
        body: input.body,
        clientCommandId: input.clientCommandId,
      }),
      headers: authHeaders(token, true),
      method: 'POST',
    },
  );
  expect(response.status).toBe(202);
}

function openStateDb(stateDir: string): Database.Database {
  return new Database(path.join(stateDir, 'state.db'));
}

function openSoulDb(stateDir: string): Database.Database {
  return new Database(path.join(stateDir, 'soul.db'));
}

function insertApproval(
  stateDir: string,
  input: {
    readonly approvalId: string;
    readonly runId: string;
    readonly toolName: string;
  },
): void {
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
      'pending',
      now,
      null,
      null,
    );
  } finally {
    db.close();
  }
}

function insertGovernanceLease(
  stateDir: string,
  input: {
    readonly leaseId: string;
    readonly runId: string;
    readonly workspaceId: string;
  },
): void {
  const db = openStateDb(stateDir);

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
      '2026-03-12T10:00:00.000Z',
      '2026-03-13T10:00:00.000Z',
      'active',
    );
  } finally {
    db.close();
  }
}

function insertMemoryCue(
  stateDir: string,
  input: {
    readonly cueId: string;
    readonly projectId: string;
  },
): void {
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
      'Auth gist summary',
      'Auth claim summary',
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

function createHttpServices(
  baseUrl: string,
  token: string,
  reconnectDelayMs = 25,
): AppServices {
  return createAppServices({
    baseUrl,
    mockScenario: 'active',
    readFreshSessionToken: null,
    reconnectDelayMs,
    sessionToken: token,
    transportMode: 'http',
  });
}

function instrumentServices(services: AppServices): AppServices {
  const realCoreApi = services.coreApi;

  return {
    ...services,
    coreApi: {
      ...realCoreApi,
      getApprovalProbe: vi.fn(realCoreApi.getApprovalProbe.bind(realCoreApi)),
      getInspectorSnapshot: vi.fn(realCoreApi.getInspectorSnapshot.bind(realCoreApi)),
      getMemoryProbe: vi.fn(realCoreApi.getMemoryProbe.bind(realCoreApi)),
      getSettingsSnapshot: vi.fn(realCoreApi.getSettingsSnapshot.bind(realCoreApi)),
      getTimelinePage: vi.fn(realCoreApi.getTimelinePage.bind(realCoreApi)),
      getWorkbenchSnapshot: vi.fn(realCoreApi.getWorkbenchSnapshot.bind(realCoreApi)),
      listTemplates: vi.fn(realCoreApi.listTemplates.bind(realCoreApi)),
      postCommand: vi.fn(realCoreApi.postCommand.bind(realCoreApi)),
      probeCommand: vi.fn(realCoreApi.probeCommand.bind(realCoreApi)),
    },
  };
}

async function startRuntime(services: AppServices): Promise<() => void> {
  const bootstrapSnapshot = await services.coreApi.getWorkbenchSnapshot();
  const cleanupStores = startAppStoreRuntime(services, {
    bootstrapSnapshot,
  });
  const stopEvents = services.eventClient.start();
  const cleanup = () => {
    stopEvents();
    cleanupStores();
  };
  activeRuntimeCleanups.push(cleanup);
  return cleanup;
}

async function bootstrapHotState(services: AppServices): Promise<void> {
  const snapshot = await services.coreApi.getWorkbenchSnapshot();
  useHotStateStore.getState().applyWorkbenchSnapshot(snapshot);
}

function getFieldValue(
  sections: ReadonlyArray<{
    readonly fields: ReadonlyArray<{ readonly fieldId: string; readonly value?: unknown }>;
  }>,
  fieldId: string,
): unknown {
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.fieldId === fieldId) {
        return field.value;
      }
    }
  }

  return undefined;
}

beforeEach(() => {
  resetAppTestState();
});

afterEach(async () => {
  while (activeRuntimeCleanups.length > 0) {
    activeRuntimeCleanups.pop()?.();
  }

  resetAppTestState();

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

describe('real-core integration', () => {
  it('boots the app store runtime against real Core and settles create-run plus send-message flow', async () => {
    const context = await startTestServer();
    const services = createHttpServices(context.baseUrl, context.token);

    await startRuntime(services);
    await waitForCondition(() => {
      expect(useHotStateStore.getState().connectionState).toBe('connected');
      expect(useHotStateStore.getState().globalInteractionLock).toBe(false);
    });

    const templates = await services.coreApi.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((template) => template.templateId === 'default')).toBe(true);

    const createResult = await dispatchCreateRun(
      'ws-bootstrap',
      {
        participants: ['lead', 'integrator'],
        templateId: 'default',
        templateInputs: {
          prompt: 'Bootstrap run from integration test',
        },
        templateVersion: 'v0.1-ui',
      },
      services.coreApi,
    );
    expect(createResult.ok).toBe(true);

    let runId = '';
    await waitForCondition(() => {
      const run = Object.values(useHotStateStore.getState().runsById).find(
        (entry) => entry.workspaceId === 'ws-bootstrap',
      );
      expect(run).toBeDefined();
      expect(
        usePendingCommandStore.getState().entriesById[createResult.entry.clientCommandId]?.status,
      ).toBe('settled');
      runId = run?.runId ?? '';
    });

    useUiStore.getState().setSelectedWorkspaceId('ws-bootstrap');
    useUiStore.getState().setSelectedRunId(runId);
    await useProjectionStore.getState().refetchTimeline(services.coreApi, {
      limit: 50,
      runId,
    });

    const messageResult = await dispatchRunMessage(
      runId,
      'ws-bootstrap',
      'real core message path',
      services.coreApi,
    );
    expect(messageResult.ok).toBe(true);

    await waitForCondition(() => {
      expect(
        usePendingCommandStore.getState().entriesById[messageResult.entry.clientCommandId]?.status,
      ).toBe('settled');
      const projection = useProjectionStore.getState().runTimelines[runId];
      expect(
        projection?.entries.some(
          (entry) =>
            entry.body?.includes('real core message path') &&
            entry.causedBy?.ackId === messageResult.entry.ackId,
        ),
      ).toBe(true);
    });
  });

  it('uses targeted approval and settings probes during overlay reconciliation', async () => {
    const context = await startTestServer({
      isDevelopment: false,
    });
    const runId = await createRunViaHttp(
      context.baseUrl,
      context.token,
      'ws-probes',
      'Approval and settings probe seed',
    );
    insertApproval(context.stateDir, {
      approvalId: 'approval-real-1',
      runId,
      toolName: 'tools.shell_exec',
    });
    insertGovernanceLease(context.stateDir, {
      leaseId: 'lease-real-1',
      runId,
      workspaceId: 'ws-probes',
    });

    const services = instrumentServices(createHttpServices(context.baseUrl, context.token));
    await startRuntime(services);
    await waitForCondition(() => {
      expect(useHotStateStore.getState().globalInteractionLock).toBe(false);
    });

    const approvalResult = await dispatchApprovalDecision(
      {
        approvalId: 'approval-real-1',
        decision: 'allow_once',
        runId,
      },
      services.coreApi,
    );
    expect(approvalResult.ok).toBe(true);

    await waitForCondition(() => {
      expect(
        useAckOverlayStore.getState().entriesById[approvalResult.entry.clientCommandId]?.status,
      ).toBe('settled');
    });
    expect(services.coreApi.getApprovalProbe).toHaveBeenCalledWith('approval-real-1');

    const settingsSnapshot = await services.coreApi.getSettingsSnapshot();
    expect(settingsSnapshot.lease.status).toBe('active');
    expect(settingsSnapshot.lease.lockedFields).toContain('engine.connection_mode');

    const settingsResult = await dispatchSettingsSave(
      {
        'appearance.theme': 'dark',
      },
      services.coreApi,
    );
    expect(settingsResult.ok).toBe(true);

    await waitForCondition(() => {
      expect(
        useAckOverlayStore.getState().entriesById[settingsResult.entry.clientCommandId]?.status,
      ).toBe('settled');
    });
    expect(services.coreApi.getSettingsSnapshot).toHaveBeenCalled();

    const updatedSettings = await services.coreApi.getSettingsSnapshot();
    expect(getFieldValue(updatedSettings.sections, 'appearance.theme')).toBe('dark');
  });

  it('merges paged timeline history from the real query surface without disturbing the optimistic tail', async () => {
    const context = await startTestServer({
      isDevelopment: false,
    });
    const runId = await createRunViaHttp(
      context.baseUrl,
      context.token,
      'ws-pagination',
      'Pagination seed run',
    );

    await sendMessageViaHttp(context.baseUrl, context.token, {
      body: 'entry one',
      clientCommandId: 'seed-msg-1',
      runId,
    });
    await sendMessageViaHttp(context.baseUrl, context.token, {
      body: 'entry two',
      clientCommandId: 'seed-msg-2',
      runId,
    });
    await sendMessageViaHttp(context.baseUrl, context.token, {
      body: 'entry three',
      clientCommandId: 'seed-msg-3',
      runId,
    });
    await sendMessageViaHttp(context.baseUrl, context.token, {
      body: 'entry four',
      clientCommandId: 'seed-msg-4',
      runId,
    });

    const services = createHttpServices(context.baseUrl, context.token);
    await bootstrapHotState(services);

    await waitForCondition(async () => {
      const page = await services.coreApi.getTimelinePage({
        limit: 50,
        runId,
      });
      expect(page.entries.length).toBeGreaterThanOrEqual(4);
    });

    await useProjectionStore.getState().refetchTimeline(services.coreApi, {
      limit: 2,
      runId,
    });

    const firstPage = useProjectionStore.getState().runTimelines[runId];
    expect(firstPage.entries).toHaveLength(2);
    expect(firstPage.hasMoreBefore).toBe(true);
    expect(typeof firstPage.nextBeforeRevision).toBe('number');

    const optimisticResult = await dispatchRunMessage(
      runId,
      'ws-pagination',
      'optimistic pagination tail',
      services.coreApi,
    );
    expect(optimisticResult.ok).toBe(true);
    expect(
      usePendingCommandStore.getState().entriesById[optimisticResult.entry.clientCommandId]?.status,
    ).toBe('acked');

    await useProjectionStore.getState().refetchTimeline(services.coreApi, {
      beforeRevision: firstPage.nextBeforeRevision ?? undefined,
      limit: 2,
      runId,
    });

    const mergedProjection = useProjectionStore.getState().runTimelines[runId];
    expect(mergedProjection.entries.length).toBeGreaterThan(2);
    expect(mergedProjection.entries.some((entry) => entry.body?.includes('entry one'))).toBe(true);
    expect(mergedProjection.entries.some((entry) => entry.body?.includes('entry four'))).toBe(true);
    expect(
      usePendingCommandStore.getState().entriesById[optimisticResult.entry.clientCommandId]?.status,
    ).toBe('acked');
  });

  it('surfaces unsupported memory governance as desynced overlays via the real ack probe path', async () => {
    const context = await startTestServer({
      isDevelopment: false,
    });
    const runId = await createRunViaHttp(
      context.baseUrl,
      context.token,
      'ws-memory',
      'Memory governance seed run',
    );
    insertMemoryCue(context.stateDir, {
      cueId: 'cue-real-1',
      projectId: 'proj-memory',
    });

    const services = instrumentServices(createHttpServices(context.baseUrl, context.token));
    await bootstrapHotState(services);

    const result = await dispatchMemoryGovernance(
      {
        memoryId: 'cue-real-1',
        mode: 'pin',
        runId,
      },
      services.coreApi,
    );
    expect(result.ok).toBe(true);

    await retryAckOverlaySync(result.entry.clientCommandId, services.coreApi);

    expect(services.coreApi.probeCommand).toHaveBeenCalled();
    expect(
      useAckOverlayStore.getState().entriesById[result.entry.clientCommandId]?.status,
    ).toBe('desynced');
    expect(
      usePendingCommandStore.getState().entriesById[result.entry.clientCommandId]?.status,
    ).toBe('failed');
  });

  it('surfaces unsupported drift decisions as desynced overlays via the real ack probe path', async () => {
    const context = await startTestServer({
      isDevelopment: false,
    });
    const runId = await createRunViaHttp(
      context.baseUrl,
      context.token,
      'ws-drift',
      'Drift resolution seed run',
    );
    const services = instrumentServices(createHttpServices(context.baseUrl, context.token));
    await bootstrapHotState(services);

    const result = await dispatchDriftResolution(
      {
        actionId: 'node-stale-1',
        mode: 'rollback',
        runId,
      },
      services.coreApi,
    );
    expect(result.ok).toBe(true);

    await retryAckOverlaySync(result.entry.clientCommandId, services.coreApi);

    expect(services.coreApi.probeCommand).toHaveBeenCalled();
    expect(
      useAckOverlayStore.getState().entriesById[result.entry.clientCommandId]?.status,
    ).toBe('desynced');
    expect(
      usePendingCommandStore.getState().entriesById[result.entry.clientCommandId]?.status,
    ).toBe('failed');
  });

  it(
    'engages the global interaction lock when the real event client disconnects',
    async () => {
    const context = await startTestServer();
    const services = createHttpServices(context.baseUrl, context.token, 5_000);
    const cleanupRuntime = await startRuntime(services);

    await waitForCondition(() => {
      expect(useHotStateStore.getState().connectionState).toBe('connected');
      expect(useHotStateStore.getState().globalInteractionLock).toBe(false);
    });

    services.eventClient.stop();

    await waitForCondition(() => {
      const state = useHotStateStore.getState();
      expect(state.connectionState).toBe('disconnected');
      expect(state.globalInteractionLock).toBe(true);
    }, {
      timeoutMs: 10_000,
    });

    const lockedResult = await dispatchCreateRun(
      'ws-offline',
      {
        participants: ['lead'],
        templateId: 'default',
        templateInputs: {
          prompt: 'This should be blocked while Core is unavailable',
        },
        templateVersion: 'v0.1-ui',
      },
      services.coreApi,
    );
    expect(lockedResult.ok).toBe(false);
    expect(
      usePendingCommandStore.getState().entriesById[lockedResult.entry.clientCommandId]?.errorCode,
    ).toBe('COMMAND_INTERACTION_LOCKED');

    cleanupRuntime();
    untrackRuntimeCleanup(cleanupRuntime);
    await context.server.stop();
    untrackServer(context.server);
    },
    15_000,
  );
});



