import App from "./app";
import { GlobalSDKProvider } from "./context/global-sdk";
import { GlobalSyncProvider } from "./context/global-sync";
import { LocalProvider } from "./context/local";
import { ServerProvider } from "./context/server";
import { isTauriRuntime } from "./utils";

function migrateLocalStorage() {
  // Compatibility migration intentionally removed in do-what hard-cut mode.
}

export default function AppEntry() {
  migrateLocalStorage();

  const defaultUrl = (() => {
    // Desktop app connects to the local OpenCode engine.
    if (isTauriRuntime()) return "http://127.0.0.1:4096";

    // When running the web UI against a do-what server (e.g. Docker dev stack),
    // use the server's `/opencode` proxy instead of loopback.
    const doWhatUrl =
      typeof import.meta.env?.VITE_DOWHAT_URL === "string"
        ? import.meta.env.VITE_DOWHAT_URL.trim()
        : "";
    if (doWhatUrl) {
      return `${doWhatUrl.replace(/\/+$/, "")}/opencode`;
    }

    // When the UI is served by the do-what server (Docker "remote" mode),
    // OpenCode is proxied at same-origin `/opencode`.
    if (import.meta.env.PROD && typeof window !== "undefined") {
      return `${window.location.origin}/opencode`;
    }

    // Dev fallback (Vite) - allow overriding for remote debugging.
    const envUrl =
      typeof import.meta.env?.VITE_OPENCODE_URL === "string"
        ? import.meta.env.VITE_OPENCODE_URL.trim()
        : "";
    return envUrl || "http://127.0.0.1:4096";
  })();

  return (
    <ServerProvider defaultUrl={defaultUrl}>
      <GlobalSDKProvider>
        <GlobalSyncProvider>
          <LocalProvider>
            <App />
          </LocalProvider>
        </GlobalSyncProvider>
      </GlobalSDKProvider>
    </ServerProvider>
  );
}
