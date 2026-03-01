import { createContext, createEffect, createMemo, createSignal, onCleanup, useContext, type ParentProps } from "solid-js";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { isTauriRuntime } from "../utils";

export function normalizeServerUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return;
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function serverDisplayName(url: string) {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

type ServerContextValue = {
  url: string;
  name: string;
  list: string[];
  healthy: () => boolean | undefined;
  setActive: (url: string) => void;
  add: (url: string) => void;
  remove: (url: string) => void;
};

const ServerContext = createContext<ServerContextValue | undefined>(undefined);

const SERVER_LIST_KEY = "dowhat.server.list";
const SERVER_ACTIVE_KEY = "dowhat.server.active";
const SERVER_TOKEN_KEY = "dowhat.server.token";
const LEGACY_SERVER_LIST_KEY = "openwork.server.list";
const LEGACY_SERVER_ACTIVE_KEY = "openwork.server.active";
const LEGACY_SERVER_TOKEN_KEY = "openwork.server.token";

export function ServerProvider(props: ParentProps & { defaultUrl: string }) {
  const [list, setList] = createSignal<string[]>([]);
  const [active, setActiveRaw] = createSignal("");
  const [healthy, setHealthy] = createSignal<boolean | undefined>(undefined);
  const [ready, setReady] = createSignal(false);

  const readStoredList = () => {
    try {
      const raw =
        window.localStorage.getItem(SERVER_LIST_KEY) ??
        window.localStorage.getItem(LEGACY_SERVER_LIST_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  };

  const readStoredActive = () => {
    try {
      const stored =
        window.localStorage.getItem(SERVER_ACTIVE_KEY) ??
        window.localStorage.getItem(LEGACY_SERVER_ACTIVE_KEY);
      return typeof stored === "string" ? stored : "";
    } catch {
      return "";
    }
  };

  createEffect(() => {
    if (typeof window === "undefined") return;
    if (ready()) return;

    const fallback = normalizeServerUrl(props.defaultUrl) ?? "";

    // In production web builds served by OpenWork (Docker "remote" mode), OpenCode
    // traffic should go through the server proxy (usually same-origin `/opencode`).
    // Do not reuse any persisted localhost targets.
    const forceProxy =
      !isTauriRuntime() &&
      (import.meta.env.PROD ||
        (typeof import.meta.env?.VITE_OPENWORK_URL === "string" &&
          import.meta.env.VITE_OPENWORK_URL.trim().length > 0));
    if (forceProxy && fallback) {
      setList([fallback]);
      setActiveRaw(fallback);
      setReady(true);
      return;
    }

    const storedList = readStoredList();
    const storedActive = normalizeServerUrl(readStoredActive());

    const initialList = storedList.length ? storedList : fallback ? [fallback] : [];
    const initialActive = storedActive || initialList[0] || fallback || "";

    setList(initialList);
    setActiveRaw(initialActive);
    setReady(true);
  });

  createEffect(() => {
    if (!ready()) return;
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(SERVER_LIST_KEY, JSON.stringify(list()));
      window.localStorage.setItem(SERVER_ACTIVE_KEY, active());
      window.localStorage.removeItem(LEGACY_SERVER_LIST_KEY);
      window.localStorage.removeItem(LEGACY_SERVER_ACTIVE_KEY);
    } catch {
      // ignore
    }
  });

  const activeUrl = createMemo(() => active());

  const readOpenworkToken = () => {
    try {
      return (
        window.localStorage.getItem(SERVER_TOKEN_KEY) ??
        window.localStorage.getItem(LEGACY_SERVER_TOKEN_KEY) ??
        ""
      ).trim();
    } catch {
      return "";
    }
  };

  const checkHealth = async (url: string) => {
    if (!url) return false;
    const token = readOpenworkToken();
    const headers = token && url.includes("/opencode") ? { Authorization: `Bearer ${token}` } : undefined;
    const client = createOpencodeClient({
      baseUrl: url,
      headers,
      signal: AbortSignal.timeout(3000),
      fetch: isTauriRuntime() ? tauriFetch : undefined,
    });
    return client.global
      .health()
      .then((result) => result.data?.healthy === true)
      .catch(() => false);
  };

  createEffect(() => {
    const url = activeUrl();
    if (!url) return;

    setHealthy(undefined);

    let activeRun = true;
    let busy = false;

    const run = () => {
      if (busy) return;
      busy = true;
      void checkHealth(url)
        .then((next) => {
          if (!activeRun) return;
          setHealthy(next);
        })
        .finally(() => {
          busy = false;
        });
    };

    run();
    const interval = window.setInterval(run, 10_000);

    onCleanup(() => {
      activeRun = false;
      window.clearInterval(interval);
    });
  });

  const setActive = (input: string) => {
    const next = normalizeServerUrl(input);
    if (!next) return;
    setActiveRaw(next);
  };

  const add = (input: string) => {
    const next = normalizeServerUrl(input);
    if (!next) return;

    setList((current) => {
      if (current.includes(next)) return current;
      return [...current, next];
    });
    setActiveRaw(next);
  };

  const remove = (input: string) => {
    const next = normalizeServerUrl(input);
    if (!next) return;

    setList((current) => current.filter((item) => item !== next));
    setActiveRaw((current) => {
      if (current !== next) return current;
      const remaining = list().filter((item) => item !== next);
      return remaining[0] ?? "";
    });
  };

  const value: ServerContextValue = {
    get url() {
      return activeUrl();
    },
    get name() {
      return serverDisplayName(activeUrl());
    },
    get list() {
      return list();
    },
    healthy,
    setActive,
    add,
    remove,
  };

  return <ServerContext.Provider value={value}>{props.children}</ServerContext.Provider>;
}

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error("Server context is missing");
  }
  return context;
}
