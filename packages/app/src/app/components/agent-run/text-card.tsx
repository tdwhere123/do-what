import { createMemo } from "solid-js";
import { marked } from "marked";

export default function TextCard(props: { content: string }) {
  const html = createMemo(() => marked.parse(props.content ?? "", { async: false }) as string);
  return <div class="prose prose-sm max-w-none rounded-lg border border-dls-border p-3" innerHTML={html()} />;
}
