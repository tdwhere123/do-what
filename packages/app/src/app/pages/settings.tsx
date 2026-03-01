import { For, Match, Show, Switch, createMemo, createSignal, onMount } from "solid-js";

import Button from "../components/button";
import type { OpencodeConnectStatus, ProviderListItem, SettingsTab, StartupPreference } from "../types";
import type {
  OpenworkAuditEntry,
  OpenworkServerCapabilities,
  OpenworkServerDiagnostics,
  OpenworkServerSettings,
  OpenworkServerStatus,
} from "../lib/openwork-server";
import type {
  EngineInfo,
  OrchestratorStatus,
  DoWhatServerInfo,
  RuntimeAssistantStatus,
} from "../lib/tauri";
import { checkAssistantStatuses } from "../lib/tauri";
import { currentLocale, t } from "../../i18n";

export type SettingsViewProps = {
  startupPreference: StartupPreference | null;
  baseUrl: string;
  headerStatus: string;
  busy: boolean;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  providers: ProviderListItem[];
  providerConnectedIds: string[];
  providerAuthBusy: boolean;
  openProviderAuthModal: () => Promise<void>;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkReconnectBusy: boolean;
  reconnectOpenworkServer: () => Promise<boolean>;
  openworkServerHostInfo: DoWhatServerInfo | null;
  openworkServerCapabilities: OpenworkServerCapabilities | null;
  openworkServerDiagnostics: OpenworkServerDiagnostics | null;
  openworkServerWorkspaceId: string | null;
  openworkServerSettings: OpenworkServerSettings;
  updateOpenworkServerSettings: (next: OpenworkServerSettings) => void;
  resetOpenworkServerSettings: () => void;
  testOpenworkServerConnection: (next: OpenworkServerSettings) => Promise<boolean>;
  canReloadWorkspace: boolean;
  reloadWorkspaceEngine: () => Promise<void>;
  reloadBusy: boolean;
  reloadError: string | null;
  workspaceAutoReloadAvailable: boolean;
  workspaceAutoReloadEnabled: boolean;
  setWorkspaceAutoReloadEnabled: (value: boolean) => void | Promise<void>;
  workspaceAutoReloadResumeEnabled: boolean;
  setWorkspaceAutoReloadResumeEnabled: (value: boolean) => void | Promise<void>;
  openworkAuditEntries: OpenworkAuditEntry[];
  openworkAuditStatus: "idle" | "loading" | "error";
  openworkAuditError: string | null;
  opencodeConnectStatus: OpencodeConnectStatus | null;
  engineInfo: EngineInfo | null;
  orchestratorStatus: OrchestratorStatus | null;
  developerMode: boolean;
  toggleDeveloperMode: () => void;
  stopHost: () => void;
  engineSource: "path" | "sidecar" | "custom";
  setEngineSource: (value: "path" | "sidecar" | "custom") => void;
  engineCustomBinPath: string;
  setEngineCustomBinPath: (value: string) => void;
  engineRuntime: "direct" | "dowhat-orchestrator";
  setEngineRuntime: (value: "direct" | "dowhat-orchestrator") => void;
  isWindows: boolean;
  defaultModelLabel: string;
  defaultModelRef: string;
  openDefaultModelPicker: () => void;
  showThinking: boolean;
  toggleShowThinking: () => void;
  hideTitlebar: boolean;
  toggleHideTitlebar: () => void;
  modelVariantLabel: string;
  editModelVariant: () => void;
  themeMode: "light" | "dark" | "system";
  setThemeMode: (value: "light" | "dark" | "system") => void;
  anyActiveRuns: boolean;
  onResetStartupPreference: () => void;
  openResetModal: (mode: "onboarding" | "all") => void;
  resetModalBusy: boolean;
  pendingPermissions: unknown;
  events: unknown;
  workspaceDebugEvents: unknown;
  clearWorkspaceDebugEvents: () => void;
  safeStringify: (value: unknown) => string;
  repairOpencodeMigration: () => void;
  migrationRepairBusy: boolean;
  migrationRepairResult: { ok: boolean; message: string } | null;
  migrationRepairAvailable: boolean;
  migrationRepairUnavailableReason: string | null;
  repairOpencodeCache: () => void;
  cacheRepairBusy: boolean;
  cacheRepairResult: string | null;
  cleanupOpenworkDockerContainers: () => void;
  dockerCleanupBusy: boolean;
  dockerCleanupResult: string | null;
  notionStatus: "disconnected" | "connecting" | "connected" | "error";
  notionStatusDetail: string | null;
  notionError: string | null;
  notionBusy: boolean;
  connectNotion: () => void;
  engineDoctorVersion: string | null;
  onBack?: () => void;
};

