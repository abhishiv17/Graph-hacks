"use client";
// The short homepage: impact, what a 2-way and a 3-way swap are, what the agents do on their own, and how KindRed
// meets the two Graph Hacks tracks it entered. Numbers come from the simulated year (data/generated/sim_results.json).
import Link from "next/link";
import { Guide } from "@/components/Kin";
import { useRef } from "react";
import { gsap, MQ, useGSAP } from "./gsap";

const INK = "#183B32";
const MINT = "#2C5A4B";

/* ---------------------------------------------------------------- impact */

const IMPACT = [
  { n: "76%", h: "more transplants", p: "when hospitals share one pool instead of each matching alone" },
  { n: "14%", h: "fewer wasted lab tests", p: "than a 3-way matcher that ignores failed tests, with no fewer transplants" },
  { n: "~25", h: "broken swaps repaired a year", p: "instead of starting again from scratch" },
  { n: "0.7", h: "weeks sooner", p: "to a match that actually holds" },
];

export function ImpactStrip() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.matchMedia().add(MQ.motion, () => {
      gsap.from(q(".imp"), { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.1, ease: "power2.out", scrollTrigger: { trigger: root.current, start: "top 80%" } });
    });
  }, { scope: root });
  return (
    <section ref={root} id="impact" className="relative py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-extrabold uppercase tracking-[0.16em]" style={{ color: MINT }}>Impact, in a simulated year of a national kidney pool</p>
        <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {IMPACT.map((x) => (
            <li key={x.h} className="imp rounded-[28px] p-6" style={{ background: "#EFEEE6" }}>
              <p className="k-serif text-5xl" style={{ color: INK }}>{x.n}</p>
              <p className="mt-2 font-extrabold" style={{ color: INK }}>{x.h}</p>
              <p className="k-body mt-1 text-sm leading-relaxed">{x.p}</p>
            </li>
          ))}
        </ul>
        <p className="k-body mt-4 text-sm">20 simulated years of about 540 families each, measured by us. The generator reproduces published match rates (Saidman et al. 2006).</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- 2-way and 3-way */

function Loop({ n }: { n: 2 | 3 }) {
  // Families on a circle, each donor's arrow to the next family's patient.
  const pts = n === 2 ? [[60, 70], [200, 70]] : [[130, 22], [212, 150], [48, 150]];
  const path = (a: number[], b: number[], bend: number) => {
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return `M${a[0]},${a[1]} Q${mx - (b[1] - a[1]) * bend},${my + (b[0] - a[0]) * bend} ${b[0]},${b[1]}`;
  };
  return (
    <svg viewBox="0 0 260 180" className="w-full max-w-[16rem]" role="img" aria-label={n === 2 ? "Two families swap donors" : "Three families pass donors around a loop"}>
      <defs>
        <marker id={`arr${n}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill={MINT} /></marker>
      </defs>
      {pts.map((a, i) => {
        const b = pts[(i + 1) % n];
        return <path key={i} d={path(a, b, n === 2 ? 0.35 : 0.18)} fill="none" stroke={MINT} strokeWidth={3} markerEnd={`url(#arr${n})`} />;
      })}
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={20} fill="#F1EEDC" stroke={INK} strokeWidth={2} />
          <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill={INK}>{String.fromCharCode(65 + i)}</text>
        </g>
      ))}
    </svg>
  );
}

