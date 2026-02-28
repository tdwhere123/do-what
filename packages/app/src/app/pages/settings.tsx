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
  OpenworkServerInfo,
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
  openworkServerHostInfo: OpenworkServerInfo | null;
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
  engineRuntime: "direct" | "openwork-orchestrator";
  setEngineRuntime: (value: "direct" | "openwork-orchestrator") => void;
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
};

export default function SettingsView(props: SettingsViewProps) {
  const tabs: SettingsTab[] = ["general", "workspace", "model", "runtimes", "advanced", "debug"];
  const activeTab = () => props.settingsTab;
  const connectedProviderCount = createMemo(() => props.providerConnectedIds.length);
  const [runtimeMap, setRuntimeMap] = createSignal<Record<string, RuntimeAssistantStatus>>({});
  const [runtimeRefreshError, setRuntimeRefreshError] = createSignal<string | null>(null);

  const runtimeStatus = (id: "opencode" | "claude-code" | "codex") => runtimeMap()[id];
  const runtimeInstallText = (status: RuntimeAssistantStatus | undefined) => {
    if (!status) return "Checking...";
    return status.installState === "installed" ? "Installed" : "Not Installed";
  };
  const runtimeLoginText = (status: RuntimeAssistantStatus | undefined) => {
    if (!status) return "Checking...";
    return status.loginState === "logged-in" ? "Logged In" : "Logged Out";
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
      setRuntimeRefreshError(error instanceof Error ? error.message : "Failed to check runtime statuses");
    }
  };

  onMount(() => void refreshRuntimes());

  return (
    <div class="space-y-5">
      <div class="flex flex-wrap gap-2">
        <For each={tabs}>
          {(tab) => (
            <button
              class={`px-3 py-1.5 text-xs rounded-md border ${activeTab() === tab ? "bg-dls-active text-dls-text" : "text-dls-secondary"}`}
              onClick={() => props.setSettingsTab(tab)}
            >
              {tab}
            </button>
          )}
        </For>
      </div>

      <Switch>
        <Match when={activeTab() === "general"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">General</div>
            <div class="text-xs text-dls-secondary">{t("status.connected", currentLocale())}: {props.headerStatus}</div>
            <div class="text-xs text-dls-secondary">Providers connected: {connectedProviderCount()}</div>
            <Button onClick={() => props.openProviderAuthModal()} disabled={props.providerAuthBusy}>Manage providers</Button>
          </div>
        </Match>

        <Match when={activeTab() === "workspace"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">Workspace</div>
            <div class="text-xs text-dls-secondary">Server: {props.openworkServerUrl || "Not configured"}</div>
            <div class="flex gap-2">
              <Button onClick={() => props.reconnectOpenworkServer()} disabled={props.openworkReconnectBusy}>Reconnect server</Button>
              <Button variant="secondary" onClick={() => props.reloadWorkspaceEngine()} disabled={!props.canReloadWorkspace || props.reloadBusy}>Reload workspace engine</Button>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "model"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">Model</div>
            <div class="text-xs text-dls-secondary">Default: {props.defaultModelLabel}</div>
            <div class="text-xs text-dls-secondary">Variant: {props.modelVariantLabel}</div>
            <div class="flex gap-2">
              <Button onClick={props.openDefaultModelPicker}>Choose default model</Button>
              <Button variant="secondary" onClick={props.editModelVariant}>Edit variant</Button>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "runtimes"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">Runtimes</div>
              <Button variant="secondary" onClick={refreshRuntimes}>Refresh</Button>
            </div>
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <div>
                <div class="text-sm">OpenCode</div>
                <div class="text-xs text-dls-secondary">Desktop engine runtime availability and local auth signal</div>
              </div>
              <div class="text-xs text-dls-secondary">Install: {runtimeInstallText(runtimeStatus("opencode"))}</div>
              <div class="text-xs text-dls-secondary">Login: {runtimeLoginText(runtimeStatus("opencode"))}</div>
              <div class="text-xs text-dls-secondary">Version: {runtimeStatus("opencode")?.version ?? "N/A"}</div>
            </div>
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <div>
                <div class="text-sm">Claude Code</div>
                <div class="text-xs text-dls-secondary">Requires `claude login` on this machine</div>
              </div>
              <div class="text-xs text-dls-secondary">Install: {runtimeInstallText(runtimeStatus("claude-code"))}</div>
              <div class="text-xs text-dls-secondary">Login: {runtimeLoginText(runtimeStatus("claude-code"))}</div>
              <div class="text-xs text-dls-secondary">Version: {runtimeStatus("claude-code")?.version ?? "N/A"}</div>
            </div>
            <div class="rounded-lg border border-dls-border p-3 space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm">Codex</div>
                  <div class="text-xs text-dls-secondary">Requires Codex CLI and OpenAI auth</div>
                </div>
                <Button variant="outline" onClick={() => props.setSettingsTab("advanced")}>Configure API Key</Button>
              </div>
              <div class="text-xs text-dls-secondary">Install: {runtimeInstallText(runtimeStatus("codex"))}</div>
              <div class="text-xs text-dls-secondary">Login: {runtimeLoginText(runtimeStatus("codex"))}</div>
              <div class="text-xs text-dls-secondary">Version: {runtimeStatus("codex")?.version ?? "N/A"}</div>
            </div>
            <Show when={runtimeRefreshError()}>
              <div class="text-xs text-red-11">{runtimeRefreshError()}</div>
            </Show>
            <div class="text-xs text-dls-secondary">
              Login state is inferred from local env vars or credential files.
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "advanced"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">Advanced</div>
            <div class="flex gap-2">
              <Button variant="secondary" onClick={props.toggleDeveloperMode}>Toggle developer mode</Button>
              <Button variant="outline" onClick={() => props.openResetModal("onboarding")} disabled={props.resetModalBusy}>Reset onboarding</Button>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "debug"}>
          <div class="space-y-3 rounded-xl border border-dls-border p-4">
            <div class="text-sm font-medium">Debug</div>
            <div class="text-xs text-dls-secondary">Engine runtime: {props.engineRuntime}</div>
            <div class="text-xs text-dls-secondary">Engine source: {props.engineSource}</div>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
