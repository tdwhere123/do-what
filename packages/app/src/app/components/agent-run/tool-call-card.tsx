import { createSignal } from "solid-js";
import type { RunEvent } from "../../lib/agent-output-parser";

export default function ToolCallCard(props: { event: Extract<RunEvent, { type: "tool_call" }> }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="rounded-lg border border-dls-border p-3 bg-dls-surface/80">
      <button type="button" class="text-xs font-medium" onClick={() => setOpen((v) => !v)}>
        Tool: {props.event.tool} {open() ? "▲" : "▼"}
      </button>
      {open() && (
        <pre class="mt-2 text-xs overflow-x-auto">{JSON.stringify(props.event.args, null, 2)}{props.event.result ? `\n\n${props.event.result}` : ""}</pre>
      )}
    </div>
  );
}
