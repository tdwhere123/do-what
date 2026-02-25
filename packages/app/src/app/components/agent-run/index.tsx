import { For, Match, Switch } from "solid-js";

import type { RunEvent } from "../../lib/agent-output-parser";
import BashCard from "./bash-card";
import CodeCard from "./code-card";
import DoneBanner from "./done-banner";
import ErrorCard from "./error-card";
import FileWriteCard from "./file-write-card";
import TextCard from "./text-card";
import ToolCallCard from "./tool-call-card";

type Props = {
  events: RunEvent[];
  status: "running" | "done" | "error" | "aborted";
};

function EventCard(props: { event: RunEvent }) {
  return (
    <Switch>
      <Match when={props.event.type === "text"}><TextCard content={(props.event as Extract<RunEvent, { type: "text" }>).content} /></Match>
      <Match when={props.event.type === "tool_call"}><ToolCallCard event={props.event as Extract<RunEvent, { type: "tool_call" }>} /></Match>
      <Match when={props.event.type === "bash"}><BashCard event={props.event as Extract<RunEvent, { type: "bash" }>} /></Match>
      <Match when={props.event.type === "file_write"}><FileWriteCard event={props.event as Extract<RunEvent, { type: "file_write" }>} /></Match>
      <Match when={props.event.type === "code"}><CodeCard event={props.event as Extract<RunEvent, { type: "code" }>} /></Match>
      <Match when={props.event.type === "error"}><ErrorCard message={(props.event as Extract<RunEvent, { type: "error" }>).message} /></Match>
      <Match when={props.event.type === "done"}><DoneBanner event={props.event as Extract<RunEvent, { type: "done" }>} /></Match>
      <Match when={true}><TextCard content={JSON.stringify(props.event)} /></Match>
    </Switch>
  );
}

export default function AgentRunView(props: Props) {
  return (
    <div class="flex flex-col gap-2 p-4 overflow-y-auto">
      <For each={props.events}>{(event) => <EventCard event={event} />}</For>
      <div class="text-[10px] uppercase tracking-wide text-dls-secondary">status: {props.status}</div>
    </div>
  );
}
