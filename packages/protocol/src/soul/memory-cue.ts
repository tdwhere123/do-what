import { z } from 'zod';

export const LegacyCueTypeSchema = z.enum(['fact', 'pattern', 'decision', 'risk']);
export const FormationKindSchema = z.enum([
  'observation',
  'inference',
  'synthesis',
  'interaction',
]);
export const DimensionSchema = z.enum([
  'technical',
  'behavioral',
  'contextual',
  'relational',
]);
export const FocusSurfaceSchema = z.string().min(1).default('default');

export const MemoryCueSchema = z.object({
  cue_id: z.string(),
  project_id: z.string().nullable().optional(),
  gist: z.string(),
  summary: z.string().nullable().optional(),
  source: z.string(),
  // Deprecated legacy alias kept for replaying older cue drafts.
  type: LegacyCueTypeSchema.optional(),
  formation_kind: FormationKindSchema.default('observation'),
  dimension: DimensionSchema.default('technical'),
  scope: z.string().default('project'),
  anchors: z.array(z.string()).default([]),
  pointers: z.array(z.string()).default([]),
  focus_surface: FocusSurfaceSchema,
  activation_score: z.number().default(0),
  retention_score: z.number().default(0.5),
  claim_draft: z.string().nullable().optional(),
  claim_confidence: z.number().min(0).max(1).nullable().optional(),
  claim_gist: z.string().max(200).nullable().optional(),
  claim_mode: z.enum(['assert', 'retract', 'supersede']).nullable().optional(),
  claim_source: z.enum(['engine', 'compiler', 'user']).nullable().optional(),
  snippet_excerpt: z.string().nullable().optional(),
  pruned: z.boolean().default(false),
}).passthrough();

export type LegacyCueType = z.infer<typeof LegacyCueTypeSchema>;
export type FormationKind = z.infer<typeof FormationKindSchema>;
export type Dimension = z.infer<typeof DimensionSchema>;
export type MemoryFocusSurface = z.infer<typeof FocusSurfaceSchema>;
export type MemoryCue = z.infer<typeof MemoryCueSchema>;
