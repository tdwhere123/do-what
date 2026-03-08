import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it } from 'node:test';
import { DecisionRecorder } from '../ledger/decision-recorder.js';
import { LedgerReader } from '../ledger/ledger-reader.js';
import { LedgerWriter } from '../ledger/ledger-writer.js';

const tempDirs: string[] = [];

function createLedgerPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-ledger-'));
  tempDirs.push(tempDir);
  return path.join(tempDir, 'evidence', 'user_decisions.jsonl');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  }
});

describe('user ledger', () => {
  it('appends decisions and reads them back with filtering', async () => {
    const ledgerPath = createLedgerPath();
    const writer = new LedgerWriter({ ledgerPath });

    await writer.append({
      context_snapshot: {
        cue_gist: 'auth note',
        formation_kind: 'observation',
        workspace_id: 'proj-1',
      },
      decision_id: 'decision-1',
      decision_type: 'accept',
      linked_memory_id: 'cue-1',
      timestamp: '2026-03-08T00:00:00.000Z',
    });
    await writer.append({
      context_snapshot: {
        cue_gist: 'risk note',
        formation_kind: 'synthesis',
        workspace_id: 'proj-1',
      },
      decision_id: 'decision-2',
      decision_type: 'reject',
      linked_memory_id: 'cue-2',
      timestamp: '2026-03-08T01:00:00.000Z',
    });

    const all = await writer.read();
    const filtered = await writer.read({
      decision_type: 'reject',
      since: '2026-03-08T00:30:00.000Z',
    });

    assert.equal(all.length, 2);
    assert.deepEqual(filtered.map((decision) => decision.decision_id), ['decision-2']);
    assert.equal(fs.existsSync(ledgerPath), true);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(ledgerPath).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  });

  it('skips corrupt lines without failing the remaining records', async () => {
    const ledgerPath = createLedgerPath();
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(
      ledgerPath,
      [
        JSON.stringify({
          context_snapshot: {
            cue_gist: 'auth note',
            formation_kind: 'observation',
            workspace_id: 'proj-1',
          },
          decision_id: 'decision-1',
          decision_type: 'accept',
          linked_memory_id: 'cue-1',
          timestamp: '2026-03-08T00:00:00.000Z',
        }),
        '{broken json',
      ].join('\n'),
      'utf8',
    );

    const warnings: string[] = [];
    const reader = new LedgerReader({
      ledgerPath,
      warn: (message) => warnings.push(message),
    });
    const decisions = await reader.read();

    assert.equal(decisions.length, 1);
    assert.equal(warnings.length, 1);
  });

  it('records supported soul events and deduplicates rapid repeats', async () => {
    const ledgerPath = createLedgerPath();
    const writer = new LedgerWriter({ ledgerPath });
    let currentTime = Date.parse('2026-03-08T00:00:00.000Z');
    const recorder = new DecisionRecorder({
      ledgerWriter: writer,
      now: () => new Date(currentTime),
      recentWindowMs: 60_000,
    });
    const bus = new EventEmitter();
    const unsubscribe = recorder.attach(
      {
        off: (eventType, listener) => bus.off(eventType, listener),
        on: (eventType, listener) => bus.on(eventType, listener),
      },
      async (event) => ({
        claim_draft_id:
          'claimDraftId' in event && typeof event.claimDraftId === 'string'
            ? event.claimDraftId
            : undefined,
        context_snapshot: {
          cue_gist: 'auth note',
          formation_kind: 'observation',
          workspace_id: 'proj-1',
        },
      }),
    );

    bus.emit('memory_cue_accepted', {
      cueId: 'cue-1',
      event: 'memory_cue_accepted',
      projectId: 'proj-1',
      revision: 1,
      runId: 'run-1',
      source: 'soul',
      timestamp: '2026-03-08T00:00:00.000Z',
    });
    bus.emit('memory_cue_accepted', {
      cueId: 'cue-1',
      event: 'memory_cue_accepted',
      projectId: 'proj-1',
      revision: 2,
      runId: 'run-1',
      source: 'soul',
      timestamp: '2026-03-08T00:00:10.000Z',
    });
    currentTime += 61_000;
    bus.emit('claim_superseded', {
      cueId: 'cue-1',
      draftId: 'draft-1',
      event: 'claim_superseded',
      revision: 3,
      runId: 'run-1',
      source: 'soul',
      timestamp: '2026-03-08T00:01:01.000Z',
    });
    await recorder.flush();

    unsubscribe();

    const decisions = await writer.read();
    assert.deepEqual(
      decisions.map((decision) => decision.decision_type),
      ['accept', 'supersede'],
    );
    assert.equal(decisions[1]?.claim_draft_id, 'draft-1');
  });
});
