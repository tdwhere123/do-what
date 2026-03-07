import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DOWHAT_DIR = path.join(os.homedir(), '.do-what');
export const STATE_DIR = path.join(DOWHAT_DIR, 'state');
export const MEMORY_REPO_BASE_PATH = path.join(DOWHAT_DIR, 'memory');
export const SOUL_DB_PATH = path.join(STATE_DIR, 'soul.db');

export interface SoulRuntimeDirOptions {
  memoryRepoBasePath?: string;
  stateDir?: string;
}

export function ensureSoulRuntimeDirs(options: SoulRuntimeDirOptions = {}): void {
  fs.mkdirSync(options.stateDir ?? STATE_DIR, { recursive: true });
  fs.mkdirSync(options.memoryRepoBasePath ?? MEMORY_REPO_BASE_PATH, {
    recursive: true,
  });
}
