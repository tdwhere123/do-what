import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import LiveMarkdownEditor from "../components/live-markdown-editor";
import { readProjectMemory, readSystemMemory, writeProjectMemory, writeSystemMemory } from "../lib/memory";
import type { OpenworkSoulHeartbeatEntry, OpenworkSoulStatus } from "../lib/openwork-server";
import type { WorkspaceInfo } from "../lib/tauri";
import { formatRelativeTime } from "../utils";
import { dismissMemoryCandidate, useMemoryCandidates } from "../state/memory-candidates";
import type { MemoryCandidate } from "../lib/memory-extractor";

type SoulViewProps = {
  workspaceName: string;
  workspaceRoot: string;
  status: OpenworkSoulStatus | null;
  heartbeats: OpenworkSoulHeartbeatEntry[];
  loading: boolean;
  loadingHeartbeats: boolean;
  error: string | null;
  newTaskDisabled: boolean;
  refresh: (options?: { force?: boolean }) => void;
  runSoulPrompt: (prompt: string) => void;
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string;
};

export default function SoulView(props: SoulViewProps) {
  const [systemMemoryContent, setSystemMemoryContent] = createSignal("");
  const [projectMemoryContent, setProjectMemoryContent] = createSignal("");
  const [activeProjectId, setActiveProjectId] = createSignal(props.activeWorkspaceId);
  const [lastUpdatedAt, setLastUpdatedAt] = createSignal<number | null>(null);
  const { memoryCandidates, setMemoryCandidates } = useMemoryCandidates();

  const activeWorkspace = createMemo(
    () => props.workspaces.find((item) => item.id === activeProjectId()) ?? null,
  );

  const loadSystemMemory = async () => {
    setSystemMemoryContent(await readSystemMemory());
  };

  const loadProjectMemory = async () => {
    const workspace = activeWorkspace();
    if (!workspace?.path) {
      setProjectMemoryContent("");
      return;
    }
    setProjectMemoryContent(await readProjectMemory(workspace.path));
  };

  createEffect(() => {
    void loadSystemMemory();
  });

  createEffect(() => {
    const nextWorkspaceId = props.activeWorkspaceId;
    if (nextWorkspaceId && nextWorkspaceId !== activeProjectId()) {
      setActiveProjectId(nextWorkspaceId);
    }
  });

  createEffect(() => {
    activeProjectId();
    void loadProjectMemory();
  });

  const handleSystemMemorySave = async (content: string) => {
    setSystemMemoryContent(content);
    await writeSystemMemory(content);
    setLastUpdatedAt(Date.now());
  };

  const handleProjectMemorySave = async (content: string) => {
    setProjectMemoryContent(content);
    const workspace = activeWorkspace();
    if (!workspace?.path) return;
    await writeProjectMemory(workspace.path, content);
    setLastUpdatedAt(Date.now());
  };

  const handleAcceptCandidate = async (candidate: MemoryCandidate) => {
    if (candidate.targetLayer === "system") {
      const merged = [systemMemoryContent().trim(), candidate.content.trim()].filter(Boolean).join("\n\n");
      await handleSystemMemorySave(merged);
      dismissMemoryCandidate(candidate);
      return;
    }

    const targetPath = candidate.targetWorkdir ?? activeWorkspace()?.path;
    if (!targetPath) return;
    const merged = [projectMemoryContent().trim(), candidate.content.trim()].filter(Boolean).join("\n\n");
    await writeProjectMemory(targetPath, merged);
    if (targetPath === activeWorkspace()?.path) {
      setProjectMemoryContent(merged);
      setLastUpdatedAt(Date.now());
    }
    dismissMemoryCandidate(candidate);
  };

  const handleDismissCandidate = (candidate: MemoryCandidate) => {
    dismissMemoryCandidate(candidate);
  };

  const projects = createMemo(() => props.workspaces.filter((workspace) => workspace.workspaceType === "local"));

  return (
    <section class="space-y-6">
      <section class="rounded-xl border border-dls-border bg-dls-surface p-5 space-y-3">
        <h2 class="text-lg font-semibold text-dls-text">关于你</h2>
        <p class="text-sm text-gray-10">每次 session 启动时自动注入到 prompt 前缀。</p>
        <LiveMarkdownEditor
          value={systemMemoryContent()}
          onChange={(value) => {
            setSystemMemoryContent(value);
            void handleSystemMemorySave(value);
          }}
          placeholder="写下你的偏好、工作方式、长期目标..."
          ariaLabel="System memory editor"
        />
      </section>

      <section class="rounded-xl border border-dls-border bg-dls-surface p-5 space-y-3">
        <h2 class="text-lg font-semibold text-dls-text">当前项目</h2>
        <select
          class="h-10 rounded-lg border border-dls-border bg-dls-hover/30 px-3 text-sm text-dls-text"
          value={activeProjectId()}
          onChange={(event) => setActiveProjectId(event.currentTarget.value)}
        >
          <For each={projects()}>
            {(project) => <option value={project.id}>{project.name}</option>}
          </For>
        </select>
        <LiveMarkdownEditor
          value={projectMemoryContent()}
          onChange={(value) => {
            setProjectMemoryContent(value);
            void handleProjectMemorySave(value);
          }}
          placeholder="技术栈、约定、当前进度..."
          ariaLabel="Project memory editor"
        />
        <p class="text-xs text-gray-10">
          上次更新: <Show when={lastUpdatedAt()} fallback={"尚未更新"}>{(ts) => formatRelativeTime(ts())}</Show>
        </p>
      </section>

      <section class="rounded-xl border border-dls-border bg-dls-surface p-5 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold text-dls-text">待记录</h2>
          <button
            type="button"
            class="h-8 rounded-md border border-dls-border px-3 text-xs text-dls-secondary hover:text-dls-text"
            onClick={() => setMemoryCandidates([])}
          >
            清空
          </button>
        </div>
        <Show when={memoryCandidates.length === 0}>
          <p class="text-sm text-gray-10">暂无待记录内容。</p>
        </Show>
        <For each={memoryCandidates}>
          {(candidate) => (
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <p class="text-xs text-gray-10">{candidate.reason}</p>
              <pre class="text-sm whitespace-pre-wrap break-words">{candidate.content}</pre>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="h-8 rounded-md border border-emerald-7/40 bg-emerald-4/20 px-3 text-xs text-emerald-11"
                  onClick={() => void handleAcceptCandidate(candidate)}
                >
                  写入
                </button>
                <button
                  type="button"
                  class="h-8 rounded-md border border-dls-border px-3 text-xs text-dls-secondary"
                  onClick={() => handleDismissCandidate(candidate)}
                >
                  忽略
                </button>
              </div>
            </div>
          )}
        </For>
      </section>
    </section>
  );
}
