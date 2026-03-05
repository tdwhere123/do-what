import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PORT = 3847;

function resolvePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? DEFAULT_PORT : parsed;
}

export const HOST = '127.0.0.1';
export const PORT = resolvePort(process.env.DOWHAT_PORT);

export const DOWHAT_DIR = path.join(os.homedir(), '.do-what');
export const RUN_DIR = path.join(DOWHAT_DIR, 'run');
export const STATE_DIR = path.join(DOWHAT_DIR, 'state');
export const SESSION_TOKEN_PATH = path.join(RUN_DIR, 'session_token');

export interface RuntimeDirOptions {
  runDir?: string;
  stateDir?: string;
}

export function ensureRuntimeDirs(options: RuntimeDirOptions = {}): void {
  fs.mkdirSync(options.runDir ?? RUN_DIR, { recursive: true });
  fs.mkdirSync(options.stateDir ?? STATE_DIR, { recursive: true });
}
