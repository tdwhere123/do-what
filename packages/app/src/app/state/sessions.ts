export { createSessionStore } from "../context/session";

import { createEffect, createRoot } from "solid-js";
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

export type Project = {
  id: string;
  name: string;
  workdir: string;
  sessionIds: string[];
  createdAt: number;
  lastActiveAt: number;
};

const [agentRuns, setAgentRuns] = createStore<AgentRun[]>([]);

const PROJECTS_STORAGE_KEY = "doWhat.projects";

const readStoredProjects = (): Project[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((project): project is Project => {
      if (!project || typeof project !== "object") return false;
      return (
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        typeof project.workdir === "string" &&
        Array.isArray(project.sessionIds) &&
        typeof project.createdAt === "number" &&
        typeof project.lastActiveAt === "number"
      );
    });
  } catch {
    return [];
  }
};

const [projects, setProjects] = createStore<Project[]>(readStoredProjects());

if (typeof window !== "undefined") {
  createRoot(() => {
    createEffect(() => {
      try {
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      } catch {
        // ignore storage failures
      }
    });
  });
}

export function useAgentRuns() {
  return { agentRuns, setAgentRuns };
}

export function useProjects() {
  return { projects, setProjects };
}

export function createProject(name: string, workdir: string): Project {
  const now = Date.now();
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled project",
    workdir: workdir.trim(),
    sessionIds: [],
    createdAt: now,
    lastActiveAt: now,
  };
  setProjects((prev) => [project, ...prev]);
  return project;
}

export function addSessionToProject(projectId: string, sessionId: string) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return;
  setProjects(
    (project) => project.id === projectId,
    (project) => ({
      ...project,
      sessionIds: project.sessionIds.includes(normalizedSessionId)
        ? project.sessionIds
        : [...project.sessionIds, normalizedSessionId],
      lastActiveAt: Date.now(),
    }),
  );
  setAgentRuns(
    (run) => run.id === normalizedSessionId,
    {
      projectId,
    },
  );
}

export function listAgentRunTextEvents(sessionIds: string[], maxEvents = 8): string[] {
  const idSet = new Set(sessionIds);
  if (!idSet.size) return [];
  return agentRuns
    .filter((run) => idSet.has(run.id))
    .flatMap((run) =>
      run.events
        .filter((event) => event.type === "text")
        .map((event) => event.content.trim())
        .filter(Boolean)
        .slice(-maxEvents),
    );
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
