import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type {
  DashboardTab,
  McpServerEntry,
  McpStatusMap,
  OpencodeConnectStatus,
  PluginScope,
  ProviderListItem,
  SettingsTab,
  ScheduledJob,
  HubSkillCard,
  SkillCard,
  StartupPreference,
  WorkspaceSessionGroup,
  View,
} from "../types";
import type { McpDirectoryInfo } from "../constants";
import {
  formatRelativeTime,
  getWorkspaceTaskLoadErrorDisplay,
  isTauriRuntime,
  normalizeDirectoryPath,
} from "../utils";
import { buildOpenworkWorkspaceBaseUrl, createOpenworkServerClient } from "../lib/openwork-server";
import type {
  OpenworkAuditEntry,
  OpenworkSoulHeartbeatEntry,
  OpenworkSoulStatus,
  OpenworkServerClient,
  OpenworkServerCapabilities,
  OpenworkServerDiagnostics,
  OpenworkServerSettings,
  OpenworkServerStatus,
} from "../lib/openwork-server";
import type { EngineInfo, OrchestratorStatus, OpenworkServerInfo, WorkspaceInfo } from "../lib/tauri";

import Button from "../components/button";
import ExtensionsView from "./extensions";
import ScheduledTasksView from "./scheduled";
import SoulView from "./soul";
import SettingsView from "./settings";
import SkillsView from "./skills";
import StatusBar from "../components/status-bar";
import ProviderAuthModal, { type ProviderOAuthStartResult } from "../components/provider-auth-modal";
import ShareWorkspaceModal from "../components/share-workspace-modal";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  History,
  HeartPulse,
  Loader2,
  MoreHorizontal,
  Plus,
  Settings,
  Zap,
} from "lucide-solid";

export type DashboardViewProps = {
  tab: DashboardTab;
  setTab: (tab: DashboardTab) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  providers: ProviderListItem[];
  providerConnectedIds: string[];
  providerAuthBusy: boolean;
  providerAuthModalOpen: boolean;
  providerAuthError: string | null;
  providerAuthMethods: Record<string, { type: "oauth" | "api"; label: string }[]>;
  openProviderAuthModal: () => Promise<void>;
  closeProviderAuthModal: () => void;
  startProviderAuth: (providerId?: string) => Promise<ProviderOAuthStartResult>;
  completeProviderAuthOAuth: (providerId: string, methodIndex: number, code?: string) => Promise<string | void>;
  submitProviderApiKey: (providerId: string, apiKey: string) => Promise<string | void>;
  view: View;
  setView: (view: View, sessionId?: string) => void;
  startupPreference: StartupPreference | null;
  baseUrl: string;
  clientConnected: boolean;
  busy: boolean;
  busyHint: string | null;
  busyLabel: string | null;
  newTaskDisabled: boolean;
  headerStatus: string;
  error: string | null;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkServerClient: OpenworkServerClient | null;
  openworkReconnectBusy: boolean;
  reconnectOpenworkServer: () => Promise<boolean>;
  openworkServerSettings: OpenworkServerSettings;
  openworkServerHostInfo: OpenworkServerInfo | null;
  openworkServerCapabilities: OpenworkServerCapabilities | null;
  openworkServerDiagnostics: OpenworkServerDiagnostics | null;
  openworkServerWorkspaceId: string | null;
  openworkAuditEntries: OpenworkAuditEntry[];
  openworkAuditStatus: "idle" | "loading" | "error";
  openworkAuditError: string | null;
  opencodeConnectStatus: OpencodeConnectStatus | null;
  engineInfo: EngineInfo | null;
  engineDoctorVersion: string | null;
  orchestratorStatus: OrchestratorStatus | null;
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
  activeWorkspaceDisplay: WorkspaceInfo;
  workspaces: WorkspaceInfo[];
  activeWorkspaceId: string;
  connectingWorkspaceId: string | null;
  activateWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  testWorkspaceConnection: (workspaceId: string) => Promise<boolean> | boolean;
  openCreateWorkspace: () => void;
  openCreateRemoteWorkspace: () => void;
  importWorkspaceConfig: () => void;
  importingWorkspaceConfig: boolean;
  exportWorkspaceConfig: (workspaceId?: string) => void;
  exportWorkspaceBusy: boolean;
  workspaceSessionGroups: WorkspaceSessionGroup[];
  selectedSessionId: string | null;
  openRenameWorkspace: (workspaceId: string) => void;
  editWorkspaceConnection: (workspaceId: string) => void;
  forgetWorkspace: (workspaceId: string) => void;
  stopSandbox: (workspaceId: string) => void;
  scheduledJobs: ScheduledJob[];
  scheduledJobsSource: "local" | "remote";
  scheduledJobsSourceReady: boolean;
  schedulerPluginInstalled: boolean;
  scheduledJobsStatus: string | null;
  scheduledJobsBusy: boolean;
  scheduledJobsUpdatedAt: number | null;
  refreshScheduledJobs: (options?: { force?: boolean }) => void;
  deleteScheduledJob: (name: string) => Promise<void> | void;
  soulStatusByWorkspaceId: Record<string, OpenworkSoulStatus | null>;
  activeSoulStatus: OpenworkSoulStatus | null;
  activeSoulHeartbeats: OpenworkSoulHeartbeatEntry[];
  soulStatusBusy: boolean;
  soulHeartbeatsBusy: boolean;
  soulError: string | null;
  refreshSoulData: (options?: { force?: boolean }) => void;
  runSoulPrompt: (prompt: string) => void;
  activeWorkspaceRoot: string;
  refreshSkills: (options?: { force?: boolean }) => void;
  refreshHubSkills: (options?: { force?: boolean }) => void;
  refreshPlugins: (scopeOverride?: PluginScope) => void;
  refreshMcpServers: () => void;
  skills: SkillCard[];
  skillsStatus: string | null;
  hubSkills: HubSkillCard[];
  hubSkillsStatus: string | null;
  skillsAccessHint?: string | null;
  canInstallSkillCreator: boolean;
  canUseDesktopTools: boolean;
  importLocalSkill: () => void;
  installSkillCreator: () => Promise<{ ok: boolean; message: string }>;
  installHubSkill: (name: string) => Promise<{ ok: boolean; message: string }>;
  revealSkillsFolder: () => void;
  uninstallSkill: (name: string) => void;
  readSkill: (name: string) => Promise<{ name: string; path: string; content: string } | null>;
  saveSkill: (input: { name: string; content: string; description?: string }) => void;
  pluginsAccessHint?: string | null;
  canEditPlugins: boolean;
  canUseGlobalPluginScope: boolean;
  pluginScope: PluginScope;
  setPluginScope: (scope: PluginScope) => void;
  pluginConfigPath: string | null;
  pluginList: string[];
  pluginInput: string;
  setPluginInput: (value: string) => void;
  pluginStatus: string | null;
  activePluginGuide: string | null;
  setActivePluginGuide: (value: string | null) => void;
  isPluginInstalled: (name: string, aliases?: string[]) => boolean;
  suggestedPlugins: Array<{
    name: string;
    packageName: string;
    description: string;
    tags: string[];
    aliases?: string[];
    installMode?: "simple" | "guided";
    steps?: Array<{
      title: string;
      description: string;
      command?: string;
      url?: string;
      path?: string;
      note?: string;
    }>;
  }>;
  addPlugin: (pluginNameOverride?: string) => void;
  mcpServers: McpServerEntry[];
  mcpStatus: string | null;
  mcpLastUpdatedAt: number | null;
  mcpStatuses: McpStatusMap;
  mcpConnectingName: string | null;
  selectedMcp: string | null;
  setSelectedMcp: (value: string | null) => void;
  quickConnect: McpDirectoryInfo[];
  connectMcp: (entry: McpDirectoryInfo) => void;
  logoutMcpAuth: (name: string) => Promise<void> | void;
  removeMcp: (name: string) => void;
  showMcpReloadBanner: boolean;
  mcpReloadBlocked: boolean;
  reloadMcpEngine: () => void;
  createSessionAndOpen: () => void;
  setPrompt: (value: string) => void;
  selectSession: (sessionId: string) => Promise<void> | void;
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
  engineSource: "path" | "sidecar" | "custom";
  setEngineSource: (value: "path" | "sidecar" | "custom") => void;
  engineCustomBinPath: string;
  setEngineCustomBinPath: (value: string) => void;
  engineRuntime: "direct" | "openwork-orchestrator";
  setEngineRuntime: (value: "direct" | "openwork-orchestrator") => void;
  isWindows: boolean;
  toggleDeveloperMode: () => void;
  developerMode: boolean;
  stopHost: () => void;
  openResetModal: (mode: "onboarding" | "all") => void;
  resetModalBusy: boolean;
  onResetStartupPreference: () => void;
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
};

