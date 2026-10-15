"use client";
import Link from "next/link";
import { PageIntro, Term } from "@/components/app/Help";
import { useState } from "react";
import { EmptyState, ErrorState, Loading, PageHeader, StatusPill } from "@/components/app/ui";
import { usePool } from "@/lib/data/hooks";
import { fmtTime, loopRoute, pct, STATUS } from "@/lib/data/derive";

const ORDER = ["broken", "testing", "offered", "selected", "committee", "locked"];

export default function Swaps() {
  const pool = usePool();
  const [status, setStatus] = useState("");
  const tasks = new Set((pool.data?.open_tasks ?? []).map((t) => t.loop_id));
  const loops = [...(pool.data?.loops ?? [])]
    .filter((l) => !status || l.status === status || (status === "repair" && tasks.has(l.loop_id)))
    .sort((a, b) => Number(tasks.has(b.loop_id)) - Number(tasks.has(a.loop_id)) || ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const counts = (pool.data?.loops ?? []).reduce<Record<string, number>>((m, l) => ({ ...m, [l.status]: (m[l.status] ?? 0) + 1 }), {});

  return (
    <div>
      <PageHeader title="Swaps" description="Every swap in this week's plan. Swaps with a failed link or a repair waiting for your review come first." />
      <PageIntro id="swaps" what={<>A <Term k="swap">swap</Term> is a ring of families who trade donors. Each one moves through the same steps: offers to every hospital, a <Term k="crossmatch">lab crossmatch</Term> per donation, then the legal <Term k="committee">committee</Term>, then surgery. Open a swap to run its lab tests, review a repair, or see its papers.</>} />
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by status">
        {[["", "All", pool.data?.loops.length], ["repair", "Repair awaiting review", tasks.size], ...ORDER.filter((s) => counts[s]).map((s) => [s, STATUS[s].label, counts[s]])].map(([k, label, n]) => (
          <button key={String(k)} className="btn btn-sm" aria-pressed={status === k}
                  style={status === k ? { background: "var(--sage)", borderColor: "var(--forest-mid)", color: "var(--forest)" } : undefined}
                  onClick={() => setStatus(String(k))}>{label} <span className="muted tnum">{n ?? 0}</span></button>
        ))}
      </div>
      {pool.error && !pool.data ? <ErrorState error={pool.error} onRetry={pool.reload} what="the exchanges" /> : !pool.data ? <Loading rows={6} /> :
        loops.length === 0 ? <EmptyState title="No exchanges match">Try another status, or load the demo pool from the Live pool screen.</EmptyState> : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead><tr><th>Exchange</th><th>Route</th><th>Status</th><th>p(all succeed)</th><th>Expected</th><th>Created</th></tr></thead>
            <tbody>
              {loops.map((l) => (
                <tr key={l.loop_id}>
                  <td><Link className="font-semibold hover:underline" style={{ color: "var(--forest)" }} href={`/swaps/${l.loop_id}`}>{l.loop_id}</Link><span className="block text-xs muted">{l.kind}{l.has_fallback ? " · fallback stored" : ""}</span></td>
                  <td>{loopRoute(l)}{l.replaced_by && <span className="block text-xs muted">replaced by {l.replaced_by}</span>}</td>
                  <td><StatusPill status={l.status} repairReady={tasks.has(l.loop_id)} /></td>
                  <td className="tnum">{pct(l.p_success)}</td>
                  <td className="tnum">{l.expected_tx} of {l.pairs.length}</td>
                  <td className="tnum text-sm muted whitespace-nowrap">{fmtTime(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
