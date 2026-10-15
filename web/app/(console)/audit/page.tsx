"use client";
import Link from "next/link";
import { PageIntro, Term } from "@/components/app/Help";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, Loading, PageHeader, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useEvents } from "@/lib/data/hooks";
import { useWorkspace, type Actor } from "@/lib/data/workspace";
import { ACTOR_LABEL, actorOf, fmtTime } from "@/lib/data/derive";

type Row = { id: string; at: number; text: string; type: string; actor: Actor; who: string; refs: string[]; evidence: string; review: string; source: "backend" | "browser"; simulated: boolean };
const TYPE_LABEL: Record<string, string> = { info: "Pool", plan: "Matching", intake: "Intake", ok: "Check passed", fail: "Check failed", committee: "Committee", integrity: "Integrity", medication: "Medication", decision: "Decision", simulation: "Simulation" };

export default function AuditPage() {
  return <Suspense fallback={<Loading rows={8} />}><Audit /></Suspense>;
}

function Audit() {
  const ev = useEvents();
  const ws = useWorkspace();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("ref") ?? "");
  const [actor, setActor] = useState(params.get("actor") ?? "");
  const [type, setType] = useState("");
  const [review, setReview] = useState("");

  const rows: Row[] = useMemo(() => {
    const refs = (t: string) => [...new Set(t.match(/\b(?:S-\d{4}(?:-FB)?|P-\d{4}|SIM-[\w-]+)\b/g) ?? [])];
    const backend: Row[] = (ev.data ?? []).map((e) => {
      const a = actorOf(e.agent);
      return {
        id: `b${e.seq}`, at: e.at, text: e.text, type: e.kind, actor: a, who: e.agent, refs: refs(e.text), source: "backend", simulated: a === "agent",
        evidence: `Event #${e.seq} · Q18_events_since`, review: a === "user" ? "Approved" : e.kind === "plan" && /repair/i.test(e.text) ? "Awaiting review" : "Not required",
      };
    });
    const local: Row[] = ws.audit.map((e) => ({
      id: e.id, at: e.at, text: e.text, type: e.type, actor: e.actor, who: e.actor === "user" ? "Meera Iyer" : e.simulated ? "Simulation" : "KindRed",
      refs: [...new Set([...(e.ref ? [e.ref] : []), ...refs(e.text)])], source: "browser", simulated: !!e.simulated, evidence: "Recorded in this browser",
      review: e.review === "approved" ? "Approved" : e.review === "declined" ? "Declined" : e.review === "reviewed" ? "Reviewed" : e.review === "pending" ? "Awaiting review" : "Not required",
    }));
    return [...backend, ...local].sort((a, b) => b.at - a.at);
  }, [ev.data, ws.audit]);

  const shown = rows.filter((r) =>
    (!q || r.text.toLowerCase().includes(q.toLowerCase()) || r.refs.some((x) => x.toLowerCase().includes(q.toLowerCase())) || r.who.toLowerCase().includes(q.toLowerCase())) &&
    (!actor || r.actor === actor) && (!type || r.type === type) && (!review || r.review === review));
  const types = [...new Set(rows.map((r) => r.type))];
  const reviews = [...new Set(rows.map((r) => r.review))];

  return (
    <div>
      <PageHeader title="Audit trail" description="Every event in order: what the system did, what the agents proposed, and what a coordinator decided." />
      <PageIntro id="audit" what={<>Nothing in KindRed happens silently. Every agent action and every human decision is written to the graph as an <code>Event</code> or a <code>Decision</code> node linked to the facts it was based on. This is the agents&rsquo; shared memory, and the record a regulator or committee would read.</>}
        steps={[<>Filter by who acted: an agent, the system, or a coordinator.</>, <>Agents keep working on their own (reminders, overdue tests), so new rows appear without anyone clicking.</>]} />
      <div className="flex flex-wrap gap-2 mb-4">
        <label className="flex items-center gap-2 input !py-1.5 flex-1 min-w-[14rem] max-w-md">
          <Icon name="search" size={16} className="muted" /><span className="sr-only">Search events</span>
          <input className="bg-transparent outline-none w-full text-sm" placeholder="Search text, S-0076, P-0377…" value={q} onChange={(e) => setQ(e.target.value)} />
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
            <thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>References</th><th>Review</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="tnum text-sm whitespace-nowrap">{fmtTime(r.at)}</td>
                  <td className="text-sm min-w-[18rem]">
                    <span className="text-xs font-semibold uppercase tracking-wide muted">{TYPE_LABEL[r.type] ?? r.type}</span>
                    <span className="block" style={{ color: r.type === "fail" ? "var(--bad)" : "var(--ink-strong)" }}>{r.text}</span>
                  </td>
                  <td className="text-sm whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={r.actor === "user" ? "user" : r.actor === "system" ? "database" : "swaps"} size={14} />
                      {ACTOR_LABEL[r.actor]}
                    </span>
                    <span className="block text-xs muted">{r.who}</span>
                  </td>
                  <td className="text-sm whitespace-nowrap">{r.refs.length ? r.refs.map((x) => x.startsWith("S-") && !x.endsWith("-FB") ? <Link key={x} className="block hover:underline" href={`/swaps/${x}`}>{x}</Link> : x.startsWith("P-") ? <Link key={x} className="block hover:underline" href={`/pool?pair=${x}`}>{x}</Link> : <span key={x} className="block">{x}</span>) : <span className="muted">–</span>}</td>
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
