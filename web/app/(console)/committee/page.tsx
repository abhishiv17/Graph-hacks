"use client";
import Link from "next/link";
import { useState } from "react";
import { PageIntro, Term } from "@/components/app/Help";
import { ErrorState, Kpis, Loading, OrganTag, StatusPill, Tag } from "@/components/app/ui";
import { useProgram } from "@/lib/program";
import type { Checklist } from "@/lib/data/types";
import { Icon } from "@/components/app/icons";
import CypherPanel from "@/components/CypherPanel";
import { useCommittee } from "@/lib/data/hooks";
import { docName, loopRoute } from "@/lib/data/derive";

function Readiness({ c }: { c?: Checklist }) {
  if (!c) return <span className="muted">–</span>;
  return (
    <span className="inline-flex items-center gap-2" title={`${c.done} of ${c.total} checklist items complete`}>
      <span className="h-1.5 w-16 rounded-full" style={{ background: "var(--surface-soft)" }}><span className="block h-full rounded-full" style={{ width: `${c.readiness_pct}%`, background: c.readiness_pct === 100 ? "var(--ok)" : "var(--forest-mid)" }} /></span>
      <span className="text-xs tnum">{c.readiness_pct}%</span>
    </span>
  );
}

export default function CommitteePage() {
  const res = useCommittee();
  const { view, includes } = useProgram();
  const [open, setOpen] = useState<string | null>(null);
  const loops: any[] = (res.data?.loops ?? []).filter((l: any) => includes(l.organ));
  const blocked = loops.filter((l) => !l.ready);
  const missingFamilies = loops.flatMap((l) => l.committee?.pairs ?? []).filter((p: any) => p.missing.length > 0);
  const soonest = blocked.map((l) => l.days_left).filter((d) => d !== null && d !== undefined).sort((a, b) => a - b)[0];

  return (
    <div>
      <h1 className="font-display text-[2.1rem] leading-none mb-4" style={{ color: "var(--ink-strong)" }}>{view ? `${view.label} committee review` : "Committee review"}</h1>
      <PageIntro id="committee"
        what={<>In India every swap needs approval from the <Term k="committee">Authorisation Committee</Term>, and each family has to submit its own papers. A swap can only go ahead when <strong>every</strong> family in it is approved, so one missing item holds everyone up. The Delhi High Court set a target of 6–8 weeks (42 days). Each program has its own checklist: {view?.name === "liver" ? <>the liver program asks for donor and recipient evaluation, the donor work-up (CT volumetry), anatomical review and surgical suitability review, plus the CT report and identity papers.</> : view?.name === "kidney" ? <>the kidney program asks for identity papers, the HLA report, blood-group cards, compatibility evidence and a negative lab crossmatch on every link.</> : <>kidney asks for the HLA report and negative lab crossmatches; liver asks for evaluations, the donor work-up, anatomical and surgical suitability review.</>} Checklists are program configuration, not clinical guidance.</>}
        steps={[
          <>Swaps that are held up come first. The family that is holding them up is marked in red.</>,
          <>Open a row to see each family&rsquo;s checklist (its program sets the items) and how many days are left.</>,
          <>The committee clerk agent reminds hospitals on its own as deadlines get closer; every reminder is in the audit trail.</>,
        ]} />

      {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} what="committee files" /> : !res.data ? <Loading rows={6} /> : (
        <>
          <div className="mb-6">
            <Kpis items={[
              { label: "Swaps waiting on papers", value: blocked.length, sub: `of ${loops.length} swaps in progress`, tone: blocked.length ? "warn" : undefined },
              { label: "Families with missing papers", value: missingFamilies.length },
              { label: "Closest deadline", value: soonest !== undefined ? `${soonest} ${soonest === 1 ? "day" : "days"}` : "–", sub: "until the 42-day target", tone: soonest !== undefined && soonest < 10 ? "bad" : undefined },
              { label: "Average checklist readiness", value: loops.length ? `${Math.round(loops.reduce((n: number, l: any) => n + (l.checklist?.readiness_pct ?? 0), 0) / loops.length)}%` : "–", sub: `${loops.length - blocked.length} swaps have every paper in` },
            ]} />
          </div>
          <div className="panel overflow-hidden">
            <table className="table">
              <thead><tr><th>Swap</th><th>Families</th><th>Status</th><th>Checklist</th><th>What&rsquo;s holding it up</th><th className="text-right">Days left</th><th /></tr></thead>
              <tbody>
                {[...loops].sort((a, b) => Number(a.ready) - Number(b.ready) || (a.days_left ?? 999) - (b.days_left ?? 999)).map((l) => {
                  const c = l.committee ?? { pairs: [] };
                  const block = c.pairs.find((p: any) => p.pair_id === c.blocking);
                  const isOpen = open === l.loop_id;
                  return [
                    <tr key={l.loop_id} className="cursor-pointer" onClick={() => setOpen(isOpen ? null : l.loop_id)} aria-expanded={isOpen}>
                      <td className="font-semibold tnum whitespace-nowrap"><Link href={`/swaps/${l.loop_id}`} className="hover:underline" style={{ color: "var(--forest)" }} onClick={(e) => e.stopPropagation()}>{l.loop_id}</Link>{!view && <span className="ml-2 align-middle"><OrganTag organ={l.organ} /></span>}</td>
                      <td className="text-sm">{loopRoute(l)}</td>
                      <td><StatusPill status={l.status} /></td>
                      <td><Readiness c={l.checklist} /></td>
                      <td className="text-sm">{l.ready ? <Tag tone="ok">All papers in</Tag> : block ? <span style={{ color: "var(--bad)" }}>{block.city} {block.pair_id}: {block.missing.map(docName).join(", ")}</span> : "–"}</td>
                      <td className="text-right tnum">{l.days_left ?? "–"}</td>
                      <td className="w-8 muted"><Icon name={isOpen ? "down" : "chevron"} size={15} /></td>
                    </tr>,
                    isOpen && (
                      <tr key={l.loop_id + "-x"}><td colSpan={7} style={{ background: "var(--surface-soft)" }}>
                        {l.checklist && (
                          <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2 pt-1 pb-3 text-sm">
                            {(l.checklist as Checklist).items.map((i) => (
                              <li key={i.key} className="flex gap-2">
                                <span style={{ color: i.done ? "var(--ok)" : "var(--warn)" }}><Icon name={i.done ? "check" : "alert"} size={14} /></span>
                                <span>{i.label}{!i.done && i.open.length > 0 && <span className="block text-xs muted">{i.open.slice(0, 2).join(" · ")}</span>}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <ul className="grid gap-3 md:grid-cols-3 py-1">
                          {c.pairs.map((p: any) => (
                            <li key={p.pair_id} className="rounded-lg border px-3 py-2.5" style={{ borderColor: p.pair_id === c.blocking ? "#e8c9c4" : "var(--line)", background: "var(--surface)" }}>
                              <p className="text-sm font-semibold" style={{ color: p.pair_id === c.blocking ? "var(--bad)" : "var(--ink-strong)" }}>{p.city} · {p.pair_id}{p.pair_id === c.blocking ? " · holding this swap" : ""}</p>
                              <p className="text-xs muted">{p.done}/{p.total} papers · day {p.day} of {p.target_days} · {p.approval_state.replace(/_/g, " ")}</p>
                              <ul className="mt-2 flex flex-wrap gap-1.5">
                                {p.documents.map((d: any) => <li key={d.type}><Tag tone={d.status === "verified" ? "ok" : "warn"}>{docName(d.type)}</Tag></li>)}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs muted">Names, documents and approval stages live in each hospital&rsquo;s private graph. Only the approval state and deadline are mirrored into the shared exchange graph.</p>
          <div className="mt-8"><CypherPanel ran={res.data.queries} title="FalkorDB queries behind this screen" /></div>
        </>
      )}
    </div>
  );
}
