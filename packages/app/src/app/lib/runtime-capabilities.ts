export type RuntimeID = "opencode" | "claude-code" | "codex";

export type RuntimeCapabilities = {
  id: RuntimeID;
  label: string;
  supportsPrompt: boolean;
  supportsAttachments: boolean;
  supportsSlashCommands: boolean;
  supportsShellMode: boolean;
  supportsAgentPicker: boolean;
};

const CAPABILITIES: Record<RuntimeID, RuntimeCapabilities> = {
  opencode: {
    id: "opencode",
    label: "OpenCode",
    supportsPrompt: true,
    supportsAttachments: true,
    supportsSlashCommands: true,
    supportsShellMode: true,
    supportsAgentPicker: true,
  },
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    supportsPrompt: true,
    supportsAttachments: false,
    supportsSlashCommands: false,
    supportsShellMode: false,
    supportsAgentPicker: false,
  },
  codex: {
    id: "codex",
    label: "Codex",
    supportsPrompt: true,
    supportsAttachments: false,
    supportsSlashCommands: false,
    supportsShellMode: false,
    supportsAgentPicker: false,
  },
};

export function resolveRuntimeID(runtime?: RuntimeID | null): RuntimeID {
  return runtime === "claude-code" || runtime === "codex" ? runtime : "opencode";
}

export function getRuntimeCapabilities(runtime?: RuntimeID | null): RuntimeCapabilities {
  return CAPABILITIES[resolveRuntimeID(runtime)];
}

export function runtimeFeatureHint(
  runtime: RuntimeID,
  feature: "attachments" | "slash" | "shell" | "agent",
): string {
  const label = CAPABILITIES[runtime].label;
  switch (feature) {
    case "attachments":
      return `${label} 暂不支持附件。`;
    case "slash":
      return `${label} 暂不支持斜杠命令。`;
    case "shell":
      return `${label} 暂不支持 Shell 模式。`;
    case "agent":
      return `${label} 暂不支持智能体选择。`;
    default:
      return `${label} 暂不支持该功能。`;
  }
}

