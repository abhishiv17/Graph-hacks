"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, Loading, OrganTag, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import TrendChart from "@/components/app/TrendChart";
import MiniMap, { type MiniLink } from "@/components/app/MiniMap";
import { useAction, useData, useResource } from "@/lib/data/source";
import { organOf } from "@/lib/organs";
import { STAGE_TONE, fmtDay } from "@/lib/personas";
import type { AgentState, ChatMessage, CoordinatorStep, PersonaFinding, PersonaHandoff, PersonaJourney, PersonaSearch } from "@/lib/data/types";

const fmtMonth = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const monthKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const pct = (p: number | null | undefined) => (p == null ? "–" : `${Math.round(p * 100)}%`);

/** Where the case stands, in five steps, read from the patient's swap in the shared graph. */
function tracker(j: PersonaJourney) {
  const c = j.case;
  const done = !c ? 0 : ["selected", "offered", "testing"].includes(c.status) ? 2 : c.status === "committee" ? 3 : j.transplanted ? 5 : 4;
  return [
    { label: "Agents watching", note: "Every new result is checked" },
    { label: "Swap found", note: c ? `${c.loop_id} · ${c.route}` : "Searching" },
    { label: "Tests passed", note: c && done >= 3 ? "Every link passed" : c ? "Tests under way" : "" },
    { label: "Transplant booked", note: c?.surgery_at ? fmtDay(c.surgery_at) : done === 3 ? "Collecting papers" : "" },
    { label: "Transplant done", note: j.transplanted && c?.transplanted_at ? fmtDay(c.transplanted_at) : "" },
  ].map((s, i) => ({ ...s, state: i < done || (i === 0 && !!c) ? "done" : i === done || (i === 0 && !c) ? "current" : "next" }));
}

function AgentsOnWatch() {
  const s = useResource<AgentState>("agents", (a) => a.agents(), 5000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!s.data?.enabled) return null;
  const ago = s.data.last_at ? Math.max(0, Math.round((now - s.data.last_at) / 1000)) : null;
  return (
    <span className="inline-flex items-center gap-2 text-xs muted" aria-live="polite">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: "var(--forest-mid)" }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--forest-mid)" }} /></span>
      Agents on watch · checked the graph {ago === null ? "…" : ago < 5 ? "just now" : `${ago}s ago`}
    </span>
  );
}

/** The coordinator agent's tool calls for one week, in order: what it called and what the graph answered. */
function HowItDecided({ f }: { f: PersonaFinding }) {
  const [open, setOpen] = useState(false);
  if (!f.trace?.length) return null;
  const say = (t: CoordinatorStep) => {
    if (t.error) return `refused: ${t.error}`;
    const r = t.result ?? {};
    if (t.tool === "find_swaps") return `${r.found} found (${r.searched})`;
    if (t.tool === "form_swap") return `formed ${r.formed}: ${r.route}`;
    if (t.tool === "run_tests") return r.outcome;
    if (t.tool === "request_papers") return `asked for ${(r.requested ?? []).join(", ")}`;
    if (t.tool === "book_surgery") return `surgery on ${r.surgery_on}`;
    if (t.tool === "wait") return "waited";
    return JSON.stringify(r).slice(0, 80);
  };
  return (
    <div className="mt-2">
      <button className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--forest)" }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="chevron" size={12} className={open ? "rotate-90 transition-transform" : "transition-transform"} /> How it decided ({f.trace.length} tool call{f.trace.length === 1 ? "" : "s"})
      </button>
      {open && (
        <ol className="mt-2 space-y-1 text-xs">
          {f.trace.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="tnum muted">{i + 1}.</span>
              <span><code style={{ color: "var(--forest)" }}>{t.tool}({Object.entries(t.input).filter(([k]) => k !== "reason").map(([k, v]) => `${k}=${v}`).join(", ")})</code>
                <span className="muted"> → {say(t)}{t.by === "rules" ? " · by the rules" : ""}</span></span>
            </li>
          ))}
        </ol>
      )}
      {f.safety_net && <p className="mt-1 text-xs" style={{ color: "var(--warn)" }}>{f.safety_net}</p>}
    </div>
  );
}

