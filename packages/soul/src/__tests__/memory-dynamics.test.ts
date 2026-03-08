import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { clampActivation, updateActivation } from '../dynamics/activation.js';
import { KarmaListener } from '../dynamics/karma-listener.js';
import { computeRetention, shouldPrune } from '../dynamics/retention.js';
import { RetentionScheduler } from '../dynamics/scheduler.js';
import { SoulStateStore } from '../db/soul-state-store.js';
import { SoulWorkerClient } from '../db/worker-client.js';
import { createSoulTestEnv, type SoulTestEnv } from './helpers.js';

const activeEnvs: SoulTestEnv[] = [];
const activeWorkers: SoulWorkerClient[] = [];

function createDbHarness() {
  const env = createSoulTestEnv();
  const worker = new SoulWorkerClient(env.dbPath);
  activeEnvs.push(env);
  activeWorkers.push(worker);
  return {
    env,
    stateStore: new SoulStateStore(env.dbPath),
    worker,
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

describe('memory dynamics', () => {
  it('computes half-life retention and protects canon cues from fast decay', () => {
    const now = new Date('2026-03-08T00:00:00.000Z');
    const workingRetention = computeRetention(
      {
        created_at: '2026-03-01T00:00:00.000Z',
        formation_kind: 'observation',
        impact_level: 'working',
        last_hit_at: null,
        last_used_at: null,
        retention_score: 1,
        updated_at: '2026-03-01T00:00:00.000Z',
      },
      now,
    );
    const canonRetention = computeRetention(
      {
        created_at: '2026-03-01T00:00:00.000Z',
        formation_kind: 'observation',
        impact_level: 'canon',
        last_hit_at: null,
        last_used_at: null,
        retention_score: 1,
        updated_at: '2026-03-01T00:00:00.000Z',
      },
      now,
    );

    assert.ok(Math.abs(workingRetention - 0.5) < 0.02);
    assert.equal(canonRetention > workingRetention, true);
  });

  it('keeps activation inside [0, 10]', () => {
    assert.equal(
      updateActivation(9.5, {
        cue_id: 'cue-1',
        karma_type: 'accept',
        triggered_by: 'user',
      }, new Date()) <= 10,
      true,
    );
    assert.equal(clampActivation(-5), 0);
  });

  it('applies karma events from soul events', async () => {
    const { env, stateStore, worker } = createDbHarness();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, anchors, pointers, activation_score,
        confidence, impact_level, pruned, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-1',
        'proj-1',
        'auth',
        'compiler',
        '["auth"]',
        '[]',
        1,
        0.9,
        'canon',
        0,
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    const listener = new KarmaListener({
      stateStore,
      writer: worker,
    });
    const bus = new EventEmitter();
    const detach = listener.attach({
      off: (eventType, handler) => bus.off(eventType, handler),
      on: (eventType, handler) => bus.on(eventType, handler),
    });

    bus.emit('memory_cue_accepted', {
      cueId: 'cue-1',
      event: 'memory_cue_accepted',
      revision: 1,
      runId: 'run-1',
      source: 'soul',
      timestamp: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    detach();

    const db = new Database(env.dbPath, { readonly: true });
    const row = db
      .prepare('SELECT activation_score FROM memory_cues WHERE cue_id = ?')
      .get('cue-1') as { activation_score: number } | undefined;
    db.close();

    assert.equal((row?.activation_score ?? 0) > 1, true);
  });

  it('marks low-retention working cues as pruned during a sweep', async () => {
    const { env, stateStore, worker } = createDbHarness();
    env.insertSql(
      `INSERT INTO memory_cues (
        cue_id, project_id, gist, source, formation_kind, anchors, pointers,
        retention_score, confidence, impact_level, pruned, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'cue-prune',
        'proj-1',
        'stale note',
        'compiler',
        'observation',
        '["stale"]',
        '[]',
        0.04,
        0.9,
        'working',
        0,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ],
    );

    assert.equal(
      shouldPrune(
        {
          created_at: '2026-01-01T00:00:00.000Z',
          formation_kind: 'observation',
          impact_level: 'working',
          last_hit_at: null,
          last_used_at: null,
          retention_score: 0.04,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        new Date('2026-03-08T00:00:00.000Z'),
      ),
      true,
    );

    const scheduler = new RetentionScheduler({
      intervalMs: 1_000,
      stateStore,
      writer: worker,
    });
    await scheduler.sweep(new Date('2026-03-08T00:00:00.000Z'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const db = new Database(env.dbPath, { readonly: true });
    const row = db
      .prepare('SELECT pruned FROM memory_cues WHERE cue_id = ?')
      .get('cue-prune') as { pruned: number } | undefined;
    db.close();

    assert.equal(row?.pruned, 1);
  });
});
