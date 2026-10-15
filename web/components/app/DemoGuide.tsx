"use client";
// The demo story as five steps, shown above every workspace screen. It reads where the story stands from
// the pool (`demo` flags computed in the graph), so it always offers the right next step.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useAction, useResource } from "@/lib/data/source";
import type { Pool } from "@/lib/data/types";

type Step = { title: string; why: string; done: boolean; action?: React.ReactNode };

export default function DemoGuide() {
  const pool = useResource<Pool>("pool", (a) => a.pool(), 5000);
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem("kindred.guide") === "hidden"); } catch { /* storage blocked */ } }, []);
  const d = pool.data?.demo;
  if (!d || !pool.data) return null;
  const hero = d.hero_loop ?? "S-0076";
  const broken = d.hero_status === "broken" || !!d.repaired_into;
  const steps: Step[] = [
    { title: "Load the shared pool", why: "153 synthetic families from 11 hospitals. The graph finds every possible swap and the optimiser picks this week's plan.",
      done: pool.data.loops.length > 0,
      action: <button className="btn btn-sm" disabled={!!act.busy} onClick={() => act.run("reset", (a) => a.reset())}>{act.busy === "reset" ? "Loading…" : "Load pool"}</button> },
    { title: "A new family registers in Chennai", why: "Their hospital's intake agent checks the rules and adds their compatibility links to the graph. They'll be the replacement later.",
      done: d.chennai_added,
      action: <button className="btn btn-sm btn-primary" disabled={!!act.busy} onClick={() => act.run("chennai", (a) => a.addChennai())}>{act.busy === "chennai" ? "Adding…" : "Add the Chennai family"}</button> },
    { title: `Run the lab tests on swap ${hero}`, why: "Hyderabad → Bengaluru → Kolkata. One test comes back positive (an antibody nobody tested for), so that donation can't happen.",
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
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.12em] rounded-full px-2.5 py-1" style={{ background: "var(--sage)", color: "var(--forest)" }}>Demo · step {now + 1} of {steps.length}</span>
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
