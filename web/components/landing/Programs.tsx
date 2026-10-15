"use client";
// Two programs on one platform. Each draws its own ring of families: the rings sit side by side and never connect,
// because a kidney donor never gives to a liver patient. What differs is listed under each ring.
import Link from "next/link";
import { useRef } from "react";
import { gsap, MQ, useGSAP } from "./gsap";

const INK = "#183B32";
type Prog = {
  key: "kidney" | "liver"; label: string; title: string; color: string; soft: string; cities: [string, string, string];
  checks: string[]; test: string; failure: string;
};
const PROGRAMS: Prog[] = [
  { key: "kidney", label: "Kidney", title: "Paired donation", color: "#2C5A4B", soft: "#DCE9DE", cities: ["Hyderabad", "Bengaluru", "Kolkata"],
    checks: ["Blood group (ABO)", "Virtual crossmatch: patient antibodies against donor tissue types", "Lab crossmatch on every link before committee"],
    test: "Lab crossmatch", failure: "A positive crossmatch takes one link out; KindRed repairs the loop around it." },
  { key: "liver", label: "Liver", title: "Paired donation", color: "#9A6A2C", soft: "#F3E6D2", cities: ["Delhi", "Chennai", "Kochi"],
    checks: ["Blood group (ABO)", "Graft size for the recipient and the share the donor keeps (program configuration)", "Evaluation statuses: anatomical, donor, recipient and surgical suitability review"],
    test: "Donor work-up (CT volumetry)", failure: "A work-up that finds the graft too small takes one link out; KindRed repairs the loop around it." },
];

// A ring of three families: A → B → C → A, in a 220 × 170 box.
const PTS: [number, number][] = [[110, 26], [196, 140], [24, 140]];
function arc(a: [number, number], b: [number, number]) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, cx = 110 + (mx - 110) * 1.35, cy = 102 + (my - 102) * 1.35;
  return `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`;
}

function Ring({ p }: { p: Prog }) {
  return (
    <svg viewBox="-10 -22 240 197" className="w-full max-w-[17rem] mx-auto" role="img"
         aria-label={`${p.label} program: ${p.cities.join(", ")} families swap in a ring, each donor giving to the next family's patient.`}>
      {PTS.map((a, i) => (
        <path key={i} className="pg-arc" d={arc(a, PTS[(i + 1) % 3])} fill="none" stroke={p.color} strokeWidth="3" strokeLinecap="round" markerEnd={`url(#pg-arrow-${p.key})`} />
      ))}
      <defs>
        <marker id={`pg-arrow-${p.key}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={p.color} />
        </marker>
      </defs>
      {PTS.map(([x, y], i) => (
        <g key={i} className="pg-node" transform={`translate(${x} ${y})`}>
          <circle r="17" fill="#F7F6F0" stroke={p.color} strokeWidth="2.5" />
          <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill={INK} style={{ fontFamily: "var(--font-sans)" }}>{"ABC"[i]}</text>
          <text y={y < 80 ? -26 : 34} textAnchor="middle" fontSize="12" fontWeight="700" fill="#4A5952" style={{ fontFamily: "var(--font-sans)" }}>{p.cities[i]}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Programs() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const q = gsap.utils.selector(root);
    gsap.matchMedia().add(MQ.motion, () => {
      q(".pg-card").forEach((card) => {
        const c = gsap.utils.selector(card);
        gsap.timeline({ scrollTrigger: { trigger: card, start: "top 75%" } })
          .from(c(".pg-node"), { scale: 0.4, autoAlpha: 0, transformOrigin: "50% 50%", duration: 0.6, ease: "back.out(2)", stagger: 0.12 })
          .fromTo(c(".pg-arc"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.7, ease: "power2.inOut", stagger: 0.25 }, "-=0.2");
      });
    });
  }, { scope: root });
  return (
    <section ref={root} id="programs" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em]" style={{ color: "#4E8A72" }}>Two programs, one platform</p>
          <h2 className="k-serif mt-3 text-4xl sm:text-[3.4rem] leading-[1.05]">One platform. Organ-specific exchange intelligence.</h2>
          <p className="k-body mt-5 text-lg sm:text-xl leading-relaxed">
            Kidney and liver exchanges share the same coordination engine: the graph, loop search, the optimiser, repairs,
            committee papers and the audit trail. Each program brings its own clinical data, matching rules, tests and
            review steps. Families only ever swap within their own program.
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-2 gap-6 lg:gap-10">
          {PROGRAMS.map((p) => (
            <article key={p.key} className="pg-card rounded-[32px] p-7 sm:p-9" style={{ background: p.soft }}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="k-serif text-3xl sm:text-4xl" style={{ color: p.color }}>{p.label}</h3>
                <span className="text-sm font-extrabold uppercase tracking-[0.12em]" style={{ color: INK }}>{p.title}</span>
              </div>
              <div className="mt-6"><Ring p={p} /></div>
              <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.12em]" style={{ color: "#4A5952" }}>What this program checks</p>
              <ul className="mt-2 space-y-1.5 k-body">
                {p.checks.map((c) => <li key={c} className="flex gap-2"><span aria-hidden="true" style={{ color: p.color }}>●</span>{c}</li>)}
              </ul>
              <p className="mt-5 k-body"><span className="font-bold" style={{ color: INK }}>Before surgery:</span> {p.test}. {p.failure}</p>
            </article>
          ))}
        </div>
        <p className="k-body mt-8 text-sm max-w-3xl">
          Thresholds such as graft size are program configuration taken from published literature, and evaluation steps are
          statuses (eligible, review required, unknown), not medical judgements. All demo data is synthetic.{" "}
          <Link href="/pool" className="k-link font-semibold">Open the workspace and switch programs</Link>
        </p>
      </div>
    </section>
  );
}