/** A link's stored reasons: the first two, the rest one click away. */
function Reasons({ reasons, chance }: { reasons: string[]; chance: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? reasons : reasons.slice(0, 2);
  return (
    <p className="text-xs muted mt-0.5">
      <span className="font-semibold" style={{ color: "var(--ink)" }}>{chance} chance it holds</span> · {shown.join(" · ")}
      {reasons.length > 2 && <button className="ml-1 underline" onClick={() => setAll((a) => !a)}>{all ? "less" : `+${reasons.length - 2} more`}</button>}
    </p>
  );
}

/** Why this swap, and how the agent found it: a small map, each donation with its reasons, shallow vs deep search. */
function WhySwap({ j, color }: { j: PersonaJourney; color: string }) {
  const first = j.name.split(" ")[0];
  // The searches of the week the swap was formed (or the latest searches, while still waiting).
  const formed = j.findings.find((f) => f.kind === "decision" && f.action === "form_swap");
  const week = formed?.week ?? j.searches[0]?.week;
  const ofWeek = j.searches.filter((s) => s.week === week);
  const shallow = ofWeek.find((s) => s.depth === 2);
  const deep = ofWeek.find((s) => s.depth === 3);
  const swapLinks: MiniLink[] = j.why.map((l) => ({ from: l.from_pair, to: l.to_pair }));
  const [step, setStep] = useState(0); // 0 = the swap; 1 = shallow search; 2 = deep search
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const replay = () => {
    timers.current.forEach(clearTimeout);
    setStep(1);
    timers.current = [window.setTimeout(() => setStep(2), 1600), window.setTimeout(() => setStep(0), 3400)];
  };
  const fams = (s?: PersonaSearch) => [...new Set((s?.loops ?? []).flatMap((l) => l.families))];
  const lit = step === 1 ? fams(shallow) : step === 2 ? fams(deep) : [];
  const links = step === 0 ? swapLinks : [];
  return (
    <section className="panel p-5" aria-labelledby="why-h">
      <h2 id="why-h" className="text-[1.02rem] font-semibold" style={{ color: "var(--ink-strong)" }}>{j.case ? "Why this swap" : "Looking for a swap"}</h2>
      <div className="mt-3 grid md:grid-cols-[minmax(16rem,22rem)_1fr] gap-6 items-start">
        <div key={`${step}-${links.length}`}>
          <MiniMap places={j.places} home={j.pair_id} links={links} lit={lit} color={color}
                   label={j.case ? `${j.case.route}: the donations of ${j.case.loop_id}` : `${first}'s hospital and the families searched`} />
          <p className="text-center text-xs muted mt-1">{step === 1 ? "Shallow search: 2-way swaps" : step === 2 ? "Deep search: 3-way swaps" : j.case ? j.case.route : `${first} in ${j.city}`}</p>
        </div>
        <div className="min-w-0 space-y-4">
          {j.why.length > 0 ? (
            <ol className="space-y-2.5">
              {j.why.map((l) => (
                <li key={l.pos} className="text-sm">
                  <p style={{ color: "var(--ink-strong)" }}>
                    <span className="font-semibold">{l.from_city}</span> donor ({l.donor_relation}, {l.donor_abo}) gives to the <span className="font-semibold">{l.to_city}</span> patient ({l.patient_abo})
                    {l.from_pair === j.pair_id && <span className="muted"> · {first}&rsquo;s family gives</span>}
                    {l.to_pair === j.pair_id && <span className="muted"> · {first} receives</span>}
                  </p>
                  <Reasons reasons={l.reasons ?? []} chance={pct(l.p_success)} />
                </li>
              ))}
            </ol>
          ) : <p className="text-sm muted">No swap yet. The coordinator agent searches again every week, and the background watch looks the moment a new family joins the pool.</p>}

          {(shallow || deep) && (
            <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] muted">How the agent searched{week ? ` · week ${week}` : ""}</p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                {[["Shallow: 2-way", shallow], ["Deep: 3-way", deep]].map(([k, s]) => (
                  <div key={String(k)} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                    <dt className="text-xs muted">{String(k)}</dt>
                    <dd className="text-lg font-semibold tnum" style={{ color: "var(--ink-strong)" }}>
                      {s ? `${(s as PersonaSearch).found} found` : "not needed"}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs muted mt-2">
                {shallow && !shallow.found && deep?.found ? `The 2-way search missed it: only looking one family further (3-way) found ${first}'s swap.`
                  : shallow?.found ? "A 2-way swap was there, so the agent didn't need to search deeper."
                  : "Neither depth found a swap yet."}
              </p>
              <button className="btn btn-sm mt-2" onClick={replay}><Icon name="replay" size={14} /> Replay the search on the map</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The model writes **bold**; show it as bold text rather than asterisks (nothing else is interpreted). */
function bold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}

/** A conversation about this patient, stored in their memory graph: any browser sees the same history. */
function Chat({ j }: { j: PersonaJourney }) {
  const { api, refresh } = useData();
  const [messages, setMessages] = useState<ChatMessage[]>(j.conversation);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!busy) setMessages(j.conversation); }, [j.conversation, busy]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  const first = j.name.split(" ")[0];
  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true); setError(null); setText("");
    setMessages((m) => [...m, { message_id: "pending", role: "user", text: q, at: Date.now(), tools: [], model: null }]);
    try {
      const r = await api.personaChat(j.id, q);
      setMessages(r.messages);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const last = messages.filter((m) => m.message_id !== "pending").at(-1);
  return (
    <section className="panel p-5 flex flex-col" aria-labelledby="chat-h">
      <h2 id="chat-h" className="text-[1.02rem] font-semibold" style={{ color: "var(--ink-strong)" }}>Ask about {first}</h2>
      <p className="text-xs muted mt-0.5">
        {last ? `Where you left off: ${new Date(last.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. ` : ""}
        Saved in {first}&rsquo;s memory graph, so it&rsquo;s here from any browser.
      </p>
      <div className="mt-3 flex-1 min-h-[12rem] max-h-[22rem] overflow-y-auto space-y-2.5 pr-1">
        {messages.length === 0 && <p className="text-sm muted">No questions yet. Try one below.</p>}
        {messages.map((m, i) => (
          <div key={m.message_id + i} className={`text-sm rounded-lg px-3 py-2 ${m.role === "user" ? "ml-8" : "mr-4"}`}
               style={{ background: m.role === "user" ? "var(--sage)" : "var(--sage-pale)", color: "var(--ink-strong)" }}>
            <p className="whitespace-pre-line">{bold(m.text)}</p>
            {m.role === "assistant" && m.tools?.length > 0 && <p className="text-[0.7rem] muted mt-1">From the graph: {m.tools.join(", ")}</p>}
          </div>
        ))}
        {busy && <p className="text-sm muted">Reading the graph…</p>}
        <div ref={end} />
      </div>
      {error && <p role="alert" className="text-xs mt-2" style={{ color: "var(--bad)" }}>{error}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Why was this swap chosen?", `What do the agents remember about ${first}?`, "What happens next?"].map((s) => (
          <button key={s} className="rounded-full border px-2.5 py-1 text-xs hover:bg-[var(--surface-soft)]" style={{ borderColor: "var(--line)" }}
                  disabled={busy} onClick={() => send(s)}>{s}</button>
        ))}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr-only" htmlFor="chat-in">Your question about {first}</label>
        <input id="chat-in" className="flex-1 rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
               value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask anything about ${first}'s case`} maxLength={1000} />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </section>
  );
}

