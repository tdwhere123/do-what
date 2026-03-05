import { z } from 'zod';

export const CueRefSchema = z.object({
  cueId: z.string(),
  gist: z.string(),
  score: z.number(),
  pointers: z.array(z.string()),
  why: z.string().optional(),
});

export type CueRef = z.infer<typeof CueRefSchema>;