export default function DashboardView(props: DashboardViewProps) {
  const title = createMemo(() => {
    switch (props.tab) {
      case "scheduled":
        return "Automations";
      case "soul":
        return "Soul";
      case "skills":
        return "Skills";
      case "extensions":
        return "Extensions";
      case "settings":
        return "Settings";
      default:
        return "Automations";
    }
  });

  const workspaceLabel = (workspace: WorkspaceInfo) =>
    workspace.displayName?.trim() ||
    workspace.openworkWorkspaceName?.trim() ||
    workspace.name?.trim() ||
    workspace.path?.trim() ||
    "Worker";
  const workspaceKindLabel = (workspace: WorkspaceInfo) =>
    workspace.workspaceType === "remote"
      ? workspace.sandboxBackend === "docker" ||
        Boolean(workspace.sandboxRunId?.trim()) ||
        Boolean(workspace.sandboxContainerName?.trim())
        ? "Sandbox"
        : "Remote"
      : "Local";

  const openSessionFromList = (workspaceId: string, sessionId: string) => {
    // Route-driven selection: navigate first and let the route effect own selectSession.
    if (workspaceId === props.activeWorkspaceId) {
      props.setView("session", sessionId);
      return;
    }
    // For different workspace, activate workspace first
    void (async () => {
      await Promise.resolve(props.activateWorkspace(workspaceId));
      props.setView("session", sessionId);
    })();
  };

  const createTaskInWorkspace = (workspaceId: string) => {
    const id = workspaceId.trim();
    if (!id) return;
    expandWorkspace(id);
    if (id === props.activeWorkspaceId) {
      props.createSessionAndOpen();
      return;
    }
    void (async () => {
      await Promise.resolve(props.activateWorkspace(id));
      props.createSessionAndOpen();
    })();
  };

  // Track last refreshed tab to avoid duplicate calls
  const [lastRefreshedTab, setLastRefreshedTab] = createSignal<string | null>(null);
  const [refreshInProgress, setRefreshInProgress] = createSignal(false);
  const [providerAuthActionBusy, setProviderAuthActionBusy] = createSignal(false);
  const MAX_SESSIONS_PREVIEW = 6;
  const COLLAPSED_SESSIONS_PREVIEW = 1;
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = createSignal<Set<string>>(
    new Set()
  );
  const isWorkspaceExpanded = (workspaceId: string) =>
    expandedWorkspaceIds().has(workspaceId);
  const expandWorkspace = (workspaceId: string) => {
    const id = workspaceId.trim();
    if (!id) return;
    setExpandedWorkspaceIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const toggleWorkspaceExpanded = (workspaceId: string) => {
    const id = workspaceId.trim();
    if (!id) return;
    setExpandedWorkspaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  createEffect(() => {
    expandWorkspace(props.activeWorkspaceId);
  });
  const [previewCountByWorkspaceId, setPreviewCountByWorkspaceId] = createSignal<
    Record<string, number>
  >({});
  const previewCount = (workspaceId: string) => {
    const base = previewCountByWorkspaceId()[workspaceId] ?? MAX_SESSIONS_PREVIEW;
    return isWorkspaceExpanded(workspaceId)
      ? base
      : Math.min(COLLAPSED_SESSIONS_PREVIEW, base);
  };
  const previewSessions = (workspaceId: string, sessions: WorkspaceSessionGroup["sessions"]) =>
    sessions.slice(0, previewCount(workspaceId));
  const showMoreSessions = (workspaceId: string, total: number) => {
    expandWorkspace(workspaceId);
    setPreviewCountByWorkspaceId((current) => {
      const next = { ...current };
      const existing = next[workspaceId] ?? MAX_SESSIONS_PREVIEW;
      next[workspaceId] = Math.min(existing + MAX_SESSIONS_PREVIEW, total);
      return next;
    });
  };
  const showMoreLabel = (workspaceId: string, total: number) => {
    const remaining = Math.max(0, total - previewCount(workspaceId));
    const nextCount = Math.min(MAX_SESSIONS_PREVIEW, remaining);
    return nextCount > 0 ? `Show ${nextCount} more` : "Show more";
  };
  const [workspaceMenuId, setWorkspaceMenuId] = createSignal<string | null>(null);
  let workspaceMenuRef: HTMLDivElement | undefined;
  const [shareWorkspaceId, setShareWorkspaceId] = createSignal<string | null>(null);
  const [addWorkspaceMenuOpen, setAddWorkspaceMenuOpen] = createSignal(false);
  let addWorkspaceMenuRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!workspaceMenuId()) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (workspaceMenuRef && target && workspaceMenuRef.contains(target)) return;
      setWorkspaceMenuId(null);
    };
    window.addEventListener("click", closeMenu);
    onCleanup(() => window.removeEventListener("click", closeMenu));
  });

  createEffect(() => {
    if (!addWorkspaceMenuOpen()) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (addWorkspaceMenuRef && target && addWorkspaceMenuRef.contains(target)) return;
      setAddWorkspaceMenuOpen(false);
    };
    window.addEventListener("click", closeMenu);
    onCleanup(() => window.removeEventListener("click", closeMenu));
  });

  const handleProviderAuthSelect = async (providerId: string): Promise<ProviderOAuthStartResult> => {
    if (providerAuthActionBusy()) {
      throw new Error("Provider auth is already in progress.");
    }
    setProviderAuthActionBusy(true);
    try {
      return await props.startProviderAuth(providerId);
    } finally {
      setProviderAuthActionBusy(false);
    }
  };

  const handleProviderAuthOAuth = async (providerId: string, methodIndex: number, code?: string) => {
    if (providerAuthActionBusy()) return;
    setProviderAuthActionBusy(true);
    try {
      await props.completeProviderAuthOAuth(providerId, methodIndex, code);
      props.closeProviderAuthModal();
    } catch {
      // Errors are surfaced in the modal.
    } finally {
      setProviderAuthActionBusy(false);
    }
  };

  const handleProviderAuthApiKey = async (providerId: string, apiKey: string) => {
    if (providerAuthActionBusy()) return;
    setProviderAuthActionBusy(true);
    try {
      await props.submitProviderApiKey(providerId, apiKey);
      props.closeProviderAuthModal();
    } catch {
      // Errors are surfaced in the modal.
    } finally {
      setProviderAuthActionBusy(false);
    }
  };

  onCleanup(() => {
    // no-op
  });

  createEffect(() => {
    const currentTab = props.tab;

    // Skip if we already refreshed this tab or a refresh is in progress
    if (lastRefreshedTab() === currentTab || refreshInProgress()) {
      return;
    }

    // Track that we're refreshing this tab
    setRefreshInProgress(true);
    setLastRefreshedTab(currentTab);

    // Use a cancelled flag to prevent stale updates after navigation
    let cancelled = false;

    const doRefresh = async () => {
      try {
        if (currentTab === "skills" && !cancelled) {
          await props.refreshSkills();
        }
        if (currentTab === "extensions" && !cancelled) {
          await Promise.all([props.refreshPlugins(), props.refreshMcpServers()]);
        }
        if (currentTab === "scheduled" && !cancelled) {
          await props.refreshScheduledJobs();
        }
        if (currentTab === "soul" && !cancelled) {
          await props.refreshSoulData();
        }
      } catch {
        // Ignore errors during navigation
      } finally {
        if (!cancelled) {
          setRefreshInProgress(false);
        }
      }
    };

    doRefresh();

    onCleanup(() => {
      cancelled = true;
      setRefreshInProgress(false);
    });
  });

  const soulModeEnabled = createMemo(() => {
    const status = props.soulStatusByWorkspaceId[props.activeWorkspaceId];
    return Boolean(status?.enabled ?? props.activeSoulStatus?.enabled);
  });

  const soulNavIconClass = () => (soulModeEnabled() ? "soul-nav-icon-active" : "");

  const navItem = (t: DashboardTab, label: any, icon: any) => {
    const active = () => props.tab === t;
    return (
      <button
        class={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-sm font-medium transition-colors ${
          active()
            ? "bg-dls-active text-dls-text"
            : "text-dls-secondary hover:text-dls-text hover:bg-dls-hover"
        }`}
        onClick={() => props.setTab(t)}
      >
        {icon}
        {label}
      </button>
    );
  };

  const openSettings = (tab: SettingsTab = "general") => {
    props.setSettingsTab(tab);
    props.setTab("settings");
  };

  const openWorkspaceSettings = () => {
    props.setSettingsTab("workspace");
    props.setTab("settings");
  };

  const openSoulForWorkspace = (workspaceId?: string) => {
    const id = (workspaceId ?? props.activeWorkspaceId).trim();
    if (!id) return;
    void (async () => {
      if (id !== props.activeWorkspaceId) {
        await Promise.resolve(props.activateWorkspace(id));
      }
      props.setTab("soul");
    })();
  };


  const shareWorkspace = createMemo(() => {
    const id = shareWorkspaceId();
    if (!id) return null;
    return props.workspaces.find((ws) => ws.id === id) ?? null;
  });

  const shareWorkspaceName = createMemo(() => {
    const ws = shareWorkspace();
    return ws ? workspaceLabel(ws) : "";
  });

  const shareWorkspaceDetail = createMemo(() => {
    const ws = shareWorkspace();
    if (!ws) return "";
    if (ws.workspaceType === "remote") {
      if (ws.remoteType === "openwork") {
        const hostUrl = ws.openworkHostUrl?.trim() || ws.baseUrl?.trim() || "";
        const mounted = buildOpenworkWorkspaceBaseUrl(hostUrl, ws.openworkWorkspaceId);
        return mounted || hostUrl;
      }
      return ws.baseUrl?.trim() || "";
    }
    return ws.path?.trim() || "";
  });

  const [shareLocalOpenworkWorkspaceId, setShareLocalOpenworkWorkspaceId] = createSignal<string | null>(null);

  createEffect(() => {
    const ws = shareWorkspace();
    const baseUrl = props.openworkServerHostInfo?.baseUrl?.trim() ?? "";
    const token = props.openworkServerHostInfo?.clientToken?.trim() ?? "";
    const workspacePath = ws?.workspaceType === "local" ? ws.path?.trim() ?? "" : "";

    if (!ws || ws.workspaceType !== "local" || !workspacePath || !baseUrl || !token) {
      setShareLocalOpenworkWorkspaceId(null);
      return;
    }

    let cancelled = false;
    setShareLocalOpenworkWorkspaceId(null);

    void (async () => {
      try {
        const client = createOpenworkServerClient({ baseUrl, token });
        const response = await client.listWorkspaces();
        if (cancelled) return;
        const items = Array.isArray(response.items) ? response.items : [];
        const targetPath = normalizeDirectoryPath(workspacePath);
        const match = items.find((entry) => normalizeDirectoryPath(entry.path) === targetPath);
        setShareLocalOpenworkWorkspaceId(match?.id ?? null);
      } catch {
        if (!cancelled) setShareLocalOpenworkWorkspaceId(null);
      }
    })();

    onCleanup(() => {
      cancelled = true;
    });
  });

  const shareFields = createMemo(() => {
    const ws = shareWorkspace();
    if (!ws) {
      return [] as Array<{
        label: string;
        value: string;
        secret?: boolean;
        placeholder?: string;
        hint?: string;
      }>;
    }

    if (ws.workspaceType !== "remote") {
      const hostUrl =
        props.openworkServerHostInfo?.connectUrl?.trim() ||
        props.openworkServerHostInfo?.lanUrl?.trim() ||
        props.openworkServerHostInfo?.mdnsUrl?.trim() ||
        props.openworkServerHostInfo?.baseUrl?.trim() ||
        "";
      const mountedUrl = shareLocalOpenworkWorkspaceId()
        ? buildOpenworkWorkspaceBaseUrl(hostUrl, shareLocalOpenworkWorkspaceId())
        : null;
      const url = mountedUrl || hostUrl;
      const token = props.openworkServerHostInfo?.clientToken?.trim() || "";
      return [
        {
          label: "OpenWork worker URL",
          value: url,
          placeholder: !isTauriRuntime() ? "Desktop app required" : "Starting server...",
          hint: mountedUrl
            ? "Use on phones or laptops connecting to this worker."
            : hostUrl
              ? "Worker URL is resolving; host URL shown as fallback."
              : undefined,
        },
        {
          label: "Access token",
          value: token,
          secret: true,
          placeholder: isTauriRuntime() ? "-" : "Desktop app required",
          hint: mountedUrl
            ? "Use on phones or laptops connecting to this worker."
            : "Use on phones or laptops connecting to this host.",
        },
      ];
    }

    if (ws.remoteType === "openwork") {
      const hostUrl = ws.openworkHostUrl?.trim() || ws.baseUrl?.trim() || "";
      const url = buildOpenworkWorkspaceBaseUrl(hostUrl, ws.openworkWorkspaceId) || hostUrl;
      const token =
        ws.openworkToken?.trim() ||
        props.openworkServerSettings.token?.trim() ||
        "";
      return [
        {
          label: "OpenWork worker URL",
          value: url,
        },
        {
          label: "Access token",
          value: token,
          secret: true,
          placeholder: token ? undefined : "Set token in Advanced",
          hint: "This token grants access to the worker on that host.",
        },
      ];
    }

    const baseUrl = ws.baseUrl?.trim() || ws.path?.trim() || "";
    const directory = ws.directory?.trim() || "";
    return [
      {
        label: "OpenCode base URL",
        value: baseUrl,
      },
      {
        label: "Directory",
        value: directory,
        placeholder: "(auto)",
      },
    ];
  });

  const shareNote = createMemo(() => {
    const ws = shareWorkspace();
    if (!ws) return null;
    if (ws.workspaceType === "local" && props.engineInfo?.runtime === "direct") {
      return "Engine runtime is set to Direct. Switching local workers can restart the host and disconnect clients. The token may change after a restart.";
    }
    return null;
  });

  const exportDisabledReason = createMemo(() => {
    const ws = shareWorkspace();
    if (!ws) return "Export is available for local workers in the desktop app.";
    if (ws.workspaceType === "remote") return "Export is only supported for local workers.";
    if (!isTauriRuntime()) return "Export is available in the desktop app.";
    if (props.exportWorkspaceBusy) return "Export is already running.";
    return null;
  });


  return (
    <div class="flex h-screen w-full bg-dls-surface text-dls-text font-sans overflow-hidden">
      <aside class="w-64 hidden md:flex flex-col bg-dls-sidebar border-r border-dls-border p-4">
        <div class="flex-1 overflow-y-auto">
          <div class="space-y-3 mb-3">
            <For each={props.workspaceSessionGroups}>
              {(group) => {
                const workspace = () => group.workspace;
                const isConnecting = () => props.connectingWorkspaceId === workspace().id;
                const isMenuOpen = () => workspaceMenuId() === workspace().id;
                const taskLoadError = () => getWorkspaceTaskLoadErrorDisplay(workspace(), group.error);
                const soulStatus = () => props.soulStatusByWorkspaceId[workspace().id] ?? null;
                const soulEnabled = () => Boolean(soulStatus()?.enabled);

                return (
                  <div class="space-y-1">
                    <div class="relative group">
                      <div
                        role="button"
                        tabIndex={0}
                        class="w-full flex items-center justify-between h-10 px-3 rounded-lg text-left transition-colors text-dls-text hover:bg-dls-hover"
                        onClick={() => {
                          expandWorkspace(workspace().id);
                          props.activateWorkspace(workspace().id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          if (event.isComposing || event.keyCode === 229) return;
                          event.preventDefault();
                          expandWorkspace(workspace().id);
                          props.activateWorkspace(workspace().id);
                        }}
                      >
                        <button
                          type="button"
                          class="mr-2 -ml-1 p-1 rounded-md text-dls-secondary hover:text-dls-text hover:bg-dls-active"
                          aria-label={isWorkspaceExpanded(workspace().id) ? "Collapse" : "Expand"}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleWorkspaceExpanded(workspace().id);
                          }}
                        >
                          <Show
                            when={isWorkspaceExpanded(workspace().id)}
                            fallback={<ChevronRight size={14} />}
                          >
                            <ChevronDown size={14} />
                          </Show>
                        </button>
                        <div class="min-w-0 flex-1">
                          <div class="text-sm font-medium truncate">{workspaceLabel(workspace())}</div>
                          <div class="text-[11px] text-dls-secondary flex items-center gap-1.5">
                            <span>{workspaceKindLabel(workspace())}</span>
                            <Show when={soulEnabled()}>
                              <span class="inline-flex items-center gap-1 rounded-full border border-rose-7/40 bg-rose-3/40 px-1.5 py-0.5 text-[10px] text-rose-11">
                                <HeartPulse size={10} />
                                Soul
                              </span>
                            </Show>
                          </div>
                        </div>
                        <Show when={group.status === "loading"}>
                          <Loader2 size={14} class="animate-spin text-dls-secondary mr-1" />
                        </Show>
                        <Show when={group.status === "error"}>
                          <span
                            class={`text-[10px] px-2 py-0.5 rounded-full border ${
                              taskLoadError().tone === "offline"
                                ? "border-amber-7/50 text-amber-11 bg-amber-3/30"
                                : "border-red-7/50 text-red-11 bg-red-3/30"
                            }`}
                            title={taskLoadError().title}
                          >
                            {taskLoadError().label}
                          </span>
                        </Show>
                        {/* Session count intentionally hidden (not a useful signal and it can crowd the header actions). */}
                        <Show when={isConnecting()}>
                          <Loader2 size={14} class="animate-spin text-dls-secondary" />
                        </Show>
                      </div>
                      <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          class="p-1 rounded-md text-dls-secondary hover:text-dls-text hover:bg-dls-active"
                          onClick={(event) => {
                            event.stopPropagation();
                            createTaskInWorkspace(workspace().id);
                          }}
                          disabled={props.newTaskDisabled}
                          aria-label="New task"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          class="p-1 rounded-md text-dls-secondary hover:text-dls-text hover:bg-dls-active"
                          onClick={(event) => {
                            event.stopPropagation();
                            setWorkspaceMenuId((current) =>
                              current === workspace().id ? null : workspace().id
                            );
                          }}
                          aria-label="Worker options"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                      <Show when={isMenuOpen()}>
                        <div
                          ref={(el) => (workspaceMenuRef = el)}
                          class="absolute right-2 top-[calc(100%+4px)] z-20 w-44 rounded-lg border border-dls-border bg-dls-surface shadow-lg p-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover"
                            onClick={() => {
                              props.openRenameWorkspace(workspace().id);
                              setWorkspaceMenuId(null);
                            }}
                          >
                            Edit name
                          </button>
                          <button
                            type="button"
                            class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover"
                            onClick={() => {
                              setShareWorkspaceId(workspace().id);
                              setWorkspaceMenuId(null);
                            }}
                          >
                            Share...
                          </button>
                          <button
                            type="button"
                            class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover"
                            onClick={() => {
                              openSoulForWorkspace(workspace().id);
                              setWorkspaceMenuId(null);
                            }}
                          >
                            {soulEnabled() ? "Soul settings" : "Enable soul"}
                          </button>
                          <Show when={workspace().workspaceType === "remote"}>
                            <button
                              type="button"
                              class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover"
                              onClick={() => {
                                void props.testWorkspaceConnection(workspace().id);
                                setWorkspaceMenuId(null);
                              }}
                              disabled={isConnecting()}
                            >
                              Test connection
                            </button>
                            <button
                              type="button"
                              class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover"
                              onClick={() => {
                                props.editWorkspaceConnection(workspace().id);
                                setWorkspaceMenuId(null);
                              }}
                              disabled={isConnecting()}
                            >
                              Edit connection
                            </button>
                          </Show>
                          <Show when={workspace().sandboxContainerName?.trim()}>
                            <button
                              type="button"
                              class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover"
                              onClick={() => {
                                props.stopSandbox(workspace().id);
                                setWorkspaceMenuId(null);
                              }}
                            >
                              Stop sandbox
                            </button>
                          </Show>
                          <button
                            type="button"
                            class="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-dls-hover text-red-11"
                            onClick={() => {
                              props.forgetWorkspace(workspace().id);
                              setWorkspaceMenuId(null);
                            }}
                          >
                            Remove worker
                          </button>
                        </div>
                      </Show>
                    </div>

                    <div class="mt-0.5 space-y-0.5 border-l border-dls-border ml-2">
                      <Show
                        when={isWorkspaceExpanded(workspace().id)}
                        fallback={
                          <Show when={group.sessions.length > 0}>
                            <For each={previewSessions(workspace().id, group.sessions)}>
                              {(session) => {
                                const isSelected = () => props.selectedSessionId === session.id;
                                return (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    class={`group flex items-center justify-between h-8 px-3 rounded-lg cursor-pointer relative overflow-hidden ml-2 w-[calc(100%-0.5rem)] ${
                                      isSelected()
                                        ? "bg-dls-active text-dls-text"
                                        : "hover:bg-dls-hover"
                                    }`}
                                    onClick={() => openSessionFromList(workspace().id, session.id)}
                                    onKeyDown={(event) => {
                                      if (event.key !== "Enter" && event.key !== " ") return;
                                      if (event.isComposing || event.keyCode === 229) return;
                                      event.preventDefault();
                                      openSessionFromList(workspace().id, session.id);
                                    }}
                                  >
                                    <span class="text-sm text-dls-text truncate mr-2 font-medium">
                                      {session.title}
                                    </span>
                                    <span class="text-xs text-dls-secondary whitespace-nowrap">
                                      {formatRelativeTime(session.time?.updated ?? Date.now())}
                                    </span>
                                  </div>
                                );
                              }}
                            </For>
                          </Show>
                        }
                      >
                        <Show
                          when={group.status === "loading" && group.sessions.length === 0}
                          fallback={
                            <Show
                              when={group.sessions.length > 0}
                              fallback={
                                <Show when={group.status === "error"}>
                                  <div
                                    class={`w-full px-3 py-2 text-xs ml-2 text-left rounded-lg border ${
                                      taskLoadError().tone === "offline"
                                        ? "text-amber-11 bg-amber-3/20 border-amber-7/40"
                                        : "text-red-11 bg-red-3/20 border-red-7/40"
                                    }`}
                                    title={taskLoadError().title}
                                  >
                                    {taskLoadError().message}
                                  </div>
                                </Show>
                              }
                            >
                              <For each={previewSessions(workspace().id, group.sessions)}>
                                {(session) => {
                                  const isSelected = () => props.selectedSessionId === session.id;
                                  return (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      class={`group flex items-center justify-between h-8 px-3 rounded-lg cursor-pointer relative overflow-hidden ml-2 w-[calc(100%-0.5rem)] ${
                                        isSelected()
                                          ? "bg-dls-active text-dls-text"
                                          : "hover:bg-dls-hover"
                                      }`}
                                      onClick={() => openSessionFromList(workspace().id, session.id)}
                                      onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        if (event.isComposing || event.keyCode === 229) return;
                                        event.preventDefault();
                                        openSessionFromList(workspace().id, session.id);
                                      }}
                                    >
                                      <span class="text-sm text-dls-text truncate mr-2 font-medium">
                                        {session.title}
                                      </span>
                                      <span class="text-xs text-dls-secondary whitespace-nowrap">
                                        {formatRelativeTime(session.time?.updated ?? Date.now())}
                                      </span>
                                    </div>
                                  );
                                }}
                              </For>

                              <Show when={group.sessions.length === 0 && group.status === "ready"}>
                                <button
                                  type="button"
                                  class="group/empty w-full px-3 py-2 text-xs text-dls-secondary ml-2 text-left rounded-lg hover:bg-dls-hover hover:text-dls-text transition-colors"
                                  onClick={() => createTaskInWorkspace(workspace().id)}
                                  disabled={props.newTaskDisabled}
                                >
                                  <span class="group-hover/empty:hidden">No tasks yet.</span>
                                  <span class="hidden group-hover/empty:inline font-medium">+ New task</span>
                                </button>
                              </Show>

                              <Show when={group.sessions.length > previewCount(workspace().id)}>
                                <button
                                  type="button"
                                  class="ml-2 w-[calc(100%-0.5rem)] px-3 py-2 text-xs text-dls-secondary hover:text-dls-text hover:bg-dls-hover rounded-lg transition-colors text-left"
                                  onClick={() => showMoreSessions(workspace().id, group.sessions.length)}
                                >
                                  {showMoreLabel(workspace().id, group.sessions.length)}
                                </button>
                              </Show>
                            </Show>
                          }
                        >
                          <div class="w-full px-3 py-2 text-xs text-dls-secondary ml-2 text-left rounded-lg">
                            Loading tasks...
                          </div>
                        </Show>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          <div class="relative" ref={(el) => (addWorkspaceMenuRef = el)}>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-dls-secondary hover:text-dls-text hover:bg-dls-hover"
              onClick={() => setAddWorkspaceMenuOpen((prev) => !prev)}
            >
              <Plus size={14} />
              Add a worker
            </button>
            <Show when={addWorkspaceMenuOpen()}>
              <div class="absolute left-0 right-0 top-full mt-2 rounded-lg border border-dls-border bg-dls-surface shadow-xl overflow-hidden z-20">
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-2 text-xs text-dls-secondary hover:text-dls-text hover:bg-dls-hover transition-colors"
                  onClick={() => {
                    props.openCreateWorkspace();
                    setAddWorkspaceMenuOpen(false);
                  }}
                >
                  <Plus size={12} />
                  New worker
                </button>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-2 text-xs text-dls-secondary hover:text-dls-text hover:bg-dls-hover transition-colors"
                  onClick={() => {
                    props.openCreateRemoteWorkspace();
                    setAddWorkspaceMenuOpen(false);
                  }}
                >
                  <Plus size={12} />
                  Connect remote
                </button>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-2 text-xs text-dls-secondary hover:text-dls-text hover:bg-dls-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={props.importingWorkspaceConfig}
                  onClick={() => {
                    props.importWorkspaceConfig();
                    setAddWorkspaceMenuOpen(false);
                  }}
                >
                  <Plus size={12} />
                  Import config
                </button>
              </div>
            </Show>
          </div>
        </div>

      </aside>

      <main class="flex-1 flex flex-col overflow-hidden bg-dls-surface">
        <div class="flex-1 overflow-y-auto">
        <header class="h-14 flex items-center justify-between px-6 md:px-10 border-b border-dls-border sticky top-0 bg-dls-surface z-10">
          <div class="flex items-center gap-3">
            <div class="px-3 py-1.5 rounded-xl bg-dls-hover text-xs text-dls-secondary font-medium">
              {props.activeWorkspaceDisplay.name}
            </div>
            <Show when={props.activeSoulStatus?.enabled}>
              <div class="inline-flex items-center gap-1 rounded-full border border-rose-7/40 bg-rose-3/40 px-2 py-1 text-[11px] text-rose-11">
                <HeartPulse size={11} />
                Soul on
              </div>
            </Show>
            <h1 class="text-lg font-medium">{title()}</h1>
            <Show when={props.developerMode}>
              <span class="text-xs text-dls-secondary">{props.headerStatus}</span>
            </Show>
            <Show when={props.busyHint}>
              <span class="text-xs text-dls-secondary">{props.busyHint}</span>
            </Show>
          </div>
          <div class="flex items-center gap-2" />
        </header>

        <div class="p-6 md:p-10 max-w-5xl mx-auto space-y-10">
          <Switch>
                        <Match when={props.tab === "sessions"}>
              <div class="flex flex-col gap-2 p-4">
                <p class="text-sm text-gray-10">Sessions will appear here.</p>
              </div>
            </Match>
            <Match when={props.tab === "scheduled"}>
              <ScheduledTasksView
                jobs={props.scheduledJobs}
                source={props.scheduledJobsSource}
                sourceReady={props.scheduledJobsSourceReady}
                status={props.scheduledJobsStatus}
                busy={props.scheduledJobsBusy}
                lastUpdatedAt={props.scheduledJobsUpdatedAt}
                refreshJobs={props.refreshScheduledJobs}
                deleteJob={props.deleteScheduledJob}
                isWindows={props.isWindows}
                activeWorkspaceRoot={props.activeWorkspaceRoot}
                createSessionAndOpen={props.createSessionAndOpen}
                setPrompt={props.setPrompt}
                newTaskDisabled={props.newTaskDisabled}
                schedulerInstalled={props.schedulerPluginInstalled}
                canEditPlugins={props.canEditPlugins}
                addPlugin={props.addPlugin}
                reloadWorkspaceEngine={props.reloadWorkspaceEngine}
                reloadBusy={props.reloadBusy}
                canReloadWorkspace={props.canReloadWorkspace}
              />
            </Match>
            <Match when={props.tab === "soul"}>
              <SoulView
                workspaceName={props.activeWorkspaceDisplay.name}
                workspaceRoot={props.activeWorkspaceRoot}
                status={props.activeSoulStatus}
                heartbeats={props.activeSoulHeartbeats}
                loading={props.soulStatusBusy}
                loadingHeartbeats={props.soulHeartbeatsBusy}
                error={props.soulError}
                newTaskDisabled={props.newTaskDisabled}
                refresh={props.refreshSoulData}
                runSoulPrompt={props.runSoulPrompt}
              />
            </Match>
            <Match when={props.tab === "skills"}>
              <SkillsView
                workspaceName={props.activeWorkspaceDisplay.name}
                busy={props.busy}
                canInstallSkillCreator={props.canInstallSkillCreator}
                canUseDesktopTools={props.canUseDesktopTools}
                accessHint={props.skillsAccessHint}
                refreshSkills={props.refreshSkills}
                refreshHubSkills={props.refreshHubSkills}
                skills={props.skills}
                skillsStatus={props.skillsStatus}
                hubSkills={props.hubSkills}
                hubSkillsStatus={props.hubSkillsStatus}
                importLocalSkill={props.importLocalSkill}
                installSkillCreator={props.installSkillCreator}
                installHubSkill={props.installHubSkill}
                revealSkillsFolder={props.revealSkillsFolder}
                uninstallSkill={props.uninstallSkill}
                readSkill={props.readSkill}
                saveSkill={props.saveSkill}
                createSessionAndOpen={props.createSessionAndOpen}
                setPrompt={props.setPrompt}
              />
            </Match>

            <Match when={props.tab === "extensions"}>
              <ExtensionsView
                initialSection="plugins"
                busy={props.busy}
                activeWorkspaceRoot={props.activeWorkspaceRoot}
                refreshMcpServers={props.refreshMcpServers}
                mcpServers={props.mcpServers}
                mcpStatus={props.mcpStatus}
                mcpLastUpdatedAt={props.mcpLastUpdatedAt}
                mcpStatuses={props.mcpStatuses}
                mcpConnectingName={props.mcpConnectingName}
                selectedMcp={props.selectedMcp}
                setSelectedMcp={props.setSelectedMcp}
                quickConnect={props.quickConnect}
                connectMcp={props.connectMcp}
                logoutMcpAuth={props.logoutMcpAuth}
                removeMcp={props.removeMcp}
                showMcpReloadBanner={props.showMcpReloadBanner}
                reloadBlocked={props.mcpReloadBlocked}
                reloadMcpEngine={props.reloadMcpEngine}
                canEditPlugins={props.canEditPlugins}
                canUseGlobalScope={props.canUseGlobalPluginScope}
                accessHint={props.pluginsAccessHint}
                pluginScope={props.pluginScope}
                setPluginScope={props.setPluginScope}
                pluginConfigPath={props.pluginConfigPath}
                pluginList={props.pluginList}
                pluginInput={props.pluginInput}
                setPluginInput={props.setPluginInput}
                pluginStatus={props.pluginStatus}
                activePluginGuide={props.activePluginGuide}
                setActivePluginGuide={props.setActivePluginGuide}
                isPluginInstalled={props.isPluginInstalled}
                suggestedPlugins={props.suggestedPlugins}
                refreshPlugins={props.refreshPlugins}
                addPlugin={props.addPlugin}
              />
            </Match>

            <Match when={props.tab === "settings"}>
                <SettingsView
                  startupPreference={props.startupPreference}
                  baseUrl={props.baseUrl}
                  headerStatus={props.headerStatus}
                  busy={props.busy}
                  settingsTab={props.settingsTab}
                  setSettingsTab={props.setSettingsTab}
                  providers={props.providers}
                  providerConnectedIds={props.providerConnectedIds}
                  providerAuthBusy={props.providerAuthBusy}
                  openProviderAuthModal={props.openProviderAuthModal}
                  openworkServerStatus={props.openworkServerStatus}
                  openworkServerUrl={props.openworkServerUrl}
                  openworkReconnectBusy={props.openworkReconnectBusy}
                  reconnectOpenworkServer={props.reconnectOpenworkServer}
                  openworkServerHostInfo={props.openworkServerHostInfo}
                  openworkServerCapabilities={props.openworkServerCapabilities}
                  openworkServerDiagnostics={props.openworkServerDiagnostics}
                  openworkServerWorkspaceId={props.openworkServerWorkspaceId}
                  openworkServerSettings={props.openworkServerSettings}
                  updateOpenworkServerSettings={props.updateOpenworkServerSettings}
                  resetOpenworkServerSettings={props.resetOpenworkServerSettings}
                  testOpenworkServerConnection={props.testOpenworkServerConnection}
                  canReloadWorkspace={props.canReloadWorkspace}
                  reloadWorkspaceEngine={props.reloadWorkspaceEngine}
                  reloadBusy={props.reloadBusy}
                  reloadError={props.reloadError}
                  workspaceAutoReloadAvailable={props.workspaceAutoReloadAvailable}
                  workspaceAutoReloadEnabled={props.workspaceAutoReloadEnabled}
                  setWorkspaceAutoReloadEnabled={props.setWorkspaceAutoReloadEnabled}
                  workspaceAutoReloadResumeEnabled={props.workspaceAutoReloadResumeEnabled}
                  setWorkspaceAutoReloadResumeEnabled={props.setWorkspaceAutoReloadResumeEnabled}
                  openworkAuditEntries={props.openworkAuditEntries}
                  openworkAuditStatus={props.openworkAuditStatus}
                  openworkAuditError={props.openworkAuditError}
                  opencodeConnectStatus={props.opencodeConnectStatus}
                  engineInfo={props.engineInfo}
                  orchestratorStatus={props.orchestratorStatus}
                  engineDoctorVersion={props.engineDoctorVersion}
                  developerMode={props.developerMode}
                  toggleDeveloperMode={props.toggleDeveloperMode}
                  stopHost={props.stopHost}
                  engineSource={props.engineSource}
                  setEngineSource={props.setEngineSource}
                  engineCustomBinPath={props.engineCustomBinPath}
                  setEngineCustomBinPath={props.setEngineCustomBinPath}
                  engineRuntime={props.engineRuntime}
                  setEngineRuntime={props.setEngineRuntime}
                  isWindows={props.isWindows}
                  defaultModelLabel={props.defaultModelLabel}
                  defaultModelRef={props.defaultModelRef}
                  openDefaultModelPicker={props.openDefaultModelPicker}
                  showThinking={props.showThinking}
                  toggleShowThinking={props.toggleShowThinking}
                  hideTitlebar={props.hideTitlebar}
                  toggleHideTitlebar={props.toggleHideTitlebar}
                  modelVariantLabel={props.modelVariantLabel}
                  editModelVariant={props.editModelVariant}
                  themeMode={props.themeMode}
                  setThemeMode={props.setThemeMode}
                  anyActiveRuns={props.anyActiveRuns}
                  onResetStartupPreference={props.onResetStartupPreference}
                  openResetModal={props.openResetModal}
                  resetModalBusy={props.resetModalBusy}
                  pendingPermissions={props.pendingPermissions}
                  events={props.events}
                  workspaceDebugEvents={props.workspaceDebugEvents}
                  clearWorkspaceDebugEvents={props.clearWorkspaceDebugEvents}
                  safeStringify={props.safeStringify}
                  repairOpencodeMigration={props.repairOpencodeMigration}
                  migrationRepairBusy={props.migrationRepairBusy}
                  migrationRepairResult={props.migrationRepairResult}
                  migrationRepairAvailable={props.migrationRepairAvailable}
                  migrationRepairUnavailableReason={props.migrationRepairUnavailableReason}
                  repairOpencodeCache={props.repairOpencodeCache}
                  cacheRepairBusy={props.cacheRepairBusy}
                  cacheRepairResult={props.cacheRepairResult}
                  cleanupOpenworkDockerContainers={props.cleanupOpenworkDockerContainers}
                  dockerCleanupBusy={props.dockerCleanupBusy}
                  dockerCleanupResult={props.dockerCleanupResult}
                  notionStatus={props.notionStatus}
                  notionStatusDetail={props.notionStatusDetail}
                  notionError={props.notionError}
                  notionBusy={props.notionBusy}
                  connectNotion={props.connectNotion}
                />

            </Match>
          </Switch>
        </div>

        <Show when={props.error}>
          <div class="mx-auto max-w-5xl px-6 md:px-10 pb-24 md:pb-10">
            <div class="rounded-2xl bg-red-1/40 px-5 py-4 text-sm text-red-12 border border-red-7/20 space-y-3">
              <div>{props.error}</div>
              <Show when={props.developerMode}>
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    class="text-xs h-8 py-0 px-3"
                    onClick={props.repairOpencodeCache}
                    disabled={props.cacheRepairBusy || !props.developerMode}
                  >
                    {props.cacheRepairBusy ? "Repairing cache" : "Repair cache"}
                  </Button>
                  <Button
                    variant="outline"
                    class="text-xs h-8 py-0 px-3"
                    onClick={props.stopHost}
                    disabled={props.busy}
                  >
                    Retry
                  </Button>
                  <Show when={props.cacheRepairResult}>
                    <span class="text-xs text-red-12/80">
                      {props.cacheRepairResult}
                    </span>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <ProviderAuthModal
          open={props.providerAuthModalOpen}
          loading={props.providerAuthBusy}
          submitting={providerAuthActionBusy()}
          error={props.providerAuthError}
          providers={props.providers}
          connectedProviderIds={props.providerConnectedIds}
          authMethods={props.providerAuthMethods}
          onSelect={handleProviderAuthSelect}
          onSubmitApiKey={handleProviderAuthApiKey}
          onSubmitOAuth={handleProviderAuthOAuth}
          onClose={props.closeProviderAuthModal}
        />

        <ShareWorkspaceModal
          open={Boolean(shareWorkspaceId())}
          onClose={() => setShareWorkspaceId(null)}
          workspaceName={shareWorkspaceName()}
          workspaceDetail={shareWorkspaceDetail()}
          fields={shareFields()}
          note={shareNote()}
          onExportConfig={
            exportDisabledReason()
              ? undefined
              : () => {
                const id = shareWorkspaceId();
                if (!id) return;
                props.exportWorkspaceConfig(id);
              }
          }
          exportDisabledReason={exportDisabledReason()}
          onOpenBots={openWorkspaceSettings}
        />
        </div>

        <StatusBar
          clientConnected={props.clientConnected}
          openworkServerStatus={props.openworkServerStatus}
          developerMode={props.developerMode}
          onOpenSettings={() => openSettings("general")}
          onOpenMessaging={openWorkspaceSettings}
          onOpenProviders={() => props.openProviderAuthModal()}
          onOpenMcp={() => props.setTab("extensions")}
          providerConnectedIds={props.providerConnectedIds}
          mcpStatuses={props.mcpStatuses}
        />
        <nav class="md:hidden border-t border-dls-border bg-dls-surface">
          <div class={`mx-auto max-w-5xl px-4 py-3 grid gap-2 grid-cols-6`}>
                        <button
              class={`flex flex-col items-center gap-1 text-xs ${
                props.tab === "sessions" ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => props.setTab("sessions")}
            >
              <History size={18} />
              Sessions
            </button>
            <button
              class={`flex flex-col items-center gap-1 text-xs ${
                props.tab === "scheduled" ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => props.setTab("scheduled")}
            >
              <History size={18} />
              Automations
            </button>
            <button
              class={`flex flex-col items-center gap-1 text-xs ${
                props.tab === "soul" ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => props.setTab("soul")}
            >
              <HeartPulse size={18} class={soulNavIconClass()} />
              Soul
            </button>
            <button
              class={`flex flex-col items-center gap-1 text-xs ${
                props.tab === "skills" ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => props.setTab("skills")}
            >
              <Zap size={18} />
              Skills
            </button>
            <button
              class={`flex flex-col items-center gap-1 text-xs ${
                props.tab === "extensions" ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => props.setTab("extensions")}
            >
              <Box size={18} />
              Extensions
            </button>
            <button
              class={`flex flex-col items-center gap-1 text-xs ${
                props.tab === "settings" ? "text-gray-12" : "text-gray-10"
              }`}
              onClick={() => props.setTab("settings")}
            >
              <Settings size={18} />
              Settings
            </button>
          </div>
        </nav>
      </main>

      <aside class="w-56 hidden md:flex flex-col bg-dls-sidebar border-l border-dls-border p-4">
        <div class="space-y-1 pt-2">
          {navItem("sessions", "Sessions", <History size={18} />)}
          {navItem("scheduled", "Automations", <History size={18} />)}
          {navItem("soul", "Soul", <HeartPulse size={18} class={soulNavIconClass()} />)}
          {navItem("skills", "Skills", <Zap size={18} />)}
          {navItem("extensions", "Extensions", <Box size={18} />)}
          {navItem("settings", "Settings", <Settings size={18} />)}
        </div>
      </aside>
    </div>
  );
}
