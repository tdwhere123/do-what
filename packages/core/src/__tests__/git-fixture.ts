import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGit } from '@do-what/tools';

export function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeRepoFile(
  repoPath: string,
  relativePath: string,
  content: string,
): void {
  const absolutePath = path.join(repoPath, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

export async function commitAll(repoPath: string, message: string): Promise<void> {
  await runGit(['add', '--all'], { cwd: repoPath });
  await runGit(['commit', '-m', message], { cwd: repoPath });
}

export async function initTempRepo(
  files: Record<string, string>,
  prefix = 'do-what-git-fixture-',
): Promise<string> {
  const repoPath = createTempDir(prefix);
  await runGit(['init'], { cwd: repoPath });
  await runGit(['config', 'user.email', 'codex@example.com'], { cwd: repoPath });
  await runGit(['config', 'user.name', 'Codex'], { cwd: repoPath });
  for (const [relativePath, content] of Object.entries(files)) {
    writeRepoFile(repoPath, relativePath, content);
  }
  await commitAll(repoPath, 'initial');
  return repoPath;
}
