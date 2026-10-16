"use client";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ExchangeGraph, { GraphLegend, type GEdge, type GNode } from "@/components/app/ExchangeGraph";
import { EmptyState, ErrorState, Loading, PageHeader, Section, StatusPill, Tag } from "@/components/app/ui";
import { organOf } from "@/lib/organs";
import { useProgram } from "@/lib/program";
import type { Checklist, Evidence, Timeline } from "@/lib/data/types";
import { PageIntro, Term } from "@/components/app/Help";
import { families as nFamilies, plainCheck, plainFact, plainResult, swapName } from "@/lib/plain";
import Walkthrough from "@/components/app/Walkthrough";
import { swapWalk } from "@/lib/walkthrough";
import { Icon } from "@/components/app/icons";
import { useEvents, useLoop, usePool } from "@/lib/data/hooks";
import { useAction, useData } from "@/lib/data/source";
import { useWorkspace } from "@/lib/data/workspace";
import { ACTOR_LABEL, actorOf, docName, fmtDate, fmtTime, pct, route } from "@/lib/data/derive";

export default function ExchangeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const d = useLoop(id);
  const pool = usePool();
  const events = useEvents();
  const ws = useWorkspace();
  const act = useAction();
  const { mode } = useData();
  const program = useProgram();
  const router = useRouter();
  const [edge, setEdge] = useState<string | null>(null);
  const [showRepair, setShowRepair] = useState(true);

  const data = d.data;
  const prop = data?.proposal;
  const mine = !!prop && prop.broken_loop === id;
  const openRepair = mine && prop.status === "open";
  const declined = mine && prop.status === "declined";
  const repairReady = openRepair;

  const graph = useMemo(() => {
    if (!data) return null;
    const fams: any[] = data.families;
    const org = organOf(data.loop);
    const nodes: GNode[] = fams.map((f) => ({ id: f.pair_id, title: f.city, sub: f.pair_id, state: openRepair && prop.released.includes(f.pair_id) ? "released" : "active" }));
    const edges: GEdge[] = (data.links as any[]).map((l) => {
      const wf = (data.workflow as any[]).find((w) => w.from_pair === l.from_pair && w.to_pair === l.to_pair);
      const state: GEdge["state"] = l.status === "failed" ? "failed" : wf?.result === "negative" ? "viable" : wf?.result === "cancelled" ? "inactive" : "pending";
      return { from: l.from_pair, to: l.to_pair, state, key: `${l.from_pair}>${l.to_pair}`, label: l.status === "failed" ? `${wf?.antibody ?? "test"} ${org.outcome.positive}` : `${Math.round((l.p_success) * 100)}%` };
    });
    if (openRepair && showRepair && prop.recommended) {
      const rec = prop.recommended;
      const cities = rec.route.split(/ → | ⇄ /);
      rec.pairs.forEach((pid: string, i: number) => {
        if (!nodes.find((n) => n.id === pid)) nodes.push({ id: pid, title: cities[i] ?? pid, sub: pid, state: "candidate", x: 280, y: 318 });
        else nodes.find((n) => n.id === pid)!.state = "joined";
      });
      rec.pairs.forEach((pid: string, i: number) => {
        const to = rec.pairs[(i + 1) % rec.pairs.length];
        if (!edges.find((e) => e.from === pid && e.to === to && e.state !== "failed")) edges.push({ from: pid, to, state: "proposed", key: `rec:${pid}>${to}`, label: `${Math.round((rec.probs[i]) * 100)}%` });
      });
    }
    if (data.fallback && prop?.fallback && showRepair) {
      const [a, b] = prop.fallback.pairs;
      edges.push({ from: b, to: a, state: "fallback", key: `fb:${b}>${a}` });
    }
    return { nodes, edges };
  }, [data, openRepair, showRepair, prop]);

  if (d.error && !data) return <div><PageHeader title={id} /><ErrorState error={d.error} onRetry={d.reload} what={`exchange ${id}`} /></div>;
  if (!data) return <div><PageHeader title={id} description="Loading the exchange…" /><Loading rows={6} /></div>;

  const loop = data.loop;
  const o = organOf(loop);
  const fams: any[] = data.families;
  const failed = (data.links as any[]).find((l) => l.status === "failed");
  const pairIds = new Set(fams.map((f) => f.pair_id));

  const decline = async (reason: string) => { await act.run("decline", (a) => a.decline(prop.task_id, reason)); };
  const approve = async (choice: string) => {
    const r = await act.run(choice, (a) => a.approve(prop.task_id, choice));
    if (r?.loop_id) router.push(`/swaps/${r.loop_id}`);
  };

  const stream = [
    ...(data.decisions as any[]).map((x) => ({ at: x.at, who: x.made_by, actor: actorOf(x.made_by) === "user" || x.approved_by ? "user" as const : actorOf(x.made_by), text: `${x.action.replace(/_/g, " ")}: ${x.rationale}`, review: x.approved_by ? `approved by ${x.approved_by}` : null, src: "graph",
                                               read: ((x.read ?? []) as string[]).filter((l) => !l.startsWith("Read 0 ")) })),
    ...(events.data ?? []).filter((e) => e.text.includes(id) || [...pairIds].some((p) => e.text.includes(p))).map((e) => ({ at: e.at, who: e.agent, actor: actorOf(e.agent), text: e.text, review: null, src: "event" })),
    ...ws.audit.filter((e) => e.ref === id).map((e) => ({ at: e.at, who: "Meera Iyer", actor: "user" as const, text: e.text, review: e.review ?? null, src: "browser" })),
  ].sort((a, b) => b.at - a.at);

  const sel = edge && (data.links as any[]).find((l) => `${l.from_pair}>${l.to_pair}` === edge);
  const selWf = sel && (data.workflow as any[]).find((w) => w.from_pair === sel.from_pair && w.to_pair === sel.to_pair);

  return (
    <div>
      {program.organ && program.organ !== o.name && (
        <Notice tone="bad" icon="alert">
          {id} is a <strong>{o.exchange.toLowerCase()}</strong>, but the workspace is showing the {program.view?.label.toLowerCase()} program.{" "}
          <button className="font-semibold underline" onClick={() => program.setProgram(o.name)}>Switch to the {o.label.toLowerCase()} program</button>
        </Notice>
      )}
      <PageHeader title={swapName({ loop_id: id, organ: o.name }, fams.map((f) => f.city))}
        description={<>{id} · {nFamilies(loop.kind, fams.length)} · {route(fams.map((f) => f.city))} · {loop.status === "broken"
          ? <>a test failed, so this swap can&rsquo;t go ahead as planned</>
          : <>{pct(loop.p_success)} chance every test passes · about {Number(loop.expected_tx).toFixed(1)} of {fams.length} transplants expected</>}
          {data.replaces && <> · replaces <Link className="underline" href={`/swaps/${data.replaces}`}>{data.replaces}</Link></>}</>}
        actions={<>
          <StatusPill status={loop.status} repairReady={repairReady} />
          {loop.status === "testing" && (
            <button className="btn btn-primary" disabled={!!act.busy} onClick={() => act.run("lab", (a) => a.runLab(id))}>
              {act.busy === "lab" ? o.running : o.run}
            </button>
          )}
        </>} />
      <PageIntro id="swap" what={<>Each arrow is one donation: a donor gives {o.gift} to the next family&rsquo;s patient. Every donation is tested before surgery ({o.test}); if one fails, KindRed finds a replacement family and a person approves it.</>} />
      {act.error && <div className="mb-4"><ErrorState error={new Error(act.error)} what="that action" /></div>}

      {data.replaced_by && (
        <Notice tone="ok" icon="check">
          Replaced by <Link className="font-semibold underline" href={`/swaps/${data.replaced_by}`}>{data.replaced_by}</Link> after a coordinator approved the repair. This loop is kept for the record.
        </Notice>
      )}
      {failed && (
        <Notice tone="bad" icon="alert">
          <span className="font-semibold">A test failed: {failed.from_city} donor → {failed.to_city} patient.</span> {failed.failed_detail}. KindRed remembers this, so it never suggests that donation again.
        </Notice>
      )}

      {(openRepair || declined) && <RepairReview prop={prop} busy={act.busy} offline={mode === "offline"} onApprove={approve} onDecline={decline} />}
      {prop && prop.status === "done" && prop.broken_loop === id && (
        <Notice tone="ok" icon="check">Repair approved by the exchange coordinator. New exchange: <Link className="font-semibold underline" href={`/swaps/${prop.result}`}>{prop.result}</Link>.</Notice>
      )}

      <div className="mt-4">
        <Walkthrough load={(lang) => swapWalk(id, lang)} onStep={(st) => setEdge(st?.edges[0] ?? null)} label="Explain this swap, step by step" />
      </div>
      <div className="mt-6 grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-8">
        <Section title="Who gives to whom" description="Each circle is a family. Click an arrow to see why that donation works."
          actions={openRepair && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRepair} onChange={(e) => setShowRepair(e.target.checked)} /> Show proposed repair</label>}>
          <div className="rounded-2xl border p-2 sm:p-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            {graph && <ExchangeGraph idPrefix="ex" height={480} nodes={graph.nodes} edges={graph.edges} selected={edge} onSelectEdge={setEdge}
              onSelectNode={(p) => router.push(`/families/${p}`)}
              label={`Exchange ${id}. ${(data.links as any[]).map((l) => `${l.from_city} to ${l.to_city}${l.status === "failed" ? " failed" : ""}`).join(", ")}.`} />}
            <div className="px-1 pt-2"><GraphLegend items={openRepair ? ["viable", "pending", "failed", "proposed", "fallback"] : ["viable", "pending", "failed"]} /></div>
          </div>
        </Section>

        <Section title="Why this donation works">
          {!sel ? <EmptyState title="Pick a donation">Click an arrow, or choose one here:
            <span className="mt-3 flex flex-wrap justify-center gap-2">{(data.links as any[]).map((l) => <button key={l.pos} className="btn btn-sm" onClick={() => setEdge(`${l.from_pair}>${l.to_pair}`)}>{l.from_city} → {l.to_city}</button>)}</span>
          </EmptyState> : (
            <div className="panel p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>{sel.from_city} donor ({sel.donor_relation}) → {sel.to_city} patient</p>
                {sel.status === "failed" ? <Tag tone="bad">Failed</Tag> : selWf?.result === "negative" ? <Tag tone="ok">Test passed</Tag> : <Tag tone="warn">Test not done yet</Tag>}
              </div>
              <ul className="text-sm space-y-1">
                {(sel.reasons as string[]).map((r) => <li key={r} className="flex gap-2"><span style={{ color: "var(--ok)" }}><Icon name="check" size={14} /></span>{plainFact(r)}</li>)}
                {sel.failed_detail && <li style={{ color: "var(--bad)" }}>{sel.failed_detail}</li>}
              </ul>
              <p className="text-sm"><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{pct(sel.p_success)}</span> chance it works, from how often similar donations failed before.
                {" "}{selWf?.offered ? `${selWf.accepts} of 2 hospitals have said yes.` : "Hospitals not asked yet."}</p>
              <details className="text-xs muted"><summary className="cursor-pointer">Exact reasons stored in the graph</summary>
                <ul className="mt-1 list-disc pl-5">{(sel.reasons as string[]).map((r) => <li key={r}>{r}</li>)}<li>Donor {sel.donor_abo}, patient {sel.patient_abo}</li></ul>
              </details>
            </div>
          )}
        </Section>
      </div>

      {data.evidence && (
        <div className="mt-10 grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8">
          <EvidencePanel ev={data.evidence} cityOf={(pid) => fams.find((f) => f.pair_id === pid)?.city ?? pid} />
          <div className="space-y-8">
            {data.checklist && <ChecklistPanel c={data.checklist} label={o.label} />}
            {data.timeline && <TimelinePanel t={data.timeline} />}
          </div>
        </div>
      )}

      <div className="mt-10 grid xl:grid-cols-2 gap-8">
        <Section title="Families">
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>Family</th><th>Donor</th><th>Patient</th><th>Donor gives to</th></tr></thead>
              <tbody>
                {fams.map((f, i) => (
                  <tr key={f.pair_id}>
                    <td><Link className="font-semibold hover:underline" href={`/case/${f.pair_id}`}>{f.pair_id}</Link><span className="block text-xs muted">{f.city}</span></td>
                    <td className="text-sm">{f.donor_relation}, {f.donor_abo}{f.liver && <span className="block text-xs muted">liver {f.liver.liver_volume_ml} ml ({f.liver.volumetry === "estimate" ? "estimated, CT pending" : "CT"})</span>}<span className="block text-xs muted">can&rsquo;t give to own patient: {f.own_clash}</span></td>
                    <td className="text-sm">blood group {f.patient_abo}, {hardness(f)}{f.failed_count ? <span className="block text-xs" style={{ color: "var(--bad)" }}>{f.failed_count} earlier failed link(s)</span> : null}</td>
                    <td className="text-sm">{fams[(i + 1) % fams.length].city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Hospitals and tests">
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>Donation</th><th>Hospitals said yes</th><th>Test</th></tr></thead>
              <tbody>
                {(data.workflow as any[]).map((w) => (
                  <tr key={w.link}>
                    <td className="text-sm">{w.link}</td>
                    <td className="text-sm">{w.offered ? `${w.accepts} of 2${w.holds ? `, ${w.holds} waiting` : ""}` : "not asked yet"}</td>
                    <td>{!w.test ? <span className="muted">–</span> : w.result === "pending" ? <Tag tone="warn">Requested</Tag> : w.result === "cancelled" ? <Tag tone="neutral" title="Another link failed first, so this test was never sent">Not needed</Tag> : w.result === "positive" ? <Tag tone="bad">{o.failed} ({w.antibody})</Tag> : <Tag tone="ok">{o.outcome.negative[0].toUpperCase() + o.outcome.negative.slice(1)}</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="mt-10 grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-8">
        <Section title="What happened" description="Newest first.">
          {stream.length === 0 ? <EmptyState title="No events recorded for this exchange yet" /> : (
            <ol className="border-l-2 pl-5 space-y-4" style={{ borderColor: "var(--line)" }}>
              {stream.map((s, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2" style={{ background: s.actor === "user" ? "var(--forest)" : "var(--surface)", borderColor: s.actor === "user" ? "var(--forest)" : "var(--line-strong)" }} aria-hidden="true" />
                  <p className="text-sm"><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{s.who}</span> <span className="text-xs muted">· {ACTOR_LABEL[s.actor]} · {fmtTime(s.at)}</span></p>
                  <p className="text-sm muted">{s.text}</p>
                  {s.review && <p className="text-xs mt-0.5" style={{ color: s.review.startsWith("declined") ? "var(--bad)" : "var(--ok)" }}>{s.review}</p>}
                  {"read" in s && s.read && s.read.length > 0 && <p className="text-xs muted mt-0.5">{s.read.join(" · ")}</p>}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Committee papers" description="In India every family needs the legal committee's approval. One missing paper holds up the whole swap.">
          {data.committee?.blocking && <ChaseLadder pair={(data.committee.pairs as any[]).find((p) => p.pair_id === data.committee.blocking)} busy={act.busy}
            onChase={() => act.run("chase", (a) => a.chase(id))} />}
          <ul className="panel divide-y">
            {(data.committee?.pairs ?? []).map((p: any) => (
              <li key={p.pair_id} className="px-4 py-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold" style={{ color: p.pair_id === data.committee.blocking ? "var(--bad)" : "var(--ink-strong)" }}>{p.city} · {p.pair_id}{p.pair_id === data.committee.blocking ? " · blocking" : ""}</span>
                  <span className="muted tnum">{p.done}/{p.total} papers · day {p.day} of {p.target_days}</span>
                </div>
                {p.missing.length > 0 && <p className="text-xs mt-1" style={{ color: "var(--warn)" }}>Missing: {p.missing.map(docName).join(", ")}</p>}
              </li>
            ))}
          </ul>
        </Section>
      </div>

    </div>
  );
}

/** How hard this patient is to match, in words (the number stays for reviewers). */
function hardness(f: any) {
  if (f.meld != null) return f.meld >= 25 ? `very ill (MELD ${f.meld})` : `MELD ${f.meld}`;
  if (f.cpra != null) return f.cpra > 85 ? `hard to match (cPRA ${f.cpra}%)` : "easy to match";
  return "";
}

const APPROVAL_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { APPROVED: "ok", PENDING: "warn", DECLINED: "bad", NOT_APPLICABLE: "neutral" };

/** Every recommendation, traceable: the facts on its graph edge, the constraints it satisfies, what a person should
 *  look at, its test, and where it stands at the human review step. Nothing here is written by a language model. */
function EvidencePanel({ ev, cityOf }: { ev: Evidence; cityOf: (pid: string) => string }) {
  const [rules, setRules] = useState(false);
  const who = (edge: string) => edge.split(" → ").map(cityOf).join(" → ");
  return (
    <Section title="Why each donation was chosen" description="Every reason comes from the graph, not from AI.">
      <div className="space-y-3">
        {ev.proposal && (
          <div className="rounded-[10px] border-2 p-4" style={{ borderColor: "var(--forest-mid)", background: "var(--surface)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Proposed fix: {ev.proposal.route}</p>
              <Tag tone="warn">Needs a person&rsquo;s OK</Tag>
            </div>
            <ul className="mt-2 text-sm space-y-0.5">{ev.proposal.facts.map((f) => <li key={f}>{plainFact(f)}</li>)}</ul>
          </div>
        )}
        {ev.links.map((l, i) => (
          <div key={l.recommendation_id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Donation {i + 1}: {who(l.candidate_edge)}</p>
              {l.failure ? <Tag tone="bad">Failed</Tag>
                : <Tag tone={l.test.result === "negative" ? "ok" : "warn"}>Test {plainResult(l.test.result)}</Tag>}
            </div>
            <ul className="mt-2 text-sm space-y-0.5">{l.facts.map((f) => <li key={f}>{plainFact(f)}</li>)}</ul>
            {l.failure && <p className="mt-2 text-sm" style={{ color: "var(--bad)" }}>{l.failure.detail}</p>}
            <p className="mt-2 flex flex-wrap gap-1.5" aria-label="Checks passed">
              {l.constraints_satisfied.map((c) => <Tag key={c} tone="ok">{plainCheck(c)}</Tag>)}
            </p>
            <p className="mt-2 text-xs muted">
              {l.p_success != null ? `${Math.round(l.p_success * 100)}% chance it works · ` : ""}Committee approval: {l.human_approval.status === "APPROVED" ? "done" : "waiting"}
              {l.flags.length > 0 && <> · <span style={{ color: "var(--warn)" }}>{l.flags.map((f) => f.split(": ").slice(1).join(": ") || f).join("; ")}</span></>}
            </p>
          </div>
        ))}
        <button className="text-sm font-medium underline" style={{ color: "var(--forest)" }} onClick={() => setRules((r) => !r)} aria-expanded={rules}>
          {rules ? "Hide" : "Show"} the medical rules this program checks
        </button>
        {rules && (
          <ul className="panel divide-y">
            {ev.rules.map((r) => (
              <li key={r.code} className="px-4 py-2.5 text-sm">
                <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{plainCheck(r.code)}</span>: {r.text}
                <span className="block text-xs muted">Source: {r.source}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

/** The program's committee checklist for this swap. Kidney and liver check different things. */
function ChecklistPanel({ c, label }: { c: Checklist; label: string }) {
  return (
    <Section title="Ready for the committee?" description={`What the ${label.toLowerCase()} committee checks.`}>
      <div className="panel p-4">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full" style={{ background: "var(--surface-soft)" }} role="progressbar" aria-valuenow={c.readiness_pct} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness">
            <div className="h-full rounded-full" style={{ width: `${c.readiness_pct}%`, background: "var(--forest-mid)" }} />
          </div>
          <span className="text-sm font-semibold tnum" style={{ color: "var(--ink-strong)" }}>{c.readiness_pct}%</span>
        </div>
        <ul className="mt-3 space-y-2">
          {c.items.map((i) => (
            <li key={i.key} className="flex gap-2 text-sm">
              <span className="mt-0.5 shrink-0" style={{ color: i.done ? "var(--ok)" : "var(--warn)" }}><Icon name={i.done ? "check" : "alert"} size={15} /></span>
              <span>
                <span style={{ color: "var(--ink-strong)" }}>{i.label}</span>
                {!i.done && i.open.length > 0 && <span className="block text-xs muted">{i.open.slice(0, 3).join(" · ")}{i.open.length > 3 ? ` · +${i.open.length - 3} more` : ""}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/** Proposed planning steps from the program configuration. Synthetic dates; nothing is scheduled. */
function TimelinePanel({ t }: { t: Timeline }) {
  const DOTC: Record<string, string> = { done: "var(--forest-mid)", current: "var(--mint)", upcoming: "var(--line-strong)", paused: "var(--bad-mark)" };
  return (
    <Section title="Planned steps" description="Proposed dates (synthetic).">
      <ol className="panel p-4 space-y-3">
        {t.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3 text-sm">
            <span className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ background: DOTC[s.state], boxShadow: s.state === "current" ? "0 0 0 4px var(--sage)" : undefined }} aria-hidden="true" />
            <span className="flex-1">
              <span className={s.state === "upcoming" ? "muted" : "font-semibold"} style={{ color: s.state === "upcoming" ? undefined : "var(--ink-strong)" }}>{s.label}</span>
              <span className="sr-only"> ({s.state})</span>
            </span>
            <span className="text-xs muted tnum whitespace-nowrap">proposed {fmtDate(s.proposed_date)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2"><Tag tone="sim">Synthetic proposed dates</Tag></p>
    </Section>
  );
}

// Reasons that are the model's estimate rather than a recorded fact: the virtual crossmatch (kidney)
// or a liver volume estimated from height and weight.
const ESTIMATE = /virtual|estimated/;

function Notice({ tone, icon, children }: { tone: "ok" | "bad"; icon: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex gap-3 rounded-[10px] border px-4 py-3 text-sm" role="status"
         style={{ background: tone === "ok" ? "var(--ok-soft)" : "var(--bad-soft)", borderColor: tone === "ok" ? "#bfdcc8" : "#e8c9c4" }}>
      <span style={{ color: tone === "ok" ? "var(--ok)" : "var(--bad)" }}><Icon name={icon} size={18} /></span>
      <p>{children}</p>
    </div>
  );
}

const LADDER = ["Remind the hospital", "Alert the coordinator", "Notify the committee secretary"];
const DONE = ["Hospital reminded", "Coordinator alerted", "Secretary notified"];

function ChaseLadder({ pair, busy, onChase }: { pair: any; busy: string | null; onChase: () => void }) {
  const level: number = pair?.chase_level ?? 0;
  return (
    <div className="mb-3 rounded-[10px] border p-4" style={{ borderColor: "#ecd9b4", background: "var(--warn-soft)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--warn)" }}>
          <span className="font-semibold">{pair.city} · {pair.pair_id}</span> is holding this exchange: {pair.missing.map(docName).join(", ")}. {pair.days_left} days left.
        </p>
        {level < 3 && (
          <button className="btn btn-sm" disabled={!!busy} onClick={onChase}>
            {busy === "chase" ? "Sending…" : `${LADDER[level]}`}
          </button>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Chase steps">
        {LADDER.map((step, i) => (
          <li key={step} className="flex items-center gap-2 text-xs">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold"
                  style={{ background: i < level ? "var(--forest)" : "var(--surface)", color: i < level ? "#fff" : "var(--muted)", border: i < level ? undefined : "1px solid var(--line-strong)" }}>
              {i < level ? <Icon name="check" size={12} strokeWidth={2.6} /> : i + 1}
            </span>
            <span style={{ color: i < level ? "var(--ink-strong)" : "var(--muted)" }}>{DONE[i]}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs muted">The committee clerk also climbs these steps on its own as the deadline gets closer.</p>
    </div>
  );
}

function RepairReview({ prop, busy, offline, onApprove, onDecline }: {
  prop: any; busy: string | null; offline: boolean; onApprove: (c: string) => void; onDecline: (reason: string) => Promise<void>;
}) {
  const declined = prop.status === "declined";
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const rec = prop.recommended;
  const fbPairs: string[] = prop.fallback?.pairs ?? [];
  const recIsFallback = !!rec && rec.pairs.length === fbPairs.length && fbPairs.every((p) => rec.pairs.includes(p));
  return (
    <section className="mt-4 rounded-[10px] border-2 p-5" style={{ borderColor: declined ? "var(--line-strong)" : "var(--forest-mid)", background: "var(--surface)" }} aria-labelledby="repair-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="repair-h" className="text-lg font-semibold" style={{ color: "var(--ink-strong)" }}>
          {declined ? "Repair declined" : prop.kind === "escalate" ? "No good repair found. A person needs to decide." : "Repair proposal: needs a person's decision"}
        </h2>
        <span className="text-xs muted">Found in {prop.found_ms} ms · {prop.candidates} candidate loops searched around {prop.released.length} released families · {prop.untouched_loops} other loops untouched</span>
      </div>
      <p className="text-sm muted mt-1">Nothing changes for any family until you decide.</p>

      {declined ? (
        <div className="mt-4 space-y-1">
          <p className="text-sm"><span className="font-semibold">Declined{prop.done_at ? ` ${fmtTime(prop.done_at)}` : ""}:</span> &ldquo;{prop.result}&rdquo;</p>
          <p className="text-sm muted">The released families went back to matching. KindRed won&rsquo;t propose this loop again.</p>
        </div>
      ) : (
        <>
          {rec && (
            <div className="mt-4 grid lg:grid-cols-[1.3fr_1fr] gap-5">
              <div className="rounded-lg p-4" style={{ background: "var(--sage-pale)" }}>
                <p className="label">Recommended</p>
                <p className="text-lg font-semibold mt-1" style={{ color: "var(--forest)" }}>{rec.route}</p>
                <p className="text-sm tnum">Expected {rec.expected} of {rec.size} transplants · every link holds {pct(rec.p_all)}{rec.has_fallback ? " · keeps a fallback" : ""}</p>
                {recIsFallback && <p className="text-sm mt-1">This is the stored two-way fallback ({prop.fallback.loop_id}), so it is ready without a new search.</p>}
                <p className="label mt-3 mb-1">Why (from the graph)</p>
                <ul className="text-sm list-disc pl-5 space-y-0.5">{(prop.why ?? []).map((w: string) => <li key={w}>{w}</li>)}</ul>
              </div>
              <div className="space-y-3">
                {prop.fallback && !recIsFallback && (
                  <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                    <p className="text-sm font-semibold">Stored two-way fallback ({prop.fallback.loop_id})</p>
                    <p className="text-xs muted">Expected {prop.fallback.expected_tx} of 2 · ready now, no new search</p>
                    <button className="btn btn-sm mt-2" disabled={!!busy || offline} title={offline ? "Offline mode only has the recorded outcome for the recommended repair" : undefined} onClick={() => onApprove("fallback")}>Use fallback instead</button>
                  </div>
                )}
                {(prop.alternatives ?? []).map((a: any, i: number) => (
                  <div key={i} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                    <p className="text-sm font-semibold">{a.route}</p>
                    <p className="text-xs muted">Expected {a.expected} of {a.size} · every link holds {pct(a.p_all)}</p>
                    <button className="btn btn-sm mt-2" disabled={!!busy || offline} title={offline ? "Offline mode only has the recorded outcome for the recommended repair" : undefined} onClick={() => onApprove(`alt:${i}`)}>Use this instead</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            {rec && <button className="btn btn-primary" disabled={!!busy} onClick={() => onApprove("recommended")}>{busy === "recommended" ? "Approving…" : "Approve recommended repair"}</button>}
            <button className="btn btn-danger" disabled={!!busy} onClick={() => setDeclining((v) => !v)} aria-expanded={declining}>Decline</button>
            <span className="text-xs muted">Your decision is written to the audit trail.</span>
          </div>
          {declining && (
            <form className="mt-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (reason.trim()) { await onDecline(reason.trim()); setDeclining(false); } }}>
              <label className="block text-sm font-semibold" htmlFor="decline-reason">Reason for declining</label>
              <textarea id="decline-reason" className="input w-full" rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Chennai committee file not yet started; prefer to wait for the fallback" />
              <button className="btn btn-danger btn-sm" type="submit" disabled={!!busy}>{busy === "decline" ? "Recording…" : "Record decline"}</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
