import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_FILES = [
  'policy-cache.test.js',
  'hook-runner.test.js',
  'mcp-server.test.js',
  'claude-adapter.test.js',
  'contract/replay.test.js',
];

function collectForwardedArgs(argv: string[]): string[] {
  const forwarded: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--') {
      continue;
    }
    if (current === '--testNamePattern' || current === '--test-name-pattern') {
      const pattern = argv[index + 1];
      if (pattern) {
        forwarded.push('--test-name-pattern', pattern);
        index += 1;
      }
      continue;
    }

    if (current.startsWith('--testNamePattern=')) {
      forwarded.push('--test-name-pattern', current.slice('--testNamePattern='.length));
      continue;
    }

    forwarded.push(current);
  }

  return forwarded;
}

const currentFilePath = fileURLToPath(import.meta.url);
const testsRoot = path.dirname(currentFilePath);
const testFiles = TEST_FILES.map((file) => path.join(testsRoot, file));
const args = [
  '--test',
  '--test-isolation=none',
  ...collectForwardedArgs(process.argv.slice(2)),
  ...testFiles,
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
