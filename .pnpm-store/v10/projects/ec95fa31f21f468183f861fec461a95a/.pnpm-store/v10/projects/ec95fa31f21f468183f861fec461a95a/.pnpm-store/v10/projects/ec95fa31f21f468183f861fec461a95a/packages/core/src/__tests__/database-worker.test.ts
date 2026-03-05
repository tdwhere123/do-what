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

function setupTable(dbPath: string, sql: string): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(sql);
  db.close();
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
    setupTable(
      dbPath,
      'CREATE TABLE event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, seq INTEGER NOT NULL);',
    );

    const client = new WorkerClient(dbPath);
    clients.push(client);

    const writes: Promise<void>[] = [];
    for (let index = 1; index <= 100; index += 1) {
      writes.push(
        client.write({
          params: [index],
          sql: 'INSERT INTO event_log (seq) VALUES (?)',
        }),
      );
    }

    await Promise.all(writes);

    const rows = readRows<{ seq: number }>(
      dbPath,
      'SELECT seq FROM event_log ORDER BY id ASC',
    );
    assert.equal(rows.length, 100);
    for (let index = 1; index <= 100; index += 1) {
      assert.equal(rows[index - 1].seq, index);
    }
  });

  it('restarts worker after crash and continues writing', async () => {
    const dbPath = createTempDb();
    setupTable(dbPath, 'CREATE TABLE event_log (value INTEGER NOT NULL);');

    const client = new WorkerClient(dbPath);
    clients.push(client);

    await client.write({
      params: [1],
      sql: 'INSERT INTO event_log (value) VALUES (?)',
    });

    const rawWorker = (client as unknown as { worker: Worker }).worker;
    await rawWorker.terminate();
    await sleep(100);

    await client.write({
      params: [2],
      sql: 'INSERT INTO event_log (value) VALUES (?)',
    });

    const rows = readRows<{ value: number }>(
      dbPath,
      'SELECT value FROM event_log ORDER BY rowid ASC',
    );
    assert.deepEqual(
      rows.map((row) => row.value),
      [1, 2],
    );
  });
});
