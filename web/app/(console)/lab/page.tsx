"use client";
import Link from "next/link";
import { PageIntro, Term } from "@/components/app/Help";
import { useEffect, useMemo, useRef, useState } from "react";
import ExchangeGraph, { GraphLegend, type GEdge, type GNode } from "@/components/app/ExchangeGraph";
import { ErrorState, Loading, PageHeader, Section } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useResource } from "@/lib/data/source";
import { workspace } from "@/lib/data/workspace";
import { gsap, useGSAP } from "@/components/landing/gsap";

type Choice = "recommended" | "fallback" | "hold";
type Step = { title: string; detail: string; actor: "agent" | "system" | "user"; tone?: "bad" | "ok" | "warn" };

/** The recorded scenario: real outputs of the backend for S-0076, replayed step by step. */
function useScenario() {
  return useResource("sim-scenario", async () => {
    const s = (await import("@/lib/demo/snapshot.json")).default as any;
    const before = s.loops_before[s.focus_loop];
    return { id: s.focus_loop as string, before, broken: s.loop_broken, prop: s.loop_broken.proposal, lab: s.lab_result, repaired: s.loop_repaired };
  });
}

export default function Lab() {
  const sc = useScenario();
  return (
    <div>
      <PageHeader title="Guided replay"
        description="Watch KindRed recover a swap after a lab test fails, one step at a time." />
      <PageIntro id="replay" what={<>A slow-motion replay of the core story, for explaining it to someone: a 3-way swap is proposed, one lab test comes back positive, the graph records the failure, searches nearby, finds a replacement family and keeps a fallback, then stops for a person to decide. Step through it with the buttons. It uses the same data as the live demo but changes nothing.</>} />
      {sc.error && !sc.data ? <ErrorState error={sc.error} onRetry={sc.reload} what="the recorded scenario" /> : !sc.data ? <Loading rows={8} /> : <Scenario sc={sc.data} />}
    </div>
  );
}

