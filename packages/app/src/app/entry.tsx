import App from "./app";
import { GlobalSDKProvider } from "./context/global-sdk";
import { GlobalSyncProvider } from "./context/global-sync";
import { LocalProvider } from "./context/local";
import { ServerProvider } from "./context/server";
import { isTauriRuntime } from "./utils";

function migrateLocalStorage() {
  if (typeof window === "undefined") return;
  const markerKey = "dowhat.__migrated";
  try {
    if (window.localStorage.getItem(markerKey)) return;

    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      const value = window.localStorage.getItem(key);
      if (value === null) continue;

      if (key.startsWith("openwork.")) {
        window.localStorage.setItem(key.replace("openwork.", "dowhat."), value);
        continue;
      }
      if (key === "openwork_mode_pref") {
        window.localStorage.setItem("dowhat_mode_pref", value);
        continue;
      }
      if (key.startsWith("openwork.global.dat:")) {
        window.localStorage.setItem(key.replace("openwork.global.dat:", "dowhat.global.dat:"), value);
        continue;
      }
      if (key.startsWith("openwork.workspace.")) {
        window.localStorage.setItem(key.replace("openwork.workspace.", "dowhat.workspace."), value);
      }
    }

    window.localStorage.setItem(markerKey, "1");
  } catch {
    // ignore migration failures to avoid blocking app startup.
  }
}

export default function AppEntry() {
  migrateLocalStorage();

  const defaultUrl = (() => {
    // Desktop app connects to the local OpenCode engine.
    if (isTauriRuntime()) return "http://127.0.0.1:4096";

    // When running the web UI against a do-what server (e.g. Docker dev stack),
    // use the server's `/opencode` proxy instead of loopback.
    const doWhatUrl =
      typeof import.meta.env?.VITE_OPENWORK_URL === "string"
        ? import.meta.env.VITE_OPENWORK_URL.trim()
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
