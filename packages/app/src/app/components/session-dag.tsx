import { For, Show, createMemo, createSignal } from "solid-js";

import { useAgentRuns, useProjects } from "../state/sessions";

type Props = {
  projectId: string | null;
  onSelectSession: (id: string) => void;
};

type DagNode = {
  id: string;
  title: string;
  status: string;
  runtime: "cc" | "cx" | "oc";
  startedAt: number;
  parentSessionIds: string[];
};

const runtimeClass = (runtime: DagNode["runtime"]) => {
  if (runtime === "cc") return "runtime-badge runtime-badge--cc";
  if (runtime === "cx") return "runtime-badge runtime-badge--cx";
  return "runtime-badge runtime-badge--oc";
};

const runtimeLabel = (runtime: DagNode["runtime"]) => {
  if (runtime === "cc") return "CC";
  if (runtime === "cx") return "CX";
  return "OC";
};

const statusColor = (status: string) => {
  if (status === "running" || status === "retry") return "bg-amber-9 animate-soft-pulse";
  if (status === "error" || status === "aborted") return "bg-red-9";
  return "bg-gray-8";
};

export default function SessionDagWidget(props: Props) {
  const [expanded, setExpanded] = createSignal(false);
  const { projects } = useProjects();
  const { agentRuns } = useAgentRuns();

  const dagNodes = createMemo<DagNode[]>(() => {
    const project = projects.find((entry) => entry.id === props.projectId);
    if (!project) return [];

    const runById = new Map(agentRuns.map((run) => [run.id, run] as const));

    return project.sessionIds
      .map((id) => {
        const run = runById.get(id);
        if (run) {
          return {
            id,
            title: run.title?.trim() || id,
            status: run.status,
            runtime: run.runtime === "claude-code" ? "cc" : "cx",
            startedAt: run.startedAt,
            parentSessionIds: run.parentSessionIds ?? [],
          } satisfies DagNode;
        }

        return {
          id,
          title: id,
          status: "done",
          runtime: "oc",
          startedAt: 0,
          parentSessionIds: [],
        } satisfies DagNode;
      })
      .sort((a, b) => a.startedAt - b.startedAt);
  });

  const sessionCount = createMemo(() => dagNodes().length);
  const indentLevel = (node: DagNode) => Math.min(node.parentSessionIds.length, 3);

  return (
    <div class="absolute top-2 right-2 z-40">
      <Show
        when={expanded()}
        fallback={
          <button
            type="button"
            onClick={() => setExpanded(true)}
            class="h-7 flex items-center gap-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-2 text-xs text-[var(--color-text-secondary)]"
          >
            <span>◆</span>
            <span>{sessionCount()} sessions</span>
          </button>
        }
      >
        <div class="w-[280px] max-h-[200px] overflow-auto rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-md)]">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-[var(--color-text-primary)]">Session Flow</span>
            <button
              type="button"
              class="rounded px-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]"
              onClick={() => setExpanded(false)}
            >
              ×
            </button>
          </div>
          <div class="space-y-1">
            <For each={dagNodes()}>
              {(node) => (
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded p-1.5 text-left hover:bg-[var(--color-bg-overlay)]"
                  style={{ "padding-left": `${6 + indentLevel(node) * 12}px` }}
                  onClick={() => props.onSelectSession(node.id)}
                >
                  <span class={`h-2 w-2 rounded-full ${statusColor(node.status)}`} />
                  <span class="flex-1 truncate text-xs text-[var(--color-text-primary)]">{node.title}</span>
                  <span class={runtimeClass(node.runtime)}>{runtimeLabel(node.runtime)}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
