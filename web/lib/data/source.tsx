"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiReachable, createLiveApi } from "@/lib/api";
import { createOfflineApi, offlineCapturedAt } from "./demo";
import type { Api } from "./types";

export type Mode = "checking" | "live" | "offline";
type Ctx = {
  mode: Mode;
  api: Api;
  /** Bumped after every action so views refetch. */
  version: number;
  refresh: () => void;
  retryLive: () => Promise<void>;
  capturedAt: number | null;
};
const DataCtx = createContext<Ctx | null>(null);
const live = createLiveApi();
const offline = createOfflineApi();

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("checking");
  const [version, setVersion] = useState(0);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);

  const check = useCallback(async () => {
    setMode("checking");
    const ok = await apiReachable();
    setMode(ok ? "live" : "offline");
    if (!ok) offlineCapturedAt().then(setCapturedAt).catch(() => {});
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => { check(); }, [check]);
  // While offline, look for the API quietly in the background and switch back to live data once it answers.
  useEffect(() => {
    if (mode !== "offline") return;
    const t = setInterval(async () => {
      if (await apiReachable()) { setMode("live"); setVersion((v) => v + 1); }
    }, 10_000);
    return () => clearInterval(t);
  }, [mode]);

  const value = useMemo<Ctx>(() => ({
    mode,
    api: mode === "live" ? live : offline,
    version,
    refresh: () => setVersion((v) => v + 1),
    retryLive: check,
    capturedAt,
  }), [mode, version, check, capturedAt]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData must be used inside <DataProvider>");
  return c;
}

export type Resource<T> = { data?: T; error: Error | null; loading: boolean; reload: () => void };

// Screens and the shell often ask for the same thing at once (the pool, especially). Share one request per
// key for a moment instead of hitting the API several times.
const inflight = new Map<string, { at: number; p: Promise<unknown> }>();
function shared<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit && Date.now() - hit.at < 1200) return hit.p as Promise<T>;
  const p = make();
  inflight.set(key, { at: Date.now(), p });
  p.catch(() => inflight.delete(key));
  return p;
}

/**
 * Fetch from whichever source is active. Polls only against the live API (the offline snapshot never changes
 * on its own). Keeps the last good data while refetching so screens don't flash.
 */
export function useResource<T>(key: string | null, fn: (api: Api) => Promise<T>, pollMs = 0): Resource<T> {
  const { mode, api, version } = useData();
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean }>({ error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (mode === "checking" || key === null) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    shared(`${mode}:${version}:${tick}:${key}`, () => fnRef.current(api))
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState((s) => ({ data: s.data, error: e instanceof Error ? e : new Error(String(e)), loading: false })));
    return () => { alive = false; };
  }, [key, mode, api, version, tick]);

  useEffect(() => {
    if (mode !== "live" || !pollMs || key === null) return;
    const t = setInterval(() => setTick((n) => n + 1), pollMs);
    return () => clearInterval(t);
  }, [mode, pollMs, key]);

  return { ...state, loading: state.loading || mode === "checking", reload: () => setTick((n) => n + 1) };
}

/** Run an action against the active source, then refresh every view. */
export function useAction() {
  const { api, refresh } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(label: string, fn: (api: Api) => Promise<T>): Promise<T | undefined> => {
    setBusy(label); setError(null);
    try {
      const r = await fn(api);
      refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [api, refresh]);
  return { run, busy, error, clearError: () => setError(null) };
}
