import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LocalHeuristics } from '../compute/local-heuristics.js';

async function summarize(diff: string) {
  const provider = new LocalHeuristics();
  return provider.summarize_diff(
    {
      diff,
      project_id: 'proj-heuristic',
    },
    {
      maxTokens: 2_000,
    },
  );
}

describe('local heuristics', () => {
  it('skips whitespace-only diffs', async () => {
    const result = await summarize(`diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@
-export function auth() {
-  return true;
-}
+export function auth() {
+    return true;
+}
`);

    assert.equal(result.cue_drafts.length, 0);
  });

  it('detects new exports and interface changes', async () => {
    const result = await summarize(`diff --git a/src/types.ts b/src/types.ts
--- a/src/types.ts
+++ b/src/types.ts
@@
+export interface AuthConfig {
+  token: string;
+}
+export const createAuth = () => true;
`);

    const gists = result.cue_drafts
      .map((draft) => String(draft.gist))
      .sort((left, right) => left.localeCompare(right));
    assert.deepEqual(gists, [
      'Added export AuthConfig',
      'Added export createAuth',
      'Interface changed: AuthConfig in src/types.ts',
    ]);
  });

  it('detects new modules and risk markers', async () => {
    const result = await summarize(`diff --git a/src/new-module.ts b/src/new-module.ts
new file mode 100644
--- /dev/null
+++ b/src/new-module.ts
@@
+// TODO: stabilize error handling
+export function buildModule() {
+  return 'ok';
+}
`);

    const gists = result.cue_drafts.map((draft) => String(draft.gist));
    assert.equal(gists.includes('New module: src/new-module.ts'), true);
    assert.equal(gists.some((gist) => gist.startsWith('TODO in src/new-module.ts:')), true);
  });

  it('emits significant change cues for large diffs', async () => {
    const largeBody = Array.from({ length: 30 }, (_, index) => `+line ${index}`).join('\n');
    const largeRemoval = Array.from({ length: 25 }, (_, index) => `-old ${index}`).join('\n');
    const result = await summarize(`diff --git a/src/huge.ts b/src/huge.ts
--- a/src/huge.ts
+++ b/src/huge.ts
@@
${largeRemoval}
${largeBody}
`);

    assert.equal(
      result.cue_drafts.some((draft) =>
        String(draft.gist) === 'Significant change in src/huge.ts (+30/-25 lines)'
      ),
      true,
    );
  });

  it('skips mechanical import renames', async () => {
    const result = await summarize(`diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@
-import { auth } from './auth.js';
-export { auth } from './auth.js';
+import { auth } from './auth-service.js';
+export { auth } from './auth-service.js';
`);

    assert.equal(result.cue_drafts.length, 0);
  });
});