function Scenario({ sc }: { sc: any }) {
  const fams: any[] = sc.before.families;
  const city = (pid: string) => fams.find((f) => f.pair_id === pid)?.city ?? (pid === sc.prop.recommended.pairs[2] ? "Chennai" : pid);
  const rec = sc.prop.recommended, fb = sc.prop.fallback;
  const failed = sc.prop.failed_link as [string, string];
  const neg = sc.lab.results?.find?.((r: any) => r.result === "negative");

  const steps: Step[] = [
    { title: "Proposed exchange", actor: "agent", detail: `${sc.id}: ${fams.map((f) => f.city).join(" → ")}. Offers accepted by every hospital's intake agent; lab crossmatches requested. Chance every link holds: ${Math.round(sc.before.loop.p_success * 100)}%.` },
    { title: "First crossmatch negative", actor: "agent", tone: "ok", detail: `${city(neg?.a ?? fams[0].pair_id)} donor → ${city(neg?.b ?? fams[1].pair_id)} patient: negative. The link can go ahead.` },
    { title: "Positive crossmatch", actor: "agent", tone: "bad", detail: `${city(failed[0])} donor → ${city(failed[1])} patient: ${sc.prop.detail}.` },
    { title: "Link marked unavailable", actor: "system", tone: "bad", detail: `Failure ${sc.prop.failure_id} stored in the graph. This donor is never proposed to this patient again. ${sc.prop.released.length} families are released from the loop.` },
    { title: "Searching nearby", actor: "agent", detail: `Searched ${sc.prop.candidates} candidate loops within two steps of the released families in ${sc.prop.found_ms} ms. ${sc.prop.untouched_loops} other loops were not touched.` },
    { title: `Candidate found: ${rec.pairs[2]}`, actor: "agent", tone: "ok", detail: `Recommended repair ${rec.route}: expected ${rec.expected} of ${rec.size} transplants. ${rec.pairs[2]} (Chennai) joins.` },
    { title: "Fallback kept ready", actor: "agent", detail: `Stored two-way swap ${fb.loop_id} (${city(fb.pairs[0])} ⇄ ${city(fb.pairs[1])}): expected ${fb.expected_tx} of 2, available without a new search.` },
    { title: "Human approval checkpoint", actor: "user", tone: "warn", detail: "The simulation stops. A coordinator chooses the repair, the fallback, or to hold." },
  ];
  const LAST = steps.length - 1;

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [run, setRun] = useState(1);
  const logged = useRef(new Set<string>());
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    if (step >= LAST) { setPlaying(false); return; }
    const t = setTimeout(() => setStep((s) => Math.min(LAST, s + 1)), 1500);
    return () => clearTimeout(t);
  }, [playing, step, LAST]);

  // Record each step once per run in the audit trail, marked as simulated.
  useEffect(() => {
    const k = `${run}:${step}`;
    if (step === 0 || logged.current.has(k)) return;
    logged.current.add(k);
    const s = steps[step];
    workspace.log({ type: "simulation", actor: s.actor === "user" ? "system" : s.actor, simulated: true, ref: `SIM-${sc.id}-${run}`, text: `Simulation run ${run}: ${s.title}. ${s.detail}`, review: step === LAST ? "pending" : "n/a" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, run]);

  useGSAP(() => {
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".sim-current", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out" });
    });
  }, { scope, dependencies: [step] });

  const reset = () => { setPlaying(false); setStep(0); setChoice(null); setRun((r) => r + 1); };
  const replay = () => { reset(); setTimeout(() => setPlaying(true), 50); };
  const decide = (c: Choice) => {
    setChoice(c);
    const text = c === "recommended" ? `approved the recommended repair ${rec.route}` : c === "fallback" ? `chose the stored fallback ${fb.loop_id}` : "held the decision for further review";
    workspace.log({ type: "simulation", actor: "user", simulated: true, ref: `SIM-${sc.id}-${run}`, text: `Simulation run ${run}: coordinator ${text}.`, review: c === "hold" ? "pending" : "approved" });
  };

  const graph = useMemo(() => graphAt(step, choice, sc, city), [step, choice, sc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={scope}>
      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-8">
        <Section title="Exchange graph" description={`Step ${step + 1} of ${steps.length}: ${steps[step].title}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" disabled={playing || step === LAST} onClick={() => setPlaying(true)}><Icon name="play" size={14} /> Run</button>
              <button className="btn btn-sm" disabled={playing || step === LAST} onClick={() => setStep((s) => Math.min(LAST, s + 1))}>Step</button>
              <button className="btn btn-sm" onClick={reset}><Icon name="reset" size={14} /> Reset</button>
              <button className="btn btn-sm" onClick={replay}><Icon name="replay" size={14} /> Replay</button>
            </div>
          }>
          <div className="canvas-dark p-3 sm:p-5">
            <ExchangeGraph idPrefix="sim" height={400} nodes={graph.nodes} edges={graph.edges} label={`Simulation step ${step + 1}: ${steps[step].title}. ${steps[step].detail}`} />
            <div className="px-1 pt-2"><GraphLegend items={["viable", "pending", "failed", "proposed", "fallback"]} /></div>
          </div>
          <div className="sim-current mt-4 rounded-[10px] border p-4" style={{ borderColor: steps[step].tone === "bad" ? "#e8c9c4" : "var(--line)", background: steps[step].tone === "bad" ? "var(--bad-soft)" : "var(--surface)" }} aria-live="polite">
            <p className="font-semibold" style={{ color: steps[step].tone === "bad" ? "var(--bad)" : "var(--ink-strong)" }}>{steps[step].title}</p>
            <p className="text-sm mt-1">{steps[step].detail}</p>
          </div>

          {step === LAST && (
            <div className="mt-4 rounded-[10px] border-2 p-4" style={{ borderColor: "var(--forest-mid)" }}>
              <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>Approval checkpoint</p>
              <p className="text-sm muted mt-1">The agents stop here. Nothing changes until a coordinator decides.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-primary btn-sm" aria-pressed={choice === "recommended"} onClick={() => decide("recommended")}>Approve repair ({rec.route})</button>
                <button className="btn btn-sm" aria-pressed={choice === "fallback"} onClick={() => decide("fallback")}>Use fallback ({city(fb.pairs[0])} ⇄ {city(fb.pairs[1])})</button>
                <button className="btn btn-sm" aria-pressed={choice === "hold"} onClick={() => decide("hold")}>Hold for review</button>
              </div>
              {choice && <p className="text-sm mt-3" style={{ color: "var(--ok)" }}>Recorded in the audit trail. <Link className="underline" href={`/audit?ref=SIM-${sc.id}-${run}`}>View</Link></p>}
            </div>
          )}
        </Section>

        <Section title="Event timeline" description="Every step is written to the audit trail.">
          <ol className="border-l-2 pl-5 space-y-3" style={{ borderColor: "var(--line)" }}>
            {steps.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2"
                      style={{ background: i <= step ? (s.tone === "bad" ? "var(--bad-mark)" : "var(--forest)") : "var(--surface)", borderColor: i <= step ? (s.tone === "bad" ? "var(--bad-mark)" : "var(--forest)") : "var(--line-strong)" }} aria-hidden="true" />
                <button className="text-left w-full" onClick={() => { setPlaying(false); setStep(i); }} disabled={i > step} aria-current={i === step ? "step" : undefined}>
                  <p className="text-sm font-semibold" style={{ color: i <= step ? "var(--ink-strong)" : "var(--muted)" }}>{s.title} <span className="text-xs font-normal muted">· {s.actor === "user" ? "Coordinator" : s.actor === "system" ? "System" : "Agent"}</span></p>
                  {i <= step && i !== step && <p className="text-xs muted line-clamp-1">{s.detail}</p>}
                </button>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {step === LAST && (
        <div className="mt-10">
          <Section title="Before and after" description={choice ? undefined : "Choose an option at the checkpoint to see the outcome."}>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="canvas-dark p-4">
                <p className="px-1 text-sm font-semibold" style={{ color: "#F7F6F0" }}>Before · as planned</p>
                <ExchangeGraph idPrefix="sb" height={300} {...graphAt(0, null, sc, city)} label={`Before: ${sc.id} as planned`} />
              </div>
              <div className="canvas-dark p-4">
                <p className="px-1 text-sm font-semibold" style={{ color: "#F7F6F0" }}>After · {choice === "recommended" ? "repaired" : choice === "fallback" ? "fallback" : choice === "hold" ? "on hold" : "waiting for a decision"}</p>
                <ExchangeGraph idPrefix="sa" height={300} {...graphAt(LAST + 1, choice, sc, city)} label="After the coordinator's choice" />
              </div>
            </div>
            {choice && <Outcome choice={choice} sc={sc} city={city} />}
          </Section>
        </div>
      )}
    </div>
  );
}

function graphAt(step: number, choice: Choice | null, sc: any, city: (p: string) => string): { nodes: GNode[]; edges: GEdge[] } {
  const fams: any[] = sc.before.families;
  const rec = sc.prop.recommended, fb = sc.prop.fallback;
  const [fa, fbp] = sc.prop.failed_link;
  const after = step > 7;
  const nodes: GNode[] = fams.map((f) => ({ id: f.pair_id, title: f.city, sub: f.pair_id, state: "active" }));
  const che = rec.pairs.find((p: string) => !fams.some((f) => f.pair_id === p));
  if (step >= 5 || (after && choice === "recommended")) nodes.push({ id: che, title: city(che), sub: che, state: after && choice === "recommended" ? "joined" : "candidate", x: 280, y: 318 });
  const released = step >= 3 && !(after && choice !== "hold");
  nodes.forEach((n) => { if (released && sc.prop.released.includes(n.id)) n.state = "released"; });
  if (after && choice === "recommended") nodes.forEach((n) => { if (rec.pairs.includes(n.id)) n.state = "joined"; else n.state = "dim"; });
  if (after && choice === "fallback") nodes.forEach((n) => { n.state = fb.pairs.includes(n.id) ? "joined" : n.id === che ? n.state : "dim"; });

  const edges: GEdge[] = [];
  const ring = fams.map((f, i) => [f.pair_id, fams[(i + 1) % fams.length].pair_id]);
  for (const [a, b] of ring) {
    const isFailed = a === fa && b === fbp;
    const isFirst = a === fams[0].pair_id;
    let state: GEdge["state"] = "pending";
    if (isFirst && step >= 1) state = "viable";
    if (isFailed && step >= 2) state = "failed";
    if (after && choice !== "hold") state = isFailed ? "failed" : "inactive";
    if (after && choice === "recommended" && isFirst) state = "viable";
    if (after && choice === "hold") state = isFailed ? "failed" : isFirst ? "viable" : "pending";
    edges.push({ from: a, to: b, state, label: isFailed && step >= 2 ? "DQ7 positive" : isFirst && step >= 1 && !(after && choice === "fallback") ? "negative" : undefined });
  }
  if (step >= 5 && !(after && choice !== "recommended")) {
    rec.pairs.forEach((p: string, i: number) => {
      const to = rec.pairs[(i + 1) % rec.pairs.length];
      if (!edges.some((e) => e.from === p && e.to === to && e.state === "viable")) edges.push({ from: p, to, state: after ? "viable" : "proposed", label: `p ${rec.probs[i]}` });
    });
  }
  if ((step >= 6 && !after) || (after && choice === "fallback")) {
    edges.push({ from: fb.pairs[1], to: fb.pairs[0], state: after ? "viable" : "fallback", label: after ? "fallback" : undefined });
    if (after) edges.push({ from: fb.pairs[0], to: fb.pairs[1], state: "viable" });
  }
  return { nodes, edges };
}

function Outcome({ choice, sc, city }: { choice: Choice; sc: any; city: (p: string) => string }) {
  const rec = sc.prop.recommended, fb = sc.prop.fallback;
  const planned = sc.before.loop.expected_tx;
  const after = choice === "recommended" ? rec.expected : choice === "fallback" ? fb.expected_tx : 0;
  const waiting = choice === "recommended" ? [sc.prop.failed_link[1]] : choice === "fallback" ? sc.before.families.map((f: any) => f.pair_id).filter((p: string) => !fb.pairs.includes(p)) : sc.prop.released;
  return (
    <dl className="mt-6 grid sm:grid-cols-3 gap-px rounded-[10px] overflow-hidden border" style={{ borderColor: "var(--line)", background: "var(--line)" }}>
      {[
        ["Expected transplants", `${planned} planned → ${after} ${choice === "hold" ? "(nothing scheduled while on hold)" : ""}`],
        ["Families back in the pool", waiting.map((p: string) => `${city(p)} ${p}`).join(", ") || "none"],
        ["Rest of the plan", `${sc.prop.untouched_loops} other loops unchanged`],
      ].map(([k, v]) => (
        <div key={k} className="p-4" style={{ background: "var(--surface)" }}><dt className="label">{k}</dt><dd className="mt-1 text-sm" style={{ color: "var(--ink-strong)" }}>{v}</dd></div>
      ))}
      <p className="sm:col-span-3 p-3 text-xs muted" style={{ background: "var(--surface)" }}>Expected transplants are model estimates.</p>
    </dl>
  );
}

