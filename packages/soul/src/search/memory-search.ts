import type Database from 'better-sqlite3';
import type { CueRef } from '@do-what/protocol';
import { TABLE_MEMORY_CUES, TABLE_MEMORY_CUES_FTS } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import type { SoulWorkerClient } from '../db/worker-client.js';
import { parseStringArray } from '../utils/json.js';
import { estimateTokens } from './budget-calculator.js';
import { EmbeddingRanker } from './embedding-ranker.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const BOOTSTRAPPING_CONFIDENCE_THRESHOLD = 0.6;

export interface MemorySearchInput {
  anchors?: readonly string[];
  budget?: number;
  dimension?: string;
  domain_tags?: readonly string[];
  limit?: number;
  project_id: string;
  query: string;
  scope?: string;
  tracks?: readonly string[];
}

export interface MemorySearchResult {
  budget_used: number;
  cues: CueRef[];
  degraded?: boolean;
  total_found: number;
}

interface SearchRow {
  confidence: number;
  cue_id: string;
  gist: string;
  impact_level: string;
  pointers: string;
  raw_rank?: number;
}

interface SearchFilterState {
  conditions: string[];
  params: unknown[];
}

export interface MemorySearchServiceOptions {
  embeddingRanker?: EmbeddingRanker;
  isBootstrappingProject?: (projectId: string) => boolean | Promise<boolean>;
  stateStore: SoulStateStore;
  writer: SoulWorkerClient;
}

function appendListFilter(
  filters: SearchFilterState,
  column: string,
  values: readonly string[] | undefined,
): void {
  if (!values || values.length === 0) {
    return;
  }

  const placeholders = values.map(() => '?').join(', ');
  filters.conditions.push(`${column} IN (${placeholders})`);
  filters.params.push(...values);
}

function appendJsonAnyFilter(
  filters: SearchFilterState,
  column: string,
  values: readonly string[] | undefined,
): void {
  if (!values || values.length === 0) {
    return;
  }

  const placeholders = values.map(() => '?').join(', ');
  filters.conditions.push(
    `EXISTS (
      SELECT 1
      FROM json_each(COALESCE(${column}, '[]'))
      WHERE value IN (${placeholders})
    )`,
  );
  filters.params.push(...values);
}

function buildFilters(
  input: MemorySearchInput,
  includeWorkingCues: boolean,
): SearchFilterState {
  const filters: SearchFilterState = {
    conditions: ['c.project_id = ?'],
    params: [input.project_id],
  };

  if (includeWorkingCues) {
    filters.conditions.push(
      `(c.impact_level IN ('canon', 'consolidated')
        OR (c.impact_level = 'working' AND c.confidence >= ?))`,
    );
    filters.params.push(BOOTSTRAPPING_CONFIDENCE_THRESHOLD);
  } else {
    filters.conditions.push(`c.impact_level IN ('canon', 'consolidated')`);
  }

  appendListFilter(filters, 'c.track', input.tracks);
  if (input.scope) {
    filters.conditions.push('c.scope = ?');
    filters.params.push(input.scope);
  }
  if (input.dimension) {
    filters.conditions.push('c.dimension = ?');
    filters.params.push(input.dimension);
  }
  appendJsonAnyFilter(filters, 'c.anchors', input.anchors);
  appendJsonAnyFilter(filters, 'c.domain_tags', input.domain_tags);
  return filters;
}

