"use client";
import { useState } from "react";
import { useQueries } from "@/lib/data/hooks";
import type { Ran } from "@/lib/api";

/** Read-only list of the named Cypher queries behind a view, with their latency. */
export default function CypherPanel({ ran, title = "Graph queries behind this view" }: { ran?: Ran[]; title?: string }) {
  const q = useQueries();
  const [open, setOpen] = useState<string | null>(null);
  const seen = new Map<string, Ran>();
  (ran ?? []).forEach((r) => seen.set(r.query, r));
  return (
    <details className="panel group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3">
        <span className="font-semibold text-sm" style={{ color: "var(--ink-strong)" }}>{title}</span>
        <span className="text-xs muted">{seen.size} named {seen.size === 1 ? "query" : "queries"} · read-only</span>
      </summary>
      <ul className="border-t divide-y" style={{ borderColor: "var(--line)" }}>
        {[...seen.values()].map((r) => (
          <li key={r.query} className="px-4 py-2">
            <button className="w-full text-left text-sm flex justify-between gap-3" aria-expanded={open === r.query} onClick={() => setOpen(open === r.query ? null : r.query)}>
              <code style={{ color: "var(--forest)" }}>{r.query}</code><span className="muted tnum text-xs">{r.ms} ms · {r.graph}</span>
            </button>
            {open === r.query && (
              <pre className="mt-2 mb-1 text-xs p-3 rounded-md overflow-x-auto" style={{ background: "var(--sage-pale)", color: "var(--ink-strong)" }}>
                {q.data?.[r.query] ?? (q.error ? "Query text unavailable." : "Loading…")}
              </pre>
            )}
          </li>
        ))}
        {seen.size === 0 && <li className="px-4 py-3 text-sm muted">No queries recorded for this view.</li>}
      </ul>
    </details>
  );
}
