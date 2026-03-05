import { z } from 'zod';

import { PolicyConfigSchema } from './config.js';

export const HookPolicyCacheSchema = z.object({
  version: z.string(),
  updatedAt: z.string(),
  rules: PolicyConfigSchema,
});

export type HookPolicyCache = z.infer<typeof HookPolicyCacheSchema>;
