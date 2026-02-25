export { createSessionStore } from "../context/session";

import { createStore } from "solid-js/store";

import type { RunEvent } from "../lib/agent-output-parser";

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
};

const [agentRuns, setAgentRuns] = createStore<AgentRun[]>([]);

export function useAgentRuns() {
  return { agentRuns, setAgentRuns };
}

export function addAgentRun(run: AgentRun) {
  setAgentRuns((prev) => [run, ...prev]);
}

export function updateAgentRun(id: string, patch: Partial<AgentRun>) {
  setAgentRuns((run) => run.id === id, patch);
}

export function appendRunEvent(id: string, event: RunEvent) {
  setAgentRuns(
    (run) => run.id === id,
    "events",
    (events = []) => [...events, event],
  );
}
