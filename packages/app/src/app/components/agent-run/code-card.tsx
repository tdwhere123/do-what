import type { RunEvent } from "../../lib/agent-output-parser";

export default function CodeCard(props: { event: Extract<RunEvent, { type: "code" }> }) {
  return (
    <div class="rounded-lg border border-dls-border p-3">
      <div class="text-[11px] text-dls-secondary">{props.event.language}</div>
      <pre class="mt-1 overflow-x-auto"><code>{props.event.content}</code></pre>
    </div>
  );
}
