import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contextBridge, ipcRenderer } from 'electron';

const CORE_SESSION_TOKEN_PATH = path.join(os.homedir(), '.do-what', 'run', 'session_token');

function readCoreSessionToken(): string | null {
  try {
    const token = fs.readFileSync(CORE_SESSION_TOKEN_PATH, 'utf8').trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

contextBridge.exposeInMainWorld('doWhatRuntime', {
  coreSessionToken: readCoreSessionToken(),
  coreSessionTokenPath: CORE_SESSION_TOKEN_PATH,
  openWorkspaceDirectory: () =>
    ipcRenderer.invoke('do-what:pick-workspace-directory') as Promise<string | null>,
  readFreshSessionToken: () => readCoreSessionToken(),
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
