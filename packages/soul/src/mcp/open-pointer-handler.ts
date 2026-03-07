import { randomUUID } from 'node:crypto';
import { SoulToolsSchemas } from '@do-what/protocol';
import {
  TABLE_EVIDENCE_INDEX,
  TABLE_MEMORY_CUES,
  type EvidenceRow,
} from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import {
  EvidenceExtractor,
  type EvidenceExtractionResult,
} from '../evidence/evidence-extractor.js';
import type { HealingQueue } from '../pointer/healing-queue.js';
import { generatePointerKey } from '../pointer/pointer-key.js';
import { parsePointer } from '../pointer/pointer-parser.js';
import { createMemoryEvent, publishMemoryEvent } from './events.js';
import type { SoulEventPublisher } from './types.js';
import { SoulToolValidationError } from './types.js';

interface CueLookupRow {
  cue_id: string;
  gist: string;
  impact_level: string;
  project_id: string | null;
}

export interface OpenPointerHandlerOptions {
  extractor: EvidenceExtractor;
  healingQueue?: HealingQueue;
  publishEvent?: SoulEventPublisher;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

function mapResult(result: EvidenceExtractionResult): Record<string, unknown> {
  return {
    components: result.components,
    content: result.content,
    degraded: result.degraded,
    filePath: result.filePath,
    found: result.found,
    gist: result.gist,
    level: result.effectiveLevel,
    lineEnd: result.lineEnd,
    lineStart: result.lineStart,
    reason: result.reason,
    tokensUsed: result.tokensUsed,
  };
}

async function upsertEvidenceAccess(
  writer: SoulWorkerClient,
  cueId: string | undefined,
  pointer: string,
  pointerKey: string,
  level: string,
  contentHash: string | undefined,
): Promise<void> {
  if (!cueId) {
    return;
  }

  const now = new Date().toISOString();
  await writer.write({
    params: [
      randomUUID(),
      cueId,
      pointer,
      pointerKey,
      level,
      contentHash ?? null,
      now,
    ],
    sql: `INSERT INTO ${TABLE_EVIDENCE_INDEX} (
            evidence_id,
            cue_id,
            pointer,
            pointer_key,
            level,
            content_hash,
            last_accessed,
            access_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(pointer_key) DO UPDATE SET
            pointer = excluded.pointer,
            level = excluded.level,
            content_hash = excluded.content_hash,
            last_accessed = excluded.last_accessed,
            access_count = ${TABLE_EVIDENCE_INDEX}.access_count + 1`,
  });
}

function findCueByPointer(stateStore: SoulStateStore, pointer: string): CueLookupRow | null {
  return stateStore.read(
    (db) =>
      (db
        .prepare(
          `SELECT cue_id, gist, project_id, impact_level
           FROM ${TABLE_MEMORY_CUES}
           WHERE EXISTS (
             SELECT 1
             FROM json_each(${TABLE_MEMORY_CUES}.pointers)
             WHERE value = ?
           )
           LIMIT 1`,
        )
        .get(pointer) as CueLookupRow | undefined) ?? null,
    null,
  );
}

function findEvidenceByPointerKey(
  stateStore: SoulStateStore,
  pointerKey: string,
): EvidenceRow | null {
  return stateStore.read(
    (db) =>
      (db
        .prepare(
          `SELECT *
           FROM ${TABLE_EVIDENCE_INDEX}
           WHERE pointer_key = ?`,
        )
        .get(pointerKey) as EvidenceRow | undefined) ?? null,
    null,
  );
}

export function createOpenPointerHandler(options: OpenPointerHandlerOptions) {
  return async function handleOpenPointer(arguments_: unknown): Promise<unknown> {
    const parsed = SoulToolsSchemas['soul.open_pointer'].safeParse(arguments_);
    if (!parsed.success) {
      throw new SoulToolValidationError(
        'Invalid soul.open_pointer arguments',
        parsed.error.issues,
      );
    }

    const cue = findCueByPointer(options.stateStore, parsed.data.pointer);
    const pointerKey = generatePointerKey(parsePointer(parsed.data.pointer));
    const evidence = findEvidenceByPointerKey(options.stateStore, pointerKey);
    const extraction = await options.extractor.extract({
      gist: cue?.gist,
      level: parsed.data.level,
      maxLines: parsed.data.max_lines,
      maxTokens: parsed.data.max_tokens,
      pointer: parsed.data.pointer,
      withContext: parsed.data.with_context,
    });

    if (!extraction.found) {
      if (evidence?.relocation_status === 'irrecoverable') {
        return {
          ...mapResult(extraction),
          archived: true,
          relocation_status: 'irrecoverable',
          suggested_relocation: false,
        };
      }

      if (options.healingQueue && cue?.project_id) {
        const relocation = await options.healingQueue.enqueue({
          cueGist: cue.gist,
          cueId: cue.cue_id,
          impactLevel: cue.impact_level,
          pointer: parsed.data.pointer,
          projectId: cue.project_id,
        });
        if (relocation.found && relocation.relocatedPointer) {
          const relocatedExtraction = await options.extractor.extract({
            gist: cue.gist,
            level: parsed.data.level,
            maxLines: parsed.data.max_lines,
            maxTokens: parsed.data.max_tokens,
            pointer: relocation.relocatedPointer,
            withContext: parsed.data.with_context,
          });
          if (relocatedExtraction.found) {
            await upsertEvidenceAccess(
              options.writer,
              cue.cue_id,
              relocation.relocatedPointer,
              pointerKey,
              relocatedExtraction.effectiveLevel,
              relocatedExtraction.contentHash,
            );
            publishMemoryEvent(
              options.publishEvent,
              createMemoryEvent({
                level: relocatedExtraction.effectiveLevel,
                operation: 'open',
                pointer: relocation.relocatedPointer,
                tokensUsed: relocatedExtraction.tokensUsed,
              }),
            );
            return {
              ...mapResult(relocatedExtraction),
              relocated_to: relocation.relocatedTo,
            };
          }
        }

        publishMemoryEvent(
          options.publishEvent,
          createMemoryEvent({
            level: extraction.effectiveLevel,
            operation: 'open',
            pointer: parsed.data.pointer,
            tokensUsed: extraction.tokensUsed,
          }),
        );
        return {
          ...mapResult(extraction),
          archived: relocation.archived,
          candidate: relocation.candidate,
          relocation_status: relocation.relocationStatus,
          suggested_relocation: true,
        };
      }

      publishMemoryEvent(
        options.publishEvent,
        createMemoryEvent({
          level: extraction.effectiveLevel,
          operation: 'open',
          pointer: parsed.data.pointer,
          tokensUsed: extraction.tokensUsed,
        }),
      );
      return {
        ...mapResult(extraction),
        suggested_relocation: true,
      };
    }

    await upsertEvidenceAccess(
      options.writer,
      cue?.cue_id,
      parsed.data.pointer,
      pointerKey,
      extraction.effectiveLevel,
      extraction.contentHash,
    );
    publishMemoryEvent(
      options.publishEvent,
      createMemoryEvent({
        level: extraction.effectiveLevel,
        operation: 'open',
        pointer: parsed.data.pointer,
        tokensUsed: extraction.tokensUsed,
      }),
    );

    return mapResult(extraction);
  };
}
