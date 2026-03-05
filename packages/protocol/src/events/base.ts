import { z } from 'zod';

export const BaseEventSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
    runId: z.string(),
    source: z.string(),
  })
  .passthrough();

export type BaseEvent = z.infer<typeof BaseEventSchema>;
