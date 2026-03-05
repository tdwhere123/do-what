import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { afterEach, describe, it } from 'node:test';
import { WorkerClient } from '../db/worker-client.js';

const tempDirs: string[] = [];
const clients: WorkerClient[] = [];

function createTempDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-db-worker-'));
  tempDirs.push(dir);
  return path.join(dir, 'state.db');
}

function readRows<T>(dbPath: string, sql: string): T[] {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(sql).all() as T[];
  db.close();
  return rows;
}

afterEach(async () => {
  while (clients.length > 0) {
    const client = clients.pop();
    if (client) {
      await client.close();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('DatabaseWorker', () => {
  it('processes writes serially without dropping order', async () => {
    const dbPath = createTempDb();
    const client = new WorkerClient(dbPath);
    clients.push(client);

    const timestamp = '2026-01-01T00:00:00.000Z';
    const writes: Promise<void>[] = [];
    for (let index = 1; index <= 100; index += 1) {
      writes.push(
        client.write({
          params: [
            index,
            timestamp,
            'test.event',
            'run-test',
            'database-worker.test',
            JSON.stringify({ seq: index }),
          ],
          sql: 'INSERT INTO event_log (revision, timestamp, event_type, run_id, source, payload) VALUES (?, ?, ?, ?, ?, ?)',
        }),
      );
    }

    await Promise.all(writes);

    const rows = readRows<{ payload: string; revision: number }>(
      dbPath,
      'SELECT revision, payload FROM event_log ORDER BY revision ASC',
    );
    assert.equal(rows.length, 100);
    for (let index = 1; index <= 100; index += 1) {
      assert.equal(rows[index - 1].revision, index);
      const payload = JSON.parse(rows[index - 1].payload) as { seq: number };
      assert.equal(payload.seq, index);
    }
  });

  it('restarts worker after crash and continues writing', async () => {
    const dbPath = createTempDb();

    const client = new WorkerClient(dbPath);
    clients.push(client);

    const timestamp = '2026-01-01T00:00:00.000Z';
    await client.write({
      params: [
        1,
        timestamp,
        'test.event',
        'run-test',
        'database-worker.test',
        JSON.stringify({ value: 1 }),
      ],
      sql: 'INSERT INTO event_log (revision, timestamp, event_type, run_id, source, payload) VALUES (?, ?, ?, ?, ?, ?)',
    });

    const rawWorker = (client as unknown as { worker: Worker }).worker;
    await rawWorker.terminate();
    await sleep(100);

    await client.write({
      params: [
        2,
        timestamp,
        'test.event',
        'run-test',
        'database-worker.test',
        JSON.stringify({ value: 2 }),
      ],
      sql: 'INSERT INTO event_log (revision, timestamp, event_type, run_id, source, payload) VALUES (?, ?, ?, ?, ?, ?)',
    });

    const rows = readRows<{ payload: string; revision: number }>(
      dbPath,
      'SELECT revision, payload FROM event_log ORDER BY revision ASC',
    );
    assert.deepEqual(rows.map((row) => row.revision), [1, 2]);
    assert.deepEqual(
      rows.map((row) => (JSON.parse(row.payload) as { value: number }).value),
      [1, 2],
    );
  });
});