export function SwapTypes() {
  return (
    <section className="relative pb-20 sm:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="k-serif text-4xl sm:text-[3.2rem] leading-[1.05] max-w-3xl">2-way or 3-way?</h2>
        <p className="k-body mt-4 max-w-3xl text-lg leading-relaxed">
          A family whose donor can&rsquo;t give to their own patient joins the pool. A <strong>swap</strong> is a loop of families
          where each donor gives to the next family&rsquo;s patient, so every patient receives and nobody gives without their own
          family getting one back.
        </p>
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          {[
            { n: 2 as const, h: "2-way swap", p: "Family A's donor gives to B's patient, and B's donor gives to A's patient. Simple, and the most common.",
              s: "In the graph: a donor-to-patient link and one straight back (1 hop out, 1 back)." },
            { n: 3 as const, h: "3-way swap", p: "A gives to B, B gives to C, C gives back to A. It helps the families nobody can swap with directly: the hard-to-match patients.",
              s: "In the graph: a loop of 3 links. A shallow, 2-way search can't see it; only a deeper search does." },
          ].map((x) => (
            <div key={x.h} className="rounded-[32px] p-8 grid sm:grid-cols-[auto_1fr] gap-6 items-center" style={{ background: x.n === 2 ? "#E1ECE6" : "#F1EEDC" }}>
              <Loop n={x.n} />
              <div>
                <h3 className="k-serif text-3xl" style={{ color: INK }}>{x.h}</h3>
                <p className="k-body mt-3 leading-relaxed">{x.p}</p>
                <p className="mt-3 text-sm font-semibold" style={{ color: MINT }}>{x.s}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="k-body mt-6 max-w-3xl">
          Every link is tested before surgery (a lab crossmatch for kidney, a donor work-up for liver). If one fails, the swap
          breaks. KindRed keeps a 2-way swap inside each 3-way one as a fallback, and searches nearby for a replacement.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- the agents */

const AGENTS = [
  { h: "Notices when someone gets worse", who: "Health watch",
    p: "Reads every new lab result and compares it with medical guidelines and with what it remembers. It speaks up only when a patient gets worse, so nobody is buried in alerts." },
  { h: "Takes the next step, every week", who: "Coordinator",
    p: "Looks at the patient's situation and does what's due: search for a swap, run the tests, ask for papers, book the surgery. It shows what it looked at and why." },
  { h: "Mends a swap when a test fails", who: "Matching and repair",
    p: "When one donation can't go ahead, it looks only at the families nearby for a replacement, keeps a backup ready, and leaves every other swap untouched." },
  { h: "Keeps everyone in the loop", who: "Scheduler, clerk, family liaison",
    p: "Books appointments, chases missing papers, and tells each family what is happening, in plain words and their own language." },
];

export function Agents() {
  return (
    <section id="agents" className="k-night relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="k-serif text-4xl sm:text-[3.2rem] leading-[1.05] max-w-3xl">Someone watching over every family, week after week.</h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed" style={{ color: "#C9D8CD" }}>
          KindRed&rsquo;s agents follow each patient from a falling lab result to a transplant. Every step says who did it, what it
          looked at first, and why.
        </p>
        <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AGENTS.map((a, i) => (
            <li key={a.h} className="rounded-[28px] p-6" style={{ background: "rgba(166,216,181,0.08)", border: "1px solid rgba(166,216,181,0.18)" }}>
              <p className="k-serif text-3xl" style={{ color: "#A6D8B5" }}>{i + 1}</p>
              <h3 className="mt-2 font-extrabold text-lg">{a.h}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#C9D8CD" }}>{a.p}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "#7FA08D" }}>{a.who}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm" style={{ color: "#A3B8AB" }}>
          A person approves every repair. The AI can only use checked tools, never edits the records directly, and every family it
          mentions is confirmed first. All families here are synthetic; KindRed is a prototype, not a clinical tool.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- why it needs a graph */

const WHY = [
  { h: "A swap is a loop", p: "Families are points and possible donations are the lines between them. A swap is a loop of lines, and finding loops is what a graph database does best.", tag: "Loops found by traversal in FalkorDB" },
  { h: "Looking further finds more", p: "A direct trade between two families is easy to spot. A three-family loop helps the patients nobody can trade with directly, and it only shows up when you look one step further.", tag: "2-way and 3-way searches, side by side" },
  { h: "It remembers, and shows why", p: "Every test, decision and conversation is kept in the same graph. Each agent picks up where another left off, and every answer comes with the path behind it.", tag: "Memory stored as connected nodes" },
];

export function Tracks() {
  return (
    <section id="why-graph" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-extrabold uppercase tracking-[0.16em]" style={{ color: MINT }}>Why it needs a graph</p>
        <h2 className="k-serif mt-3 text-4xl sm:text-[3.2rem] leading-[1.05] max-w-3xl">Families, donations and memory, all connected.</h2>
        <ul className="mt-10 grid md:grid-cols-3 gap-5">
          {WHY.map((w) => (
            <li key={w.h} className="rounded-[28px] p-7" style={{ background: "#EFEEE6" }}>
              <h3 className="font-extrabold text-lg" style={{ color: INK }}>{w.h}</h3>
              <p className="k-body mt-2 leading-relaxed">{w.p}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: MINT }}>{w.tag}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- try it */

export function TryIt() {
  return (
    <section className="relative pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-[40px] px-6 py-12 sm:px-14 sm:py-14 grid md:grid-cols-[auto_1.2fr_auto] gap-8 items-center" style={{ background: "#DCE9DE" }}>
          <Guide size={120} pose="wave" className="hidden md:block" />
          <div>
            <h2 className="k-serif text-4xl sm:text-5xl leading-[1.05]">Follow a family to a transplant.</h2>
            <p className="k-body mt-4 text-lg leading-relaxed max-w-2xl">
              Meet Sunita, who needs a kidney, or Rajesh, who needs part of a liver. Move forward one week at a time and watch the
              agents find a swap, run the tests and book the surgery. Stuck anywhere? Ask Kin, at the bottom of every screen.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/patients" className="k-btn k-btn-primary">Meet the patients</Link>
            <Link href="/pool" className="k-btn k-btn-paper">See the live map</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
