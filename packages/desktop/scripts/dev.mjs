/**
 * Cross-platform dev launcher for Tauri.
 * Replaces the Unix-only inline env-var syntax in package.json scripts.
 */
import { execSync, spawnSync } from "child_process";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point directly at the local .bin so we don't rely on PATH
const binDir = join(__dirname, "../node_modules/.bin");

const port = process.env.PORT ?? "5173";
const dataDir = `${homedir()}/.do-what/do-what-orchestrator-dev`;
const devUrl = `http://localhost:${port}`;

// On Windows .bin entries are .CMD shims; on Unix they're plain scripts
const tauriBin = join(binDir, process.platform === "win32" ? "tauri.CMD" : "tauri");

const configArg = JSON.stringify({ build: { devUrl } });

const resolveMsvcLinker = () => {
  if (process.platform !== "win32") return null;
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const vswhere = join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe"
  );
  if (!existsSync(vswhere)) return null;

  const result = spawnSync(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-find",
      "**\\VC\\Tools\\MSVC\\**\\bin\\Hostx64\\x64\\link.exe",
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return null;
  const line = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  return line || null;
};

const linkerPath = resolveMsvcLinker();
const linkerDir = linkerPath ? dirname(linkerPath) : null;

if (process.platform === "win32" && linkerPath) {
  console.log(`[do-what] Using MSVC linker: ${linkerPath}`);
}

const nextPath =
  process.platform === "win32" && linkerDir
    ? `${linkerDir};${process.env.PATH ?? ""}`
    : process.env.PATH;

// shell:true is required on Windows to execute .CMD files
execSync(
  `"${tauriBin}" dev --config src-tauri/tauri.dev.conf.json --config "${configArg.replace(/"/g, '\\"')}"`,
  {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      DOWHAT_DATA_DIR: dataDir,
      ...(linkerPath
        ? { CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER: linkerPath }
        : {}),
      ...(nextPath ? { PATH: nextPath } : {}),
    },
  }
);
