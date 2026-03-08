import type {
  BaseEvent,
  ClaimDraft,
  ClaimResolution,
  RunCheckpointEvent,
} from '@do-what/protocol';
import { CHECKPOINT_CLAIM_WRITE_MARKER } from './write-guard.js';
import type { CueRow } from '../db/schema.js';
import { TABLE_MEMORY_CUES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import type { SoulEventPublisher } from '../mcp/types.js';
import type { ClaimQueue } from './claim-queue.js';
import type { EvidenceCapsuleWriter } from '../evidence/capsule-writer.js';

export interface CheckpointWriterOptions {
  claimQueue: ClaimQueue;
  evidenceCapsuleWriter?: EvidenceCapsuleWriter;
  publishEvent?: SoulEventPublisher;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

export class CheckpointWriter {
  private readonly claimQueue: ClaimQueue;
  private readonly evidenceCapsuleWriter?: EvidenceCapsuleWriter;
  private readonly publishEvent?: SoulEventPublisher;
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: CheckpointWriterOptions) {
    this.claimQueue = options.claimQueue;
    this.evidenceCapsuleWriter = options.evidenceCapsuleWriter;
    this.publishEvent = options.publishEvent;
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async handle(event: RunCheckpointEvent): Promise<void> {
    const { accepted, resolved, resolutions } = this.claimQueue.resolveAtCheckpoint(event.projectId);

    for (const record of accepted) {
      await this.writer.write({
        params: [
          record.claim.draft_id,
          record.claim.claim_confidence,
          record.claim.claim_gist,
          record.claim.claim_mode,
          record.claim.claim_source,
          record.cueId,
        ],
        sql: `/* ${CHECKPOINT_CLAIM_WRITE_MARKER} */
              UPDATE ${TABLE_MEMORY_CUES}
              SET claim_draft = ?,
                  claim_confidence = ?,
                  claim_gist = ?,
                  claim_mode = ?,
                  claim_source = ?
              WHERE cue_id = ?`,
      });

      publishEvent(this.publishEvent, {
        changedFields: ['claim_draft', 'claim_confidence', 'claim_gist', 'claim_mode', 'claim_source'],
        cueId: record.cueId,
        event: 'memory_cue_modified',
        projectId: record.projectId,
        runId: event.runId,
        source: 'soul.checkpoint-writer',
        timestamp: new Date().toISOString(),
      });

      const cue = this.getCue(record.cueId);
      if (cue && this.evidenceCapsuleWriter) {
        await this.evidenceCapsuleWriter.writeAcceptedClaim({
          claim: record.claim,
          cue,
        });
      }
    }

    for (const resolution of resolutions) {
      if (resolution.resolution === 'superseded') {
        const record = resolved.find((candidate) => candidate.resolution.draft_id === resolution.draft_id);
        publishEvent(this.publishEvent, {
          cueId: record?.record.cueId ?? '',
          draftId: resolution.draft_id,
          event: 'claim_superseded',
          runId: event.runId,
          source: 'soul.checkpoint-writer',
          timestamp: resolution.resolved_at,
        });
      }
    }
  }

  private getCue(cueId: string): CueRow | null {
    return this.stateStore.read(
      (db) =>
        (db
          .prepare(`SELECT * FROM ${TABLE_MEMORY_CUES} WHERE cue_id = ?`)
          .get(cueId) as CueRow | undefined) ?? null,
      null,
    );
  }
}

function publishEvent(
  publisher: SoulEventPublisher | undefined,
  event: Omit<BaseEvent, 'revision'>,
): void {
  if (!publisher) {
    return;
  }

  publisher(event);
}
