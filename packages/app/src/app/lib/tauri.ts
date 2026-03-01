import { invoke } from "@tauri-apps/api/core";
import { validateMcpServerName } from "../mcp";
import type { AgentRunConfig, AgentRuntime } from "../state/sessions";

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const maybeTauri = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return maybeTauri.__TAURI__ != null || maybeTauri.__TAURI_INTERNALS__ != null;
}

function commandUnavailableMessage(command: string): string {
  return `[${command}] requires desktop runtime`;
}

async function invokeWithFallback<T>(
  command: string,
  args?: Record<string, unknown>,
  fallback?: T | (() => T | Promise<T>),
): Promise<T> {
  if (!isTauri()) {
    if (typeof fallback === "function") {
      return (fallback as () => T | Promise<T>)();
    }
    if (fallback !== undefined) return fallback;
    throw new Error(commandUnavailableMessage(command));
  }
  return invoke<T>(command, args);
}

export type EngineInfo = {
  running: boolean;
  runtime: "direct" | "dowhat-orchestrator";
  baseUrl: string | null;
  projectDir: string | null;
  hostname: string | null;
  port: number | null;
  opencodeUsername: string | null;
  opencodePassword: string | null;
  pid: number | null;
  lastStdout: string | null;
  lastStderr: string | null;
};

export type DoWhatServerInfo = {
  running: boolean;
  host: string | null;
  port: number | null;
  baseUrl: string | null;
  connectUrl: string | null;
  mdnsUrl: string | null;
  lanUrl: string | null;
  clientToken: string | null;
  hostToken: string | null;
  pid: number | null;
  lastStdout: string | null;
  lastStderr: string | null;
};

export type OrchestratorDaemonState = {
  pid: number;
  port: number;
  baseUrl: string;
  startedAt: number;
};

export type OrchestratorEngineState = {
  pid: number;
  port: number;
  baseUrl: string;
  startedAt: number;
};

export type OrchestratorBinaryInfo = {
  path: string;
  source: string;
  expectedVersion?: string | null;
  actualVersion?: string | null;
};

export type OrchestratorBinaryState = {
  opencode?: OrchestratorBinaryInfo | null;
};

export type OrchestratorSidecarInfo = {
  dir?: string | null;
  baseUrl?: string | null;
  manifestUrl?: string | null;
  target?: string | null;
  source?: string | null;
  opencodeSource?: string | null;
  allowExternal?: boolean | null;
};

export type OrchestratorWorkspace = {
  id: string;
  name: string;
  path: string;
  workspaceType: string;
  baseUrl?: string | null;
  directory?: string | null;
  createdAt?: number | null;
  lastUsedAt?: number | null;
};

export type OrchestratorStatus = {
  running: boolean;
  dataDir: string;
  daemon: OrchestratorDaemonState | null;
  opencode: OrchestratorEngineState | null;
  cliVersion?: string | null;
  sidecar?: OrchestratorSidecarInfo | null;
  binaries?: OrchestratorBinaryState | null;
  activeId: string | null;
  workspaceCount: number;
  workspaces: OrchestratorWorkspace[];
  lastError: string | null;
};

export type RuntimeAssistantStatus = {
  id: "opencode" | "claude-code" | "codex";
  name: string;
  binary: string;
  installed: boolean;
  installState: "installed" | "not-installed";
  loggedIn: boolean;
  loginState: "logged-in" | "logged-out";
  version: string | null;
  details: string[];
};

export type RuntimeAssistantStatusSnapshot = {
  checkedAt: number;
  assistants: RuntimeAssistantStatus[];
};

const defaultRuntimeAssistantStatus = (
  id: RuntimeAssistantStatus["id"],
  name: string,
  binary: string,
): RuntimeAssistantStatus => ({
  id,
  name,
  binary,
  installed: false,
  installState: "not-installed",
  loggedIn: false,
  loginState: "logged-out",
  version: null,
  details: ["Desktop runtime required"],
});

const defaultEngineInfo = (): EngineInfo => ({
  running: false,
  runtime: "direct",
  baseUrl: null,
  projectDir: null,
  hostname: null,
  port: null,
  opencodeUsername: null,
  opencodePassword: null,
  pid: null,
  lastStdout: null,
  lastStderr: null,
});

const defaultOrchestratorStatus = (): OrchestratorStatus => ({
  running: false,
  dataDir: "",
  daemon: null,
  opencode: null,
  cliVersion: null,
  sidecar: null,
  binaries: null,
  activeId: null,
  workspaceCount: 0,
  workspaces: [],
  lastError: null,
});

