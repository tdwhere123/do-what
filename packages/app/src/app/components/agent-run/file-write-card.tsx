import type { RunEvent } from "../../lib/agent-output-parser";

export default function FileWriteCard(props: { event: Extract<RunEvent, { type: "file_write" }> }) {
  return (
    <div class="rounded-lg border border-dls-border p-3">
      <div class="text-xs font-medium">{props.event.path}</div>
      <pre class="mt-2 text-xs whitespace-pre-wrap">{props.event.diff ?? "No diff"}</pre>
    </div>
  );
}
