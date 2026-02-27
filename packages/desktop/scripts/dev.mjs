/**
 * Cross-platform dev launcher for Tauri.
 * Replaces the Unix-only inline env-var syntax in package.json scripts.
 */
import { execSync } from "child_process";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point directly at the local .bin so we don't rely on PATH
const binDir = join(__dirname, "../node_modules/.bin");

const port = process.env.PORT ?? "5173";
const dataDir = `${homedir()}/.openwork/openwork-orchestrator-dev`;
const devUrl = `http://localhost:${port}`;

// On Windows .bin entries are .CMD shims; on Unix they're plain scripts
const tauriBin = join(binDir, process.platform === "win32" ? "tauri.CMD" : "tauri");

const configArg = JSON.stringify({ build: { devUrl } });
// shell:true is required on Windows to execute .CMD files
execSync(
  `"${tauriBin}" dev --config src-tauri/tauri.dev.conf.json --config "${configArg.replace(/"/g, '\\"')}"`,
  {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      OPENWORK_DATA_DIR: dataDir,
    },
  }
);
