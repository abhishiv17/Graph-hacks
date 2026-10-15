"use client";
// Which transplant program the workspace is showing: one organ, or "all" (an operational overview that lists both
// programs side by side; it never merges them into one compatibility graph). Every console screen reads this, so
// switching programs changes the data, the columns, the words and the scenario, not just a colour.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ORGANS, ORGAN_NAMES, type OrganName, type OrganView } from "./organs";

export type ProgramKey = OrganName | "all";
const KEY = "kindred.program";

type Ctx = {
  program: ProgramKey;
  setProgram: (p: ProgramKey) => void;
  /** The organ to query for, or null for every program. */
  organ: OrganName | null;
  view: OrganView | null;
  /** Rows (loops, pairs, events) that belong to the current program. */
  includes: (organ?: string | null) => boolean;
};
const ProgramCtx = createContext<Ctx | null>(null);

const valid = (v: string | null): v is ProgramKey => v === "all" || ORGAN_NAMES.includes(v as OrganName);

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const [program, setState] = useState<ProgramKey>("all");
  useEffect(() => {
    // A ?program= link wins over the remembered choice.
    const url = new URLSearchParams(window.location.search).get("program");
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    const next = valid(url) ? url : valid(saved) ? saved : null;
    if (next) setState(next);
    // Remember a linked program too, so the next screen opened without ?program= stays on it.
    if (valid(url) && url !== saved) {
      try { localStorage.setItem(KEY, url); } catch { /* storage blocked */ }
    }
  }, []);
  const setProgram = useCallback((p: ProgramKey) => {
    setState(p);
    try { localStorage.setItem(KEY, p); } catch { /* storage blocked: keep in memory */ }
  }, []);
  const value = useMemo<Ctx>(() => {
    const organ = program === "all" ? null : program;
    return {
      program, setProgram, organ, view: organ ? ORGANS[organ] : null,
      includes: (o) => organ === null || (o ?? "kidney") === organ,
    };
  }, [program, setProgram]);
  return <ProgramCtx.Provider value={value}>{children}</ProgramCtx.Provider>;
}

export function useProgram() {
  const c = useContext(ProgramCtx);
  if (!c) throw new Error("useProgram must be used inside <ProgramProvider>");
  return c;
}

export const PROGRAM_LABEL: Record<ProgramKey, string> = { all: "All programs", kidney: "Kidney", liver: "Liver" };
