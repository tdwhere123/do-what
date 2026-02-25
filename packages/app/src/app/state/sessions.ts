export { createSessionStore } from "../context/session";

import { createStore } from "solid-js/store";

import type { RunEvent } from "../lib/agent-output-parser";
import { extractMemoryCandidates } from "../lib/memory-extractor";
import { addMemoryCandidates } from "./memory-candidates";

export type AgentRunStatus = "running" | "done" | "error" | "aborted";
export type AgentRunType = "quick-chat" | "agent-run";
export type AgentRuntime = "claude-code" | "codex";

export type AgentRunConfig = {
  mcpConfigPath?: string;
  rulesPrefix?: string;
};

export type AgentRun = {
  id: string;
  runtime: AgentRuntime;
  type: AgentRunType;
  prompt: string;
  workdir?: string;
  title: string;
  status: AgentRunStatus;
  events: RunEvent[];
  startedAt: number;
  endedAt?: number;
  projectId?: string;
  parentSessionIds?: string[];
  _memoryCandidatesExtracted?: boolean;
};

const [agentRuns, setAgentRuns] = createStore<AgentRun[]>([]);

export function useAgentRuns() {
  return { agentRuns, setAgentRuns };
}

export function addAgentRun(run: AgentRun) {
  setAgentRuns((prev) => [run, ...prev]);
}

const maybeExtractRunMemoryCandidates = (run: AgentRun) => {
  if (run._memoryCandidatesExtracted) return;
  if (run.status !== "done" && run.status !== "error") return;

  const candidates = extractMemoryCandidates(run);
  if (candidates.length) {
    addMemoryCandidates(candidates);
  }

  setAgentRuns((item) => item.id === run.id, { _memoryCandidatesExtracted: true });
};

export function updateAgentRun(id: string, patch: Partial<AgentRun>) {
  setAgentRuns((run) => run.id === id, patch);
  const run = agentRuns.find((item) => item.id === id);
  if (run) {
    maybeExtractRunMemoryCandidates(run);
  }
}

export function appendRunEvent(id: string, event: RunEvent) {
  setAgentRuns(
    (run) => run.id === id,
    "events",
    (events = []) => [...events, event],
  );

  if (event.type === "done") {
    const run = agentRuns.find((item) => item.id === id);
    if (run) {
      maybeExtractRunMemoryCandidates({ ...run, status: "done" });
    }
  }
}