export default function SettingsView(props: SettingsViewProps) {
  const tabs: SettingsTab[] = ["general", "workspace", "model", "runtimes", "advanced", "debug"];
  const tabLabels: Record<SettingsTab, string> = {
    general: "通用",
    workspace: "工作区",
    model: "模型",
    runtimes: "运行时",
    advanced: "高级",
    debug: "调试",
  };
  const activeTab = () => props.settingsTab;
  const connectedProviderCount = createMemo(() => props.providerConnectedIds.length);
  const [runtimeMap, setRuntimeMap] = createSignal<Record<string, RuntimeAssistantStatus>>({});
  const [runtimeRefreshError, setRuntimeRefreshError] = createSignal<string | null>(null);

  const runtimeStatus = (id: "opencode" | "claude-code" | "codex") => runtimeMap()[id];
  const runtimeInstallText = (status: RuntimeAssistantStatus | undefined) => {
    if (!status) return "检查中...";
    return status.installState === "installed" ? "已安装" : "未安装";
  };
  const runtimeLoginText = (status: RuntimeAssistantStatus | undefined) => {
    if (!status) return "检查中...";
    return status.loginState === "logged-in" ? "已登录" : "未登录";
  };

  const refreshRuntimes = async () => {
    try {
      const snapshot = await checkAssistantStatuses();
      const next: Record<string, RuntimeAssistantStatus> = {};
      for (const assistant of snapshot.assistants) {
        next[assistant.id] = assistant;
      }
      setRuntimeMap(next);
      setRuntimeRefreshError(null);
    } catch (error) {
      setRuntimeRefreshError(error instanceof Error ? error.message : "检查运行时状态失败");
    }
  };

  onMount(() => void refreshRuntimes());

  return (
    <div class="space-y-5">
      <div class="flex items-center gap-3">
        <Show when={props.onBack}>
          <button
            class="px-2 py-1 text-xs rounded-md border text-dls-secondary hover:text-dls-text hover:bg-dls-surface transition-colors"
            onClick={() => props.onBack?.()}
          >
            ← 返回
          </button>
        </Show>
        <div class="flex flex-wrap gap-2">
          <For each={tabs}>
            {(tab) => (
              <button
                class={`px-3 py-1.5 text-xs rounded-md border ${activeTab() === tab ? "bg-dls-active text-dls-text" : "text-dls-secondary"}`}
                onClick={() => props.setSettingsTab(tab)}
              >
                {tabLabels[tab]}
              </button>
            )}
          </For>
        </div>
      </div>

      <Switch>
        <Match when={activeTab() === "general"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">通用 (General)</div>
            <div class="text-xs text-dls-secondary">{t("status.connected", currentLocale())}: {props.headerStatus}</div>
            <div class="text-xs text-dls-secondary">已连接服务商: {connectedProviderCount()}</div>
            <Button onClick={() => props.openProviderAuthModal()} disabled={props.providerAuthBusy}>管理服务商</Button>
          </div>
        </Match>

        <Match when={activeTab() === "workspace"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">工作区 (Workspace)</div>
            <div class="text-xs text-dls-secondary">服务器: {props.openworkServerUrl || "未配置"}</div>
            <div class="flex gap-2">
              <Button onClick={() => props.reconnectOpenworkServer()} disabled={props.openworkReconnectBusy}>重新连接服务器</Button>
              <Button variant="secondary" onClick={() => props.reloadWorkspaceEngine()} disabled={!props.canReloadWorkspace || props.reloadBusy}>重新加载工作区引擎</Button>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "model"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">模型 (Model)</div>
            <div class="text-xs text-dls-secondary">默认模型: {props.defaultModelLabel}</div>
            <div class="text-xs text-dls-secondary">配置变体: {props.modelVariantLabel}</div>
            <div class="flex gap-2">
              <Button onClick={props.openDefaultModelPicker}>选择默认模型</Button>
              <Button variant="secondary" onClick={props.editModelVariant}>编辑配置</Button>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "runtimes"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">运行时 (Runtimes)</div>
              <Button variant="secondary" onClick={refreshRuntimes}>刷新状态</Button>
            </div>
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm">OpenCode</div>
                  <div class="text-xs text-dls-secondary">桌面端原生引擎和本地认证支持</div>
                </div>
                <Button variant="outline" onClick={props.openDefaultModelPicker}>选择模型</Button>
              </div>
              <div class="text-xs text-dls-secondary">安装状态: {runtimeInstallText(runtimeStatus("opencode"))}</div>
              <div class="text-xs text-dls-secondary">登录状态: {runtimeLoginText(runtimeStatus("opencode"))}</div>
              <div class="text-xs text-dls-secondary">版本: {runtimeStatus("opencode")?.version ?? "未知"}</div>
            </div>
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm">Claude Code</div>
                  <div class="text-xs text-dls-secondary">Claude 终端助手 (Terminal Companion)</div>
                </div>
                <div class="text-xs text-dls-secondary bg-dls-surface px-2 py-1 rounded">claude login</div>
              </div>
              <div class="text-xs text-dls-secondary">安装状态: {runtimeInstallText(runtimeStatus("claude-code"))}</div>
              <div class="text-xs text-dls-secondary">登录状态: {runtimeLoginText(runtimeStatus("claude-code"))}</div>
              <div class="text-xs text-dls-secondary">版本: {runtimeStatus("claude-code")?.version ?? "未知"}</div>
            </div>
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm">Codex</div>
                  <div class="text-xs text-dls-secondary">需要命令行 Codex 和 OpenAI API 认证</div>
                </div>
                <Button variant="outline" onClick={props.openProviderAuthModal}>配置 API Key</Button>
              </div>
              <div class="text-xs text-dls-secondary">安装状态: {runtimeInstallText(runtimeStatus("codex"))}</div>
              <div class="text-xs text-dls-secondary">登录状态: {runtimeLoginText(runtimeStatus("codex"))}</div>
              <div class="text-xs text-dls-secondary">版本: {runtimeStatus("codex")?.version ?? "未知"}</div>
            </div>
            <Show when={runtimeRefreshError()}>
              <div class="text-xs text-red-11">{runtimeRefreshError()}</div>
            </Show>
            <div class="text-xs text-dls-secondary">
              登录状态是通过分析本地环境变量和授权文件自动推断的。
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "advanced"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">高级设置 (Advanced)</div>
            <div class="flex gap-2">
              <Button variant="secondary" onClick={props.toggleDeveloperMode}>切换开发者模式</Button>
              <Button variant="outline" onClick={() => props.openResetModal("onboarding")} disabled={props.resetModalBusy}>重置新手引导</Button>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "debug"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">调试信息 (Debug)</div>
            <div class="text-xs text-dls-secondary">引擎运行时: {props.engineRuntime}</div>
            <div class="text-xs text-dls-secondary">引擎源: {props.engineSource}</div>
          </div>
        </Match>
      </Switch>
    </div>
  );
}