const defaultDoWhatServerInfo = (): DoWhatServerInfo => ({
  running: false,
  host: null,
  port: null,
  baseUrl: null,
  connectUrl: null,
  mdnsUrl: null,
  lanUrl: null,
  clientToken: null,
  hostToken: null,
  pid: null,
  lastStdout: null,
  lastStderr: null,
});

const defaultWorkspaceList = (): WorkspaceList => ({
  activeId: "",
  workspaces: [],
});

export type EngineDoctorResult = {
  found: boolean;
  inPath: boolean;
  resolvedPath: string | null;
  version: string | null;
  supportsServe: boolean;
  notes: string[];
  serveHelpStatus: number | null;
  serveHelpStdout: string | null;
  serveHelpStderr: string | null;
};

export type WorkspaceInfo = {
  id: string;
  name: string;
  path: string;
  preset: string;
  workspaceType: "local" | "remote";
  remoteType?: "openwork" | "opencode" | null;
  baseUrl?: string | null;
  directory?: string | null;
  displayName?: string | null;
  openworkHostUrl?: string | null;
  openworkToken?: string | null;
  openworkWorkspaceId?: string | null;
  openworkWorkspaceName?: string | null;

  // Sandbox lifecycle metadata (desktop-managed)
  sandboxBackend?: "docker" | null;
  sandboxRunId?: string | null;
  sandboxContainerName?: string | null;
};

export type WorkspaceList = {
  activeId: string;
  workspaces: WorkspaceInfo[];
};

export type WorkspaceExportSummary = {
  outputPath: string;
  included: number;
  excluded: string[];
};

export async function engineStart(
  projectDir: string,
  options?: {
    preferSidecar?: boolean;
    runtime?: "direct" | "dowhat-orchestrator";
    workspacePaths?: string[];
    opencodeBinPath?: string | null;
  },
): Promise<EngineInfo> {
  return invokeWithFallback<EngineInfo>("engine_start", {
    projectDir,
    preferSidecar: options?.preferSidecar ?? false,
    opencodeBinPath: options?.opencodeBinPath ?? null,
    runtime: options?.runtime ?? null,
    workspacePaths: options?.workspacePaths ?? null,
  }, defaultEngineInfo);
}

export async function workspaceBootstrap(): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_bootstrap", undefined, defaultWorkspaceList);
}

export async function workspaceSetActive(workspaceId: string): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_set_active", { workspaceId }, defaultWorkspaceList);
}

export async function workspaceCreate(input: {
  folderPath: string;
  name: string;
  preset: string;
}): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_create", {
    folderPath: input.folderPath,
    name: input.name,
    preset: input.preset,
  }, defaultWorkspaceList);
}

export async function workspaceCreateRemote(input: {
  baseUrl: string;
  directory?: string | null;
  displayName?: string | null;
  remoteType?: "openwork" | "opencode" | null;
  openworkHostUrl?: string | null;
  openworkToken?: string | null;
  openworkWorkspaceId?: string | null;
  openworkWorkspaceName?: string | null;

  // Sandbox lifecycle metadata (desktop-managed)
  sandboxBackend?: "docker" | null;
  sandboxRunId?: string | null;
  sandboxContainerName?: string | null;
}): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_create_remote", {
    baseUrl: input.baseUrl,
    directory: input.directory ?? null,
    displayName: input.displayName ?? null,
    remoteType: input.remoteType ?? null,
    openworkHostUrl: input.openworkHostUrl ?? null,
    openworkToken: input.openworkToken ?? null,
    openworkWorkspaceId: input.openworkWorkspaceId ?? null,
    openworkWorkspaceName: input.openworkWorkspaceName ?? null,
    sandboxBackend: input.sandboxBackend ?? null,
    sandboxRunId: input.sandboxRunId ?? null,
    sandboxContainerName: input.sandboxContainerName ?? null,
  }, defaultWorkspaceList);
}

