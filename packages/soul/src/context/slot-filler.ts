import { TABLE_MEMORY_CUES } from '../db/schema.js';
import type { SoulStateStore } from '../db/soul-state-store.js';
import { estimateTokens } from '../search/budget-calculator.js';
import type { ContextRequest, ContextTrigger, SlotEntry } from './types.js';

interface SlotCueRow {
  activation_score: number;
  cue_id: string;
  gist: string;
  snippet_excerpt: string | null;
}

const MAX_SLOT_CANDIDATES = 20;

function toSlotType(trigger: ContextTrigger) {
  switch (trigger) {
    case 'full':
      return 'full_slot' as const;
    case 'excerpt':
      return 'excerpt_slot' as const;
    default:
      return 'hint_slot' as const;
  }
}

function buildContent(trigger: ContextTrigger, row: SlotCueRow): string {
  if (trigger === 'hint') {
    return row.gist;
  }

  return row.snippet_excerpt?.trim() || row.gist;
}

export class SlotFiller {
  private readonly stateStore: SoulStateStore;

  constructor(stateStore: SoulStateStore) {
    this.stateStore = stateStore;
  }

  fill(request: ContextRequest): SlotEntry[] {
    const rows = this.stateStore.read(
      (db) =>
        db
          .prepare(buildSlotQuery(request))
          .all(...buildSlotParams(request), MAX_SLOT_CANDIDATES) as SlotCueRow[],
      [] as SlotCueRow[],
    );
    const slotType = toSlotType(request.trigger);

    return rows.map((row) => {
      const content = buildContent(request.trigger, row);
      return {
        activation_score: row.activation_score ?? 0,
        content,
        cue_id: row.cue_id,
        gist: row.gist,
        origin: 'seed',
        slot_type: slotType,
        token_count: estimateTokens(content),
      };
    });
  }
}

function buildSlotParams(request: ContextRequest): unknown[] {
  const params: unknown[] = [request.project_id];
  const queryTerm = request.query?.trim();
  if (queryTerm) {
    params.push(`%${queryTerm}%`, `%${queryTerm}%`);
  }
  if (request.focus_surface) {
    params.push(request.focus_surface);
  }
  if (request.dimension) {
    params.push(request.dimension);
  }
  if (request.tracks && request.tracks.length > 0) {
    params.push(...request.tracks);
  }
  if (request.anchors && request.anchors.length > 0) {
    params.push(...request.anchors);
  }
  if (request.seed_cue_ids && request.seed_cue_ids.length > 0) {
    params.push(...request.seed_cue_ids);
  }
  return params;
}

function buildSlotQuery(request: ContextRequest): string {
  const conditions = [
    'project_id = ?',
    'COALESCE(pruned, 0) = 0',
    `impact_level IN ('canon', 'consolidated')`,
  ];

  if (request.query?.trim()) {
    conditions.push('(gist LIKE ? OR anchors LIKE ?)');
  }
  if (request.focus_surface) {
    conditions.push('focus_surface = ?');
  }
  if (request.dimension) {
    conditions.push('dimension = ?');
  }
  if (request.tracks && request.tracks.length > 0) {
    conditions.push(`track IN (${request.tracks.map(() => '?').join(', ')})`);
  }
  if (request.anchors && request.anchors.length > 0) {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM json_each(COALESCE(${TABLE_MEMORY_CUES}.anchors, '[]'))
        WHERE value IN (${request.anchors.map(() => '?').join(', ')})
      )`,
    );
  }
  if (request.seed_cue_ids && request.seed_cue_ids.length > 0) {
    conditions.push(`cue_id IN (${request.seed_cue_ids.map(() => '?').join(', ')})`);
  }

  return `SELECT cue_id, gist, snippet_excerpt, activation_score
          FROM ${TABLE_MEMORY_CUES}
          WHERE ${conditions.join(' AND ')}
          ORDER BY activation_score DESC, updated_at DESC
          LIMIT ?`;
}
