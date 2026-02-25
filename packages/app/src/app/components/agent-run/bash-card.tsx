import type { RunEvent } from "../../lib/agent-output-parser";

export default function BashCard(props: { event: Extract<RunEvent, { type: "bash" }> }) {
  return (
    <div class="rounded-lg bg-gray-12 text-gray-1 p-3 font-mono text-xs">
      <div>$ {props.event.command}</div>
      <pre class="mt-2 whitespace-pre-wrap">{props.event.output}</pre>
    </div>
  );
}
