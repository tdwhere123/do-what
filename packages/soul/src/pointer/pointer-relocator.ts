import path from 'node:path';
import {
  TABLE_EVIDENCE_INDEX,
  type EvidenceRow,
} from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { generatePointerKey } from './pointer-key.js';
import { parsePointer, type PointerComponents } from './pointer-parser.js';
import type { GitRenameDetector } from './git-rename-detector.js';
import type { SemanticFallback } from './semantic-fallback.js';
import type { SnippetMatcher } from './snippet-matcher.js';
import type { SymbolSearcher } from './symbol-searcher.js';

export interface PointerRelocationInput {
  cueId?: string;
  cueGist?: string;
  impactLevel?: string;
  pointer: string;
  projectId?: string;
}

export interface PointerRelocationResult {
  archived?: boolean;
  candidate?: string;
  found: boolean;
  relocatedPointer?: string;
  relocatedTo?: string;
  relocationMethod?: 'rename' | 'semantic' | 'snippet' | 'symbol';
  relocationStatus: 'failed' | 'irrecoverable' | 'relocated' | 'semantic_candidate';
}

export interface PointerRelocatorOptions {
  gitRenameDetector: GitRenameDetector;
  semanticFallback: SemanticFallback;
  snippetMatcher: SnippetMatcher;
  stateStore: SoulStateStore;
  symbolSearcher: SymbolSearcher;
  writer: SoulWorkerClient;
}

function serializePointer(components: PointerComponents): string {
  const segments: string[] = [];
  if (components.gitCommit) {
    segments.push(`git_commit:${components.gitCommit}`);
  }
  if (components.repoPath) {
    segments.push(`repo_path:${components.repoPath}`);
  }
  if (components.symbol) {
    segments.push(`symbol:${components.symbol}`);
  }
  if (components.snippetHash) {
    segments.push(`snippet_hash:${components.snippetHash}`);
  }
  for (const [key, value] of Object.entries(components.extras).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    segments.push(`${key}:${value}`);
  }
  return segments.join(' ');
}

export class PointerRelocator {
  private readonly gitRenameDetector: GitRenameDetector;
  private readonly semanticFallback: SemanticFallback;
  private readonly snippetMatcher: SnippetMatcher;
  private readonly stateStore: SoulStateStore;
  private readonly symbolSearcher: SymbolSearcher;
  private readonly writer: SoulWorkerClient;

  constructor(options: PointerRelocatorOptions) {
    this.gitRenameDetector = options.gitRenameDetector;
    this.semanticFallback = options.semanticFallback;
    this.snippetMatcher = options.snippetMatcher;
    this.stateStore = options.stateStore;
    this.symbolSearcher = options.symbolSearcher;
    this.writer = options.writer;
  }

  async relocate(input: PointerRelocationInput): Promise<PointerRelocationResult> {
    const components = parsePointer(input.pointer);
    const pointerKey = generatePointerKey(components);
    const evidence = this.getEvidence(pointerKey);

    if (evidence?.relocation_status === 'irrecoverable') {
      return {
        archived: true,
        found: false,
        relocationStatus: 'irrecoverable',
      };
    }

    if (!components.repoPath) {
      await this.persistRelocation(pointerKey, input.cueId, input.pointer, 'irrecoverable');
      return {
        archived: true,
        found: false,
        relocationStatus: 'irrecoverable',
      };
    }

    const renamed = input.projectId
      ? this.gitRenameDetector.findLatestRename(input.projectId, components.repoPath)
      : null;
    if (renamed) {
      const relocatedPointer = serializePointer({
        ...components,
        repoPath: renamed.new_path,
      });
      await this.persistRelocation(
        pointerKey,
        input.cueId,
        input.pointer,
        'relocated',
        relocatedPointer,
      );
      return {
        found: true,
        relocatedPointer,
        relocatedTo: renamed.new_path,
        relocationMethod: 'rename',
        relocationStatus: 'relocated',
      };
    }

    if (components.symbol) {
      const symbolCandidates = await this.symbolSearcher.search(
        components.symbol,
        components.repoPath,
      );
      const symbolMatch = symbolCandidates[0];
      if (symbolMatch) {
        const relocatedPointer = serializePointer({
          ...components,
          repoPath: symbolMatch.repoPath,
        });
        await this.persistRelocation(
          pointerKey,
          input.cueId,
          input.pointer,
          'relocated',
          relocatedPointer,
        );
        return {
          found: true,
          relocatedPointer,
          relocatedTo: symbolMatch.repoPath,
          relocationMethod: 'symbol',
          relocationStatus: 'relocated',
        };
      }
    }

    const expectedHash = components.snippetHash ?? evidence?.content_hash ?? null;
    if (expectedHash) {
      const snippetMatch = await this.snippetMatcher.match(expectedHash, components.repoPath);
      if (snippetMatch) {
        const relocatedPointer = serializePointer({
          ...components,
          repoPath: snippetMatch.repoPath,
        });
        await this.persistRelocation(
          pointerKey,
          input.cueId,
          input.pointer,
          'relocated',
          relocatedPointer,
        );
        return {
          found: true,
          relocatedPointer,
          relocatedTo: snippetMatch.repoPath,
          relocationMethod: 'snippet',
          relocationStatus: 'relocated',
        };
      }
    }

    if (input.impactLevel === 'canon' && input.cueGist) {
      const semanticCandidate = await this.semanticFallback.findCandidate(input.cueGist);
      if (semanticCandidate) {
        const candidate = serializePointer({
          ...components,
          repoPath: semanticCandidate.repoPath,
        });
        await this.persistRelocation(pointerKey, input.cueId, input.pointer, 'semantic_candidate');
        return {
          candidate,
          found: false,
          relocationStatus: 'semantic_candidate',
        };
      }
    }

    const nextStatus = evidence?.relocation_status === 'failed' ? 'irrecoverable' : 'failed';
    await this.persistRelocation(pointerKey, input.cueId, input.pointer, nextStatus);
    return {
      archived: nextStatus === 'irrecoverable',
      found: false,
      relocationStatus: nextStatus,
    };
  }

  private getEvidence(pointerKey: string): EvidenceRow | null {
    return this.stateStore.read(
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

  private async persistRelocation(
    pointerKey: string,
    cueId: string | undefined,
    pointer: string,
    relocationStatus: PointerRelocationResult['relocationStatus'],
    relocatedPointer?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.writer.write({
      params: [
        cueId ?? null,
        pointer,
        pointerKey,
        now,
        relocationStatus,
        relocatedPointer ?? null,
      ],
      sql: `INSERT INTO ${TABLE_EVIDENCE_INDEX} (
              evidence_id,
              cue_id,
              pointer,
              pointer_key,
              level,
              relocation_attempted_at,
              relocation_status,
              relocated_pointer,
              access_count
            )
            VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'hint', ?, ?, ?, 0)
            ON CONFLICT(pointer_key) DO UPDATE SET
              relocation_attempted_at = excluded.relocation_attempted_at,
              relocation_status = excluded.relocation_status,
              relocated_pointer = excluded.relocated_pointer`,
    });
  }
}

export { serializePointer };
