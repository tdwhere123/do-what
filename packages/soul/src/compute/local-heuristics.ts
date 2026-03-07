import type {
  ComputeProvider,
  CostEstimate,
  SummarizeInput,
  SummarizeResult,
  TokenBudget,
} from './provider.js';

const DEFAULT_TIMEOUT_MS = 100;
const MAX_DIFF_BYTES = 100 * 1024;
const RULE_CONFIDENCE = {
  export: 0.6,
  interface: 0.55,
  module: 0.65,
  risk: 0.7,
  significant: 0.5,
} as const;

interface FileDiff {
  additions: string[];
  deletions: string[];
  isNewFile: boolean;
  path: string;
}

function truncateDiff(diff: string): { truncated: boolean; value: string } {
  if (diff.length <= MAX_DIFF_BYTES) {
    return {
      truncated: false,
      value: diff,
    };
  }

  return {
    truncated: true,
    value: diff.slice(0, MAX_DIFF_BYTES),
  };
}

function parseFileDiffs(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      if (current) {
        files.push(current);
      }

      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = {
        additions: [],
        deletions: [],
        isNewFile: false,
        path: match?.[2] ?? match?.[1] ?? 'unknown',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('new file mode ')) {
      current.isNewFile = true;
      continue;
    }

    if (line.startsWith('+++ ')) {
      if (line === '+++ /dev/null') {
        current.path = 'unknown';
      } else if (line.startsWith('+++ b/')) {
        current.path = line.slice(6);
      }
      continue;
    }

    if (line.startsWith('--- ')) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions.push(line.slice(1));
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions.push(line.slice(1));
    }
  }

  if (current) {
    files.push(current);
  }

  return files.filter((file) => file.path !== 'unknown');
}

function normalizedLines(lines: readonly string[]): string[] {
  return lines
    .map((line) => line.replace(/\s+/g, ''))
    .filter((line) => line.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function isWhitespaceOnlyChange(file: FileDiff): boolean {
  const additions = normalizedLines(file.additions);
  const deletions = normalizedLines(file.deletions);
  if (additions.length === 0 && deletions.length === 0) {
    return true;
  }

  return additions.length === deletions.length
    && additions.every((line, index) => line === deletions[index]);
}

function isMechanicalImportRename(file: FileDiff): boolean {
  const changed = [...file.additions, ...file.deletions]
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (changed.length === 0) {
    return false;
  }

  return changed.every((line) => /^(import|export)\b/.test(line));
}

function extractAnchors(filePath: string, symbol?: string): string[] {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);
  const anchors = segments.slice(-4);
  if (symbol) {
    anchors.push(symbol);
  }
  return anchors;
}

function buildPointer(filePath: string, symbol?: string): string {
  return symbol
    ? `repo_path:${filePath} symbol:${symbol}`
    : `repo_path:${filePath}`;
}

function createDraft(input: {
  confidence: number;
  filePath: string;
  formationKind: 'fact' | 'pattern' | 'risk';
  gist: string;
  symbol?: string;
}): Record<string, unknown> {
  return {
    anchors: extractAnchors(input.filePath, input.symbol),
    formation_kind: input.formationKind,
    gist: input.gist,
    pointers: [buildPointer(input.filePath, input.symbol)],
    scope: 'project',
    source: 'local_heuristic',
    track: 'architecture',
    confidence: input.confidence,
  };
}

function matchExport(line: string): string | null {
  const match =
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_$]+)/.exec(
      line,
    );
  return match?.[1] ?? null;
}

function matchInterface(line: string): string | null {
  const match = /\b(?:interface|type)\s+([A-Za-z0-9_$]+)/.exec(line);
  return match?.[1] ?? null;
}

function createRiskGist(filePath: string, line: string): string {
  const compact = line.trim().replace(/\s+/g, ' ').slice(0, 60);
  return `TODO in ${filePath}: ${compact}`;
}

export class LocalHeuristics implements ComputeProvider {
  readonly name = 'local-heuristics';

  cost_estimate(_input: SummarizeInput): CostEstimate {
    return {
      dollars: 0,
      tokens: 0,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  async summarize_diff(
    input: SummarizeInput,
    _budget: TokenBudget,
  ): Promise<SummarizeResult> {
    const startedAt = Date.now();
    const { truncated, value } = truncateDiff(input.diff);
    const files = parseFileDiffs(value);
    const cueDrafts: Array<Record<string, unknown>> = [];
    let timedOut = false;

    for (const file of files) {
      if (Date.now() - startedAt > DEFAULT_TIMEOUT_MS) {
        timedOut = true;
        break;
      }

      if (isWhitespaceOnlyChange(file) || isMechanicalImportRename(file)) {
        continue;
      }

      if (file.isNewFile) {
        cueDrafts.push(
          createDraft({
            confidence: RULE_CONFIDENCE.module,
            filePath: file.path,
            formationKind: 'pattern',
            gist: `New module: ${file.path}`,
          }),
        );
      }

      for (const line of file.additions) {
        const exportedName = matchExport(line);
        if (exportedName) {
          cueDrafts.push(
            createDraft({
              confidence: RULE_CONFIDENCE.export,
              filePath: file.path,
              formationKind: 'fact',
              gist: `Added export ${exportedName}`,
              symbol: exportedName,
            }),
          );
        }

        if (/(TODO|FIXME|HACK)/.test(line)) {
          cueDrafts.push(
            createDraft({
              confidence: RULE_CONFIDENCE.risk,
              filePath: file.path,
              formationKind: 'risk',
              gist: createRiskGist(file.path, line),
            }),
          );
        }
      }

      const interfaceLines = [...file.additions, ...file.deletions]
        .map((line) => matchInterface(line))
        .filter((name): name is string => name !== null);
      for (const name of new Set(interfaceLines)) {
        cueDrafts.push(
          createDraft({
            confidence: RULE_CONFIDENCE.interface,
            filePath: file.path,
            formationKind: 'pattern',
            gist: `Interface changed: ${name} in ${file.path}`,
            symbol: name,
          }),
        );
      }

      const changedLineCount = file.additions.length + file.deletions.length;
      if (changedLineCount > 50) {
        cueDrafts.push(
          createDraft({
            confidence: RULE_CONFIDENCE.significant,
            filePath: file.path,
            formationKind: 'fact',
            gist: `Significant change in ${file.path} (+${file.additions.length}/-${file.deletions.length} lines)`,
          }),
        );
      }
    }

    const confidence =
      cueDrafts.length === 0
        ? 0
        : Math.max(
            ...cueDrafts.map((draft) =>
              typeof draft.confidence === 'number' ? draft.confidence : 0,
            ),
          );

    return {
      confidence,
      cue_drafts: cueDrafts,
      source: 'local_heuristic',
      truncated: truncated || timedOut || undefined,
    };
  }
}