function computeScore(row: SearchRow, usedLikeFallback: boolean): number {
  const rankComponent = usedLikeFallback
    ? 0.6
    : 1 / (1 + Math.abs(row.raw_rank ?? 0));
  const score = rankComponent * 0.7 + row.confidence * 0.3;
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function buildWhy(row: SearchRow, usedLikeFallback: boolean): string | undefined {
  if (row.impact_level === 'working') {
    return '[trial] bootstrapping candidate';
  }
  if (usedLikeFallback) {
    return 'LIKE fallback match';
  }
  return 'FTS match';
}

function normalizeLimit(value: number | undefined): number {
  if (!value || value <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(value, MAX_LIMIT);
}

function sanitizeFtsQuery(query: string): string {
  return query.replace(/[^\p{L}\p{N}_\- ]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function mapRowsToCueRefs(rows: SearchRow[], usedLikeFallback: boolean): CueRef[] {
  return rows.map((row) => ({
    cueId: row.cue_id,
    gist: row.gist,
    pointers: parseStringArray(row.pointers),
    score: computeScore(row, usedLikeFallback),
    why: buildWhy(row, usedLikeFallback),
  }));
}

function applyBudget(
  cues: readonly CueRef[],
  limit: number,
  budget: number | undefined,
): MemorySearchResult {
  let budgetUsed = 0;
  let degraded = false;
  const selected: CueRef[] = [];

  for (const cue of cues) {
    if (selected.length >= limit) {
      degraded = cues.length > selected.length;
      break;
    }

    const nextCost = estimateTokens(
      `${cue.gist} ${cue.why ?? ''} ${cue.pointers.join(' ')}`.trim(),
    );
    if (budget && selected.length > 0 && budgetUsed + nextCost > budget) {
      degraded = true;
      break;
    }

    selected.push(cue);
    budgetUsed += nextCost;
  }

  return {
    budget_used: budgetUsed,
    cues: selected,
    degraded: degraded || undefined,
    total_found: cues.length,
  };
}

function buildCandidateLimit(limit: number): number {
  return Math.min(Math.max(limit * 4, limit), 50);
}

function fetchFtsRows(
  db: Database.Database,
  input: MemorySearchInput,
  includeWorkingCues: boolean,
  limit: number,
): { failed: boolean; rows: SearchRow[] } {
  const sanitizedQuery = sanitizeFtsQuery(input.query);
  if (!sanitizedQuery) {
    return { failed: true, rows: [] };
  }

  try {
    const filters = buildFilters(input, includeWorkingCues);
    const rows = db
      .prepare(
        `SELECT
           c.cue_id,
           c.gist,
           c.pointers,
           c.confidence,
           c.impact_level,
           bm25(${TABLE_MEMORY_CUES_FTS}) AS raw_rank
         FROM ${TABLE_MEMORY_CUES_FTS}
         JOIN ${TABLE_MEMORY_CUES} c
           ON c.rowid = ${TABLE_MEMORY_CUES_FTS}.rowid
         WHERE ${TABLE_MEMORY_CUES_FTS} MATCH ?
           AND ${filters.conditions.join(' AND ')}
         ORDER BY raw_rank ASC, c.confidence DESC, c.updated_at DESC
         LIMIT ?`,
      )
      .all(sanitizedQuery, ...filters.params, buildCandidateLimit(limit)) as SearchRow[];
    return { failed: false, rows };
  } catch {
    return { failed: true, rows: [] };
  }
}

function fetchLikeRows(
  db: Database.Database,
  input: MemorySearchInput,
  includeWorkingCues: boolean,
  limit: number,
): SearchRow[] {
  const filters = buildFilters(input, includeWorkingCues);
  const likeTerm = `%${input.query.trim()}%`;

  return db
    .prepare(
      `SELECT
         c.cue_id,
         c.gist,
         c.pointers,
         c.confidence,
         c.impact_level
       FROM ${TABLE_MEMORY_CUES} c
       WHERE (c.gist LIKE ? OR c.anchors LIKE ?)
         AND ${filters.conditions.join(' AND ')}
       ORDER BY c.confidence DESC, c.updated_at DESC
       LIMIT ?`,
    )
    .all(likeTerm, likeTerm, ...filters.params, buildCandidateLimit(limit)) as SearchRow[];
}

export class MemorySearchService {
  private readonly embeddingRanker: EmbeddingRanker;
  private readonly isBootstrappingProject?: MemorySearchServiceOptions['isBootstrappingProject'];
  private readonly stateStore: SoulStateStore;
  private readonly writer: SoulWorkerClient;

  constructor(options: MemorySearchServiceOptions) {
    this.embeddingRanker = options.embeddingRanker ?? new EmbeddingRanker();
    this.isBootstrappingProject = options.isBootstrappingProject;
    this.stateStore = options.stateStore;
    this.writer = options.writer;
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResult> {
    const limit = normalizeLimit(input.limit);
    const includeWorkingCues = (await this.isBootstrappingProject?.(input.project_id))
      ?? false;
    const useFts = this.stateStore.isFtsAvailable();
    const rows = this.loadRows(input, includeWorkingCues, limit, useFts);
    const ranked = await this.embeddingRanker.rank(
      input.query,
      mapRowsToCueRefs(rows.rows, rows.usedLikeFallback),
    );
    const result = applyBudget(ranked, limit, input.budget);

    void this.touchHits(result.cues);
    if (rows.usedLikeFallback && result.cues.length > 0) {
      result.degraded = true;
    }
    result.total_found = ranked.length;
    return result;
  }

  private loadRows(
    input: MemorySearchInput,
    includeWorkingCues: boolean,
    limit: number,
    useFts: boolean,
  ): { rows: SearchRow[]; usedLikeFallback: boolean } {
    if (useFts) {
      const ftsResult = this.stateStore.read(
        (db) => fetchFtsRows(db, input, includeWorkingCues, limit),
        { failed: true, rows: [] },
      );
      if (!ftsResult.failed) {
        return { rows: ftsResult.rows, usedLikeFallback: false };
      }
    }

    const rows = this.stateStore.read(
      (db) => fetchLikeRows(db, input, includeWorkingCues, limit),
      [] as SearchRow[],
    );
    return { rows, usedLikeFallback: true };
  }

  private async touchHits(cues: readonly CueRef[]): Promise<void> {
    const timestamp = new Date().toISOString();
    await Promise.allSettled(
      cues.map((cue) =>
        this.writer.write({
          params: [timestamp, cue.cueId],
          sql: `UPDATE ${TABLE_MEMORY_CUES}
                SET hit_count = hit_count + 1,
                    last_hit_at = ?
                WHERE cue_id = ?`,
        }),
      ),
    );
  }
}
