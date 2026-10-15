"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ErrorState, Loading, OrganTag, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import TrendChart from "@/components/app/TrendChart";
import CypherPanel from "@/components/CypherPanel";
import { useAction, useData, useResource } from "@/lib/data/source";
import { organOf } from "@/lib/organs";
import { STAGE_TONE, fmtDay } from "@/lib/personas";
import type { AgentState, PersonaFinding, PersonaHandoff, PersonaJourney } from "@/lib/data/types";

const AGENT_ICON: Record<string, string> = {
  "Matching agent": "swaps", Scheduler: "surgery", "Committee clerk": "committee", "Patient liaison": "family",
  "Health watch": "lab", "Crossmatch coordinator": "lab", "Intake agent": "hospital",
};

/** Where the case stands, in five steps, read from the patient's swap in the shared graph. */
function tracker(j: PersonaJourney) {
  const c = j.case;
  // How many steps are done; the next one is the current step.
  const at = !c ? 0 : ["selected", "offered", "testing"].includes(c.status) ? 2 : c.status === "committee" ? 3 : j.transplanted ? 5 : 4;
  return [
    { label: "Agents watching", note: j.pair?.urgent && !c ? "Marked urgent · searching for a swap" : "Every new reading is checked" },
    { label: "Swap found", note: c ? `${c.loop_id} · ${c.route}` : "Not yet" },
    { label: "Tests passed", note: c && at >= 3 ? "Every link passed" : c ? "Tests under way" : "" },
    { label: "Transplant booked", note: c?.surgery_at ? fmtDay(c.surgery_at) : at === 3 ? "Collecting committee papers" : "" },
    { label: "Transplant done", note: j.transplanted && c?.transplanted_at ? fmtDay(c.transplanted_at) : "" },
  ].map((s, i) => ({ ...s, state: i < at || (i === 0 && !!c) ? "done" : i === at || (i === 0 && !c) ? "current" : "next" }));
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
      Agents on watch · checked the graph {ago === null ? "…" : ago < 5 ? "just now" : `${ago}s ago`} · every {s.data.interval_s}s
    </span>
  );
}

