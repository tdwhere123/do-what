import type { RunEvent } from "../../lib/agent-output-parser";

export default function DoneBanner(props: { event: Extract<RunEvent, { type: "done" }> }) {
  const ok = props.event.exitCode === 0;
  return (
    <div class={`rounded-lg p-2 text-xs ${ok ? "bg-green-3 text-green-11" : "bg-red-3 text-red-11"}`}>
      Done in {props.event.durationMs}ms (exit {props.event.exitCode})
    </div>
  );
}