export async function workspaceUpdateRemote(input: {
  workspaceId: string;
  baseUrl?: string | null;
  directory?: string | null;
  displayName?: string | null;
  remoteType?: "openwork" | "opencode" | null;
  openworkHostUrl?: string | null;
  openworkToken?: string | null;
  openworkWorkspaceId?: string | null;
  openworkWorkspaceName?: string | null;

  // Sandbox lifecycle metadata (desktop-managed)
  sandboxBackend?: "docker" | null;
  sandboxRunId?: string | null;
  sandboxContainerName?: string | null;
}): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_update_remote", {
    workspaceId: input.workspaceId,
    baseUrl: input.baseUrl ?? null,
    directory: input.directory ?? null,
    displayName: input.displayName ?? null,
    remoteType: input.remoteType ?? null,
    openworkHostUrl: input.openworkHostUrl ?? null,
    openworkToken: input.openworkToken ?? null,
    openworkWorkspaceId: input.openworkWorkspaceId ?? null,
    openworkWorkspaceName: input.openworkWorkspaceName ?? null,
    sandboxBackend: input.sandboxBackend ?? null,
    sandboxRunId: input.sandboxRunId ?? null,
    sandboxContainerName: input.sandboxContainerName ?? null,
  }, defaultWorkspaceList);
}

export async function workspaceUpdateDisplayName(input: {
  workspaceId: string;
  displayName?: string | null;
}): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_update_display_name", {
    workspaceId: input.workspaceId,
    displayName: input.displayName ?? null,
  }, defaultWorkspaceList);
}

export async function workspaceForget(workspaceId: string): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_forget", { workspaceId }, defaultWorkspaceList);
}

export async function workspaceAddAuthorizedRoot(input: {
  workspacePath: string;
  folderPath: string;
}): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "workspace_add_authorized_root",
    {
      workspacePath: input.workspacePath,
      folderPath: input.folderPath,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("workspace_add_authorized_root"),
    },
  );
}

export async function workspaceExportConfig(input: {
  workspaceId: string;
  outputPath: string;
}): Promise<WorkspaceExportSummary> {
  return invokeWithFallback<WorkspaceExportSummary>("workspace_export_config", {
    workspaceId: input.workspaceId,
    outputPath: input.outputPath,
  }, {
    outputPath: input.outputPath,
    included: 0,
    excluded: [],
  });
}

export async function workspaceImportConfig(input: {
  archivePath: string;
  targetDir: string;
  name?: string | null;
}): Promise<WorkspaceList> {
  return invokeWithFallback<WorkspaceList>("workspace_import_config", {
    archivePath: input.archivePath,
    targetDir: input.targetDir,
    name: input.name ?? null,
  }, defaultWorkspaceList);
}

export type OpencodeCommandDraft = {
  name: string;
  description?: string;
  template: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
};

export type WorkspaceDoWhatConfig = {
  version: number;
  workspace?: {
    name?: string | null;
    createdAt?: number | null;
    preset?: string | null;
  } | null;
  authorizedRoots: string[];
  reload?: {
    auto?: boolean;
    resume?: boolean;
  } | null;
};

function defaultWorkspaceDoWhatConfig(workspacePath?: string): WorkspaceDoWhatConfig {
  return {
    version: 1,
    workspace: null,
    authorizedRoots: workspacePath ? [workspacePath] : [],
    reload: null,
  };
}

export async function workspaceDoWhatRead(input: {
  workspacePath: string;
}): Promise<WorkspaceDoWhatConfig> {
  return invokeWithFallback<WorkspaceDoWhatConfig>(
    "workspace_dowhat_read",
    {
      workspacePath: input.workspacePath,
    },
    () => defaultWorkspaceDoWhatConfig(input.workspacePath),
  );
}

export async function workspaceDoWhatWrite(input: {
  workspacePath: string;
  config: WorkspaceDoWhatConfig;
}): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "workspace_dowhat_write",
    {
      workspacePath: input.workspacePath,
      config: input.config,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("workspace_dowhat_write"),
    },
  );
}

export async function opencodeCommandList(input: {
  scope: "workspace" | "global";
  projectDir: string;
}): Promise<string[]> {
  return invokeWithFallback<string[]>(
    "opencode_command_list",
    {
      scope: input.scope,
      projectDir: input.projectDir,
    },
    [],
  );
}

export async function opencodeCommandWrite(input: {
  scope: "workspace" | "global";
  projectDir: string;
  command: OpencodeCommandDraft;
}): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "opencode_command_write",
    {
      scope: input.scope,
      projectDir: input.projectDir,
      command: input.command,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("opencode_command_write"),
    },
  );
}

export async function opencodeCommandDelete(input: {
  scope: "workspace" | "global";
  projectDir: string;
  name: string;
}): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "opencode_command_delete",
    {
      scope: input.scope,
      projectDir: input.projectDir,
      name: input.name,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("opencode_command_delete"),
    },
  );
}

