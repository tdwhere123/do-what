import fs from 'node:fs';
import path from 'node:path';
import {
  HookPolicyCacheSchema,
  type HookPolicyCache,
  type PolicyConfig,
} from '@do-what/protocol';

export function writePolicyCache(
  rules: PolicyConfig,
  cachePath: string,
  version = '1',
): HookPolicyCache {
  const cachePayload = HookPolicyCacheSchema.parse({
    rules,
    updatedAt: new Date().toISOString(),
    version,
  });

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(cachePayload, null, 2)}\n`, 'utf8');
  return cachePayload;
}

