"use client";
// Simulation-lab runs are replays, not backend actions, so their steps are logged here (in this browser)
// and merged into the audit trail next to the backend's own events.
import { useSyncExternalStore } from "react";

export type Actor = "user" | "system" | "agent";
export type LocalEvent = {
  id: string; at: number; type: string; actor: Actor; text: string;
  ref?: string; review?: "approved" | "declined" | "reviewed" | "pending" | "n/a"; simulated?: boolean;
};
export type Workspace = { audit: LocalEvent[] };

const KEY = "kindred.workspace.v2";
const EMPTY: Workspace = { audit: [] };
let state: Workspace = EMPTY;
let loaded = false;
const subs = new Set<() => void>();

function hydrate() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* storage blocked or corrupt: start empty */ }
}
function commit(next: Workspace) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: keep in memory */ }
  subs.forEach((f) => f());
}
const uid = () => `L-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const workspace = {
  get: () => { hydrate(); return state; },
  subscribe(f: () => void) { hydrate(); subs.add(f); return () => { subs.delete(f); }; },
  log(e: Omit<LocalEvent, "id" | "at">) {
    commit({ ...state, audit: [{ ...e, id: uid(), at: Date.now() }, ...state.audit].slice(0, 300) });
  },
};

export function useWorkspace(): Workspace {
  return useSyncExternalStore(workspace.subscribe, workspace.get, () => EMPTY);
}
