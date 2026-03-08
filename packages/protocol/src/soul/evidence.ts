import { z } from 'zod';

export const EVIDENCE_SNIPPET_MAX_CHARS = 1_500;

export const EvidenceCapsuleSchema = z.object({
  capsule_id: z.string(),
  confidence: z.number().min(0).max(1),
  context_fingerprint: z.string(),
  created_at: z.string().datetime(),
  cue_id: z.string(),
  git_commit: z.string().min(7).max(40),
  repo_path: z.string().min(1),
  snippet_excerpt: z.string().min(1).max(EVIDENCE_SNIPPET_MAX_CHARS),
  symbol: z.string().optional(),
}).passthrough();

export type EvidenceCapsule = z.infer<typeof EvidenceCapsuleSchema>;
