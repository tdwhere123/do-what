import fs from 'node:fs';
import path from 'node:path';
import { runProcess } from './git-process.js';

export async function createWorkspaceMemoryJunction(
  workspacePath: string,
  memoryRepoPath: string,
): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  const junctionRoot = path.join(workspacePath, '.do-what');
  const junctionPath = path.join(junctionRoot, 'memory_repo');
  if (fs.existsSync(junctionPath)) {
    return junctionPath;
  }

  fs.mkdirSync(junctionRoot, { recursive: true });
  const result = await runProcess({
    args: ['/c', 'mklink', '/J', junctionPath, memoryRepoPath],
    command: 'cmd.exe',
    cwd: workspacePath,
  });
  if (result.code !== 0) {
    console.warn('[soul][junction] failed to create workspace memory junction', {
      junctionPath,
      memoryRepoPath,
      stderr: result.stderr,
    });
    return null;
  }

  return junctionPath;
}
