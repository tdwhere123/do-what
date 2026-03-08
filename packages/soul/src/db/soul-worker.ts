import Database from 'better-sqlite3';
import { parentPort, workerData } from 'node:worker_threads';
import { shouldWarnClaimWrite } from '../claim/write-guard.js';
import { runPendingMigrations } from './migration-runner.js';

interface WorkerData {
  dbPath: string;
}

interface WriteMessage {
  id: string;
  params: unknown[];
  sql: string;
  type: 'write';
}

interface ResultMessage {
  error?: string;
  id: string;
  ok: boolean;
  type: 'result';
}

const BATCH_SIZE = 5;
const MAX_QUEUE_LENGTH = 1000;

type QueueItem = WriteMessage;

function main(): void {
  const data = workerData as WorkerData;
  const db = new Database(data.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  runPendingMigrations(db);

  const queue: QueueItem[] = [];
  let processing = false;

  const postResult = (message: ResultMessage) => {
    parentPort?.postMessage(message);
  };

  const processQueue = () => {
    if (processing) {
      return;
    }

    processing = true;

    const runBatch = () => {
      let handled = 0;

      while (queue.length > 0 && handled < BATCH_SIZE) {
        handled += 1;
        const item = queue.shift();
        if (!item) {
          continue;
        }

        try {
          if (shouldWarnClaimWrite(item.sql)) {
            console.warn('[soul][db-worker] claim_* write attempted outside checkpoint path');
          }
          db.prepare(item.sql).run(item.params);
          postResult({ id: item.id, ok: true, type: 'result' });
        } catch (error) {
          postResult({
            error: error instanceof Error ? error.message : String(error),
            id: item.id,
            ok: false,
            type: 'result',
          });
        }
      }

      if (queue.length > 0) {
        setImmediate(runBatch);
        return;
      }

      processing = false;
    };

    runBatch();
  };

  parentPort?.on('message', (message: WriteMessage) => {
    if (message.type !== 'write') {
      return;
    }

    if (queue.length >= MAX_QUEUE_LENGTH) {
      postResult({
        error: 'write queue overflow: request rejected',
        id: message.id,
        ok: false,
        type: 'result',
      });
      console.warn('[soul][db-worker] write queue overflow, rejected newest request');
      return;
    }

    queue.push(message);
    processQueue();
  });
}

main();
