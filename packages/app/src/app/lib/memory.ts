import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "../utils";

const SYSTEM_MEMORY_PATH = "~/.config/do-what/shared/system.md";
const WEB_SYSTEM_MEMORY_KEY = "openwork.system-memory.v1";

export async function readSystemMemory(): Promise<string> {
  if (!isTauriRuntime()) {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(WEB_SYSTEM_MEMORY_KEY) ?? "";
  }

  try {
    return await invoke<string>("read_text_file", { path: SYSTEM_MEMORY_PATH });
  } catch {
    return "";
  }
}

export async function writeSystemMemory(content: string): Promise<void> {
  if (!isTauriRuntime()) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WEB_SYSTEM_MEMORY_KEY, content);
    return;
  }

  try {
    await invoke("write_text_file", { path: SYSTEM_MEMORY_PATH, content });
  } catch {
    // no-op in environments without filesystem write support
  }
}

export async function readProjectMemory(workdir: string): Promise<string> {
  const target = [workdir.trim().replace(/[\\/]+$/, ""), "AGENTS.md"].filter(Boolean).join("/");
  if (!target) return "";

  try {
    return await invoke<string>("read_text_file", { path: target });
  } catch {
    return "";
  }
}

export async function writeProjectMemory(workdir: string, content: string): Promise<void> {
  const target = [workdir.trim().replace(/[\\/]+$/, ""), "AGENTS.md"].filter(Boolean).join("/");
  if (!target) return;

  try {
    await invoke("write_text_file", { path: target, content });
  } catch {
    // no-op in environments without filesystem write support
  }
}

export async function buildSystemMemoryPrefix(): Promise<string> {
  return (await readSystemMemory()).trim().slice(0, 500);
}
