import { z } from 'zod';

export const PolicyRuleSchema = z.object({
  default: z.enum(['allow', 'ask', 'deny']),
  allow_paths: z.array(z.string()).optional(),
  deny_paths: z.array(z.string()).optional(),
  allow_commands: z.array(z.string()).optional(),
  allow_domains: z.array(z.string()).optional(),
});

export const PolicyConfigSchema = z.record(z.string(), PolicyRuleSchema);

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;
