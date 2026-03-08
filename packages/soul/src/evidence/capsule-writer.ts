import { randomUUID } from 'node:crypto';
import {
  EVIDENCE_SNIPPET_MAX_CHARS,
  EvidenceCapsuleSchema,
  type ClaimDraft,
} from '@do-what/protocol';
import {
  TABLE_EVIDENCE_INDEX,
  TABLE_MEMORY_CUES,
  type CueRow,
  type EvidenceRow,
} from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { EvidenceExtractor } from './evidence-extractor.js';
import { computeContextFingerprint } from './fingerprint.js';
import { parsePointer } from '../pointer/pointer-parser.js';
import { parseStringArray } from '../utils/json.js';
import type { SoulEventPublisher } from '../mcp/types.js';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const SNIPPET_TRUNCATED_MARKER = '\n// [truncated]';

export interface EvidenceCapsuleWriterOptions {
  extractor: EvidenceExtractor;
  publishEvent?: SoulEventPublisher;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

export interface WriteAcceptedClaimInput {
  claim: ClaimDraft;
  cue: CueRow;
}

export class EvidenceCapsuleWriter {
  private readonly extractor: EvidenceExtractor;
  private readonly publishEvent?: SoulEventPublisher;
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: EvidenceCapsuleWriterOptions) {
    this.extractor = options.extractor;
    this.publishEvent = options.publishEvent;
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async writeAcceptedClaim(input: WriteAcceptedClaimInput): Promise<void> {
    if (input.cue.impact_level !== 'canon') {
      return;
    }

    const pointer = parseStringArray(input.cue.pointers)[0];
    if (!pointer) {
      return;
    }

    const components = parsePointer(pointer);
    if (!components.gitCommit || !components.repoPath || !SHA_PATTERN.test(components.gitCommit)) {
      return;
    }

    const extraction = await this.extractor.extract({
      gist: input.cue.gist,
      level: 'excerpt',
      maxTokens: 500,
      pointer,
    });
    if (!extraction.found || !extraction.content) {
      return;
    }

    const snippetExcerpt = trimSnippet(extraction.content);
    const fingerprint = computeContextFingerprint(
      components.repoPath,
      components.gitCommit,
      components.symbol,
    );
    const existing = this.findByFingerprint(fingerprint);
    const capsule = EvidenceCapsuleSchema.parse({
      capsule_id: existing?.evidence_id ?? randomUUID(),
      confidence: input.claim.claim_confidence,
      context_fingerprint: fingerprint,
      created_at: existing?.created_at ?? new Date().toISOString(),
      cue_id: input.cue.cue_id,
      git_commit: components.gitCommit,
      repo_path: components.repoPath,
      snippet_excerpt: snippetExcerpt,
      symbol: components.symbol,
    });

    await this.writer.write({
      params: [
        capsule.capsule_id,
        capsule.cue_id,
        pointer,
        fingerprint,
        'excerpt',
        extraction.contentHash ?? null,
        capsule.git_commit,
        capsule.repo_path,
        capsule.symbol ?? null,
        capsule.snippet_excerpt,
        capsule.context_fingerprint,
        capsule.confidence,
        capsule.created_at,
      ],
      sql: `INSERT INTO ${TABLE_EVIDENCE_INDEX} (
              evidence_id,
              cue_id,
              pointer,
              pointer_key,
              level,
              content_hash,
              git_commit,
              repo_path,
              symbol,
              snippet_excerpt,
              context_fingerprint,
              confidence,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(context_fingerprint) DO UPDATE SET
              cue_id = excluded.cue_id,
              pointer = excluded.pointer,
              level = excluded.level,
              content_hash = excluded.content_hash,
              git_commit = excluded.git_commit,
              repo_path = excluded.repo_path,
              symbol = excluded.symbol,
              snippet_excerpt = excluded.snippet_excerpt,
              confidence = excluded.confidence`,
    });

    await this.writer.write({
      params: [snippetExcerpt, input.cue.cue_id],
      sql: `UPDATE ${TABLE_MEMORY_CUES}
            SET snippet_excerpt = ?
            WHERE cue_id = ?`,
    });

    if (this.publishEvent) {
      this.publishEvent({
        changedFields: ['snippet_excerpt'],
        cueId: input.cue.cue_id,
        event: 'memory_cue_modified',
        projectId: input.cue.project_id ?? undefined,
        runId: 'soul',
        source: 'soul.evidence',
        timestamp: new Date().toISOString(),
      });
    }
  }

  findByCueId(cueId: string): EvidenceRow | null {
    return this.stateStore.read(
      (db) =>
        (db
          .prepare(
            `SELECT *
             FROM ${TABLE_EVIDENCE_INDEX}
             WHERE cue_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
          )
          .get(cueId) as EvidenceRow | undefined) ?? null,
      null,
    );
  }

  private findByFingerprint(fingerprint: string): EvidenceRow | null {
    return this.stateStore.read(
      (db) =>
        (db
          .prepare(
            `SELECT *
             FROM ${TABLE_EVIDENCE_INDEX}
             WHERE context_fingerprint = ?`,
          )
          .get(fingerprint) as EvidenceRow | undefined) ?? null,
      null,
    );
  }
}

function trimSnippet(content: string): string {
  if (content.length <= EVIDENCE_SNIPPET_MAX_CHARS) {
    return content;
  }

  const maxBodyLength = EVIDENCE_SNIPPET_MAX_CHARS - SNIPPET_TRUNCATED_MARKER.length;
  return `${content.slice(0, Math.max(0, maxBodyLength))}${SNIPPET_TRUNCATED_MARKER}`;
}
