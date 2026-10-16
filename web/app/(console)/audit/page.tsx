"use client";
import Link from "next/link";
import { PageIntro, Term } from "@/components/app/Help";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, Loading, OrganTag, PageHeader, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useResource } from "@/lib/data/source";
import { useProgram } from "@/lib/program";
import { organOfLoop } from "@/lib/organs";
import type { BackendEvent } from "@/lib/data/types";
import { useWorkspace, type Actor } from "@/lib/data/workspace";
import { ACTOR_LABEL, actorOf, fmtTime } from "@/lib/data/derive";

type Row = { id: string; at: number; text: string; type: string; actor: Actor; who: string; refs: string[]; evidence: string; review: string; source: "backend" | "browser"; simulated: boolean; organ: string };
const TYPE_LABEL: Record<string, string> = { info: "Pool", plan: "Matching", intake: "Intake", ok: "Check passed", fail: "Check failed", committee: "Committee", integrity: "Integrity", medication: "Medication", decision: "Decision", simulation: "Simulation" };

export default function AuditPage() {
  return <Suspense fallback={<Loading rows={8} />}><Audit /></Suspense>;
}

function Audit() {
  const { organ, view, includes } = useProgram();
  // Events come tagged with their program by the API ("shared" when an event spans programs).
  const ev = useResource<BackendEvent[]>(`audit:${organ ?? "all"}`, (a) => a.audit(organ), 3000);
  const ws = useWorkspace();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("ref") ?? "");
  const [actor, setActor] = useState(params.get("actor") ?? "");
  const [type, setType] = useState("");
  const [review, setReview] = useState("");

  const rows: Row[] = useMemo(() => {
    const refs = (t: string) => [...new Set(t.match(/\b(?:[SL]-\d{4}(?:-FB)?|P-\d{4}|SIM-[\w-]+)\b/g) ?? [])];
    // A browser-recorded simulation step belongs to the program of the loop it replays.
    const localOrgan = (r: string[], text: string) => r.map((x) => organOfLoop(x.replace(/^SIM-/, ""))?.name).find(Boolean) ?? (/^Liver /.test(text) ? "liver" : /^Kidney /.test(text) ? "kidney" : "shared");
    const backend: Row[] = (ev.data ?? []).map((e) => {
      const a = actorOf(e.agent);
      return {
        id: `b${e.seq}`, at: e.at, text: e.text, type: e.kind, actor: a, who: e.agent, refs: refs(e.text), source: "backend", simulated: a === "agent", organ: e.organ ?? "shared",
        evidence: `Event #${e.seq} · Q18_events_since`, review: a === "user" ? "Approved" : e.kind === "plan" && /repair/i.test(e.text) ? "Awaiting review" : "Not required",
      };
    });
    const local: Row[] = ws.audit.map((e) => ({
      id: e.id, at: e.at, text: e.text, type: e.type, actor: e.actor, who: e.actor === "user" ? "Meera Iyer" : e.simulated ? "Simulation" : "KindRed",
      refs: [...new Set([...(e.ref ? [e.ref] : []), ...refs(e.text)])], source: "browser", simulated: !!e.simulated, evidence: "Recorded in this browser",
      organ: localOrgan([...(e.ref ? [e.ref] : []), ...refs(e.text)], e.text),
      review: e.review === "approved" ? "Approved" : e.review === "declined" ? "Declined" : e.review === "reviewed" ? "Reviewed" : e.review === "pending" ? "Awaiting review" : "Not required",
    }));
    return [...backend, ...local].filter((r) => r.organ === "shared" || includes(r.organ)).sort((a, b) => b.at - a.at);
  }, [ev.data, ws.audit, includes]);

  const shown = rows.filter((r) =>
    (!q || r.text.toLowerCase().includes(q.toLowerCase()) || r.refs.some((x) => x.toLowerCase().includes(q.toLowerCase())) || r.who.toLowerCase().includes(q.toLowerCase())) &&
    (!actor || r.actor === actor) && (!type || r.type === type) && (!review || r.review === review));
  const types = [...new Set(rows.map((r) => r.type))];
  const reviews = [...new Set(rows.map((r) => r.review))];

  return (
    <div>
      <PageHeader title={view ? `${view.label} audit trail` : "Audit trail"} />
      <PageIntro id="audit" what={<>Every agent action and every person&rsquo;s decision, in order, as recorded in the graph.</>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <label className="flex items-center gap-2 input !py-1.5 flex-1 min-w-[14rem] max-w-md">
          <Icon name="search" size={16} className="muted" /><span className="sr-only">Search events</span>
          <input className="bg-transparent outline-none w-full text-sm" placeholder="Search text, S-0076, L-0034, P-0377…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label><span className="sr-only">Actor</span>
          <select className="input" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Any actor</option>
            {(["user", "system", "agent"] as Actor[]).map((a) => <option key={a} value={a}>{ACTOR_LABEL[a]}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Event type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any type</option>
            {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Review status</span>
          <select className="input" value={review} onChange={(e) => setReview(e.target.value)}>
            <option value="">Any review status</option>
            {reviews.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        {(q || actor || type || review) && <button className="btn btn-sm" onClick={() => { setQ(""); setActor(""); setType(""); setReview(""); }}>Clear filters</button>}
      </div>

      {ev.error && !ev.data ? <ErrorState error={ev.error} onRetry={ev.reload} what="the event log" /> : !ev.data ? <Loading rows={8} /> :
        shown.length === 0 ? <EmptyState title="No events match these filters" /> : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead><tr><th>Time</th><th>Event</th>{!view && <th>Program</th>}<th>Actor</th><th>References</th><th>Review</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="tnum text-sm whitespace-nowrap">{fmtTime(r.at)}</td>
                  <td className="text-sm min-w-[18rem]">
                    <span className="text-xs font-semibold uppercase tracking-wide muted">{TYPE_LABEL[r.type] ?? r.type}</span>
                    <span className="block" style={{ color: r.type === "fail" ? "var(--bad)" : "var(--ink-strong)" }}>{r.text}</span>
                  </td>
                  {!view && <td>{r.organ === "shared" ? <span className="text-xs muted">Shared</span> : <OrganTag organ={r.organ} />}</td>}
                  <td className="text-sm whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={r.actor === "user" ? "user" : r.actor === "system" ? "database" : "swaps"} size={14} />
                      {ACTOR_LABEL[r.actor]}
                    </span>
                    <span className="block text-xs muted">{r.who}</span>
                  </td>
                  <td className="text-sm whitespace-nowrap">{r.refs.length ? r.refs.map((x) => /^[SL]-\d{4}$/.test(x) ? <Link key={x} className="block hover:underline" href={`/swaps/${x}`}>{x}</Link> : x.startsWith("P-") ? <Link key={x} className="block hover:underline" href={`/pool?pair=${x}`}>{x}</Link> : <span key={x} className="block">{x}</span>) : <span className="muted">–</span>}</td>
                  <td>{r.review === "Awaiting review" ? <Tag tone="warn">{r.review}</Tag> : r.review === "Approved" || r.review === "Reviewed" ? <Tag tone="ok">{r.review}</Tag> : r.review === "Declined" ? <Tag tone="bad">{r.review}</Tag> : <span className="text-sm muted">{r.review}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs muted">
        <span>{shown.length} of {rows.length} events</span>
      </div>
    </div>
  );
}
