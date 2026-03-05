import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const SoulMemorySearchInputSchema = z.object({
  project_id: z.string(),
  query: z.string(),
  anchors: z.array(z.string()).optional(),
  limit: z.number().int().positive().default(10),
  tracks: z.array(z.string()).optional(),
  budget: z.number().int().positive().optional(),
});

const SoulOpenPointerInputSchema = z.object({
  pointer: z.string(),
  level: z.enum(['hint', 'excerpt', 'full']),
  max_tokens: z.number().int().positive().optional(),
  max_lines: z.number().int().positive().optional(),
  with_context: z.boolean().optional(),
});

const SoulExploreGraphInputSchema = z.object({
  entity_name: z.string(),
  track: z.string(),
  depth: z.number().int().positive().default(2),
  limit: z.number().int().positive().default(20),
});

const SoulProposeMemoryUpdateInputSchema = z.object({
  project_id: z.string(),
  cue_draft: z.record(z.unknown()),
  edge_drafts: z.array(z.record(z.unknown())).optional(),
  confidence: z.number().min(0).max(1),
  impact_level: z.enum(['working', 'consolidated', 'canon']),
});

const SoulReviewMemoryProposalInputSchema = z.object({
  proposal_id: z.string(),
  action: z.enum(['accept', 'edit', 'reject', 'hint_only']),
  edits: z.record(z.unknown()).optional(),
});

export const SoulToolsSchemas = {
  'soul.memory_search': SoulMemorySearchInputSchema,
  'soul.open_pointer': SoulOpenPointerInputSchema,
  'soul.explore_graph': SoulExploreGraphInputSchema,
  'soul.propose_memory_update': SoulProposeMemoryUpdateInputSchema,
  'soul.review_memory_proposal': SoulReviewMemoryProposalInputSchema,
} as const;

export type SoulToolName = keyof typeof SoulToolsSchemas;

const toJsonSchema = (schema: z.ZodTypeAny) =>
  zodToJsonSchema(schema, {
    $refStrategy: 'none',
  });

const soulToolEntries = Object.entries(SoulToolsSchemas) as [SoulToolName, z.ZodTypeAny][];

export const SoulToolsJsonSchemas = Object.fromEntries(
  soulToolEntries.map(([name, schema]) => [name, toJsonSchema(schema)]),
) as Record<SoulToolName, ReturnType<typeof toJsonSchema>>;

export type SoulMemorySearchInput = z.infer<typeof SoulMemorySearchInputSchema>;
export type SoulOpenPointerInput = z.infer<typeof SoulOpenPointerInputSchema>;
export type SoulExploreGraphInput = z.infer<typeof SoulExploreGraphInputSchema>;
export type SoulProposeMemoryUpdateInput = z.infer<typeof SoulProposeMemoryUpdateInputSchema>;
export type SoulReviewMemoryProposalInput = z.infer<typeof SoulReviewMemoryProposalInputSchema>;
