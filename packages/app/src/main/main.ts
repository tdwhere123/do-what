import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

if (started) {
  app.quit();
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f5f1e8',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f5f1e8',
      symbolColor: '#6b5e56',
      height: 44,
    },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
}

async function pickWorkspaceDirectory(): Promise<string | null> {
  const browserWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
    properties: ['openDirectory'],
    title: 'Open Workspace',
  });
  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

app.whenReady().then(() => {
  createMainWindow();
  ipcMain.handle('do-what:pick-workspace-directory', async () => pickWorkspaceDirectory());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
