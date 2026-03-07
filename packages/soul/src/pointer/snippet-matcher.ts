import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SnippetMatch {
  endLine: number;
  filePath: string;
  repoPath: string;
  startLine: number;
}

export interface SnippetMatcherOptions {
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
      } else if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export class SnippetMatcher {
  private readonly workspaceRoot: string;

  constructor(options: SnippetMatcherOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
  }

  async match(
    expectedHash: string,
    preferredPath?: string,
  ): Promise<SnippetMatch | null> {
    const files = await collectFiles(this.workspaceRoot);
    const preferredDir = preferredPath ? path.dirname(path.resolve(this.workspaceRoot, preferredPath)) : null;

    for (const filePath of files.sort((left, right) => {
      const leftScore = preferredDir && path.dirname(left).startsWith(preferredDir) ? 0 : 1;
      const rightScore = preferredDir && path.dirname(right).startsWith(preferredDir) ? 0 : 1;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return left.localeCompare(right);
    })) {
      const content = await this.safeReadFile(filePath);
      if (!content) {
        continue;
      }

      if (hashContent(content) === expectedHash) {
        const lineCount = content.split(/\r?\n/).length;
        return {
          endLine: lineCount,
          filePath,
          repoPath: path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/'),
          startLine: 1,
        };
      }

      const lines = content.split(/\r?\n/);
      for (const windowSize of [8, 12, 20, 40]) {
        for (let index = 0; index < lines.length; index += 1) {
          const snippet = lines.slice(index, index + windowSize).join('\n');
          if (snippet.length === 0) {
            continue;
          }
          if (hashContent(snippet) === expectedHash) {
            return {
              endLine: Math.min(lines.length, index + windowSize),
              filePath,
              repoPath: path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/'),
              startLine: index + 1,
            };
          }
        }
      }
    }

    return null;
  }

  private async safeReadFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }
}
