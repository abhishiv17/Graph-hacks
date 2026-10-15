"use client";
import Link from "next/link";
import { useRef } from "react";
import { gsap, MQ, ScrollTrigger, useGSAP } from "./gsap";
import { Logo, Wordmark } from "@/components/Logo";
import { Edge, KidneyPair, Sparkle } from "./paint";

const INK = "#183B32";

/* ---------------------------------------------------------------- nav */

export function TopNav() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const set = () => root.current?.classList.toggle("is-scrolled", window.scrollY > 40);
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: set, onRefresh: set });
  }, { scope: root });
  return (
    <header ref={root} className="k-nav fixed inset-x-0 top-0 z-50 transition-[background,box-shadow] duration-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center gap-8">
        <Link href="/" aria-label="KindRed home" className="shrink-0"><Logo size={34} /></Link>
        <nav className="hidden md:flex items-center gap-8 font-semibold" style={{ color: "#4A5952" }} aria-label="Sections">
          <a href="#how" className="hover:text-[#183B32] transition-colors">How a swap works</a>
          <Link href="/patients" className="hover:text-[#183B32] transition-colors">Patients</Link>
          <Link href="/pool" className="hover:text-[#183B32] transition-colors">Live map</Link>
          <Link href="/graph" className="hover:text-[#183B32] transition-colors">How it works</Link>
        </nav>
        <Link href="/patients" className="ml-auto k-btn k-btn-primary !py-2.5 !px-5 text-sm">Follow a patient →</Link>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- the problem, told as a story */

export function StoryBand() {
  return (
    <section className="k-night relative -mt-px">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-24 sm:pb-28 text-center border-t" style={{ borderColor: "rgba(166,216,181,0.14)" }}>
        <h2 className="k-serif text-4xl sm:text-6xl leading-[1.05]">Most of these families never get there.</h2>
        <p className="mx-auto mt-8 max-w-3xl text-lg sm:text-xl leading-relaxed" style={{ color: "#C9D8CD" }}>
          India does more living-donor transplants than any other country, yet it meets only about{" "}
          <Num>7%</Num> of its yearly need for kidneys and about <Num>1.5%</Num> for livers. Many willing family donors
          are ruled out by blood group alone. Swaps would help them, but India has managed{" "}
          <Num>1,839</Num> kidney swaps in 24 years and <Num>259</Num> liver swaps at 7 centres. Finding a match is the easy
          part. The swap falls apart afterwards, when a late test fails and a coordinator has to start again by phone.
        </p>
      </div>
      <Edge color="#F7F6F0" seed={4} />
    </section>
  );
}
function Num({ children }: { children: React.ReactNode }) {
  return <span className="k-serif text-[1.45em] leading-none whitespace-nowrap" style={{ color: "#A6D8B5" }}>{children}</span>;
}

/* ---------------------------------------------------------------- spot illustrations */

const S = { fill: "none", stroke: INK, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const SPOTS: Record<string, React.ReactNode> = {
  find: (<>
    <circle cx="32" cy="32" r="26" fill="#DCE9DE" />
    <path {...S} d="M16 22 L30 16 L46 26 L40 44 L22 44 Z" stroke="#A9C3AF" />
    <path {...S} d="M30 16 L46 26 L22 44 Z" stroke="#C96E64" strokeWidth="3" />
    {[[16, 22], [30, 16], [46, 26], [40, 44], [22, 44]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill={i === 1 || i === 2 || i === 4 ? "#C96E64" : INK} />)}
  </>),
  choose: (<>
    <circle cx="32" cy="32" r="26" fill="#F1EEDC" />
    <path {...S} d="M32 14 V48 M22 50 H42 M14 22 H50" />
    <path {...S} d="M14 22 L8 36 H20 Z M50 22 L44 34 H56 Z" fill="#F7F6F0" />
  </>),
  ask: (<>
    <circle cx="32" cy="32" r="26" fill="#E1ECE6" />
    <rect {...S} x="12" y="20" width="40" height="28" rx="5" fill="#F7F6F0" />
    <path {...S} d="M13 22 L32 36 L51 22" />
    <path d="M32 44 C27 40 27 36 30 36 C31 36 32 37 32 38 C32 37 33 36 34 36 C37 36 37 40 32 44 Z" fill="#C96E64" />
  </>),
  mend: (<>
    <circle cx="32" cy="32" r="26" fill="#EFE8DC" />
    <path {...S} d="M12 40 C20 30 28 46 36 34 C42 25 48 30 52 22" stroke="#D4927F" strokeWidth="3.4" />
    <path {...S} d="M40 14 L54 28" />
    <ellipse cx="42.5" cy="16.5" rx="2.4" ry="1.2" transform="rotate(45 42.5 16.5)" fill="#F7F6F0" stroke={INK} strokeWidth="1.6" />
    <circle cx="36" cy="34" r="4.5" fill={INK} />
  </>),
  decide: (<>
    <circle cx="32" cy="32" r="26" fill="#E3F1E6" />
    <circle {...S} cx="32" cy="30" r="15" fill="#F7F6F0" />
    <path {...S} d="M25 30 L30 35 L40 25" stroke="#1F6B48" strokeWidth="3.2" />
    <path {...S} d="M24 44 L20 54 L26 51 L28 57 L32 46 M40 44 L44 54 L38 51 L36 57 L32 46" fill="#4E8A72" stroke={INK} strokeWidth="2" />
  </>),
  ai: (<>
    <circle cx="32" cy="32" r="26" fill="#DCE9DE" />
    <path {...S} d="M14 18 H46 A4 4 0 0 1 50 22 V38 A4 4 0 0 1 46 42 H28 L20 49 V42 H18 A4 4 0 0 1 14 38 V22 A4 4 0 0 1 18 18 Z" fill="#F7F6F0" />
    <path {...S} d="M21 27 H43 M21 34 H36" stroke="#A9C3AF" />
  </>),
  person: (<>
    <circle cx="32" cy="32" r="26" fill="#F1EEDC" />
    <circle {...S} cx="28" cy="24" r="7" fill="#F7F6F0" />
    <path {...S} d="M15 50 C15 40 21 35 28 35 C33 35 37 37 39 41" fill="#F7F6F0" />
    <circle cx="44" cy="44" r="9" fill="#4E8A72" />
    <path {...S} d="M40 44 L43 47 L48 41" stroke="#F7F6F0" strokeWidth="2.6" />
  </>),
  law: (<>
    <circle cx="32" cy="32" r="26" fill="#EFE8DC" />
    <path {...S} d="M18 14 H42 A4 4 0 0 1 46 18 V50 H22 A4 4 0 0 1 18 46 Z" fill="#F7F6F0" />
    <path {...S} d="M24 24 H40 M24 31 H40 M24 38 H32" stroke="#A9C3AF" />
    <circle cx="42" cy="46" r="7" fill="#C96E64" />
    <path d="M38 52 L36 58 L40 56 L42 59 L44 56 L48 58 L46 52" fill="#C96E64" />
  </>),
  lock: (<>
    <circle cx="32" cy="32" r="26" fill="#E1ECE6" />
    <path {...S} d="M14 30 L32 15 L50 30 V50 H14 Z" fill="#F7F6F0" />
    <rect {...S} x="25" y="34" width="14" height="11" rx="2.5" fill="#4E8A72" />
    <path {...S} d="M28 34 V30 A4 4 0 0 1 36 30 V34" />
  </>),
  query: (<>
    <circle cx="32" cy="32" r="26" fill="#E3F1E6" />
    <path {...S} d="M16 18 H38 M16 26 H34 M16 34 H28" stroke="#A9C3AF" />
    <circle {...S} cx="38" cy="36" r="9" fill="#F7F6F0" />
    <path {...S} d="M45 43 L52 50" strokeWidth="3.4" />
  </>),
  lang: (<>
    <circle cx="32" cy="32" r="26" fill="#F1EEDC" />
    <path {...S} d="M10 16 H34 A3 3 0 0 1 37 19 V31 A3 3 0 0 1 34 34 H20 L14 39 V34 H13 A3 3 0 0 1 10 31 V19 A3 3 0 0 1 13 16 Z" fill="#F7F6F0" />
    <path {...S} d="M54 28 H32 A3 3 0 0 0 29 31 V43 A3 3 0 0 0 32 46 H46 L51 51 V46 H51 A3 3 0 0 0 54 43 V31 A3 3 0 0 0 51 28 Z" fill="#DCE9DE" />
    <text x="23.5" y="29.5" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK} style={{ fontFamily: "var(--font-sans)" }}>A</text>
    <text x="41.5" y="42" textAnchor="middle" fontSize="11" fontWeight="800" fill={INK}>अ</text>
  </>),
};
function Spot({ k, size = 64 }: { k: string; size?: number }) {
  return <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="shrink-0">{SPOTS[k]}</svg>;
}

/* ---------------------------------------------------------------- who does what */

const PIPE = [
  { k: "find", h: "The graph finds", t: "Every two- and three-family loop within each program across 11 hospitals, with the reason each link can or can't work." },
  { k: "choose", h: "The optimiser chooses", t: "It picks loops by how many transplants they're likely to deliver, counting the chance a lab test fails." },
  { k: "ask", h: "Agents ask", t: "They send offers to each hospital, gather answers and request each program's test: a lab crossmatch, or a donor work-up." },
  { k: "mend", h: "KindRed mends", t: "When a test fails, it re-plans only around the break. Loops already booked are never touched." },
  { k: "decide", h: "A person decides", t: "A coordinator approves every change, and each decision is logged with what it was based on." },
];

export function Pipeline() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.matchMedia().add(MQ.motion, () => {
      gsap.fromTo(q(".pipe-path"), { drawSVG: "0%" }, { drawSVG: "100%", ease: "none", scrollTrigger: { trigger: q(".pipe-row")[0], start: "top 75%", end: "bottom 55%", scrub: 0.6 } });
      gsap.from(q(".pipe-stop"), { y: 24, autoAlpha: 0, duration: 0.9, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: q(".pipe-row")[0], start: "top 78%" } });
    });
  }, { scope: root });
  return (
    <section ref={root} className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <h2 className="k-serif text-4xl sm:text-[3.4rem] leading-[1.05]">Evidence first. A person decides.</h2>
          <p className="k-body mt-5 text-lg sm:text-xl leading-relaxed">
            Software never decides who receives an organ. The language model can explain the evidence the graph returns and write the messages families read; it cannot approve, allocate, or declare anyone medically suitable.
          </p>
        </div>
        <div className="pipe-row relative mt-16">
          <svg className="hidden lg:block absolute left-0 right-0 top-6 w-full h-24" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="pipe-path" d="M60 30 C180 90 300 -10 420 40 S660 90 780 30 S1020 -10 1140 40" fill="none" stroke="#B9D3BF" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <ol className="relative grid sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-6">
            {PIPE.map((p, i) => (
              <li key={p.k} className={`pipe-stop flex lg:block gap-5 ${i % 2 ? "lg:mt-14" : ""}`}>
                <Spot k={p.k} size={76} />
                <div className="lg:mt-5">
                  <h3 className="k-serif text-2xl">{p.h}</h3>
                  <p className="k-body mt-2 leading-relaxed">{p.t}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- auditable history */

// Lines from the recorded demo story (see lib/demo/snapshot.json), shortened.
const TRAIL = [
  { t: "09:41", who: "Crossmatch coordinator", kind: "Simulated agent", text: "Hyderabad → Bengaluru crossmatch negative", tone: "ok" },
  { t: "09:41", who: "Crossmatch coordinator", kind: "Simulated agent", text: "Bengaluru → Kolkata crossmatch positive (DQ7). Link stored as failed.", tone: "bad" },
  { t: "09:41", who: "Matching agent", kind: "Simulated agent", text: "Repair proposed for S-0076: Hyderabad → Bengaluru → Chennai, found in 41 ms", tone: "warn" },
  { t: "09:43", who: "Exchange coordinator", kind: "Person", text: "Approved the repair. New exchange S-0078 includes Chennai P-0377.", tone: "ok" },
  { t: "10:05", who: "Crossmatch coordinator", kind: "Simulated agent", text: "Liver L-0034: Chennai donor work-up finds the graft too small for Kochi (synthetic rule). Link stored as failed.", tone: "bad" },
];

export function AuditHistory() {
  return (
    <section className="relative pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-center">
        <div>
          <h2 className="k-serif text-4xl sm:text-[3.4rem] leading-[1.05]">Every event, on the record.</h2>
          <p className="k-body mt-5 text-lg leading-relaxed">
            Discovery, checks, proposals and approvals are written to one history, each with the evidence it relied on and
            who acted: a person, the platform, or a simulated agent. Months later, anyone can trace why an exchange changed.
          </p>
          <Link href="/audit" className="k-link mt-6 inline-block font-semibold">Open the audit trail</Link>
        </div>
        <ol className="rounded-2xl border bg-white divide-y" style={{ borderColor: "#DDE4DC" }} aria-label="Example audit entries from the recorded demo">
          {TRAIL.map((e, i) => (
            <li key={i} className="grid grid-cols-[3.2rem_1fr] gap-4 px-5 py-4">
              <span className="text-sm tabular-nums" style={{ color: "#66736B" }}>{e.t}</span>
              <div>
                <p className="text-sm"><span className="font-semibold" style={{ color: "#183B32" }}>{e.who}</span> <span style={{ color: "#66736B" }}>· {e.kind}</span></p>
                <p className="mt-0.5" style={{ color: e.tone === "bad" ? "#9E4238" : "#34433D" }}>{e.text}</p>
                {e.kind === "Person" && <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#E3F1E6", color: "#1F6B48" }}>Approved by a person</span>}
                {e.tone === "warn" && <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#FBF1DE", color: "#8A5A12" }}>Needs human review</span>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- results */

// From data/generated/sim_results.json: mean transplants per simulated year, 20 runs × 52 weeks.
const BARS = [
  { label: "Each hospital alone", sub: "two-family swaps only, as today", v: 141.8, c: "#DCE9DE" },
  { label: "Shared pool", sub: "two-family swaps only", v: 222.7, c: "#E1ECE6" },
  { label: "Shared, three-family loops", sub: "ignores that lab tests fail", v: 248.7, c: "#F1EEDC" },
  { label: "KindRed", sub: "plans for failed tests and repairs as it goes", v: 250.2, c: "#2C5A4B", hi: true },
];

export function Results() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.matchMedia().add(MQ.motion, () => {
      gsap.from(q(".bar-fill"), { scaleX: 0, duration: 1.6, ease: "expo.out", stagger: 0.14, scrollTrigger: { trigger: q(".bars")[0], start: "top 75%" } });
    });
  }, { scope: root });
  return (
    <section ref={root} id="results" className="relative pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-[40px] px-6 py-12 sm:px-12 sm:py-16 grid lg:grid-cols-[1.25fr_0.75fr] gap-12 lg:gap-16" style={{ background: "#EFEEE6" }}>
          <div>
            <h2 className="k-serif text-4xl sm:text-5xl leading-[1.06]">
              In a simulated kidney-program year, <span className="italic" style={{ color: "#2C5A4B" }}>76% more transplants</span> than hospitals working alone.
            </h2>
            <div className="bars mt-12 space-y-7">
              {BARS.map((b) => (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p><span className="font-extrabold" style={{ color: b.hi ? "#2C5A4B" : INK }}>{b.label}</span> <span className="k-body text-sm">{b.sub}</span></p>
                    <span className="k-serif text-2xl tabular-nums">{Math.round(b.v)}</span>
                  </div>
                  <div className="mt-2 h-4 rounded-full" style={{ background: "#E3E8E0" }}>
                    <div className="bar-fill h-full rounded-full origin-left" style={{ width: `${(b.v / 300) * 100}%`, background: b.c }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="k-body mt-6 text-sm">Kidney program only. Transplants per simulated year: average of 20 runs of 52 weeks, about 539 families arriving. Lab results take 9 days, as in multi-centre programmes. The liver program has no simulated year yet.</p>
          </div>
          <div className="space-y-8 lg:pt-24 text-lg leading-relaxed k-body">
            <p>
              <span className="k-serif text-4xl block" style={{ color: INK }}>About 25</span>
              broken loops a year get repaired instead of being lost.
            </p>
            <p>
              <span className="k-serif text-4xl block" style={{ color: INK }}>14% fewer</span>
              wasted lab tests than a three-family match that ignores failures, with no fewer transplants.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- promises */

const PROMISES = [
  { k: "ai", h: "Software never allocates an organ.", p: "Loops come from the graph and rankings from an optimiser with stated rules. The language model only explains returned evidence; it can't approve a transplant or invent a fact." },
  { k: "person", h: "A person approves every repair.", p: "KindRed prepares the repair and keeps a fallback ready. A coordinator decides, and the decision is recorded." },
  { k: "law", h: "Indian law is checked before matching.", p: "Near-relative donors only, Authorisation Committee approval for each pair, no altruistic chains." },
  { k: "lock", h: "Names stay at home.", p: "Names, full HLA typing, CT measurements, clinical notes and documents stay in each hospital's own graph. The shared pool sees only what matching needs." },
  { k: "query", h: "Every number can be traced.", p: "Each screen shows the named Cypher queries behind it and how long they took." },
  { k: "lang", h: "Families hear it in their own language.", p: "Each family sees only their own case, in English or Hindi, without medical jargon." },
];

export function Promises() {
  return (
    <section className="relative pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="k-serif text-4xl sm:text-[3.4rem] leading-[1.05] max-w-3xl">Promises we keep</h2>
        <ul className="mt-12 grid md:grid-cols-2 gap-x-16">
          {PROMISES.map((p) => (
            <li key={p.k} className="flex gap-6 py-7 border-t-2" style={{ borderColor: "#E3E8E0" }}>
              <Spot k={p.k} size={60} />
              <div>
                <h3 className="k-serif text-2xl leading-snug">{p.h}</h3>
                <p className="k-body mt-2 leading-relaxed">{p.p}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- call to action */

const TRY = [
  "Open the live pool: kidney and liver families across 11 hospitals.",
  "Kidney: open the Hyderabad loop and press Run lab tests.",
  "Watch one test fail, then press Approve repair.",
  "Switch to the liver program and run the donor work-ups on L-0034.",
];

export function FinalCTA() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.matchMedia().add(MQ.motion, () => {
      gsap.to(q(".mascot"), { y: -10, rotate: 2, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(q(".mascot-star"), { scale: 0.5, opacity: 0.5, transformOrigin: "50% 50%", duration: 1.2, yoyo: true, repeat: -1, stagger: 0.4, ease: "sine.inOut" });
    });
  }, { scope: root });
  return (
    <section ref={root} className="relative pb-24 sm:pb-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="rounded-[40px] px-6 py-12 sm:px-14 sm:py-16 grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-center" style={{ background: "#DCE9DE" }}>
          <svg viewBox="0 0 260 220" className="mx-auto w-60 sm:w-72 lg:w-full max-w-sm" role="img" aria-label="KindRed's two kidney characters, smiling and leaning together">
            <ellipse cx="130" cy="200" rx="78" ry="10" fill="#183B32" opacity="0.12" />
            <g className="mascot" style={{ transformOrigin: "130px 110px" }}><g transform="translate(20 22)"><KidneyPair faces /></g></g>
            <g className="mascot-star" transform="translate(30 40)"><Sparkle r={9} fill="#A6D8B5" /></g>
            <g className="mascot-star" transform="translate(232 70)"><Sparkle r={7} fill="#4E8A72" /></g>
            <g className="mascot-star" transform="translate(220 180)"><Sparkle r={5} fill="#C96E64" /></g>
          </svg>
          <div>
            <h2 className="k-serif text-4xl sm:text-[3.4rem] leading-[1.05]">Watch a loop come undone, and come back together.</h2>
            <ol className="mt-8 space-y-3 text-lg font-semibold" style={{ color: INK }}>
              {TRY.map((t) => (
                <li key={t} className="flex gap-3 items-baseline">
                  <svg viewBox="-8 -8 16 16" className="h-3.5 w-3.5 shrink-0 translate-y-0.5" aria-hidden="true"><Sparkle r={7} fill="#C96E64" /></svg>
                  {t}
                </li>
              ))}
            </ol>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/pool" className="k-btn k-btn-primary">Open the live pool</Link>
              <Link href="/case/P-0154" className="k-btn k-btn-paper">See a family&rsquo;s view (English / हिन्दी)</Link>
            </div>
            <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-bold" style={{ color: "#4A5952" }}>
              <Link href="/lab" className="k-link">Simulation</Link>
              <Link href="/audit" className="k-link">Audit trail</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="k-night relative">
      <Edge flip color="#F7F6F0" seed={33} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-14 flex flex-col md:flex-row gap-8 md:items-end md:justify-between">
        <div>
          <Wordmark tone="dark" size="2rem" />
          <p className="mt-4" style={{ color: "#C9D8CD" }}>Every connection creates a possibility.</p>
        </div>
        <p className="max-w-md md:text-right font-semibold" style={{ color: "#A3B8AB" }}>
          © 2026 KindRed
        </p>
      </div>
    </footer>
  );
}
