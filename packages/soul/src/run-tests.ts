import { spawnSync } from 'node:child_process';

const TEST_FILES = [
  'dist/__tests__/soul-ddl.test.js',
  'dist/__tests__/concept-unification.test.js',
  'dist/__tests__/fingerprint.test.js',
  'dist/__tests__/memory-repo.test.js',
  'dist/__tests__/local-heuristics.test.js',
  'dist/__tests__/official-api.test.js',
  'dist/__tests__/memory-compiler.test.js',
  'dist/__tests__/memory-search.test.js',
  'dist/__tests__/pointer-parser.test.js',
  'dist/__tests__/pointer-relocator.test.js',
  'dist/__tests__/healing-queue.test.js',
  'dist/__tests__/open-pointer.test.js',
  'dist/__tests__/explore-graph.test.js',
  'dist/__tests__/proposal-service.test.js',
  'dist/__tests__/cue-writer.test.js',
  'dist/__tests__/review-handler.test.js',
  'dist/__tests__/bootstrapping.test.js',
];

function mapArgs(argv: readonly string[]): string[] {
  const mapped: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--testNamePattern') {
      const value = argv[index + 1];
      if (value) {
        mapped.push('--test-name-pattern', value);
        index += 1;
      }
      continue;
    }

    mapped.push(arg);
  }

  return mapped;
}

const result = spawnSync(
  process.execPath,
  ['--test', '--test-isolation=none', ...mapArgs(process.argv.slice(2)), ...TEST_FILES],
  {
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