/** One month: a chip with the month's key moment; clicking it opens the weekly breakdown underneath. */
function Months({ j, handoffs }: { j: PersonaJourney; handoffs: Map<string, PersonaHandoff[]> }) {
  const months = useMemo(() => {
    const by = new Map<string, { key: string; at: number; readings: number[]; findings: PersonaFinding[] }>();
    const add = (at: number) => {
      const k = monthKey(at);
      if (!by.has(k)) by.set(k, { key: k, at, readings: [], findings: [] });
      return by.get(k)!;
    };
    for (const r of j.readings) add(r.at).readings.push(r.value);
    for (const f of j.findings) if (f.kind !== "baseline") add(f.at).findings.push(f);
    return [...by.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [j.readings, j.findings]);
  const [open, setOpen] = useState<string | null>(null);
  const highlight = (fs: PersonaFinding[]) => {
    const text = fs.map((f) => f.text).join(" ");
    if (/Transplant done/.test(text)) return { label: "Transplant done", tone: "ok" as const };
    if (fs.some((f) => f.action === "book_surgery")) return { label: "Surgery booked", tone: "ok" as const };
    if (fs.some((f) => f.action === "form_swap")) return { label: "Swap formed", tone: "ok" as const };
    if (fs.some((f) => f.kind === "stage_change")) return { label: "Stage changed", tone: "warn" as const };
    return null;
  };
  const sel = months.find((m) => m.key === open);
  const weeks = useMemo(() => {
    if (!sel) return [];
    const w = new Map<number, PersonaFinding[]>();
    for (const f of [...sel.findings].sort((a, b) => a.at - b.at)) w.set(f.week, [...(w.get(f.week) ?? []), f]);
    return [...w.entries()];
  }, [sel]);
  const order = (f: PersonaFinding) => ({ world: 0, stage_change: 1, reading: 1, check: 1, case: 2, decision: 3 } as Record<string, number>)[f.kind] ?? 4;
  return (
    <section aria-labelledby="months-h">
      <h2 id="months-h" className="text-[1.02rem] font-semibold" style={{ color: "var(--ink-strong)" }}>Month by month</h2>
      <p className="text-sm muted mt-0.5 mb-3">Click a month to see what happened each week.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Months">
        {months.map((m) => {
          const h = highlight(m.findings);
          const on = open === m.key;
          return (
            <button key={m.key} role="tab" aria-selected={on} onClick={() => setOpen(on ? null : m.key)}
                    className="shrink-0 rounded-[10px] border px-3 py-2 text-left min-w-[7.5rem] transition-colors hover:bg-[var(--surface-soft)]"
                    style={{ borderColor: on ? "var(--forest-mid)" : "var(--line)", background: on ? "var(--sage-pale)" : "var(--surface)" }}>
              <span className="block text-xs muted">{fmtMonth(m.at)}</span>
              <span className="block text-sm font-semibold tnum" style={{ color: "var(--ink-strong)" }}>
                {m.readings.length ? `${j.measure.label} ${m.readings[m.readings.length - 1]}` : "–"}
              </span>
              {h ? <span className="mt-1 inline-block"><Tag tone={h.tone}>{h.label}</Tag></span>
                 : <span className="block text-[0.7rem] muted mt-1">{new Set(m.findings.map((f) => f.week)).size} weeks{m.findings.every((f) => f.week <= 0) ? " · on file" : ""}</span>}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="mt-3 panel p-4" role="tabpanel">
          <p className="text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>{fmtMonth(sel.at)}</p>
          {weeks.length === 0 ? (
            <p className="text-sm muted mt-1">Monthly lab result on file: {j.measure.label} {sel.readings.join(", ")}.</p>
          ) : (
            <ol className="mt-2 space-y-3">
              {weeks.map(([w, fs]) => (
                <li key={w} className="border-l-2 pl-3" style={{ borderColor: "var(--line-strong)" }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] muted">{w > 0 ? `Week ${w} of the demo · ${fmtDay(fs[0].at)}` : `Week of ${fmtDay(fs[0].at)} · on file`}</p>
                  <ul className="mt-1 space-y-1.5">
                    {[...fs].sort((a, b) => order(a) - order(b)).map((f) => (
                      <li key={f.finding_id} className="text-sm">
                        <p style={{ color: "var(--ink-strong)" }}>
                          <span className="font-semibold">{f.kind === "world" ? (f.week > 0 ? "Hospitals: " : "Hospital visit · ") : f.kind === "decision" || f.kind === "case" ? "" : "Health watch: "}</span>
                          {f.text}
                        </p>
                        {f.kind === "decision" && <HowItDecided f={f} />}
                        {(handoffs.get(f.finding_id) ?? []).map((h) => (
                          <p key={h.task_id} className="text-xs muted mt-0.5 ml-3">{h.agent}: {h.result ?? h.payload.what ?? h.payload.why}</p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

export default function Journey({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useResource<PersonaJourney>(`persona:${id}`, (a) => a.persona(id), 6000);
  const act = useAction();
  const { api, mode } = useData();
  const [greeting, setGreeting] = useState<string | null>(null);
  // One visit = one session in the persona's memory graph; the greeting is what changed since the last one.
  useEffect(() => {
    if (mode !== "live") return;
    let alive = true;
    api.personaSession(id).then((s) => alive && setGreeting(s.greeting)).catch(() => {});
    return () => { alive = false; };
  }, [api, id, mode]);

  const j = r.data;
  const handoffs = useMemo(() => {
    const m = new Map<string, PersonaHandoff[]>();
    for (const h of [...(j?.handoffs ?? [])].sort((a, b) => (a.payload.step ?? 0) - (b.payload.step ?? 0))) m.set(h.finding_id, [...(m.get(h.finding_id) ?? []), h]);
    return m;
  }, [j?.handoffs]);
  if (r.error && !j) return <ErrorState error={r.error} onRetry={r.reload} what={`demo patient ${id}`} />;
  if (!j) return <Loading rows={6} />;
  const o = organOf(j.organ);
  const first = j.name.split(" ")[0];
  const steps = tracker(j);
  const ended = j.transplanted || j.weeks_left <= 0;
  const mapHref = `/pool?program=all&pair=${j.pair_id}&patient=${j.id}`;
  const decision = j.findings.find((f) => f.kind === "decision");

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5 mb-5 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] flex items-center gap-3" style={{ color: "var(--ink-strong)" }}>
            {j.name} <OrganTag organ={j.organ} />
          </h1>
          <p className="mt-1 text-sm muted">{j.age} · {j.city} · {j.pair_id}</p>
          <p className="mt-2 text-[0.94rem]">{j.story}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={!!act.busy || ended} onClick={() => act.run("advance", (a) => a.personaAdvance(id))}
                    title={ended ? "The journey is over. Replay it to start again." : "One simulated week passes: a new lab result arrives and the agents act"}>
              <Icon name="play" size={15} /> {act.busy === "advance" ? "Agents working…" : j.transplanted ? "Transplant done" : ended ? "End of the journey" : "Next week"}
            </button>
            <button className="btn" disabled={!!act.busy} onClick={() => { setGreeting(null); act.run("reset", (a) => a.personaReset(id)); }}>
              <Icon name="reset" size={15} /> Replay
            </button>
          </div>
          <AgentsOnWatch />
        </div>
      </header>

      {act.error && <p role="alert" className="mb-4 text-sm" style={{ color: "var(--bad)" }}>{act.error}</p>}
      {greeting && (
        <p className="mb-5 flex items-start gap-2.5 rounded-[10px] border px-4 py-3 text-sm" style={{ borderColor: "var(--line)", background: "var(--sage-pale)" }}>
          <Icon name="database" size={17} className="mt-0.5 shrink-0" />
          <span><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>From memory: </span>{greeting}</span>
        </p>
      )}

      <section className="panel p-5" aria-label="Where the case stands">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Tag tone={STAGE_TONE[j.stage ?? ""] ?? "neutral"}>{j.stage_label}</Tag>
            {j.last && <span className="font-semibold tnum" style={{ color: "var(--ink-strong)" }}>{j.measure.label} {j.last.value}</span>}
            <span className="muted">{fmtDay(j.now)} · week {j.week} of {j.week + j.weeks_left} (simulated)</span>
          </p>
          {j.case && (
            <Link href={mapHref} className="btn btn-primary">
              <Icon name="pool" size={15} /> {j.transplanted ? `See ${first}'s transplant on the live map` : `See ${first}'s swap on the live map`}
            </Link>
          )}
        </div>
        <ol className="mt-5 grid grid-cols-1 sm:grid-cols-5 gap-3">
          {steps.map((s, i) => (
            <li key={s.label} className="flex sm:flex-col gap-3 sm:gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                    style={{ background: s.state === "done" ? "var(--forest-mid)" : s.state === "current" ? "var(--mint)" : "var(--sage-pale)",
                             color: s.state === "done" ? "#fff" : "var(--forest)" }}>
                {s.state === "done" ? <Icon name="check" size={14} strokeWidth={2.4} /> : i + 1}
              </span>
              <div>
                <p className={`text-sm ${s.state === "next" ? "muted" : "font-semibold"}`} style={{ color: s.state === "next" ? undefined : "var(--ink-strong)" }}>{s.label}</p>
                {s.note && <p className="text-xs muted">{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
        {decision && decision.week > 0 && (
          <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            <p className="text-sm">
              <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>This week, the coordinator agent: </span>
              {decision.text.replace(/^Coordinator agent: /, "")}
            </p>
            <p className="text-xs muted mt-0.5">A language model ({decision.model ?? "rules"}) choosing from a fixed set of graph tools. It never writes a query, and every id it names is checked.</p>
            <HowItDecided f={decision} />
          </div>
        )}
      </section>

      <div className="mt-6 grid xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)] gap-6 items-start">
        <WhySwap j={j} color={o.tone} />
        <Chat j={j} />
      </div>

      <section className="mt-6 panel p-4" aria-label={`${j.measure.label} over time`}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--ink-strong)" }}>{j.measure.label} over the last months</h2>
        <TrendChart readings={j.readings} thresholds={j.thresholds} findings={j.findings} label={j.measure.label} unit={j.measure.unit}
                    color={o.tone} worse={j.measure.better === "higher" ? "down" : "up"} />
      </section>

      <div className="mt-8"><Months j={j} handoffs={handoffs} /></div>
      <p className="mt-8 text-xs muted">Synthetic people, readings and approvals. A software prototype, not a clinical tool.</p>
    </div>
  );
}