export async function engineStop(): Promise<EngineInfo> {
  return invokeWithFallback<EngineInfo>("engine_stop", undefined, defaultEngineInfo);
}

export async function orchestratorStatus(): Promise<OrchestratorStatus> {
  return invokeWithFallback<OrchestratorStatus>(
    "orchestrator_status",
    undefined,
    defaultOrchestratorStatus,
  );
}

export async function orchestratorWorkspaceActivate(input: {
  workspacePath: string;
  name?: string | null;
}): Promise<OrchestratorWorkspace> {
  return invokeWithFallback<OrchestratorWorkspace>("orchestrator_workspace_activate", {
    workspacePath: input.workspacePath,
    name: input.name ?? null,
  });
}

export async function orchestratorInstanceDispose(workspacePath: string): Promise<boolean> {
  return invokeWithFallback<boolean>("orchestrator_instance_dispose", { workspacePath }, false);
}

export type AppBuildInfo = {
  version: string;
  gitSha?: string | null;
  buildEpoch?: string | null;
};

export async function appBuildInfo(): Promise<AppBuildInfo> {
  return invokeWithFallback<AppBuildInfo>(
    "app_build_info",
    undefined,
    () => ({ version: "web", gitSha: null, buildEpoch: null }),
  );
}

export type OrchestratorDetachedHost = {
  doWhatUrl: string;
  token: string;
  hostToken: string;
  port: number;
  sandboxBackend?: "docker" | null;
  sandboxRunId?: string | null;
  sandboxContainerName?: string | null;
};

export async function orchestratorStartDetached(input: {
  workspacePath: string;
  sandboxBackend?: "none" | "docker" | null;
  runId?: string | null;
}): Promise<OrchestratorDetachedHost> {
  return invokeWithFallback<OrchestratorDetachedHost>("orchestrator_start_detached", {
    workspacePath: input.workspacePath,
    sandboxBackend: input.sandboxBackend ?? null,
    runId: input.runId ?? null,
  });
}

export type SandboxDoctorResult = {
  installed: boolean;
  daemonRunning: boolean;
  permissionOk: boolean;
  ready: boolean;
  clientVersion?: string | null;
  serverVersion?: string | null;
  error?: string | null;
  debug?: {
    candidates: string[];
    selectedBin?: string | null;
    versionCommand?: {
      status: number;
      stdout: string;
      stderr: string;
    } | null;
    infoCommand?: {
      status: number;
      stdout: string;
      stderr: string;
    } | null;
  } | null;
};

export async function sandboxDoctor(): Promise<SandboxDoctorResult> {
  return invokeWithFallback<SandboxDoctorResult>(
    "sandbox_doctor",
    undefined,
    () => ({
      installed: false,
      daemonRunning: false,
      permissionOk: false,
      ready: false,
      clientVersion: null,
      serverVersion: null,
      error: commandUnavailableMessage("sandbox_doctor"),
      debug: { candidates: [] },
    }),
  );
}

export async function sandboxStop(containerName: string): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "sandbox_stop",
    { containerName },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("sandbox_stop"),
    },
  );
}

export type DoWhatDockerCleanupResult = {
  candidates: string[];
  removed: string[];
  errors: string[];
};

export async function sandboxCleanupDoWhatContainers(): Promise<DoWhatDockerCleanupResult> {
  return invokeWithFallback<DoWhatDockerCleanupResult>(
    "sandbox_cleanup_dowhat_containers",
    undefined,
    { candidates: [], removed: [], errors: [] },
  );
}

export async function doWhatServerInfo(): Promise<DoWhatServerInfo> {
  return invokeWithFallback<DoWhatServerInfo>(
    "dowhat_server_info",
    undefined,
    defaultDoWhatServerInfo,
  );
}

export async function engineInfo(): Promise<EngineInfo> {
  return invokeWithFallback<EngineInfo>("engine_info", undefined, defaultEngineInfo);
}

export async function engineDoctor(options?: {
  preferSidecar?: boolean;
  opencodeBinPath?: string | null;
}): Promise<EngineDoctorResult> {
  return invokeWithFallback<EngineDoctorResult>("engine_doctor", {
    preferSidecar: options?.preferSidecar ?? false,
    opencodeBinPath: options?.opencodeBinPath ?? null,
  }, () => ({
    found: false,
    inPath: false,
    resolvedPath: null,
    version: null,
    supportsServe: false,
    notes: [commandUnavailableMessage("engine_doctor")],
    serveHelpStatus: null,
    serveHelpStdout: null,
    serveHelpStderr: null,
  }));
}

