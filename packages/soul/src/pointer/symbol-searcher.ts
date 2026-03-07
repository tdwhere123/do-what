import fs from 'node:fs/promises';
import path from 'node:path';

export interface SymbolSearchCandidate {
  filePath: string;
  line: number;
  repoPath: string;
  symbol: string;
}

export interface SymbolSearcherOptions {
  workspaceRoot: string;
}

async function collectFiles(rootDir: string): Promise<string[]> {
  const pending = [rootDir];
  const files: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

function sortCandidates(
  workspaceRoot: string,
  preferredPath: string | undefined,
  candidates: SymbolSearchCandidate[],
): SymbolSearchCandidate[] {
  const preferredDir = preferredPath ? path.dirname(preferredPath) : null;
  return [...candidates].sort((left, right) => {
    const leftScore = preferredDir && path.dirname(left.filePath).startsWith(preferredDir) ? 0 : 1;
    const rightScore = preferredDir && path.dirname(right.filePath).startsWith(preferredDir) ? 0 : 1;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return path
      .relative(workspaceRoot, left.filePath)
      .localeCompare(path.relative(workspaceRoot, right.filePath));
  });
}

export class SymbolSearcher {
  private readonly workspaceRoot: string;

  constructor(options: SymbolSearcherOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
  }

  async search(
    symbol: string,
    preferredPath?: string,
  ): Promise<SymbolSearchCandidate[]> {
    const files = await collectFiles(this.workspaceRoot);
    const pattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const candidates: SymbolSearchCandidate[] = [];

    for (const filePath of files) {
      const content = await this.safeReadFile(filePath);
      if (!content || !pattern.test(content)) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      const lineIndex = lines.findIndex((line) => pattern.test(line));
      candidates.push({
        filePath,
        line: lineIndex >= 0 ? lineIndex + 1 : 1,
        repoPath: path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/'),
        symbol,
      });
    }

    return sortCandidates(
      this.workspaceRoot,
      preferredPath ? path.resolve(this.workspaceRoot, preferredPath) : undefined,
      candidates,
    );
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }
}
