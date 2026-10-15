"use client";
// The demo story as five steps, shown above every workspace screen. Each program has its own story: kidney
// (a positive crossmatch) and liver (a donor work-up that finds the graft too small). Where a story stands is read
// from the live pool, so the guide always offers the right next step.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useAction, useResource } from "@/lib/data/source";
import type { LoopSummary, Pool } from "@/lib/data/types";
import { useProgram } from "@/lib/program";
import { ORGANS, type OrganView } from "@/lib/organs";

type Step = { title: string; why: string; done: boolean; action?: React.ReactNode };

/** The story loop of one program (the first loop its first story family joined) and what replaced it. */
function story(loops: LoopSummary[], view: OrganView) {
  const mine = loops.filter((l) => l.pairs.some((p) => p.pair_id === view.storyPairs[0])).sort((a, b) => a.created_at - b.created_at);
  const hero = mine[0];
  const last = mine[mine.length - 1];
  return { hero: hero?.loop_id ?? null, status: hero?.status ?? null, repaired: hero?.replaced_by ?? (last && last !== hero ? last.loop_id : null) };
}

export default function DemoGuide() {
  const pool = useResource<Pool>("pool", (a) => a.pool(), 5000);
  const act = useAction();
  const { view } = useProgram();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [fromPatient, setFromPatient] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem("kindred.guide") === "hidden"); } catch { /* storage blocked */ } }, []);
  // Arriving from a demo patient's journey, the map is about that patient: the coordinator story stays out of the way.
  useEffect(() => { setFromPatient(new URLSearchParams(window.location.search).has("patient")); }, []);
  const d = pool.data?.demo;
  if (!d || !pool.data || fromPatient) return null;
  const liver = view?.name === "liver";
  const ls = story(pool.data.loops, ORGANS.liver);
  const hero = liver ? ls.hero ?? "L-0034" : d.hero_loop ?? "S-0076";
  const broken = liver ? ls.status === "broken" || !!ls.repaired : d.hero_status === "broken" || !!d.repaired_into;
  const loadStep: Step = { title: "Load the shared pools", why: "Synthetic kidney and liver families from 11 hospitals. Each program finds its own possible swaps and the optimiser picks this week's plan; the two programs never mix.",
    done: pool.data.loops.length > 0,
    action: <button className="btn btn-sm" disabled={!!act.busy} onClick={() => act.run("reset", (a) => a.reset())}>{act.busy === "reset" ? "Loading…" : "Load pools"}</button> };
  const steps: Step[] = liver ? [
    loadStep,
    { title: `Run the donor work-ups on liver swap ${hero}`, why: "Delhi → Chennai → Kochi. Chennai's CT volumetry measures a smaller lobe than the height-and-weight estimate, so that donation fails the program's graft-size rule (synthetic demonstration).",
      done: broken, action: <Link className="btn btn-sm btn-primary" href={`/swaps/${hero}`}>Open {hero}</Link> },
    { title: "Approve the repair", why: "KindRed searched two steps around the released families and recommends a new pathway with its evidence. Nothing changes until a person approves.",
      done: !!ls.repaired, action: <Link className="btn btn-sm btn-primary" href={`/swaps/${hero}`}>Review the repair</Link> },
    { title: "Check the liver committee checklist", why: "The liver program's checklist adds anatomical and surgical suitability review. Chennai's surgical review is still open, so the swap can't reach committee yet.",
      done: false, action: <Link className="btn btn-sm" href="/committee">Committee review</Link> },
    { title: "See the family's view", why: "The family sees only their own case, in their language, in liver terms.",
      done: false, action: <Link className="btn btn-sm" href={`/case/${ORGANS.liver.familyPair}`}>Family view</Link> },
  ] : [
    loadStep,
    { title: "A new family registers in Chennai", why: "Their hospital's intake agent checks the rules and adds their compatibility links to the graph. They'll be the replacement later.",
      done: d.chennai_added,
      action: <button className="btn btn-sm btn-primary" disabled={!!act.busy} onClick={() => act.run("chennai", (a) => a.addChennai())}>{act.busy === "chennai" ? "Adding…" : "Add the Chennai family"}</button> },
    { title: `Run the lab tests on kidney swap ${hero}`, why: "Hyderabad → Bengaluru → Kolkata. One test comes back positive (an antibody nobody tested for), so that donation can't happen.",
      done: broken, action: <Link className="btn btn-sm btn-primary" href={`/swaps/${hero}`}>Open {hero}</Link> },
    { title: "Approve the repair", why: "KindRed found a replacement family nearby in milliseconds and kept a 2-way backup. Nothing changes until a person approves.",
      done: !!d.repaired_into, action: <Link className="btn btn-sm btn-primary" href={`/swaps/${hero}`}>Review the repair</Link> },
    { title: "See the family's view and the papers", why: "The family sees only their own case, in their language. The committee screen shows which paper holds the swap up.",
      done: false, action: <span className="flex gap-2"><Link className="btn btn-sm" href={`/case/${d.family_pair}`}>Family view</Link><Link className="btn btn-sm" href="/committee">Committee</Link></span> },
  ];
  const current = steps.findIndex((s) => !s.done);
  const now = current === -1 ? steps.length - 1 : current;
  const toggleHidden = (h: boolean) => { setHidden(h); try { localStorage.setItem("kindred.guide", h ? "hidden" : "shown"); } catch { /* storage blocked */ } };

  if (hidden) return (
    <button className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--forest)" }} onClick={() => toggleHidden(false)}>
      <Icon name="play" size={14} /> Show the demo guide
    </button>
  );
  return (
    <section className="mb-5 rounded-[12px] border" style={{ borderColor: "var(--line)", background: "var(--surface)" }} aria-label="Demo guide">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] rounded-full px-2.5 py-1" style={{ background: "var(--sage)", color: "var(--forest)" }}>{liver ? "Liver" : "Kidney"} demo · step {now + 1} of {steps.length}</span>
        <ol className="hidden md:flex items-center gap-1.5" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={i} className="h-2 w-8 rounded-full" title={s.title}
                style={{ background: s.done ? "var(--forest-mid)" : i === now ? "var(--mint)" : "var(--line)" }} />
          ))}
        </ol>
        <p className="min-w-0 flex-1 text-sm"><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{steps[now].title}.</span> <span className="muted">{steps[now].why}</span></p>
        <div className="flex items-center gap-2">
          {steps[now].action}
          <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Less" : "All steps"}</button>
          <button className="text-xs muted hover:underline" onClick={() => toggleHidden(true)}>Hide</button>
        </div>
      </div>
      {act.error && <p className="px-4 pb-3 text-sm" style={{ color: "var(--bad)" }}>{act.error}</p>}
      {open && (
        <ol className="border-t px-4 py-3 grid gap-3 md:grid-cols-5" style={{ borderColor: "var(--line)" }}>
          {steps.map((s, i) => (
            <li key={i} className="text-sm">
              <p className="flex items-center gap-2 font-semibold" style={{ color: s.done ? "var(--ok)" : "var(--ink-strong)" }}>
                <span className="h-5 w-5 shrink-0 rounded-full grid place-items-center text-[0.7rem]" style={{ background: s.done ? "var(--ok-soft)" : i === now ? "var(--sage)" : "var(--surface-soft)" }}>
                  {s.done ? <Icon name="check" size={12} strokeWidth={2.4} /> : i + 1}
                </span>
                {s.title}
              </p>
              <p className="mt-1 muted text-[0.82rem] leading-snug">{s.why}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