export async function pickDirectory(options?: {
  title?: string;
  defaultPath?: string;
  multiple?: boolean;
}): Promise<string | string[] | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({
    title: options?.title,
    defaultPath: options?.defaultPath,
    directory: true,
    multiple: options?.multiple,
  });
}

export async function pickFile(options?: {
  title?: string;
  defaultPath?: string;
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | string[] | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({
    title: options?.title,
    defaultPath: options?.defaultPath,
    directory: false,
    multiple: options?.multiple,
    filters: options?.filters,
  });
}

export async function saveFile(options?: {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | null> {
  if (!isTauri()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    title: options?.title,
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
}

export type ExecResult = {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
};

export type ScheduledJobRun = {
  prompt?: string;
  command?: string;
  arguments?: string;
  files?: string[];
  agent?: string;
  model?: string;
  variant?: string;
  title?: string;
  share?: boolean;
  continue?: boolean;
  session?: string;
  runFormat?: string;
  attachUrl?: string;
  port?: number;
};

export type ScheduledJob = {
  scopeId?: string;
  timeoutSeconds?: number;
  invocation?: { command: string; args: string[] };
  slug: string;
  name: string;
  schedule: string;
  prompt?: string;
  attachUrl?: string;
  run?: ScheduledJobRun;
  source?: string;
  workdir?: string;
  createdAt: string;
  updatedAt?: string;
  lastRunAt?: string;
  lastRunExitCode?: number;
  lastRunError?: string;
  lastRunSource?: string;
  lastRunStatus?: string;
};

export async function engineInstall(): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "engine_install",
    undefined,
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("engine_install"),
    },
  );
}

export async function opkgInstall(projectDir: string, pkg: string): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "opkg_install",
    { projectDir, package: pkg },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("opkg_install"),
    },
  );
}

export async function importSkill(
  projectDir: string,
  sourceDir: string,
  options?: { overwrite?: boolean },
): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "import_skill",
    {
      projectDir,
      sourceDir,
      overwrite: options?.overwrite ?? false,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("import_skill"),
    },
  );
}

export async function installSkillTemplate(
  projectDir: string,
  name: string,
  content: string,
  options?: { overwrite?: boolean },
): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "install_skill_template",
    {
      projectDir,
      name,
      content,
      overwrite: options?.overwrite ?? false,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("install_skill_template"),
    },
  );
}

export type LocalSkillCard = {
  name: string;
  path: string;
  description?: string;
  trigger?: string;
};

export type LocalSkillContent = {
  path: string;
  content: string;
};

export async function listLocalSkills(projectDir: string): Promise<LocalSkillCard[]> {
  return invokeWithFallback<LocalSkillCard[]>("list_local_skills", { projectDir }, []);
}

export async function readLocalSkill(projectDir: string, name: string): Promise<LocalSkillContent> {
  return invokeWithFallback<LocalSkillContent>(
    "read_local_skill",
    { projectDir, name },
    { path: "", content: "" },
  );
}

export async function writeLocalSkill(projectDir: string, name: string, content: string): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "write_local_skill",
    { projectDir, name, content },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("write_local_skill"),
    },
  );
}

export async function uninstallSkill(projectDir: string, name: string): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "uninstall_skill",
    { projectDir, name },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("uninstall_skill"),
    },
  );
}

export type OpencodeConfigFile = {
  path: string;
  exists: boolean;
  content: string | null;
};


export async function readOpencodeConfig(
  scope: "project" | "global",
  projectDir: string,
): Promise<OpencodeConfigFile> {
  return invokeWithFallback<OpencodeConfigFile>(
    "read_opencode_config",
    { scope, projectDir },
    { path: "", exists: false, content: null },
  );
}

export async function writeOpencodeConfig(
  scope: "project" | "global",
  projectDir: string,
  content: string,
): Promise<ExecResult> {
  return invokeWithFallback<ExecResult>(
    "write_opencode_config",
    { scope, projectDir, content },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("write_opencode_config"),
    },
  );
}

export type ResetDoWhatMode = "onboarding" | "all";

export async function resetDoWhatState(mode: ResetDoWhatMode): Promise<void> {
  return invokeWithFallback<void>("reset_dowhat_state", { mode }, undefined);
}

