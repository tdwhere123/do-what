import { z } from 'zod';

export const ClaimModeSchema = z.enum(['assert', 'retract', 'supersede']);
export const ClaimSourceSchema = z.enum(['engine', 'compiler', 'user']);
export const ClaimResolutionStatusSchema = z.enum([
  'accepted',
  'rejected',
  'superseded',
  'expired',
]);
export const ClaimResolverSchema = z.enum(['slot_winner', 'user', 'timeout']);

export const ClaimDraftSchema = z.object({
  draft_id: z.string(),
  cue_id: z.string(),
  claim_gist: z.string().min(1).max(200),
  claim_confidence: z.number().min(0).max(1),
  claim_mode: ClaimModeSchema,
  claim_source: ClaimSourceSchema,
  proposed_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
}).passthrough();

export const ClaimResolutionSchema = z.object({
  draft_id: z.string(),
  resolution: ClaimResolutionStatusSchema,
  resolved_at: z.string().datetime(),
  resolver: ClaimResolverSchema,
}).passthrough();

export type ClaimMode = z.infer<typeof ClaimModeSchema>;
export type ClaimSource = z.infer<typeof ClaimSourceSchema>;
export type ClaimResolutionStatus = z.infer<typeof ClaimResolutionStatusSchema>;
export type ClaimResolver = z.infer<typeof ClaimResolverSchema>;
export type ClaimDraft = z.infer<typeof ClaimDraftSchema>;
export type ClaimResolution = z.infer<typeof ClaimResolutionSchema>;
