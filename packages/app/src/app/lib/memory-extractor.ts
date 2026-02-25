import type { RunEvent } from "./agent-output-parser";
import type { AgentRun } from "../state/sessions";

export type MemoryCandidate = {
  content: string;
  targetLayer: "system" | "project";
  targetWorkdir?: string;
  reason: string;
};

const SYSTEM_KEYWORDS = ["记住", "always", "never", "prefer"];
const PROJECT_FILE_RE = /\.(json|toml|ya?ml)$/i;

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const addCandidate = (
  bucket: MemoryCandidate[],
  candidate: MemoryCandidate,
  maxCandidates: number,
  dedupe: Set<string>,
) => {
  if (bucket.length >= maxCandidates) return;
  const key = `${candidate.targetLayer}:${candidate.targetWorkdir ?? ""}:${candidate.content}`;
  if (dedupe.has(key)) return;
  dedupe.add(key);
  bucket.push(candidate);
};

const candidateFromText = (event: RunEvent): MemoryCandidate | null => {
  if (event.type !== "text") return null;
  const text = normalizeText(event.content);
  if (!text) return null;
  const lower = text.toLowerCase();
  const hit = SYSTEM_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
  if (!hit) return null;
  return {
    content: text.slice(0, 280),
    targetLayer: "system",
    reason: "检测到偏好/约束关键词，建议沉淀到系统记忆。",
  };
};

const candidateFromFileWrite = (run: AgentRun, event: RunEvent): MemoryCandidate | null => {
  if (event.type !== "file_write") return null;
  if (!PROJECT_FILE_RE.test(event.path)) return null;
  if (!run.workdir) return null;

  return {
    content: `更新了配置文件：${event.path}`,
    targetLayer: "project",
    targetWorkdir: run.workdir,
    reason: "检测到配置文件变更，建议更新项目记忆。",
  };
};

const candidateFromSlowRun = (event: RunEvent): MemoryCandidate | null => {
  if (event.type !== "done") return null;
  if ((event.durationMs ?? 0) <= 30_000) return null;
  return {
    content: `本次任务耗时 ${(event.durationMs / 1000).toFixed(1)}s，建议补充关键结果或复盘。`,
    targetLayer: "system",
    reason: "任务耗时较长，可能包含可复用经验。",
  };
};

export function extractMemoryCandidates(
  run: AgentRun,
  options?: { maxCandidates?: number },
): MemoryCandidate[] {
  const maxCandidates = Math.max(1, options?.maxCandidates ?? 5);
  const candidates: MemoryCandidate[] = [];
  const dedupe = new Set<string>();

  for (const event of run.events) {
    const fromFile = candidateFromFileWrite(run, event);
    if (fromFile) {
      addCandidate(candidates, fromFile, maxCandidates, dedupe);
      continue;
    }

    const fromText = candidateFromText(event);
    if (fromText) {
      addCandidate(candidates, fromText, maxCandidates, dedupe);
      continue;
    }

    const fromDuration = candidateFromSlowRun(event);
    if (fromDuration) {
      addCandidate(candidates, fromDuration, maxCandidates, dedupe);
    }
  }

  return candidates;
}