export type CacheResetResult = {
  removed: string[];
  missing: string[];
  errors: string[];
};

export async function resetOpencodeCache(): Promise<CacheResetResult> {
  return invokeWithFallback<CacheResetResult>(
    "reset_opencode_cache",
    undefined,
    { removed: [], missing: [], errors: [commandUnavailableMessage("reset_opencode_cache")] },
  );
}

export async function schedulerListJobs(scopeRoot?: string): Promise<ScheduledJob[]> {
  return invokeWithFallback<ScheduledJob[]>("scheduler_list_jobs", { scopeRoot }, []);
}

export async function schedulerDeleteJob(name: string, scopeRoot?: string): Promise<ScheduledJob> {
  return invokeWithFallback<ScheduledJob>(
    "scheduler_delete_job",
    { name, scopeRoot },
    {
      slug: name,
      name,
      schedule: "",
      createdAt: "",
    },
  );
}

export async function opencodeDbMigrate(input: {
  projectDir: string;
  preferSidecar?: boolean;
  opencodeBinPath?: string | null;
}): Promise<ExecResult> {
  const safeProjectDir = input.projectDir.trim();
  if (!safeProjectDir) {
    throw new Error("project_dir is required");
  }

  return invokeWithFallback<ExecResult>(
    "opencode_db_migrate",
    {
      projectDir: safeProjectDir,
      preferSidecar: input.preferSidecar ?? false,
      opencodeBinPath: input.opencodeBinPath ?? null,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("opencode_db_migrate"),
    },
  );
}

export async function opencodeMcpAuth(
  projectDir: string,
  serverName: string,
): Promise<ExecResult> {
  const safeProjectDir = projectDir.trim();
  if (!safeProjectDir) {
    throw new Error("project_dir is required");
  }

  const safeServerName = validateMcpServerName(serverName);

  return invokeWithFallback<ExecResult>(
    "opencode_mcp_auth",
    {
      projectDir: safeProjectDir,
      serverName: safeServerName,
    },
    {
      ok: false,
      status: -1,
      stdout: "",
      stderr: commandUnavailableMessage("opencode_mcp_auth"),
    },
  );
}

/**
 * Set window decorations (titlebar) visibility.
 * When `decorations` is false, the native titlebar is hidden.
 * Useful for tiling window managers on Linux (e.g., Hyprland, i3, sway).
 */
export async function setWindowDecorations(decorations: boolean): Promise<void> {
  return invokeWithFallback<void>("set_window_decorations", { decorations }, undefined);
}


export async function agentRunStart(params: {
  runId: string;
  runtime: AgentRuntime;
  prompt: string;
  workdir?: string;
  config: AgentRunConfig;
}): Promise<void> {
  return invokeWithFallback(
    "agent_run_start",
    {
      runId: params.runId,
      runtime: params.runtime,
      prompt: params.prompt,
      workdir: params.workdir ?? null,
      config: {
        mcpConfigPath: params.config.mcpConfigPath ?? null,
        rulesPrefix: params.config.rulesPrefix ?? null,
      },
    },
    undefined,
  );
}

export async function agentRunAbort(runId: string): Promise<void> {
  return invokeWithFallback("agent_run_abort", { runId }, undefined);
}

export async function checkRuntimeAvailable(runtime: "claude-code" | "codex"): Promise<string> {
  return invokeWithFallback("check_runtime_available", { runtime }, "not-installed");
}

export async function checkOpencodeStatus(): Promise<RuntimeAssistantStatus> {
  return invokeWithFallback(
    "check_opencode_status",
    undefined,
    defaultRuntimeAssistantStatus("opencode", "OpenCode", "opencode"),
  );
}

export async function checkClaudeCodeStatus(): Promise<RuntimeAssistantStatus> {
  return invokeWithFallback(
    "check_claude_code_status",
    undefined,
    defaultRuntimeAssistantStatus("claude-code", "Claude Code", "claude"),
  );
}

export async function checkCodexStatus(): Promise<RuntimeAssistantStatus> {
  return invokeWithFallback(
    "check_codex_status",
    undefined,
    defaultRuntimeAssistantStatus("codex", "Codex", "codex"),
  );
}

export async function checkAssistantStatuses(): Promise<RuntimeAssistantStatusSnapshot> {
  return invokeWithFallback("check_assistant_statuses", undefined, {
    checkedAt: Date.now(),
    assistants: [],
  });
}
