import fs from 'node:fs/promises';
import path from 'node:path';

export interface SemanticFallbackCandidate {
  filePath: string;
  repoPath: string;
  score: number;
}

export interface SemanticFallbackOptions {
  workspaceRoot: string;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
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
      } else if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

export class SemanticFallback {
  private readonly workspaceRoot: string;

  constructor(options: SemanticFallbackOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
  }

  async findCandidate(gist: string): Promise<SemanticFallbackCandidate | null> {
    const queryTokens = tokenize(gist);
    if (queryTokens.size === 0) {
      return null;
    }

    let best: SemanticFallbackCandidate | null = null;
    for (const filePath of await collectFiles(this.workspaceRoot)) {
      const content = await this.safeReadFile(filePath);
      if (!content) {
        continue;
      }

      const fileTokens = tokenize(`${path.basename(filePath)} ${content.slice(0, 512)}`);
      const overlap = [...queryTokens].filter((token) => fileTokens.has(token)).length;
      if (overlap === 0) {
        continue;
      }

      const score = overlap / queryTokens.size;
      if (!best || score > best.score) {
        best = {
          filePath,
          repoPath: path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/'),
          score,
        };
      }
    }

    return best;
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }
}
