import { createMemo, createSignal } from "solid-js";
import type { RuntimeAssistantStatus, RuntimeAssistantStatusSnapshot } from "../lib/tauri";
import { checkAssistantStatuses } from "../lib/tauri";

const [runtimeSnapshot, setRuntimeSnapshot] = createSignal<RuntimeAssistantStatusSnapshot>({
  checkedAt: 0,
  assistants: [],
});

export { runtimeSnapshot };

export const connectedRuntimes = createMemo<RuntimeAssistantStatus[]>(() =>
  runtimeSnapshot().assistants.filter(
    (assistant) => assistant.installed && (assistant.id === "opencode" || assistant.loggedIn),
  ),
);

export const hasAnyConnectedRuntime = createMemo(() => connectedRuntimes().length > 0);

export async function refreshRuntimeSnapshot() {
  try {
    const snapshot = await checkAssistantStatuses();
    setRuntimeSnapshot(snapshot);
  } catch {
    // Web mode or offline: keep an empty snapshot.
  }
}
