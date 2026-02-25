export type RunEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; result?: string }
  | { type: "file_read"; path: string; preview?: string }
  | { type: "file_write"; path: string; diff?: string }
  | { type: "bash"; command: string; output: string; exitCode?: number }
  | { type: "code"; language: string; content: string }
  | { type: "error"; message: string }
  | { type: "done"; exitCode: number; durationMs: number };

const CODE_BLOCK_RE = /```(\w+)\n([\s\S]+?)```/g;
const BASH_BLOCK_RE = /\$ (.+)\n([\s\S]*?)(?=\n\$ |$)/g;

export function parseClaudeCodeChunk(raw: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const line of raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    try {
      const obj = JSON.parse(line) as {
        type?: string;
        subtype?: string;
        error?: string;
        duration_ms?: number;
        message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }> };
      };
      if (obj.type === "assistant") {
        for (const part of obj.message?.content ?? []) {
          if (part.type === "text" && part.text) {
            events.push({ type: "text", content: part.text });
          }
          if (part.type === "tool_use") {
            events.push({ type: "tool_call", tool: part.name ?? "tool", args: part.input ?? {} });
          }
        }
        continue;
      }
      if (obj.type === "result" && obj.subtype === "success") {
        events.push({ type: "done", exitCode: 0, durationMs: Number(obj.duration_ms ?? 0) });
        continue;
      }
      if (obj.type === "result" && obj.error) {
        events.push({ type: "error", message: obj.error });
        continue;
      }
      events.push({ type: "text", content: line });
    } catch {
      events.push({ type: "text", content: line });
    }
  }
  return events;
}

export function parseCodexChunk(raw: string): RunEvent[] {
  const events: RunEvent[] = [];
  let matched = false;

  for (const match of raw.matchAll(BASH_BLOCK_RE)) {
    matched = true;
    events.push({ type: "bash", command: match[1]?.trim() ?? "", output: (match[2] ?? "").trim() });
  }

  for (const match of raw.matchAll(CODE_BLOCK_RE)) {
    matched = true;
    events.push({ type: "code", language: match[1] ?? "text", content: (match[2] ?? "").trim() });
  }

  if (!matched) {
    const content = raw.trim();
    if (content) events.push({ type: "text", content });
  }

  return events;
}

export class OutputBuffer {
  private chunks: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRuntime: "claude-code" | "codex" = "claude-code";

  constructor(
    private readonly onFlush: (events: RunEvent[]) => void,
    private readonly debounceMs = 300,
  ) {}

  push(chunk: string, runtime: "claude-code" | "codex") {
    this.chunks.push(chunk);
    this.lastRuntime = runtime;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const raw = this.chunks.join("\n");
      this.chunks = [];
      const events = runtime === "claude-code" ? parseClaudeCodeChunk(raw) : parseCodexChunk(raw);
      if (events.length) this.onFlush(events);
    }, this.debounceMs);
  }

  flush() {
    if (!this.chunks.length) return;
    const raw = this.chunks.join("\n");
    this.chunks = [];
    const events = this.lastRuntime === "claude-code" ? parseClaudeCodeChunk(raw) : parseCodexChunk(raw);
    if (events.length) this.onFlush(events);
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.chunks = [];
  }
}
