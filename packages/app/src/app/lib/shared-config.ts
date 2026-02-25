import { invoke } from "@tauri-apps/api/core";

export type McpEntry = {
  name: string;
  command: string[];
  env?: Record<string, string>;
};

export type SharedConfig = {
  rulesPath: string;
  mcpServers: McpEntry[];
  skillsDir: string;
};

const DEFAULTS: SharedConfig = {
  rulesPath: "~/.config/do-what/shared/rules.md",
  mcpServers: [],
  skillsDir: "~/.config/do-what/shared/skills/",
};

const STORAGE_KEY = "openwork.shared-config.v1";

export async function readSharedConfig(): Promise<SharedConfig> {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SharedConfig>) };
  } catch {
    return DEFAULTS;
  }
}

export async function writeSharedConfig(cfg: Partial<SharedConfig>): Promise<void> {
  if (typeof window === "undefined") return;
  const merged = { ...(await readSharedConfig()), ...cfg };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export async function readRulesContent(): Promise<string> {
  try {
    return await invoke<string>("read_text_file", { path: (await readSharedConfig()).rulesPath });
  } catch {
    return "";
  }
}

export async function writeRulesContent(content: string): Promise<void> {
  try {
    await invoke("write_text_file", { path: (await readSharedConfig()).rulesPath, content });
  } catch {
    // no-op in web mode
  }
}

export async function buildPromptPrefix(): Promise<string> {
  const rules = (await readRulesContent()).trim();
  if (!rules) return "";
  return `System rules:\n${rules}\n\n`;
}
