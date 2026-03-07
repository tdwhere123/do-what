import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatePointerKey, normalizePointerComponents } from '../pointer/pointer-key.js';
import { parsePointer } from '../pointer/pointer-parser.js';

describe('pointer parser', () => {
  it('parses known pointer components', () => {
    const parsed = parsePointer(
      'git_commit:abc123 repo_path:src/auth.ts symbol:authenticate snippet_hash:def456',
    );

    assert.equal(parsed.gitCommit, 'abc123');
    assert.equal(parsed.repoPath, 'src/auth.ts');
    assert.equal(parsed.symbol, 'authenticate');
    assert.equal(parsed.snippetHash, 'def456');
  });

  it('normalizes pointer keys deterministically', () => {
    const left = parsePointer('symbol:authenticate repo_path:src/auth.ts git_commit:abc123');
    const right = parsePointer('git_commit:abc123 repo_path:src/auth.ts symbol:authenticate');

    assert.equal(normalizePointerComponents(left), normalizePointerComponents(right));
    assert.equal(generatePointerKey(left), generatePointerKey(right));
  });
});