function Week({ items, handoffs }: { items: PersonaFinding[]; handoffs: Map<string, PersonaHandoff[]> }) {
  const f0 = items[0];
  return (
    <li className="panel p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] muted">{f0.week > 0 ? `Week ${f0.week}` : "On file"} · {fmtDay(f0.at)}</p>
      <ul className="mt-2 space-y-2">
        {items.map((f) => (
          <li key={f.finding_id}>
            <p className="text-sm flex gap-2" style={{ color: "var(--ink-strong)" }}>
              <Icon name={f.kind === "case" ? AGENT_ICON[f.text.split(":")[0]] ?? "swaps" : "lab"} size={16} className="mt-0.5 shrink-0" />
              <span>{f.kind === "stage_change" && <Tag tone={STAGE_TONE[f.stage] ?? "neutral"}>Stage changed</Tag>} {f.kind === "case" ? f.text : `Health watch: ${f.text}`}</span>
            </p>
            {(handoffs.get(f.finding_id) ?? []).length > 0 && (
              <ul className="mt-1.5 ml-6 space-y-1 border-l pl-3" style={{ borderColor: "var(--line)" }}>
                {(handoffs.get(f.finding_id) ?? []).map((h) => (
                  <li key={h.task_id} className="text-sm">
                    <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{h.agent}:</span> {h.result ?? h.payload.what ?? h.payload.why}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </li>
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
  if (r.error && !j) return <ErrorState error={r.error} onRetry={r.reload} what={`demo patient ${id}`} />;
  if (!j) return <Loading rows={6} />;
  const o = organOf(j.organ);
  const first = j.name.split(" ")[0];
  const steps = tracker(j);
  const ended = j.transplanted || j.weeks_left <= 0;
  const mapHref = `/pool?program=${j.organ}&pair=${j.pair_id}&patient=${j.id}`;
  const handoffs = new Map<string, PersonaHandoff[]>();
  for (const h of [...j.handoffs].sort((a, b) => (a.payload.step ?? 0) - (b.payload.step ?? 0))) {
    handoffs.set(h.finding_id, [...(handoffs.get(h.finding_id) ?? []), h]);
  }
  const weeks: PersonaFinding[][] = [];
  for (const f of j.findings) {
    const w = weeks.find((x) => x[0].week === f.week);
    if (w) w.push(f); else weeks.push([f]);
  }
  for (const w of weeks) w.sort((a, b) => Number(b.kind === "case") - Number(a.kind === "case"));
  const latest = j.findings[0];

  return (
    <div className="max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5 mb-5 border-b" style={{ borderColor: "var(--line)" }}>
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] flex items-center gap-3" style={{ color: "var(--ink-strong)" }}>
            {j.name} <OrganTag organ={j.organ} />
          </h1>
          <p className="mt-1 text-sm muted">{j.age} · {j.city} · {j.pair_id}</p>
          <p className="mt-2 max-w-2xl text-[0.94rem]">{j.story}</p>
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

      {/* Where the case stands: the one thing to read first. */}
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
        {latest && latest.week > 0 && (
          <p className="mt-4 border-t pt-3 text-sm" style={{ borderColor: "var(--line)" }}>
            <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>Latest: </span>
            {(() => {
              const step = weeks[0]?.find((f) => f.kind === "case");
              if (step) return step.text;
              const hs = handoffs.get(latest.finding_id) ?? [];
              const m = hs.find((h) => h.agent === "Matching agent");
              return m?.result ?? latest.text;
            })()}
          </p>
        )}
      </section>

      <section className="mt-6 panel p-4" aria-label={`${j.measure.label} over time`}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--ink-strong)" }}>{j.measure.label} over the last months</h2>
        <TrendChart readings={j.readings} thresholds={j.thresholds} findings={j.findings} label={j.measure.label} unit={j.measure.unit}
                    color={o.tone} worse={j.measure.better === "higher" ? "down" : "up"} />
      </section>

      <section className="mt-8">
        <h2 className="text-[1.02rem] font-semibold" style={{ color: "var(--ink-strong)" }}>What the agents did, week by week</h2>
        <p className="text-sm muted mt-0.5 mb-3">Nobody pressed approve. Each agent picked up its own task from the graph.</p>
        <ol className="space-y-3">{weeks.map((w) => <Week key={w[0].finding_id} items={w} handoffs={handoffs} />)}</ol>
      </section>

      <details className="mt-8 panel">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-sm" style={{ color: "var(--ink-strong)" }}>
          Under the hood: memory, playbook, appointments and the graph queries
        </summary>
        <div className="border-t px-4 py-4 grid md:grid-cols-2 gap-6 text-sm" style={{ borderColor: "var(--line)" }}>
          <div>
            <h3 className="label mb-2">What the agents remember about {first}</h3>
            <ul className="space-y-2">
              {j.facts.map((f) => (
                <li key={f.key}><p style={{ color: "var(--ink-strong)" }}>{f.text}</p>
                  <p className="text-xs muted">Since {fmtDay(f.at)}{f.was_text ? ` · before: ${f.was_text}` : ""}</p></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="label mb-2">Appointments (hospital graph)</h3>
            <ul className="space-y-1.5">
              {[...j.appointments].reverse().map((a) => (
                <li key={a.appointment_id} className="flex justify-between gap-3">
                  <span style={{ color: "var(--ink-strong)" }}>{a.kind} <span className="muted">· {fmtDay(a.at)}</span></span>
                  <span className="muted">{a.status === "done" ? "attended" : a.status}</span>
                </li>
              ))}
            </ul>
            {j.family_message && <><h3 className="label mt-5 mb-2">Message to the family</h3><p>{j.family_message}</p></>}
          </div>
          <div>
            <h3 className="label mb-2">Playbook for {j.stage_label} (procedural memory)</h3>
            <ol className="space-y-1.5">
              {j.playbook.map((s) => <li key={s.step}><span className="font-semibold">{s.agent}</span>{s.what ? `: ${s.what}` : ""} <span className="muted">· {s.why}</span></li>)}
            </ol>
          </div>
          <div>
            <h3 className="label mb-2">Where this lives in FalkorDB</h3>
            <ul className="space-y-1.5">
              <li><code style={{ color: "var(--forest)" }}>{j.graphs.hospital}</code> · readings and appointments, private to the hospital</li>
              <li><code style={{ color: "var(--forest)" }}>{j.graphs.memory}</code> · {first}&rsquo;s memory: sessions, findings, facts, playbooks</li>
              <li><code style={{ color: "var(--forest)" }}>{j.graphs.shared}</code> · the swap and the agents&rsquo; hand-off tasks</li>
            </ul>
            <p className="mt-3 text-xs muted">Thresholds: {j.sources.join(" · ")}</p>
          </div>
          <div className="md:col-span-2"><CypherPanel ran={j.queries} /></div>
        </div>
      </details>
      <p className="mt-6 text-xs muted">Synthetic people, readings and approvals. A software prototype, not a clinical tool.</p>
    </div>
  );
}
